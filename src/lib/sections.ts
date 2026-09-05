import {
  BookOpen,
  Brain,
  Film,
  Headphones,
  Mic,
  Newspaper,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type SectionKey =
  | "leitner"
  | "sentences"
  | "stories"
  | "news"
  | "books"
  | "videos"
  | "audio";

export interface SectionMeta {
  key: SectionKey;
  to: string;
  icon: LucideIcon;
  /** English label. */
  title: string;
  /** Persian label. */
  fa: string;
  /** Grid span used on Home. */
  span?: string;
}

export const SECTIONS: SectionMeta[] = [
  {
    key: "leitner",
    to: "/leitner",
    icon: Brain,
    title: "Leitner",
    fa: "فلش‌کارت",
    span: "col-span-2 row-span-2",
  },
  {
    key: "sentences",
    to: "/sentence-lab",
    icon: Mic,
    title: "Sentences",
    fa: "گفتار",
  },
  {
    key: "stories",
    to: "/language-books",
    icon: Sparkles,
    title: "Stories",
    fa: "داستان",
  },
  {
    key: "news",
    to: "/news",
    icon: Newspaper,
    title: "News",
    fa: "اخبار",
    span: "col-span-2",
  },
  {
    key: "books",
    to: "/books",
    icon: BookOpen,
    title: "Books",
    fa: "کتاب",
  },
  {
    key: "videos",
    to: "/videos",
    icon: Film,
    title: "Videos",
    fa: "ویدیو",
  },
  {
    key: "audio",
    to: "/audio",
    icon: Headphones,
    title: "Podcasts",
    fa: "پادکست",
    span: "col-span-2",
  },
];

export const sectionClass = (key: SectionKey) => `sec-${key}`;
