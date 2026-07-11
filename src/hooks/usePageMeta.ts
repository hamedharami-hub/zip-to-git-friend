import { useEffect } from "react";

interface PageMeta {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  /** Absolute URL for canonical + og:url. Defaults to window.location.href. */
  canonicalUrl?: string;
  /** Absolute image URL for og:image / twitter:image. */
  image?: string;
}

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Set document title + description + Open Graph tags + canonical URL
 * for the current page. Values are re-applied whenever inputs change.
 */
export function usePageMeta({
  title,
  description,
  ogTitle,
  ogDescription,
  ogType = "website",
  canonicalUrl,
  image,
}: PageMeta) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      upsertMeta('meta[name="description"]', "name", "description", description);
      upsertMeta(
        'meta[property="og:description"]',
        "property",
        "og:description",
        ogDescription ?? description,
      );
      upsertMeta(
        'meta[name="twitter:description"]',
        "name",
        "twitter:description",
        ogDescription ?? description,
      );
    }
    upsertMeta('meta[property="og:title"]', "property", "og:title", ogTitle ?? title);
    upsertMeta('meta[property="og:type"]', "property", "og:type", ogType);
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", ogTitle ?? title);

    const href =
      canonicalUrl ??
      (typeof window !== "undefined" ? window.location.href.split("?")[0].split("#")[0] : "");
    if (href) {
      upsertLink("canonical", href);
      upsertMeta('meta[property="og:url"]', "property", "og:url", href);
    }

    if (image) {
      upsertMeta('meta[property="og:image"]', "property", "og:image", image);
      upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
    }
  }, [title, description, ogTitle, ogDescription, ogType, canonicalUrl, image]);
}
