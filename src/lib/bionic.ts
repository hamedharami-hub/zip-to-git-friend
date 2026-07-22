/**
 * Bionic-Reading: walk text nodes inside an element and wrap the first
 * portion of each word in a <b class="rm-bionic"> span. Reversible via
 * `removeBionic(el)`. Preserves existing HTML (links, images, etc.).
 */

const BIONIC_ATTR = "data-rm-bionic";

// Persian/Arabic script ranges (we only need to detect "contains RTL").
const RTL_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Letters that do NOT join to the following letter in Arabic/Persian.
// Splitting after these keeps the word shape intact.
const RTL_NON_JOINING_RIGHT = new Set([
  "\u0621", // HAMZA
  "\u0622", // ALEF WITH MADDA ABOVE
  "\u0623", // ALEF WITH HAMZA ABOVE
  "\u0624", // WAW WITH HAMZA ABOVE
  "\u0625", // ALEF WITH HAMZA BELOW
  "\u0626", // YEH WITH HAMZA ABOVE
  "\u0627", // ALEF
  "\u062F", // DAL
  "\u0630", // THAL
  "\u0631", // REH
  "\u0632", // ZAIN
  "\u0698", // JEH
  "\u0648", // WAW
  "\u0649", // ALEF MAKSURA
  "\u0629", // TEH MARBUTA
]);

function isWordChar(ch: string): boolean {
  return /\p{L}|\p{N}/u.test(ch);
}

function trimNonWordEdges(part: string): {
  leading: string;
  core: string;
  trailing: string;
} {
  let start = 0;
  while (start < part.length && !isWordChar(part[start])) start++;
  let end = part.length;
  while (end > start && !isWordChar(part[end - 1])) end--;
  return {
    leading: part.slice(0, start),
    core: part.slice(start, end),
    trailing: part.slice(end),
  };
}

function idealCut(core: string, intensity: number): number {
  const n = core.length;
  if (n <= 1) return n;
  const raw = Math.max(1, Math.min(n - 1, Math.ceil(n * intensity)));
  if (!RTL_SCRIPT_RE.test(core)) return raw;

  // For Persian/Arabic, prefer a cut after a letter that does not join to the
  // next one. This keeps the cursive word shape intact.
  let cut = raw;
  while (cut < n && !RTL_NON_JOINING_RIGHT.has(core[cut - 1])) cut++;
  if (cut < n) return cut;

  // No safe boundary forward; walk back to the previous safe spot.
  cut = raw;
  while (cut > 1 && !RTL_NON_JOINING_RIGHT.has(core[cut - 1])) cut--;
  return cut;
}

/** Apply bionic bolding to all text nodes in `root`. `intensity` = 0..1. */
export function applyBionic(root: HTMLElement, intensity = 0.5): void {
  if (!root) return;
  removeBionic(root); // idempotent
  root.setAttribute(BIONIC_ATTR, "1");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "CODE" || tag === "PRE")
        return NodeFilter.FILTER_REJECT;
      if (p.closest("[data-rm-bionic-skip]")) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const targets: Text[] = [];
  let cur = walker.nextNode();
  while (cur) {
    targets.push(cur as Text);
    cur = walker.nextNode();
  }

  for (const textNode of targets) {
    const text = textNode.nodeValue ?? "";
    const frag = document.createDocumentFragment();
    // Split preserving whitespace
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }
      const { leading, core, trailing } = trimNonWordEdges(part);
      if (core.length <= 1) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }
      const cut = idealCut(core, intensity);
      frag.appendChild(document.createTextNode(leading));
      const wrap = document.createElement("span");
      wrap.className = "rm-bionic-word";
      const b = document.createElement("b");
      b.className = "rm-bionic";
      b.textContent = core.slice(0, cut);
      wrap.appendChild(b);
      wrap.appendChild(document.createTextNode(core.slice(cut)));
      frag.appendChild(wrap);
      frag.appendChild(document.createTextNode(trailing));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

export function removeBionic(root: HTMLElement): void {
  if (!root) return;
  root.removeAttribute(BIONIC_ATTR);
  const wraps = root.querySelectorAll("span.rm-bionic-word");
  wraps.forEach((w) => {
    const text = w.textContent ?? "";
    w.replaceWith(document.createTextNode(text));
  });
  // Merge adjacent text nodes
  root.normalize();
}

export function isBionicActive(root: HTMLElement | null): boolean {
  return !!root && root.getAttribute(BIONIC_ATTR) === "1";
}
