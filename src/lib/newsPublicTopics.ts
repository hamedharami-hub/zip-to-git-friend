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
  { label: "Startups", labelFa: "استارتاپ", query: "startup funding", language: "en" },
  { label: "Politics", labelFa: "سیاست", query: "politics news", language: "en" },
  { label: "Sports", labelFa: "ورزش", query: "sports news", language: "en" },
  { label: "Culture", labelFa: "فرهنگ", query: "culture news", language: "en" },
  { label: "Climate", labelFa: "اقلیم", query: "climate change news", language: "en" },
  { label: "Middle East", labelFa: "خاورمیانه", query: "Middle East news", language: "en" },
  { label: "Cybersecurity", labelFa: "امنیت سایبری", query: "cybersecurity news", language: "en" },
  { label: "Space", labelFa: "فضا", query: "space exploration news", language: "en" },
  { label: "Design", labelFa: "طراحی", query: "design news", language: "en" },
  { label: "Psychology", labelFa: "روان‌شناسی", query: "psychology news", language: "en" },
  { label: "History", labelFa: "تاریخ", query: "history news", language: "en" },
  { label: "Philosophy", labelFa: "فلسفه", query: "philosophy news", language: "en" },
  { label: "Film", labelFa: "سینما", query: "film movie news", language: "en" },
];

export type CatalogCategory =
  | "tech"
  | "think_tank"
  | "science"
  | "space"
  | "security"
  | "business"
  | "world"
  | "health"
  | "sports"
  | "culture"
  | "design"
  | "film"
  | "persian";

export interface CatalogCategoryDef {
  id: CatalogCategory;
  label: string;
  labelFa: string;
}

