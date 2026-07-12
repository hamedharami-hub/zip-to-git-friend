export type PublicTopic = {
  label: string;
  labelFa: string;
  query: string;
  language: string;
};

export const PUBLIC_TOPICS: PublicTopic[] = [
  { label: "World", labelFa: "جهان", query: "world news", language: "en" },
  { label: "Iran", labelFa: "ایران", query: "ایران", language: "fa" },
  { label: "Technology", labelFa: "تکنولوژی", query: "technology news", language: "en" },
  { label: "Health", labelFa: "سلامت", query: "health news", language: "en" },
  { label: "Business", labelFa: "اقتصاد", query: "business news", language: "en" },
];

export const SAMPLE_SOURCES: {
  kind: "rss" | "topic";
  name: string;
  url: string | null;
  topic: string | null;
  language: string;
}[] = [
  { kind: "topic", name: "World News", url: null, topic: "world news", language: "en" },
  { kind: "topic", name: "ایران", url: null, topic: "ایران", language: "fa" },
  { kind: "topic", name: "Technology", url: null, topic: "technology news", language: "en" },
  {
    kind: "rss",
    name: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    topic: null,
    language: "en",
  },
];
