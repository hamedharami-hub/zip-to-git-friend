import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Film,
  Headphones,
  Brain,
  TrendingUp,
  BookOpen,
  Newspaper,
  Sparkles,
  Mic,
  ArrowRight,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InstallButton } from '@/components/pwa/InstallButton';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { AccountButton } from '@/components/auth/AccountButton';

type Tone = 'primary' | 'secondary' | 'tertiary';

interface ModeItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  desc: string;
  tone: Tone;
  span?: boolean;
}

const PRIMARY_MODES: ModeItem[] = [
  {
    to: '/leitner',
    icon: Brain,
    eyebrow: 'Spaced repetition',
    title: 'Leitner Flashcards',
    desc: 'مرور لغات با جعبه‌های فاصله‌ای، عکس و جمله نمونه با AI و فولدر مجزا برای هر کتاب/فیلم',
    tone: 'primary',
    span: true,
  },
  {
    to: '/sentence-lab',
    icon: Mic,
    eyebrow: 'Speak & practice',
    title: 'Sentence Lab',
    desc: 'تمرین روزانهٔ جملات با FSRS، حالت پادکست و مکالمهٔ صوتی با AI',
    tone: 'tertiary',
  },
  {
    to: '/language-books',
    icon: Sparkles,
    eyebrow: 'Vocab in context',
    title: 'Language Books',
    desc: 'لغات و idiomها را به AI بده، داستان کوتاه بساز و مثل فصل کتاب بخوان',
    tone: 'secondary',
  },
];

const SECONDARY_MODES: ModeItem[] = [
  {
    to: '/videos',
    icon: Film,
    eyebrow: 'Watch & learn',
    title: 'Videos',
    desc: 'فیلم، اپیزود و کلیپ — همراه با زیرنویس و تحلیل AI',
    tone: 'primary',
  },
  {
    to: '/audio',
    icon: Headphones,
    eyebrow: 'Listen & learn',
    title: 'Podcasts',
    desc: 'MP3، M4A و WAV — ایده‌آل برای رفت‌وآمد و پیاده‌روی',
    tone: 'tertiary',
  },
  {
    to: '/books',
    icon: BookOpen,
    eyebrow: 'Read & learn',
    title: 'Books',
    desc: 'EPUB با tap-to-translate، تحلیل پاراگراف و راوی طبیعی',
    tone: 'secondary',
  },
  {
    to: '/news',
    icon: Newspaper,
    eyebrow: 'Stay informed',
    title: 'News',
    desc: 'فیدهای RSS، جستجوی موضوعی و خلاصه‌های هوش مصنوعی',
    tone: 'primary',
  },
];

const toneClasses: Record<Tone, { card: string; iconBg: string; iconFg: string }> = {
  primary: {
    card: 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
    iconBg: 'bg-[hsl(var(--primary))]',
    iconFg: 'text-[hsl(var(--primary-foreground))]',
  },
  secondary: {
    card: 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
    iconBg: 'bg-[hsl(var(--secondary))]',
    iconFg: 'text-[hsl(var(--secondary-foreground))]',
  },
  tertiary: {
    card: 'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]',
    iconBg: 'bg-[hsl(var(--tertiary))]',
    iconFg: 'text-[hsl(var(--tertiary-foreground))]',
  },
};

function ModeCard({ item, large }: { item: ModeItem; large?: boolean }) {
  const Icon = item.icon;
  const t = toneClasses[item.tone];
  return (
    <Link
      to={item.to}
      className={`m3-state-layer group relative flex flex-col justify-between overflow-hidden rounded-[28px] p-5 sm:p-6 transition-all duration-300 hover:m3-elevation-2 hover:-translate-y-0.5 ${
        t.card
      } ${item.span ? 'sm:col-span-2 min-h-[200px]' : large ? 'min-h-[180px]' : 'min-h-[170px]'}`}
    >
      {/* Decorative blob */}
      <div
        aria-hidden="true"
        className={`absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-25 blur-2xl ${t.iconBg}`}
      />

      <div className="relative flex items-start justify-between">
        <div
          className={`h-14 w-14 rounded-[20px] flex items-center justify-center ${t.iconBg} ${t.iconFg} m3-elevation-1 transition-transform group-hover:scale-105 group-hover:rotate-[-4deg]`}
        >
          <Icon className="h-7 w-7" />
        </div>
        <ArrowRight className="h-5 w-5 opacity-0 -translate-x-2 transition-all group-hover:opacity-70 group-hover:translate-x-0" />
      </div>

      <div className="relative mt-6">
        <p className="text-[11px] uppercase tracking-[0.12em] font-medium opacity-70">
          {item.eyebrow}
        </p>
        <h3 className="text-xl sm:text-2xl font-semibold mt-1 leading-tight">
          {item.title}
        </h3>
        <p className="text-sm mt-2 opacity-80 leading-relaxed line-clamp-2">{item.desc}</p>
      </div>
    </Link>
  );
}

