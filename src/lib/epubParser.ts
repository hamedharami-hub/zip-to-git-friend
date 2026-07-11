/**
 * EPUB parsing utilities.
 *
 * We parse the EPUB ZIP directly with JSZip, read the OPF package to discover
 * the spine + manifest, then sanitize each chapter HTML. This is far more
 * robust in browsers than `epubjs` which relies on iframe rendering.
 *
 * The original .epub bytes are kept untouched in `bookBlobs` so we can
 * re-parse later with a different strategy if needed.
 */
import JSZip from "jszip";
import type { Book, BookChapter } from "@/types";

export interface ParsedEpub {
  book: Omit<Book, "lastChapterIndex" | "lastScrollRatio" | "createdAt" | "updatedAt">;
  chapters: BookChapter[];
}

export interface ParseProgress {
  /** 0..1 */
  ratio: number;
  /** Optional human-readable label, e.g. current chapter title. */
  label?: string;
}

/**
 * Strip <script>/<style>/<link>/<meta> and inline event handlers from raw
 * chapter HTML. We keep semantic tags (headings, paragraphs, lists, images)
 * so the reader can render real book layout, not a flat blob of text.
 */
function sanitizeChapterHtml(raw: string): { html: string; text: string } {
  // Parse as XML first (xhtml) and fall back to html for tag soup.
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xhtml+xml");
    // If parser error, fallback
    if (doc.querySelector("parsererror")) {
      doc = new DOMParser().parseFromString(raw, "text/html");
    }
  } catch {
    doc = new DOMParser().parseFromString(raw, "text/html");
  }

  // Remove dangerous / irrelevant nodes.
  doc
    .querySelectorAll("script, style, link, meta, iframe, object, embed")
    .forEach((n) => n.remove());
  // Strip inline event handlers + javascript: links and external image refs
  // (they point to ZIP-internal paths the browser can't resolve).
  doc.querySelectorAll<Element>("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  // Drop images we can't resolve — they would 404 in the reader.
  doc.querySelectorAll("img, svg image").forEach((n) => n.remove());

  const body = doc.querySelector("body") ?? doc.documentElement;
  const html = (body?.innerHTML ?? "").trim();
  const text = (body?.textContent ?? "").replace(/\s+/g, " ").trim();
  return { html, text };
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function dedupeTitle(raw: string | undefined | null, fallback: string): string {
  const t = (raw ?? "").trim();
  return t.length ? t : fallback;
}

/** Resolve an href relative to a base file path inside the ZIP. */
function resolvePath(basePath: string, href: string): string {
  // Strip fragment.
  const clean = href.split("#")[0];
  if (!clean) return basePath;
  const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/")) : "";
  if (clean.startsWith("/")) return clean.slice(1);
  const parts = (baseDir ? baseDir.split("/") : []).concat(clean.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function stripFragment(href: string): string {
  const i = href.indexOf("#");
  return i >= 0 ? href.slice(0, i) : href;
}

/**
 * Parse an EPUB file into metadata + chapters using JSZip + the OPF package.
 */
export async function parseEpub(
  file: File | Blob,
  bookId: string,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedEpub> {
  onProgress?.({ ratio: 0.02, label: "Opening archive" });
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // 1. Find OPF path via META-INF/container.xml
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Invalid EPUB: missing META-INF/container.xml");
  const containerXml = await containerFile.async("string");
  const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const rootfile = containerDoc.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: rootfile path missing");

  onProgress?.({ ratio: 0.06, label: "Reading package" });
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`Invalid EPUB: package file not found at ${opfPath}`);
  const opfXml = await opfFile.async("string");
  const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");

  // 2. Metadata
  const getMeta = (tag: string): string | undefined => {
    // dc:title, dc:creator, dc:language live under metadata. namespaces vary.
    const el =
      opfDoc.getElementsByTagName(`dc:${tag}`)[0] ??
      opfDoc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", tag)[0] ??
      opfDoc.getElementsByTagName(tag)[0];
    return el?.textContent?.trim() || undefined;
  };
  const title = dedupeTitle(
    getMeta("title"),
    (file as File).name?.replace(/\.epub$/i, "") ?? "Untitled",
  );
  const author = getMeta("creator");
  const language = getMeta("language");

  // 3. Manifest: id → href, mediaType
  const manifest = new Map<string, { href: string; type: string; properties: string }>();
  Array.from(opfDoc.getElementsByTagName("item")).forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) return;
    manifest.set(id, {
      href,
      type: item.getAttribute("media-type") ?? "",
      properties: item.getAttribute("properties") ?? "",
    });
  });

  // 4. Spine (reading order)
  const spineRefs: string[] = Array.from(opfDoc.getElementsByTagName("itemref"))
    .map((el) => el.getAttribute("idref"))
    .filter((v): v is string => !!v);

  if (spineRefs.length === 0) throw new Error("EPUB spine is empty.");

  // 5. Cover image (best effort)
  let coverDataUrl: string | undefined;
  try {
    let coverId: string | undefined;
    // EPUB3: properties="cover-image"
    for (const [id, m] of manifest) {
      if (m.properties.split(/\s+/).includes("cover-image")) {
        coverId = id;
        break;
      }
    }
    // EPUB2: <meta name="cover" content="..."/>
    if (!coverId) {
      const meta = Array.from(opfDoc.getElementsByTagName("meta")).find(
        (m) => m.getAttribute("name") === "cover",
      );
      coverId = meta?.getAttribute("content") ?? undefined;
    }
    if (coverId && manifest.has(coverId)) {
      const coverHref = manifest.get(coverId)!.href;
      const coverPath = resolvePath(opfPath, coverHref);
      const coverFile = zip.file(coverPath);
      if (coverFile) {
        const blob = await coverFile.async("blob");
        if (blob.size <= 256 * 1024) {
          coverDataUrl = await blobToDataUrl(blob);
        }
      }
    }
  } catch {
    /* covers are optional */
  }

  // 6. TOC (try EPUB3 nav, then EPUB2 ncx)
  const tocMap = await buildTocMap(zip, opfPath, opfDoc, manifest);

  // 7. Walk spine → chapters
  const chapters: BookChapter[] = [];
  for (let i = 0; i < spineRefs.length; i++) {
    const id = spineRefs[i];
    const m = manifest.get(id);
    if (!m) continue;
    const chapterPath = resolvePath(opfPath, m.href);
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) continue;

    let raw: string;
    try {
      raw = await chapterFile.async("string");
    } catch (err) {
      console.warn("[epubParser] failed to read", chapterPath, err);
      continue;
    }
    if (!raw) continue;

    const { html, text } = sanitizeChapterHtml(raw);
    if (!text || text.length < 20) continue; // skip empty/cover-only items

    const tocTitle = tocMap.get(stripFragment(m.href)) ?? extractTitle(raw) ?? "";
    const fallback = `Chapter ${chapters.length + 1}`;
    chapters.push({
      id: `${bookId}:${chapters.length}`,
      bookId,
      index: chapters.length,
      title: dedupeTitle(tocTitle, fallback),
      html,
      text,
      wordCount: countWords(text),
    });

    onProgress?.({
      ratio: 0.1 + (0.9 * (i + 1)) / spineRefs.length,
      label: tocTitle || fallback,
    });
  }

  return {
    book: {
      id: bookId,
      title,
      author,
      language,
      fileName: (file as File).name ?? "book.epub",
      chapterCount: chapters.length,
      coverDataUrl,
    },
    chapters,
  };
}

