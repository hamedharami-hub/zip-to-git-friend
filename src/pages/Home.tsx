import { forwardRef, memo, useEffect, useState } from 'react';
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
  span?: string;
  gradient: string; // tailwind gradient classes
  text: string; // text color class
  glow: string; // shadow color (rgb/hex w/ alpha)
  blob: string; // decorative blob color
}

const TILES: Tile[] = [
  {
    to: '/leitner',
    icon: Brain,
    title: 'Leitner',
    fa: 'فلش‌کارت',
    span: 'col-span-2 row-span-2',
    gradient: 'bg-gradient-to-br from-[#ff7a3d] via-[#f04e3e] to-[#c2185b]',
    text: 'text-white',
    glow: 'shadow-[0_18px_40px_-18px_rgba(240,78,62,0.7)]',
    blob: 'bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.35),transparent_55%)]',
  },
  {
    to: '/sentence-lab',
    icon: Mic,
    title: 'Sentences',
    fa: 'گفتار',
    gradient: 'bg-gradient-to-br from-[#8b5cf6] via-[#a855f7] to-[#ec4899]',
    text: 'text-white',
    glow: 'shadow-[0_14px_32px_-16px_rgba(168,85,247,0.7)]',
    blob: 'bg-[radial-gradient(circle_at_20%_85%,rgba(255,255,255,0.3),transparent_60%)]',
  },
  {
    to: '/language-books',
    icon: Sparkles,
    title: 'Stories',
    fa: 'داستان',
    gradient: 'bg-gradient-to-br from-[#fbbf24] via-[#f59e0b] to-[#fb7185]',
    text: 'text-white',
    glow: 'shadow-[0_14px_32px_-16px_rgba(245,158,11,0.65)]',
    blob: 'bg-[radial-gradient(circle_at_80%_85%,rgba(255,255,255,0.35),transparent_60%)]',
  },
  {
    to: '/news',
    icon: Newspaper,
    title: 'News',
    fa: 'اخبار',
    span: 'col-span-2',
    gradient: 'bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0b3d2e]',
    text: 'text-white',
    glow: 'shadow-[0_16px_36px_-18px_rgba(16,185,129,0.55)]',
    blob: 'bg-[radial-gradient(circle_at_88%_20%,rgba(52,211,153,0.45),transparent_55%)]',
  },
  {
    to: '/books',
    icon: BookOpen,
    title: 'Books',
    fa: 'کتاب',
    gradient: 'bg-gradient-to-br from-[#065f46] via-[#10b981] to-[#34d399]',
    text: 'text-white',
    glow: 'shadow-[0_14px_32px_-16px_rgba(16,185,129,0.6)]',
    blob: 'bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.3),transparent_55%)]',
  },
  {
    to: '/videos',
    icon: Film,
    title: 'Videos',
    fa: 'ویدیو',
    gradient: 'bg-gradient-to-br from-[#0ea5e9] via-[#0284c7] to-[#06b6d4]',
    text: 'text-white',
    glow: 'shadow-[0_14px_32px_-16px_rgba(14,165,233,0.6)]',
    blob: 'bg-[radial-gradient(circle_at_20%_85%,rgba(255,255,255,0.3),transparent_55%)]',
  },
  {
    to: '/audio',
    icon: Headphones,
    title: 'Podcasts',
    fa: 'پادکست',
    span: 'col-span-2',
    gradient: 'bg-gradient-to-br from-[#fb7185] via-[#f43f5e] to-[#be123c]',
    text: 'text-white',
    glow: 'shadow-[0_16px_36px_-18px_rgba(244,63,94,0.6)]',
    blob: 'bg-[radial-gradient(circle_at_85%_85%,rgba(255,255,255,0.3),transparent_55%)]',
  },
];

const TileCard = memo(
  forwardRef<HTMLAnchorElement, { item: Tile }>(function TileCard({ item }, ref) {
    const Icon = item.icon;
    return (
      <Link
        ref={ref}
        to={item.to}
        aria-label={`${item.title} — ${item.fa}`}
        className={`group relative flex flex-col justify-between rounded-[28px] p-4 sm:p-5 overflow-hidden border border-white/10 transition-all duration-300 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${item.span ?? ''} ${item.gradient} ${item.text} ${item.glow}`}
      >
        {/* Decorative light blob */}
        <div className={`pointer-events-none absolute inset-0 ${item.blob} opacity-90 transition-opacity duration-500 group-hover:opacity-100`} />
        {/* Subtle inner sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />

        <div className="relative z-10 flex items-center justify-between">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md ring-1 ring-white/25 shadow-sm">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        </div>
        <div className="relative z-10 mt-3">
          <h3 className="font-serif text-2xl sm:text-3xl leading-none tracking-tight drop-shadow-sm">
            {item.title}
          </h3>
          <p className="text-[11px] opacity-80 mt-1.5 font-medium">{item.fa}</p>
        </div>
      </Link>
    );
  }),
);

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
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-foreground flex flex-col">
      <header className={`m3-top-app-bar sticky top-0 z-30 ${scrolled ? 'scrolled' : ''}`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
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

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col">
        <PWAInstallBanner />

        <div className="flex items-center justify-between px-1 mb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{today}</p>
          <p className="font-serif italic text-xs text-muted-foreground">امروز</p>
        </div>

        <section
          className="grid grid-cols-4 gap-3 flex-1"
          style={{ gridAutoRows: '1fr', gridTemplateRows: 'repeat(4, minmax(0, 1fr))' }}
        >
          {TILES.map((t) => (
            <TileCard key={t.to} item={t} />
          ))}
        </section>

        <footer className="text-center mt-4 pb-2">
          <p className="font-serif italic text-[11px] text-muted-foreground">
            Learn from what you love
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Home;
