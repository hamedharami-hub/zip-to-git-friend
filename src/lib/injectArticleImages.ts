/**
 * Take images/figures from the ORIGINAL article HTML and interleave them
 * between top-level blocks of a REWRITTEN version so the shorter/AI rewrite
 * still shows the article's inline photos at roughly the same positions.
 *
 * - The article's cover image (matched by URL) is excluded so we don't
 *   duplicate what NewsArticle already renders above the reader.
 * - Images are distributed evenly among paragraph/heading boundaries.
 * - Runs in the browser using DOMParser — no dependencies.
 */
export function injectArticleImages(
  rewriteHtml: string,
  originalHtml: string | null | undefined,
  opts: { skipUrl?: string | null } = {},
): string {
  if (!rewriteHtml) return rewriteHtml;
  if (!originalHtml) return rewriteHtml;
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return rewriteHtml;
  }

  try {
    const parser = new DOMParser();
    const origDoc = parser.parseFromString(originalHtml, 'text/html');
    const skip = (opts.skipUrl ?? '').trim();

    // Collect distinct figure/img blocks in source order.
    const seen = new Set<string>();
    const media: string[] = [];
    const nodes = origDoc.body.querySelectorAll('figure, img');
    nodes.forEach((node) => {
      let figureHtml = '';
      let src = '';
      if (node.tagName === 'FIGURE') {
        // Skip figures whose only content is a nested img already collected.
        const img = node.querySelector('img');
        if (!img) return;
        src = img.getAttribute('src') || '';
        figureHtml = node.outerHTML;
      } else {
        // Skip <img> that's inside a <figure> — the figure handler took it.
        if ((node as HTMLElement).closest('figure')) return;
        src = (node as HTMLImageElement).getAttribute('src') || '';
        if (!src) return;
        const alt = (node as HTMLImageElement).getAttribute('alt') || '';
        figureHtml = `<figure><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" /></figure>`;
      }
      if (!src || seen.has(src)) return;
      if (skip && src === skip) return;
      seen.add(src);
      media.push(figureHtml);
    });

    if (media.length === 0) return rewriteHtml;

    const rwDoc = parser.parseFromString(rewriteHtml, 'text/html');
    const blocks = Array.from(rwDoc.body.children);
    if (blocks.length < 2) {
      // Not enough structure to interleave; append at the end.
      return rewriteHtml + '\n' + media.join('\n');
    }

    // Compute insertion positions: evenly spaced between blocks (never at very top or very bottom).
    const slots = blocks.length - 1;
    const count = Math.min(media.length, Math.max(1, slots));
    const positions: number[] = [];
    for (let i = 1; i <= count; i++) {
      const idx = Math.round((slots * i) / (count + 1));
      positions.push(Math.min(Math.max(idx, 1), blocks.length - 1));
    }

    // Insert from the end so earlier indices stay valid.
    for (let i = count - 1; i >= 0; i--) {
      const pos = positions[i];
      const anchor = blocks[pos];
      const fragment = parser.parseFromString(media[i], 'text/html').body.firstChild;
      if (!fragment) continue;
      // Add a marker class so styles can target injected images.
      if (fragment.nodeType === 1) {
        (fragment as HTMLElement).classList.add('inline-article-image');
      }
      anchor.parentNode?.insertBefore(fragment, anchor);
    }

    return rwDoc.body.innerHTML;
  } catch {
    return rewriteHtml;
  }
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