const Home = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = 'Language Learning Player';
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground flex flex-col">
      {/* M3 Top App Bar */}
      <header
        className={`m3-top-app-bar sticky top-0 z-30 ${scrolled ? 'scrolled' : ''}`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] flex items-center justify-center shrink-0">
              <Film className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate">
                Language Player
              </p>
              <p className="text-[11px] text-[hsl(var(--on-surface-variant))] truncate">
                Learn from what you love
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <InstallButton />
            <AccountButton />
            <Link to="/settings">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                className="rounded-full h-10 w-10"
              >
                <SettingsIcon className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <PWAInstallBanner />

        {/* Hero — M3 expressive display */}
        <section className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-[hsl(var(--primary-container))] via-[hsl(var(--surface-container))] to-[hsl(var(--tertiary-container))] p-6 sm:p-10">
          <div
            aria-hidden="true"
            className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-[hsl(var(--primary)/0.18)] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[hsl(var(--tertiary)/0.18)] blur-3xl"
          />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[hsl(var(--surface)/0.7)] text-[hsl(var(--on-surface-variant))] text-xs font-medium m3-elevation-1">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
              Powered by AI
            </div>
            <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05] text-[hsl(var(--on-primary-container))]">
              یاد بگیر،<br />
              <span className="text-[hsl(var(--primary))]">از چیزی که دوست داری</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm sm:text-base text-[hsl(var(--on-surface-variant))]">
              فیلم، پادکست، کتاب و خبر را تبدیل به جلسهٔ تمرین زبان کن — با
              فلش‌کارت، تحلیل هوشمند و تمرین گفتار.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/leitner">
                <Button
                  size="lg"
                  className="rounded-full h-12 px-6 gap-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 m3-elevation-2"
                >
                  <Brain className="h-5 w-5" />
                  شروع مرور
                </Button>
              </Link>
              <Link to="/sentence-lab">
                <Button
                  size="lg"
                  variant="ghost"
                  className="rounded-full h-12 px-5 gap-2 text-[hsl(var(--on-primary-container))] hover:bg-[hsl(var(--surface)/0.6)]"
                >
                  <Mic className="h-5 w-5" />
                  تمرین گفتار
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Quick actions — M3 assist chips */}
        <section aria-label="Quick actions" className="flex flex-wrap gap-2">
          {[
            { to: '/stats', label: 'پیشرفت من', icon: TrendingUp },
            { to: '/leitner', label: 'فلش‌کارت‌ها', icon: Brain },
            { to: '/news', label: 'اخبار', icon: Newspaper },
            { to: '/books', label: 'کتاب‌ها', icon: BookOpen },
            { to: '/settings', label: 'تنظیمات', icon: SettingsIcon },
          ].map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="m3-state-layer inline-flex items-center gap-2 h-9 px-3 rounded-full border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-container))] transition-colors"
            >
              <Icon className="h-4 w-4 text-[hsl(var(--primary))]" />
              {label}
            </Link>
          ))}
        </section>

        {/* Featured */}
        <section className="space-y-4">
          <div className="flex items-end justify-between px-1">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--on-surface-variant))] font-medium">
                Featured
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold mt-0.5">روزانه تمرین کن</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            {PRIMARY_MODES.map((m) => (
              <ModeCard key={m.to} item={m} large />
            ))}
          </div>
        </section>

        {/* All sources */}
        <section className="space-y-4">
          <div className="flex items-end justify-between px-1">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--on-surface-variant))] font-medium">
                Library
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold mt-0.5">منابع یادگیری</h2>
            </div>
            <Link
              to="/stats"
              className="text-sm text-[hsl(var(--primary))] hover:underline inline-flex items-center gap-1"
            >
              پیشرفت
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            {SECONDARY_MODES.map((m) => (
              <ModeCard key={m.to} item={m} />
            ))}
          </div>
        </section>

        <div className="h-4" />
      </main>
    </div>
  );
};

export default Home;
