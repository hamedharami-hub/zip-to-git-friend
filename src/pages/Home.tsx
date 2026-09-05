import { forwardRef, memo, useEffect, useState } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallButton } from "@/components/pwa/InstallButton";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";
import { AccountButton } from "@/components/auth/AccountButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { SECTIONS, sectionClass } from "@/lib/sections";

const TileCard = memo(
  forwardRef<HTMLAnchorElement, { item: (typeof SECTIONS)[number] }>(function TileCard(
    { item },
    ref,
  ) {
    const Icon = item.icon;
    return (
      <Link
        ref={ref}
        to={item.to}
        aria-label={`${item.title} — ${item.fa}`}
        className={`group relative flex flex-col justify-between rounded-[28px] m3-section-tile p-4 sm:p-5 overflow-hidden transition-all duration-300 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--section))] ${sectionClass(item.key)} ${item.span ?? ""}`}
      >
        {/* Subtle inner sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />

        <div className="relative z-10 flex items-center justify-between">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md ring-1 ring-white/20 shadow-sm dark:bg-[hsl(var(--section)/0.16)] dark:ring-[hsl(var(--section)/0.3)] dark:text-[hsl(var(--section))]">
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

  usePageMeta({
    title: "Lingua — Language Learning Player",
    description:
      "پخش‌کننده‌ی یادگیری زبان با اخبار، کتاب، فیلم، شادویینگ و کارت‌های لایتنر — همه در یک اپ.",
  });
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-foreground flex flex-col">
      <AppHeader
        title={
          <Link to="/" className="font-serif italic text-base tracking-tight">
            Lingua<span className="text-[hsl(var(--primary))]">.</span>
          </Link>
        }
        scrolled={scrolled}
        actions={
          <>
            <InstallButton />
            <AccountButton />
            <Link to="/settings">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                className="rounded-full h-9 w-9"
              >
                <SettingsIcon className="h-[18px] w-[18px]" />
              </Button>
            </Link>
          </>
        }
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col">
        <PWAInstallBanner />

        <div className="flex items-center justify-between px-1 mb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{today}</p>
          <p className="font-serif italic text-xs text-muted-foreground">امروز</p>
        </div>

        <section
          className="grid grid-cols-4 gap-3 flex-1"
          style={{ gridAutoRows: "1fr", gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}
        >
          {SECTIONS.map((t) => (
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
