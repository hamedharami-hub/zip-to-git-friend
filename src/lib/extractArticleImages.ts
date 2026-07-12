export interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string;
}

/**
 * Extracts a distinct, ordered list of article images from an HTML string.
 * Handles <figure> tags with optional <figcaption> as well as plain <img> tags.
 */
export function extractArticleImages(
  html: string | null | undefined,
  opts: { skipUrl?: string | null } = {},
): LightboxImage[] {
  if (!html || typeof window === "undefined" || typeof DOMParser === "undefined") {
    return [];
  }

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const skip = (opts.skipUrl ?? "").trim();
    const seen = new Set<string>();
    const images: LightboxImage[] = [];

    const nodes = doc.body.querySelectorAll("figure, img");
    nodes.forEach((node) => {
      let src = "";
      let alt = "";
      let caption = "";

      if (node.tagName === "FIGURE") {
        const img = node.querySelector("img");
        if (!img) return;
        src = img.getAttribute("src") || "";
        alt = img.getAttribute("alt") || "";
        const figcaption = node.querySelector("figcaption");
        if (figcaption) caption = figcaption.textContent?.trim() ?? "";
      } else {
        if ((node as HTMLElement).closest("figure")) return;
        src = (node as HTMLImageElement).getAttribute("src") || "";
        alt = (node as HTMLImageElement).getAttribute("alt") || "";
      }

      if (!src) return;
      if (skip && src === skip) return;
      if (seen.has(src)) return;
      seen.add(src);
      images.push({ src, alt, caption });
    });

    return images;
  } catch {
    return [];
  }
}