export const CATALOG_CATEGORIES: CatalogCategoryDef[] = [
  { id: "tech", label: "Technology", labelFa: "تکنولوژی" },
  { id: "think_tank", label: "Think Tanks", labelFa: "تینک‌تنک‌ها" },
  { id: "science", label: "Science", labelFa: "علم" },
  { id: "space", label: "Space", labelFa: "فضا" },
  { id: "security", label: "Cybersecurity", labelFa: "امنیت سایبری" },
  { id: "business", label: "Business", labelFa: "اقتصاد" },
  { id: "world", label: "World News", labelFa: "اخبار جهان" },
  { id: "health", label: "Health", labelFa: "سلامت" },
  { id: "sports", label: "Sports", labelFa: "ورزش" },
  { id: "culture", label: "Culture", labelFa: "فرهنگ" },
  { id: "design", label: "Design", labelFa: "طراحی" },
  { id: "film", label: "Film", labelFa: "سینما" },
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
    id: "mit-technology-review",
    name: "MIT Technology Review",
    nameFa: "ام‌آی‌تی تکنولوژی ریویو",
    category: "tech",
    url: "https://www.technologyreview.com/feed/",
    language: "en",
  },
  {
    id: "the-register",
    name: "The Register",
    nameFa: "د رجیستر",
    category: "tech",
    url: "https://www.theregister.com/headlines.atom",
    language: "en",
  },
  {
    id: "venturebeat",
    name: "VentureBeat",
    nameFa: "ونچربیت",
    category: "tech",
    url: "https://venturebeat.com/feed/",
    language: "en",
  },
  {
    id: "zdnet",
    name: "ZDNET",
    nameFa: "زد‌دنت",
    category: "tech",
    url: "https://www.zdnet.com/news/rss.xml",
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
  {
    id: "techmeme",
    name: "Techmeme",
    nameFa: "تک‌میم",
    category: "tech",
    url: "https://www.techmeme.com/feed.xml",
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
  {
    id: "csis",
    name: "CSIS",
    nameFa: "مرکز مطالعات راهبردی و بین‌الملل",
    category: "think_tank",
    url: "https://www.csis.org/rss",
    language: "en",
  },
  {
    id: "chatham-house",
    name: "Chatham House",
    nameFa: "چتم هاوس",
    category: "think_tank",
    url: "https://www.chathamhouse.org/feed",
    language: "en",
  },
  {
    id: "piie",
    name: "Peterson Institute",
    nameFa: "پیترسون",
    category: "think_tank",
    url: "https://www.piie.com/rss.xml",
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
  {
    id: "scientific-american",
    name: "Scientific American",
    nameFa: "ساینتیفیک آمریکن",
    category: "science",
    url: "https://www.scientificamerican.com/feed/atom",
    language: "en",
  },
  {
    id: "nautilus",
    name: "Nautilus",
    nameFa: "ناتیلوس",
    category: "science",
    url: "https://nautil.us/feed/",
    language: "en",
  },

  // Space
  {
    id: "nasa",
    name: "NASA",
    nameFa: "ناسا",
    category: "space",
    url: "https://www.nasa.gov/feed/",
    language: "en",
  },
  {
    id: "space-com",
    name: "Space.com",
    nameFa: "اسپیس دات کام",
    category: "space",
    url: "https://www.space.com/feeds/all",
    language: "en",
  },
  {
    id: "spacenews",
    name: "SpaceNews",
    nameFa: "اسپیس نیوز",
    category: "space",
    url: "https://spacenews.com/feed/",
    language: "en",
  },

  // Security
  {
    id: "bleepingcomputer",
    name: "BleepingComputer",
    nameFa: "بلیپینگ کامپیوتر",
    category: "security",
    url: "https://www.bleepingcomputer.com/feed/",
    language: "en",
  },
  {
    id: "krebsonsecurity",
    name: "Krebs on Security",
    nameFa: "کربز آن سکیوریتی",
    category: "security",
    url: "https://krebsonsecurity.com/feed/",
    language: "en",
  },
  {
    id: "darkreading",
    name: "Dark Reading",
    nameFa: "دارک ریدینگ",
    category: "security",
    url: "https://www.darkreading.com/rss.xml",
    language: "en",
  },
  {
    id: "cso-online",
    name: "CSO Online",
    nameFa: "سی‌اس‌آنلاین",
    category: "security",
    url: "https://www.csoonline.com/feed/",
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
  {
    id: "the-economist",
    name: "The Economist",
    nameFa: "اکونومیست",
    category: "business",
    url: "https://www.economist.com/latest/rss.xml",
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
  {
    id: "ap-news",
    name: "AP News",
    nameFa: "آسوشیتد پرس",
    category: "world",
    url: "https://apnews.com/rss",
    language: "en",
  },
  {
    id: "nyt-world",
    name: "The New York Times — World",
    nameFa: "نیویورک تایمز جهان",
    category: "world",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    language: "en",
  },
  {
    id: "france24",
    name: "France 24",
    nameFa: "فرانس ۲۴",
    category: "world",
    url: "https://www.france24.com/en/rss-france24",
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
  {
    id: "dw-persian",
    name: "Deutsche Welle Persian",
    nameFa: "دویچه وله فارسی",
    category: "persian",
    url: "https://rss.dw.com/rdf/rss-per-all",
    language: "fa",
  },
  {
    id: "voa-persian",
    name: "VOA Persian",
    nameFa: "صدای آمریکا فارسی",
    category: "persian",
    url: "https://ir.voanews.com/rss",
    language: "fa",
  },
  {
    id: "iranintl",
    name: "Iran International",
    nameFa: "ایران اینترنشنال",
    category: "persian",
    url: "https://www.iranintl.com/feeds/latest",
    language: "fa",
  },
  {
    id: "mehr-news",
    name: "Mehr News",
    nameFa: "مهر نیوز",
    category: "persian",
    url: "https://www.mehrnews.com/rss",
    language: "fa",
  },

  // Health
  {
    id: "who",
    name: "WHO",
    nameFa: "سازمان بهداشت جهانی",
    category: "health",
    url: "https://www.who.int/rss-feeds/news-english.xml",
    language: "en",
  },
  {
    id: "nih",
    name: "NIH News",
    nameFa: "ان‌آی‌اچ",
    category: "health",
    url: "https://www.nih.gov/news-events/news-releases/rss.xml",
    language: "en",
  },
  {
    id: "medical-newstoday",
    name: "Medical News Today",
    nameFa: "مدیکال نیوز تودی",
    category: "health",
    url: "https://www.medicalnewstoday.com/news/feed",
    language: "en",
  },

  // Sports
  {
    id: "espn",
    name: "ESPN",
    nameFa: "ای‌اس‌پی‌ان",
    category: "sports",
    url: "https://www.espn.com/espn/rss/news",
    language: "en",
  },
  {
    id: "bbc-sport",
    name: "BBC Sport",
    nameFa: "بی‌بی‌سی ورزش",
    category: "sports",
    url: "https://feeds.bbci.co.uk/sport/rss.xml?edition=uk",
    language: "en",
  },

  // Culture
  {
    id: "dezeen",
    name: "Dezeen",
    nameFa: "دیزین",
    category: "culture",
    url: "https://www.dezeen.com/rss/",
    language: "en",
  },
  {
    id: "vox",
    name: "Vox",
    nameFa: "وکس",
    category: "culture",
    url: "https://www.vox.com/rss/index.xml",
    language: "en",
  },
  {
    id: "aeon",
    name: "Aeon",
    nameFa: "ایون",
    category: "culture",
    url: "https://aeon.co/feed.rss",
    language: "en",
  },

  // Design
  {
    id: "archdaily",
    name: "ArchDaily",
    nameFa: "آرک‌دیلی",
    category: "design",
    url: "https://www.archdaily.com/feed",
    language: "en",
  },
  {
    id: "design-milk",
    name: "Design Milk",
    nameFa: "دیزاین میلک",
    category: "design",
    url: "https://design-milk.com/feed/",
    language: "en",
  },
  {
    id: "its-nice-that",
    name: "It's Nice That",
    nameFa: "ایتس نایس دت",
    category: "design",
    url: "https://www.itsnicethat.com/feed",
    language: "en",
  },

  // Film
  {
    id: "variety",
    name: "Variety",
    nameFa: "واریتی",
    category: "film",
    url: "https://variety.com/feed/",
    language: "en",
  },
  {
    id: "indiewire",
    name: "IndieWire",
    nameFa: "ایندی‌وایر",
    category: "film",
    url: "https://www.indiewire.com/feed/rss/",
    language: "en",
  },
  {
    id: "deadline",
    name: "Deadline",
    nameFa: "ددلاین",
    category: "film",
    url: "https://deadline.com/feed/",
    language: "en",
  },

  // Think tanks (additional)
  {
    id: "brookings",
    name: "Brookings Institution",
    nameFa: "بروکینگز",
    category: "think_tank",
    url: "https://www.brookings.edu/feed/",
    language: "en",
  },
  {
    id: "cfr",
    name: "Council on Foreign Relations",
    nameFa: "شورای روابط خارجی",
    category: "think_tank",
    url: "https://www.cfr.org/rss.xml",
    language: "en",
  },
  {
    id: "rand",
    name: "RAND Corporation",
    nameFa: "رند",
    category: "think_tank",
    url: "https://www.rand.org/rss/news.xml",
    language: "en",
  },
  {
    id: "foreign-affairs",
    name: "Foreign Affairs",
    nameFa: "فارن افرز",
    category: "think_tank",
    url: "https://www.foreignaffairs.com/rss.xml",
    language: "en",
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
