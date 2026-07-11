import { Cloud, Droplet, Music, Sparkles } from "lucide-react";

/**
 * Decorative animated header for the podcast/audio library page.
 * A small group of "cloud / droplet / music note" characters bobbing along
 * a soft gradient — pure CSS animation (no business logic).
 */
export function PodcastHeroDecor() {
  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card h-28 sm:h-32"
    >
      {/* Soft glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_120%,hsl(var(--primary)/0.25),transparent_55%)]" />

      {/* Floating characters */}
      <div className="absolute inset-0">
        <Character left="6%" top="18%" delay="0s" color="text-primary">
          <Cloud className="h-9 w-9" strokeWidth={1.6} />
          <Eyes />
        </Character>
        <Character left="32%" top="42%" delay="0.6s" color="text-sky-400">
          <Droplet className="h-7 w-7" strokeWidth={1.6} />
          <Eyes small />
        </Character>
        <Character left="58%" top="22%" delay="1.1s" color="text-primary">
          <Music className="h-7 w-7" strokeWidth={1.8} />
        </Character>
        <Character left="78%" top="48%" delay="0.3s" color="text-amber-400">
          <Sparkles className="h-6 w-6" strokeWidth={1.6} />
        </Character>
        <Character left="86%" top="14%" delay="1.4s" color="text-primary">
          <Cloud className="h-6 w-6" strokeWidth={1.6} />
        </Character>
      </div>

      {/* Title overlay */}
      <div className="relative z-10 h-full flex flex-col justify-center px-5">
        <p className="text-xs uppercase tracking-wide text-primary/80 font-medium">
          Podcast studio
        </p>
        <p className="text-lg sm:text-xl font-semibold">Listen, learn, repeat</p>
      </div>
    </div>
  );
}

function Character({
  children,
  left,
  top,
  delay,
  color,
}: {
  children: React.ReactNode;
  left: string;
  top: string;
  delay: string;
  color: string;
}) {
  return (
    <div
      className={`absolute ${color}`}
      style={{
        left,
        top,
        animation: "podcast-bob 3.4s ease-in-out infinite",
        animationDelay: delay,
      }}
    >
      <div className="relative">{children}</div>
    </div>
  );
}

function Eyes({ small = false }: { small?: boolean }) {
  const dot = small ? "h-0.5 w-0.5" : "h-1 w-1";
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-1 mt-1">
      <span className={`${dot} rounded-full bg-foreground`} />
      <span className={`${dot} rounded-full bg-foreground`} />
    </div>
  );
}
