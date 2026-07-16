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
  { label: "AI", labelFa: "هوش مصنوعی", query: "artificial intelligence news", language: "en" },
  { label: "Health", labelFa: "سلامت", query: "health news", language: "en" },
  { label: "Science", labelFa: "علم", query: "science news", language: "en" },
  { label: "Business", labelFa: "اقتصاد", query: "business news", language: "en" },
  { label: "Climate", labelFa: "اقلیم", query: "climate change news", language: "en" },
  { label: "Middle East", labelFa: "خاورمیانه", query: "Middle East news", language: "en" },
];

export type CatalogCategory = "tech" | "think_tank" | "science" | "business" | "world" | "persian";

export interface CatalogCategoryDef {
  id: CatalogCategory;
  label: string;
  labelFa: string;
}

export const CATALOG_CATEGORIES: CatalogCategoryDef[] = [
  { id: "tech", label: "Technology", labelFa: "تکنولوژی" },
  { id: "think_tank", label: "Think Tanks", labelFa: "تینک‌تنک‌ها" },
  { id: "science", label: "Science", labelFa: "علم" },
  { id: "business", label: "Business", labelFa: "اقتصاد" },
  { id: "world", label: "World News", labelFa: "اخبار جهان" },
  { id: "persian", label: "Persian / ایران", labelFa: "فارسی / ایران" },
];

export interface SourceCatalogItem {
  id: string;
  name: string;
  nameFa: string;
  category: CatalogCategory;
  url: string;
  language: string;
}

