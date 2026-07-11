/**
 * Bionic-Reading: walk text nodes inside an element and wrap the first
 * portion of each word in a <b class="rm-bionic"> span. Reversible via
 * `removeBionic(el)`. Preserves existing HTML (links, images, etc.).
 */

const BIONIC_ATTR = "data-rm-bionic";

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
      const n = part.length;
      const cut = Math.max(1, Math.min(n - 1, Math.ceil(n * intensity)));
      // Skip very short tokens like "a" — just append plain
      if (n <= 1) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }
      const wrap = document.createElement("span");
      wrap.className = "rm-bionic-word";
      const b = document.createElement("b");
      b.className = "rm-bionic";
      b.textContent = part.slice(0, cut);
      wrap.appendChild(b);
      wrap.appendChild(document.createTextNode(part.slice(cut)));
      frag.appendChild(wrap);
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
