import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Set document title + description + Open Graph tags for the current page.
 * Values reset only when the next page calls this hook again.
 */
export function usePageMeta({ title, description, ogTitle, ogDescription, ogType = 'website' }: PageMeta) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      upsertMeta('meta[name="description"]', 'name', 'description', description);
      upsertMeta('meta[property="og:description"]', 'property', 'og:description', ogDescription ?? description);
    }
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', ogTitle ?? title);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', ogType);
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', ogTitle ?? title);
    if (description) {
      upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', ogDescription ?? description);
    }
  }, [title, description, ogTitle, ogDescription, ogType]);
}
