import { useCallback, useMemo, useState } from "react";
import { extractArticleImages, type LightboxImage } from "@/lib/extractArticleImages";
import type { NewsArticle } from "@/types";

export interface UseArticleLightboxParams {
  article: NewsArticle | null;
  rewriteHtmlWithImages?: string;
}

export interface UseArticleLightboxReturn {
  allImages: LightboxImage[];
  lightboxOpen: boolean;
  setLightboxOpen: (open: boolean) => void;
  lightboxImages: LightboxImage[];
  setLightboxImages: (images: LightboxImage[]) => void;
  lightboxIndex: number;
  setLightboxIndex: (index: number) => void;
  openLightbox: (src: string) => void;
}

export function useArticleLightbox({
  article,
  rewriteHtmlWithImages,
}: UseArticleLightboxParams): UseArticleLightboxReturn {
  const articleImageUrl = article?.imageUrl;
  const articleContentHtml = article?.contentHtml;
  const articleTitle = article?.title;

  const allImages = useMemo<LightboxImage[]>(() => {
    const map = new Map<string, LightboxImage>();
    const add = (html: string | null | undefined) => {
      for (const img of extractArticleImages(html, { skipUrl: articleImageUrl })) {
        if (!map.has(img.src)) map.set(img.src, img);
      }
    };
    if (articleImageUrl) map.set(articleImageUrl, { src: articleImageUrl, alt: articleTitle });
    if (articleContentHtml) add(articleContentHtml);
    if (rewriteHtmlWithImages) add(rewriteHtmlWithImages);
    return Array.from(map.values());
  }, [articleImageUrl, articleContentHtml, articleTitle, rewriteHtmlWithImages]);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = useCallback(
    (src: string) => {
      const idx = allImages.findIndex((img) => img.src === src);
      if (idx >= 0) {
        setLightboxImages(allImages);
        setLightboxIndex(idx);
      } else {
        setLightboxImages([{ src, alt: "" }]);
        setLightboxIndex(0);
      }
      setLightboxOpen(true);
    },
    [allImages],
  );

  return {
    allImages,
    lightboxOpen,
    setLightboxOpen,
    lightboxImages,
    setLightboxImages,
    lightboxIndex,
    setLightboxIndex,
    openLightbox,
  };
}
