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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InstallButton } from '@/components/pwa/InstallButton';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { AccountButton } from '@/components/auth/AccountButton';

interface Tile {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  fa: string;
  span?: string; // grid span classes
  tone: string; // bg/text classes
}

const TILES: Tile[] = [
  {
    to: '/leitner',
    icon: Brain,
    title: 'Leitner',
    fa: 'فلش‌کارت',
    span: 'col-span-2 row-span-2',
    tone: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
  },
  {
    to: '/sentence-lab',
    icon: Mic,
    title: 'Sentences',
    fa: 'گفتار',
    tone: 'bg-[hsl(var(--primary)/0.10)] text-foreground',
  },
  {
    to: '/language-books',
    icon: Sparkles,
    title: 'Stories',
    fa: 'داستان',
    tone: 'bg-[hsl(var(--primary)/0.06)] text-foreground',
  },
  {
    to: '/news',
    icon: Newspaper,
    title: 'News',
    fa: 'اخبار',
    span: 'col-span-2',
    tone: 'bg-foreground text-background',
  },
  {
    to: '/books',
    icon: BookOpen,
    title: 'Books',
    fa: 'کتاب',
    tone: 'bg-[hsl(var(--primary)/0.06)] text-foreground',
  },
  {
    to: '/videos',
    icon: Film,
    title: 'Videos',
    fa: 'ویدیو',
    tone: 'bg-[hsl(var(--primary)/0.10)] text-foreground',
  },
  {
    to: '/audio',
    icon: Headphones,
    title: 'Podcasts',
    fa: 'پادکست',
    span: 'col-span-2',
    tone: 'bg-card border border-border text-foreground',
  },
];

function TileCard({ item }: { item: Tile }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`group relative flex flex-col justify-between rounded-3xl p-4 sm:p-5 min-h-[120px] sm:min-h-[140px] overflow-hidden transition-all active:scale-[0.98] hover:shadow-lg ${item.span ?? ''} ${item.tone}`}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-background/15 backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3">
        <h3 className="font-serif text-2xl sm:text-3xl leading-none tracking-tight">
          {item.title}
        </h3>
        <p className="text-[11px] opacity-75 mt-1.5">{item.fa}</p>
      </div>
    </Link>
  );
}

const Home = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = 'Lingua — Language Learning Player';
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
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

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <PWAInstallBanner />

        <div className="flex items-center justify-between px-1 mb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{today}</p>
          <p className="font-serif italic text-xs text-muted-foreground">امروز</p>
        </div>

        <section className="grid grid-cols-4 auto-rows-[minmax(120px,auto)] sm:auto-rows-[minmax(140px,auto)] gap-3">
          {TILES.map((t) => (
            <TileCard key={t.to} item={t} />
          ))}
        </section>

        <footer className="text-center mt-10 pb-6">
          <p className="font-serif italic text-xs text-muted-foreground">
            Learn from what you love
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Home;
