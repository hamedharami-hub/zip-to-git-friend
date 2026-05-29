/**
 * Leitner Stats extras: 30-day review activity heatmap + 7-day due forecast.
 * Pure read-only view of the in-memory card collection — no extra storage needed.
 */
import { useMemo } from 'react';
import type { LeitnerCard } from '@/types';
import { Flame, Calendar, TrendingUp } from 'lucide-react';

interface Props {
  cards: LeitnerCard[];
  folderId?: string | null;
}

const DAY = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function StatsExtras({ cards, folderId }: Props) {
  const scope = useMemo(
    () => (folderId ? cards.filter((c) => c.folderId === folderId) : cards),
    [cards, folderId],
  );

  // ── 30-day heatmap from reviewLog ──
  const heatmap = useMemo(() => {
    const today = startOfDay(Date.now());
    const counts = new Map<number, number>();
    for (const c of scope) {
      for (const r of c.reviewLog ?? []) {
        const d = startOfDay(r.at);
        if (today - d > 29 * DAY) continue;
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
    }
    const cells: Array<{ day: number; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const day = today - i * DAY;
      cells.push({ day, count: counts.get(day) ?? 0 });
    }
    const max = Math.max(1, ...cells.map((c) => c.count));
    const total = cells.reduce((s, c) => s + c.count, 0);
    // current streak: consecutive days ending today with count > 0
    let streak = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].count > 0) streak++;
      else break;
    }
    return { cells, max, total, streak };
  }, [scope]);

  // ── 7-day forecast from nextReview ──
  const forecast = useMemo(() => {
    const today = startOfDay(Date.now());
    const bins: Array<{ day: number; count: number; label: string }> = [];
    const overdue = scope.filter((c) => c.nextReview < today).length;
    for (let i = 0; i < 7; i++) {
      const start = today + i * DAY;
      const end = start + DAY;
      const count = scope.filter((c) => c.nextReview >= start && c.nextReview < end).length;
      const d = new Date(start);
      bins.push({
        day: start,
        count,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      });
    }
    const max = Math.max(1, ...bins.map((b) => b.count), overdue);
    return { bins, max, overdue };
  }, [scope]);

  return (
    <div className="space-y-6">
      {/* Streak + 30-day summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile icon={<Flame className="h-4 w-4" />} label="Streak" value={`${heatmap.streak} d`} />
        <SummaryTile icon={<Calendar className="h-4 w-4" />} label="Reviews 30d" value={heatmap.total.toLocaleString()} />
        <SummaryTile icon={<TrendingUp className="h-4 w-4" />} label="Due 7d" value={forecast.bins.reduce((s, b) => s + b.count, 0).toLocaleString()} />
      </div>

      {/* Heatmap */}
      <section className="rounded-[20px] border border-border bg-card p-5">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">۳۰ روز گذشته</h3>
          <span className="text-[11px] text-muted-foreground">
            {heatmap.total} مرور
          </span>
        </header>
        <div className="grid grid-cols-15 gap-1" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
          {heatmap.cells.map((c) => {
            const intensity = c.count === 0 ? 0 : Math.min(1, c.count / heatmap.max);
            const bg = c.count === 0
              ? 'hsl(var(--muted))'
              : `color-mix(in oklab, hsl(var(--primary)) ${Math.round(20 + intensity * 80)}%, transparent)`;
            const d = new Date(c.day);
            return (
              <div
                key={c.day}
                title={`${d.toLocaleDateString()} — ${c.count} review${c.count === 1 ? '' : 's'}`}
                className="aspect-square rounded-[4px]"
                style={{ background: bg }}
              />
            );
          })}
        </div>
      </section>

      {/* Forecast */}
      <section className="rounded-[20px] border border-border bg-card p-5">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">پیش‌بینی ۷ روز آینده</h3>
          {forecast.overdue > 0 && (
            <span className="text-[11px] text-destructive font-medium">
              {forecast.overdue} عقب‌افتاده
            </span>
          )}
        </header>
        <div className="flex items-end justify-between gap-2 h-32">
          {forecast.bins.map((b) => {
            const h = b.count === 0 ? 4 : Math.max(6, Math.round((b.count / forecast.max) * 100));
            return (
              <div key={b.day} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[10px] tabular-nums text-muted-foreground">{b.count || ''}</span>
                <div
                  className="w-full rounded-md bg-gradient-to-t from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.5)] transition-all"
                  style={{ height: `${h}%`, opacity: b.count === 0 ? 0.25 : 1 }}
                />
                <span className="text-[10px] text-muted-foreground truncate w-full text-center">{b.label}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-border bg-card p-3 flex items-center gap-3">
      <span className="h-8 w-8 rounded-full bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  );
}
