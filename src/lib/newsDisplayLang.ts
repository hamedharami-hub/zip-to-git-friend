import type { DisplayLang } from "@/components/books/InteractiveBookText";

/** Persisted display-language preference shared by all News reader surfaces. */
export const NEWS_DISPLAY_LANG_KEY = "news.displayLang.v1";

export function loadNewsDisplayLang(fallback: DisplayLang = "both"): DisplayLang {
  try {
    const v = localStorage.getItem(NEWS_DISPLAY_LANG_KEY);
    if (v === "en" || v === "fa" || v === "both") return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveNewsDisplayLang(lang: DisplayLang) {
  try {
    localStorage.setItem(NEWS_DISPLAY_LANG_KEY, lang);
  } catch {
    /* ignore */
  }
}
