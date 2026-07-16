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
  { label: "AI", labelFa: "هوش مصنوعی", query: "artificial intelligence", language: "en" },
  { label: "Science", labelFa: "علم", query: "science news", language: "en" },
  { label: "Health", labelFa: "سلامت", query: "health news", language: "en" },
  { label: "Business", labelFa: "اقتصاد", query: "business news", language: "en" },
  { label: "Startups", labelFa: "استارتاپ", query: "startup funding", language: "en" },
  { label: "Politics", labelFa: "سیاست", query: "politics news", language: "en" },
  { label: "Sports", labelFa: "ورزش", query: "sports news", language: "en" },
  { label: "Culture", labelFa: "فرهنگ", query: "culture news", language: "en" },
];

export type CuratedFeed = {
  name: string;
  url: string;
  language: string;
};

export type CuratedCategory = {
  category: string;
  categoryFa: string;
  feeds: CuratedFeed[];
};

export const CURATED_CATEGORIES: CuratedCategory[] = [
  {
    category: "Technology",
    categoryFa: "تکنولوژی",
    feeds: [
      { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", language: "en" },
      { name: "TechCrunch", url: "https://techcrunch.com/feed/", language: "en" },
      { name: "Wired", url: "https://www.wired.com/feed/rss", language: "en" },
      { name: "Ars Technica", url: "https://arstechnica.com/feed/", language: "en" },
      { name: "Engadget", url: "https://www.engadget.com/rss.xml", language: "en" },
      { name: "Gizmodo", url: "https://gizmodo.com/rss", language: "en" },
      { name: "CNET", url: "https://www.cnet.com/rss/news/", language: "en" },
      { name: "ZDNet", url: "https://www.zdnet.com/news/rss.xml", language: "en" },
      { name: "Hacker News", url: "https://news.ycombinator.com/rss", language: "en" },
    ],
  },
  {
    category: "Science",
    categoryFa: "علم",
    feeds: [
      {
        name: "Scientific American",
        url: "https://www.scientificamerican.com/rss/news.rss",
        language: "en",
      },
      { name: "Nature News", url: "https://www.nature.com/nature.rss", language: "en" },
      { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/all.xml", language: "en" },
      {
        name: "The Conversation",
        url: "https://theconversation.com/global/en/articles.atom",
        language: "en",
      },
    ],
  },
  {
    category: "Business",
    categoryFa: "اقتصاد و کسب‌وکار",
    feeds: [
      { name: "Reuters Business", url: "https://www.reuters.com/business/rss/", language: "en" },
      { name: "MarketWatch", url: "https://www.marketwatch.com/rss", language: "en" },
      { name: "Business Insider", url: "https://www.businessinsider.com/rss", language: "en" },
      { name: "Fortune", url: "https://fortune.com/feed/", language: "en" },
      { name: "Financial Times", url: "https://www.ft.com/rss/home/uk", language: "en" },
    ],
  },
  {
    category: "World News",
    categoryFa: "اخبار جهان",
    feeds: [
      { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", language: "en" },
      { name: "The Guardian World", url: "https://www.theguardian.com/world/rss", language: "en" },
      {
        name: "Al Jazeera English",
        url: "https://www.aljazeera.com/xml/rss/all.xml",
        language: "en",
      },
      { name: "Reuters World", url: "https://www.reuters.com/world/rss/", language: "en" },
      { name: "AP News Top", url: "https://apnews.com/hub/world-news/rss", language: "en" },
      { name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", language: "en" },
      { name: "Axios", url: "https://www.axios.com/feeds/streams/all.rss", language: "en" },
      { name: "The Atlantic", url: "https://www.theatlantic.com/feed/all/", language: "en" },
    ],
  },
  {
    category: "Think Tanks",
    categoryFa: "تینک تانک‌ها و سیاست",
    feeds: [
      { name: "Brookings Institution", url: "https://www.brookings.edu/feed/", language: "en" },
      { name: "Council on Foreign Relations", url: "https://www.cfr.org/rss.xml", language: "en" },
      { name: "Chatham House", url: "https://www.chathamhouse.org/rss", language: "en" },
      { name: "Carnegie Endowment", url: "https://carnegieendowment.org/rss", language: "en" },
      { name: "CSIS", url: "https://www.csis.org/rss", language: "en" },
      { name: "RAND Corporation", url: "https://www.rand.org/rss/news.xml", language: "en" },
      { name: "Atlantic Council", url: "https://www.atlanticcouncil.org/feed/", language: "en" },
      { name: "Foreign Affairs", url: "https://www.foreignaffairs.com/rss.xml", language: "en" },
    ],
  },
  {
    category: "Health",
    categoryFa: "سلامت",
    feeds: [
      { name: "WHO", url: "https://www.who.int/rss-feeds/news-english.xml", language: "en" },
      {
        name: "NIH News",
        url: "https://www.nih.gov/news-events/news-releases/rss.xml",
        language: "en",
      },
      {
        name: "Medical News Today",
        url: "https://www.medicalnewstoday.com/news/feed",
        language: "en",
      },
    ],
  },
  {
    category: "Sports",
    categoryFa: "ورزش",
    feeds: [
      { name: "ESPN", url: "https://www.espn.com/espn/rss/news", language: "en" },
      {
        name: "BBC Sport",
        url: "https://feeds.bbci.co.uk/sport/rss.xml?edition=uk",
        language: "en",
      },
    ],
  },
  {
    category: "Culture & Design",
    categoryFa: "فرهنگ و طراحی",
    feeds: [
      { name: "Dezeen", url: "https://www.dezeen.com/rss/", language: "en" },
      { name: "Vox", url: "https://www.vox.com/rss/index.xml", language: "en" },
      { name: "Aeon", url: "https://aeon.co/feed.rss", language: "en" },
    ],
  },
  {
    category: "Persian",
    categoryFa: "فارسی",
    feeds: [
      { name: "BBC Persian", url: "https://feeds.bbci.co.uk/persian/rss.xml", language: "fa" },
      { name: "Deutsche Welle Persian", url: "https://rss.dw.com/rdf/rss-per-all", language: "fa" },
      { name: "Radio Farda", url: "https://www.rferl.org/api/epiqq", language: "fa" },
    ],
  },
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
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    topic: null,
    language: "en",
  },
  {
    kind: "rss",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    topic: null,
    language: "en",
  },
  {
    kind: "rss",
    name: "Reuters World",
    url: "https://www.reuters.com/world/rss/",
    topic: null,
    language: "en",
  },
  {
    kind: "rss",
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    topic: null,
    language: "en",
  },
  {
    kind: "rss",
    name: "Brookings Institution",
    url: "https://www.brookings.edu/feed/",
    topic: null,
    language: "en",
  },
  {
    kind: "rss",
    name: "BBC Persian",
    url: "https://feeds.bbci.co.uk/persian/rss.xml",
    topic: null,
    language: "fa",
  },
];