/** Pull a <title> or first heading from raw chapter HTML, if any. */
function extractTitle(raw: string): string | undefined {
  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const t = doc.querySelector("title")?.textContent?.trim();
    if (t) return t;
    const h = doc.querySelector("h1, h2, h3")?.textContent?.trim();
    return h || undefined;
  } catch {
    return undefined;
  }
}

async function buildTocMap(
  zip: JSZip,
  opfPath: string,
  opfDoc: Document,
  manifest: Map<string, { href: string; type: string; properties: string }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // EPUB3 nav doc
  let navId: string | undefined;
  for (const [id, m] of manifest) {
    if (m.properties.split(/\s+/).includes("nav")) {
      navId = id;
      break;
    }
  }
  if (navId) {
    const navHref = manifest.get(navId)!.href;
    const navPath = resolvePath(opfPath, navHref);
    const navFile = zip.file(navPath);
    if (navFile) {
      try {
        const xml = await navFile.async("string");
        const doc = new DOMParser().parseFromString(xml, "application/xhtml+xml");
        const links = doc.querySelectorAll("nav a, a");
        links.forEach((a) => {
          const href = a.getAttribute("href");
          const label = a.textContent?.trim();
          if (href && label) {
            const resolved = resolvePath(navPath, stripFragment(href));
            // Re-relativize back to opf-dir-relative paths used in manifest hrefs
            const opfDir = opfPath.includes("/")
              ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
              : "";
            const key = resolved.startsWith(opfDir) ? resolved.slice(opfDir.length) : resolved;
            if (!map.has(key)) map.set(key, label);
          }
        });
        if (map.size > 0) return map;
      } catch {
        /* fall through */
      }
    }
  }

  // EPUB2 NCX
  const spineEl = opfDoc.getElementsByTagName("spine")[0];
  const ncxId = spineEl?.getAttribute("toc");
  if (ncxId && manifest.has(ncxId)) {
    const ncxHref = manifest.get(ncxId)!.href;
    const ncxPath = resolvePath(opfPath, ncxHref);
    const ncxFile = zip.file(ncxPath);
    if (ncxFile) {
      try {
        const xml = await ncxFile.async("string");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const points = doc.getElementsByTagName("navPoint");
        const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
        Array.from(points).forEach((p) => {
          const label = p.getElementsByTagName("text")[0]?.textContent?.trim();
          const content = p.getElementsByTagName("content")[0]?.getAttribute("src");
          if (content && label) {
            const resolved = resolvePath(ncxPath, stripFragment(content));
            const key = resolved.startsWith(opfDir) ? resolved.slice(opfDir.length) : resolved;
            if (!map.has(key)) map.set(key, label);
          }
        });
      } catch {
        /* ignore */
      }
    }
  }

  return map;
}

async function blobToDataUrl(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(blob);
  });
}
