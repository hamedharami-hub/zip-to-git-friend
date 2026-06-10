import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Film,
  Headphones,
  Brain,
  BookOpen,
  Newspaper,
  Sparkles,
  Mic,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InstallButton } from '@/components/pwa/InstallButton';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { AccountButton } from '@/components/auth/AccountButton';

interface ModeItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  fa: string;
  num: string;
}

const MODES: ModeItem[] = [
  { to: '/leitner',        icon: Brain,     title: 'Leitner',   fa: 'فلش‌کارت',  num: '01' },
  { to: '/sentence-lab',   icon: Mic,       title: 'Sentences', fa: 'گفتار',     num: '02' },
  { to: '/language-books', icon: Sparkles,  title: 'Stories',   fa: 'داستان',    num: '03' },
  { to: '/books',          icon: BookOpen,  title: 'Books',     fa: 'کتاب',      num: '04' },
  { to: '/news',           icon: Newspaper, title: 'News',      fa: 'اخبار',     num: '05' },
  { to: '/videos',         icon: Film,      title: 'Videos',    fa: 'ویدیو',     num: '06' },
  { to: '/audio',          icon: Headphones,title: 'Podcasts',  fa: 'پادکست',    num: '07' },
];

function ChapterRow({ item }: { item: ModeItem }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="group flex items-center gap-4 py-4 px-2 sm:px-3 border-b border-border/60 transition-colors hover:bg-[hsl(var(--primary)/0.04)]"
    >
      <span className="font-serif italic text-sm text-muted-foreground tabular-nums w-8 shrink-0">
        {item.num}
      </span>
      <span className="h-10 w-10 rounded-full bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] flex items-center justify-center shrink-0 transition-colors group-hover:bg-[hsl(var(--primary)/0.16)]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="font-serif text-xl sm:text-2xl leading-tight tracking-tight">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">{item.fa}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all group-hover:text-[hsl(var(--primary))] group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
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

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-foreground flex flex-col">
      <header className={`m3-top-app-bar sticky top-0 z-30 ${scrolled ? 'scrolled' : ''}`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <Link to="/" className="font-serif italic text-base tracking-tight">
            Lingua<span className="text-[hsl(var(--primary))]">.</span>
          </Link>
          <div className="flex items-center gap-1">
            <InstallButton />
            <AccountButton />
            <Link to="/settings">
              <Button variant="ghost" size="icon" aria-label="Settings" className="rounded-full h-9 w-9">
                <SettingsIcon className="h-[18px] w-[18px]" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-14">
        <PWAInstallBanner />

        {/* Cover — like a book title page */}
        <section className="text-center py-10 sm:py-16 animate-editorial-in">
          <p className="editorial-eyebrow">{today}</p>
          <div className="editorial-rule mx-auto my-5 max-w-[120px]" />
          <h1 className="font-serif text-5xl sm:text-7xl font-medium tracking-tight leading-[0.95]">
            یاد بگیر
          </h1>
          <h1 className="font-serif italic text-5xl sm:text-7xl text-[hsl(var(--primary))] mt-1 leading-[0.95]">
            بخوان
          </h1>
          <div className="editorial-rule mx-auto my-5 max-w-[120px]" />
          <p className="font-serif italic text-sm text-muted-foreground">
            — Volume I —
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/leitner">
              <Button size="lg" className="gap-2 rounded-full px-6">
                <Brain className="h-4 w-4" />
                شروع
              </Button>
            </Link>
            <Link to="/sentence-lab">
              <Button size="lg" variant="ghost" className="gap-2 rounded-full px-5">
                <Mic className="h-4 w-4" />
                گفتار
              </Button>
            </Link>
          </div>
        </section>

        {/* Table of contents */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between mb-2 px-2 sm:px-3">
            <p className="editorial-eyebrow">Contents</p>
            <p className="font-serif italic text-xs text-muted-foreground">فهرست</p>
          </div>
          <div className="border-t border-border/60">
            {MODES.map((m) => (
              <ChapterRow key={m.to} item={m} />
            ))}
          </div>
        </section>

        <footer className="text-center mt-16 pb-6">
          <div className="editorial-rule mx-auto max-w-[80px] mb-4" />
          <p className="font-serif italic text-xs text-muted-foreground">
            Learn from what you love
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Home;
