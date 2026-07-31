/**
 * Compact HUD: Level + XP bar, Streak, Hearts, Combo.
 * Sits in the Drill header so the player always sees the score state.
 */
import { memo, useEffect } from "react";
import { useShallow } from "zustand/shallow";
import { Heart, Flame, Zap, Trophy } from "lucide-react";
import { useGamificationStore } from "@/store/gamificationStore";
import { xpProgress } from "@/lib/gamification";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const GamificationHUD = memo(function GamificationHUD({
  compact = false,
}: {
  compact?: boolean;
}) {
  const {
    xp,
    level,
    currentStreak,
    longestStreak,
    hearts,
    comboBest,
    combo,
    quests,
    load,
    loadQuests,
    claim,
  } = useGamificationStore(
    useShallow((s) => ({
      xp: s.state?.xp ?? 0,
      level: s.state?.level ?? 1,
      currentStreak: s.state?.currentStreak ?? 0,
      longestStreak: s.state?.longestStreak ?? 0,
      hearts: s.state?.hearts ?? 0,
      comboBest: s.state?.comboBest ?? 0,
      combo: s.combo,
      quests: s.quests,
      load: s.load,
      loadQuests: s.loadQuests,
      claim: s.claim,
    })),
  );

  useEffect(() => {
    void load();
    void loadQuests();
  }, [load, loadQuests]);

  const p = xpProgress(xp);
  const claimable = quests.filter((q) => q.completed && !q.claimed).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border bg-card px-2 py-1 text-xs hover:bg-muted/60 transition-colors">
          <span className="flex items-center gap-1 font-semibold tabular-nums">
            <Trophy className="h-3.5 w-3.5 text-amber-500" />L{level}
          </span>
          {!compact && (
            <span className="hidden sm:flex items-center gap-1 text-muted-foreground">
              <Flame className={`h-3.5 w-3.5 ${currentStreak > 0 ? "text-orange-500" : ""}`} />
              <span className="tabular-nums">{currentStreak}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Heart
              className={`h-3.5 w-3.5 ${hearts > 0 ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`}
            />
            <span className="tabular-nums">{hearts}</span>
          </span>
          {combo >= 3 && (
            <span
              className={`flex items-center gap-0.5 rounded-full px-1.5 font-bold ${
                combo >= 10
                  ? "bg-amber-500/20 text-amber-400"
                  : combo >= 5
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-sky-500/20 text-sky-400"
              }`}
            >
              <Zap className="h-3 w-3" />×{combo}
            </span>
          )}
          {claimable > 0 && (
            <span className="flex items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[9px] font-bold text-white">
              {claimable}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        {/* Level + XP */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Level {p.level}</span>
            <span className="text-muted-foreground tabular-nums">
              {p.into}/{p.span} XP
            </span>
          </div>
          <Progress value={p.pct} className="h-2 mt-1" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat icon={Flame} label="Streak" value={currentStreak} accent="text-orange-500" />
          <Stat icon={Trophy} label="Best" value={longestStreak} accent="text-amber-500" />
          <Stat icon={Zap} label="Combo" value={comboBest} accent="text-sky-500" />
        </div>

        {/* Quests */}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Daily Quests
        </p>
        <div className="space-y-2">
          {quests.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">در حال بارگذاری…</p>
          ) : (
            quests.map((q) => {
              const pct = Math.min(100, (q.progress / q.target) * 100);
              return (
                <div key={q.id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium" dir="rtl">
                      {q.title}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.min(q.progress, q.target)}/{q.target}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1 mt-1.5" />
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">+{q.rewardXp} XP</span>
                    {q.completed && !q.claimed ? (
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => claim(q.id)}
                      >
                        دریافت 🎁
                      </Button>
                    ) : q.claimed ? (
                      <span className="text-[10px] text-emerald-500">✓ گرفته شد</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  icon: any;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-1.5 text-center">
      <Icon className={`h-3.5 w-3.5 mx-auto ${accent}`} />
      <p className="text-sm font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}
