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

const toneClasses: Record<Tone, { iconBg: string; iconFg: string; accent: string }> = {
  primary: {
    iconBg: 'bg-[hsl(var(--primary)/0.12)]',
    iconFg: 'text-[hsl(var(--primary))]',
    accent: 'before:bg-[hsl(var(--primary))]',
  },
  secondary: {
    iconBg: 'bg-[hsl(var(--secondary)/0.14)]',
    iconFg: 'text-[hsl(var(--secondary))]',
    accent: 'before:bg-[hsl(var(--secondary))]',
  },
  tertiary: {
    iconBg: 'bg-[hsl(var(--tertiary)/0.16)]',
    iconFg: 'text-[hsl(var(--tertiary))]',
    accent: 'before:bg-[hsl(var(--tertiary))]',
  },
};

function ModeCard({ item, large }: { item: ModeItem; large?: boolean }) {
  const Icon = item.icon;
  const t = toneClasses[item.tone];
  return (
    <Link
      to={item.to}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 sm:p-6 bg-card border border-border/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:m3-elevation-2 before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:opacity-0 before:transition-opacity group-hover:before:opacity-100 ${
        t.accent
      } ${item.span ? 'sm:col-span-2 min-h-[180px]' : large ? 'min-h-[170px]' : 'min-h-[160px]'}`}
    >
      <div className="relative flex items-start justify-between">
        <div
          className={`h-12 w-12 rounded-xl flex items-center justify-center ${t.iconBg} ${t.iconFg} transition-transform group-hover:scale-105`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <ArrowRight className="h-5 w-5 opacity-0 -translate-x-2 transition-all group-hover:opacity-60 group-hover:translate-x-0 text-muted-foreground" />
      </div>

      <div className="relative mt-5">
        <p className="editorial-eyebrow">{item.eyebrow}</p>
        <h3 className="font-serif text-xl sm:text-2xl font-medium mt-1.5 leading-tight tracking-tight">
          {item.title}
        </h3>
        <p className="text-sm mt-2 text-muted-foreground leading-relaxed line-clamp-2">{item.desc}</p>
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

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10">
        <PWAInstallBanner />

        {/* Hero — Editorial display */}
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-[hsl(var(--primary-container)/0.6)] via-card to-[hsl(var(--tertiary-container)/0.5)] p-6 sm:p-12 animate-editorial-in">
          <div
            aria-hidden="true"
            className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-[hsl(var(--primary)/0.10)] blur-3xl"
          />
          <div className="relative">
            <p className="editorial-eyebrow inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by AI · Issue 01
            </p>
            <h1 className="mt-5 font-serif text-4xl sm:text-6xl font-medium tracking-tight leading-[1.02] text-foreground">
              یاد بگیر،<br />
              <span className="italic text-primary">از چیزی که دوست داری</span>
            </h1>
            <div className="editorial-rule my-6 max-w-xs" />
            <p className="max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              فیلم، پادکست، کتاب و خبر را تبدیل به جلسهٔ تمرین زبان کن — با
              فلش‌کارت، تحلیل هوشمند و تمرین گفتار.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/leitner">
                <Button size="lg" className="gap-2">
                  <Brain className="h-5 w-5" />
                  شروع مرور
                </Button>
              </Link>
              <Link to="/sentence-lab">
                <Button size="lg" variant="outline" className="gap-2">
                  <Mic className="h-5 w-5" />
                  تمرین گفتار
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Quick actions */}
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
              className="m3-state-layer inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-border bg-card text-sm text-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Icon className="h-4 w-4 text-primary" />
              {label}
            </Link>
          ))}
        </section>

        <div className="editorial-rule" />

        {/* Featured */}
        <section className="space-y-5">
          <div className="flex items-end justify-between px-1">
            <div>
              <p className="editorial-eyebrow">Featured</p>
              <h2 className="font-serif text-2xl sm:text-3xl font-medium mt-1 tracking-tight">روزانه تمرین کن</h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PRIMARY_MODES.map((m) => (
              <ModeCard key={m.to} item={m} large />
            ))}
          </div>
        </section>

        <div className="editorial-rule" />

        {/* All sources */}
        <section className="space-y-5">
          <div className="flex items-end justify-between px-1">
            <div>
              <p className="editorial-eyebrow">Library</p>
              <h2 className="font-serif text-2xl sm:text-3xl font-medium mt-1 tracking-tight">منابع یادگیری</h2>
            </div>
            <Link
              to="/stats"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              پیشرفت
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