export const SOURCE_CATALOG: SourceCatalogItem[] = [
  // Tech
  {
    id: "techcrunch",
    name: "TechCrunch",
    nameFa: "تک‌کرانچ",
    category: "tech",
    url: "https://techcrunch.com/feed/",
    language: "en",
  },
  {
    id: "the-verge",
    name: "The Verge",
    nameFa: "د ورج",
    category: "tech",
    url: "https://www.theverge.com/rss/index.xml",
    language: "en",
  },
  {
    id: "wired",
    name: "Wired",
    nameFa: "وایرد",
    category: "tech",
    url: "https://www.wired.com/feed/rss",
    language: "en",
  },
  {
    id: "ars-technica",
    name: "Ars Technica",
    nameFa: "آرس تکنیکا",
    category: "tech",
    url: "https://arstechnica.com/feed/",
    language: "en",
  },
  {
    id: "engadget",
    name: "Engadget",
    nameFa: "انگجت",
    category: "tech",
    url: "https://www.engadget.com/rss.xml",
    language: "en",
  },
  {
    id: "9to5mac",
    name: "9to5Mac",
    nameFa: "ناین تو فایو مک",
    category: "tech",
    url: "https://9to5mac.com/feed/",
    language: "en",
  },
  {
    id: "9to5google",
    name: "9to5Google",
    nameFa: "ناین تو فایو گوگل",
    category: "tech",
    url: "https://9to5google.com/feed/",
    language: "en",
  },
  {
    id: "thenextweb",
    name: "The Next Web",
    nameFa: "نکست وب",
    category: "tech",
    url: "https://thenextweb.com/feed/",
    language: "en",
  },
  {
    id: "gizmodo",
    name: "Gizmodo",
    nameFa: "گیزمودو",
    category: "tech",
    url: "https://gizmodo.com/rss",
    language: "en",
  },
  {
    id: "cnet",
    name: "CNET",
    nameFa: "سی‌نت",
    category: "tech",
    url: "https://www.cnet.com/rss/news/",
    language: "en",
  },
  {
    id: "hackernews",
    name: "Hacker News",
    nameFa: "هکرنیوز",
    category: "tech",
    url: "https://news.ycombinator.com/rss",
    language: "en",
  },

  // Think tanks / policy
  {
    id: "atlantic-council",
    name: "Atlantic Council",
    nameFa: "آتلانتیک کونسیل",
    category: "think_tank",
    url: "https://www.atlanticcouncil.org/feed/",
    language: "en",
  },
  {
    id: "foreign-policy",
    name: "Foreign Policy",
    nameFa: "فارن پالیسی",
    category: "think_tank",
    url: "https://foreignpolicy.com/feed/",
    language: "en",
  },
  {
    id: "the-diplomat",
    name: "The Diplomat",
    nameFa: "دیپلمات",
    category: "think_tank",
    url: "https://thediplomat.com/feed/",
    language: "en",
  },
  {
    id: "al-monitor",
    name: "Al-Monitor",
    nameFa: "ال‌مانیتور",
    category: "think_tank",
    url: "https://www.al-monitor.com/rss",
    language: "en",
  },
  {
    id: "warontherocks",
    name: "War on the Rocks",
    nameFa: "وار آن د راکس",
    category: "think_tank",
    url: "https://warontherocks.com/feed/",
    language: "en",
  },
  {
    id: "crisis-group",
    name: "International Crisis Group",
    nameFa: "گروه بحران بین‌الملل",
    category: "think_tank",
    url: "https://www.crisisgroup.org/rss",
    language: "en",
  },
  {
    id: "carnegie-npp",
    name: "Carnegie Nuclear Policy",
    nameFa: "کارنگی سیاست هسته‌ای",
    category: "think_tank",
    url: "https://feeds.feedburner.com/carnegie/NPP",
    language: "en",
  },

  // Science
  {
    id: "nature",
    name: "Nature News",
    nameFa: "نیچر",
    category: "science",
    url: "https://www.nature.com/nature.rss",
    language: "en",
  },
  {
    id: "new-scientist",
    name: "New Scientist",
    nameFa: "نیو ساینتیست",
    category: "science",
    url: "https://www.newscientist.com/feed/",
    language: "en",
  },
  {
    id: "physorg",
    name: "Phys.org",
    nameFa: "فیز دات ارگ",
    category: "science",
    url: "https://phys.org/rss-feed/",
    language: "en",
  },
  {
    id: "sciencemag",
    name: "Science",
    nameFa: "ساینس",
    category: "science",
    url: "https://www.science.org/rss/news_current.xml",
    language: "en",
  },

  // Business
  {
    id: "cnbc-top",
    name: "CNBC Top News",
    nameFa: "سی‌ان‌بی‌سی",
    category: "business",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    language: "en",
  },
  {
    id: "cnbc-tech",
    name: "CNBC Technology",
    nameFa: "سی‌ان‌بی‌سی تکنولوژی",
    category: "business",
    url: "https://www.cnbc.com/id/100727362/device/rss/rss.html",
    language: "en",
  },
  {
    id: "fortune",
    name: "Fortune",
    nameFa: "فورچون",
    category: "business",
    url: "https://fortune.com/feed/",
    language: "en",
  },
  {
    id: "forbes-business",
    name: "Forbes Business",
    nameFa: "فوربز بیزینس",
    category: "business",
    url: "https://www.forbes.com/business/feed/",
    language: "en",
  },
  {
    id: "marketwatch",
    name: "MarketWatch",
    nameFa: "مارکت‌واچ",
    category: "business",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/",
    language: "en",
  },
  {
    id: "business-insider",
    name: "Business Insider",
    nameFa: "بیزینس اینسایدر",
    category: "business",
    url: "https://www.businessinsider.com/rss",
    language: "en",
  },

  // World news
  {
    id: "bbc-world",
    name: "BBC World",
    nameFa: "بی‌بی‌سی جهان",
    category: "world",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    language: "en",
  },
  {
    id: "guardian-world",
    name: "The Guardian",
    nameFa: "گاردین",
    category: "world",
    url: "https://www.theguardian.com/world/rss",
    language: "en",
  },
  {
    id: "aljazeera",
    name: "Al Jazeera",
    nameFa: "الجزیره",
    category: "world",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    language: "en",
  },
  {
    id: "npr",
    name: "NPR News",
    nameFa: "ان‌پی‌آر",
    category: "world",
    url: "https://feeds.npr.org/1001/rss.xml",
    language: "en",
  },
  {
    id: "the-hill",
    name: "The Hill",
    nameFa: "د هیل",
    category: "world",
    url: "https://thehill.com/homenews/feed/",
    language: "en",
  },
  {
    id: "axios",
    name: "Axios",
    nameFa: "اکسیوس",
    category: "world",
    url: "https://www.axios.com/feeds/feed.rss",
    language: "en",
  },
  {
    id: "middle-east-eye",
    name: "Middle East Eye",
    nameFa: "میدل ایست آی",
    category: "world",
    url: "https://www.middleeasteye.net/rss",
    language: "en",
  },

  // Persian
  {
    id: "bbc-persian",
    name: "BBC Persian",
    nameFa: "بی‌بی‌سی فارسی",
    category: "persian",
    url: "https://feeds.bbci.co.uk/persian/rss.xml",
    language: "fa",
  },
  {
    id: "radio-farda",
    name: "Radio Farda",
    nameFa: "رادیو فردا",
    category: "persian",
    url: "https://www.radiofarda.com/api/",
    language: "fa",
  },
  {
    id: "kayhan-london",
    name: "Kayhan London",
    nameFa: "کیهان لندن",
    category: "persian",
    url: "https://kayhan.london/fa/feed/",
    language: "fa",
  },
  {
    id: "isna",
    name: "ISNA",
    nameFa: "ایسنا",
    category: "persian",
    url: "https://www.isna.ir/rss",
    language: "fa",
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
    name: "بی‌بی‌سی فارسی",
    url: "https://feeds.bbci.co.uk/persian/rss.xml",
    topic: null,
    language: "fa",
  },
  {
    kind: "rss",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    topic: null,
    language: "en",
  },
];
