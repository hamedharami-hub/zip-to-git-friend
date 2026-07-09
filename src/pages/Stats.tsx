import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Flame,
  Clock,
  BookOpen,
  GraduationCap,
  Brain,
  TrendingUp,
  Headphones,
  Library,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeitnerStore } from '@/store/leitnerStore';
import { getAllListeningSessions, getAllWordStatus } from '@/lib/db';
import { getAllReadingSessions, getAllBooks } from '@/lib/bookDb';
import type { ListeningSession, ReadingSession, WordStatusValue, Book } from '@/types';

const Stats = () => {
  useEffect(() => {
    document.title = 'Stats — Language Learning Player';
  }, []);

  const cards = useLeitnerStore((s) => s.cards);
  const [sessions, setSessions] = useState<ListeningSession[]>([]);
  const [readingSessions, setReadingSessions] = useState<ReadingSession[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [wordStatusCounts, setWordStatusCounts] = useState<Record<WordStatusValue, number>>({
    new: 0,
    learning: 0,
    known: 0,
    ignored: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, w, r, b] = await Promise.all([
        getAllListeningSessions(),
        getAllWordStatus(),
        getAllReadingSessions(),
        getAllBooks(),
      ]);
      if (cancelled) return;
      setSessions(s);
      setReadingSessions(r);
      setBooks(b);
      const counts: Record<WordStatusValue, number> = {
        new: 0,
        learning: 0,
        known: 0,
        ignored: 0,
      };
      for (const r of w) counts[r.status] = (counts[r.status] ?? 0) + 1;
      setWordStatusCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute totals over a session list (seconds + words for reading).
  const summarize = (rows: Array<{ date: string; seconds: number; words?: number }>) => {
    let allSeconds = 0;
    let last30 = 0;
    let last7 = 0;
    let today = 0;
    let allWords = 0;
    const now = new Date();
    const todayKey = formatDate(now);
    const cut30 = new Date(now);
    cut30.setDate(cut30.getDate() - 30);
    const cut7 = new Date(now);
    cut7.setDate(cut7.getDate() - 7);
    for (const s of rows) {
      allSeconds += s.seconds;
      allWords += s.words ?? 0;
      const d = new Date(s.date + 'T00:00:00');
      if (d >= cut30) last30 += s.seconds;
      if (d >= cut7) last7 += s.seconds;
      if (s.date === todayKey) today += s.seconds;
    }
    return { allSeconds, last30, last7, today, allWords };
  };

  const listenTotals = useMemo(() => summarize(sessions), [sessions]);
  const readTotals = useMemo(() => summarize(readingSessions), [readingSessions]);

  /** Combined totals across listen + read for the top KPI cards. */
  const totals = useMemo(
    () => ({
      allSeconds: listenTotals.allSeconds + readTotals.allSeconds,
      last30: listenTotals.last30 + readTotals.last30,
      last7: listenTotals.last7 + readTotals.last7,
      today: listenTotals.today + readTotals.today,
    }),
    [listenTotals, readTotals],
  );

  // Compute streak across listen + read: consecutive days with > 60 combined seconds.
  const streak = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of sessions) totals.set(s.date, (totals.get(s.date) ?? 0) + s.seconds);
    for (const s of readingSessions)
      totals.set(s.date, (totals.get(s.date) ?? 0) + s.seconds);
    let count = 0;
    const d = new Date();
    while ((totals.get(formatDate(d)) ?? 0) > 60) {
      count += 1;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [sessions, readingSessions]);

  // 30-day chart data (oldest → newest), stacked by source.
  const chartData = useMemo(() => {
    const listenMap = new Map(sessions.map((s) => [s.date, s.seconds]));
    const readMap = new Map(readingSessions.map((s) => [s.date, s.seconds]));
    const arr: Array<{
      date: string;
      listen: number;
      read: number;
      total: number;
      label: string;
    }> = [];
    const d = new Date();
    d.setDate(d.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      const key = formatDate(d);
      const listen = listenMap.get(key) ?? 0;
      const read = readMap.get(key) ?? 0;
      arr.push({
        date: key,
        listen,
        read,
        total: listen + read,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
      d.setDate(d.getDate() + 1);
    }
    return arr;
  }, [sessions, readingSessions]);

  const maxBar = Math.max(60, ...chartData.map((d) => d.total));

  // Leitner stats
  const cardStats = useMemo(() => {
    const now = Date.now();
    const due = cards.filter((c) => c.nextReview <= now).length;
    const boxes = [0, 0, 0, 0, 0];
    for (const c of cards) boxes[c.box - 1] += 1;
    return { total: cards.length, due, boxes };
  }, [cards]);

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground">
      <header className="m3-top-app-bar sticky top-0 z-30 border-b border-outline-variant/40">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm" className="rounded-full gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Home
            </Button>
          </Link>
          <h1 className="text-[15px] font-semibold flex items-center gap-2">
            <span className="h-9 w-9 rounded-2xl bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))] flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </span>
            Progress
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[hsl(var(--tertiary-container))] via-[hsl(var(--surface-container))] to-[hsl(var(--primary-container))] p-6 sm:p-8">
          <div aria-hidden className="absolute -top-12 -left-12 h-48 w-48 rounded-full bg-[hsl(var(--tertiary)/0.18)] blur-3xl" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--on-surface-variant))]">
              Your Journey
            </p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-[hsl(var(--on-tertiary-container))] leading-tight">
              پیشرفت شما
            </h2>
            <p className="mt-2 text-sm text-[hsl(var(--on-surface-variant))]">
              {streak > 0 ? `🔥 ${streak} روز پشت سر هم` : 'امروز شروع کن'}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={<Flame className="h-5 w-5" />}
            label="Day streak"
            value={streak.toString()}
            sub={streak === 1 ? 'day in a row' : 'days in a row'}
            highlight={streak > 0}
          />
          <KpiCard
            icon={<Clock className="h-5 w-5" />}
            label="Today"
            value={formatDuration(totals.today)}
            sub="of input"
          />
          <KpiCard
            icon={<Clock className="h-5 w-5" />}
            label="Last 7 days"
            value={formatDuration(totals.last7)}
          />
          <KpiCard
            icon={<Clock className="h-5 w-5" />}
            label="All-time"
            value={formatDuration(totals.allSeconds)}
          />
        </section>

        {/* Activity chart (stacked: listen + read) */}
        <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Last 30 days
            </h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-primary/70" />
                Listen
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-accent-foreground/60" />
                Read
              </span>
              <span className="font-medium text-foreground">
                {formatDuration(totals.last30)}
              </span>
            </div>
          </div>
          <div className="flex items-end gap-[3px] h-32 overflow-hidden">
            {chartData.map((d) => {
              const isToday = d.date === formatDate(new Date());
              const listenH = (d.listen / maxBar) * 100;
              const readH = (d.read / maxBar) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 min-w-0 flex flex-col items-center justify-end gap-0"
                  title={
                    `${d.label} — ${formatDuration(d.total)}` +
                    (d.listen ? ` · 🎧 ${formatDuration(d.listen)}` : '') +
                    (d.read ? ` · 📖 ${formatDuration(d.read)}` : '')
                  }
                >
                  {d.read > 0 && (
                    <div
                      className="w-full bg-accent-foreground/60 rounded-t-sm"
                      style={{ height: `${Math.max(readH, 2)}%` }}
                    />
                  )}
                  {d.listen > 0 && (
                    <div
                      className={`w-full ${
                        isToday ? 'bg-primary' : 'bg-primary/70'
                      } ${d.read === 0 ? 'rounded-t-sm' : ''}`}
                      style={{ height: `${Math.max(listenH, 2)}%` }}
                    />
                  )}
                  {d.total === 0 && (
                    <div
                      className="w-full bg-muted rounded-sm"
                      style={{ height: '2%' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{chartData[0]?.label}</span>
            <span>{chartData[Math.floor(chartData.length / 2)]?.label}</span>
            <span>Today</span>
          </div>
        </section>

        {/* Per-activity breakdown */}
        <section className="grid gap-4 sm:grid-cols-2">
          <ActivityCard
            icon={<Headphones className="h-4 w-4 text-primary" />}
            title="Listening"
            today={listenTotals.today}
            last7={listenTotals.last7}
            allTime={listenTotals.allSeconds}
          />
          <ActivityCard
            icon={<BookOpen className="h-4 w-4 text-primary" />}
            title="Reading"
            today={readTotals.today}
            last7={readTotals.last7}
            allTime={readTotals.allSeconds}
            extra={
              books.length > 0
                ? `${books.length} ${books.length === 1 ? 'book' : 'books'} in library`
                : undefined
            }
          />
        </section>

        {/* Vocabulary breakdown */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Vocabulary knowledge
            </h2>
            <div className="space-y-2">
              <StatRow
                label="Known"
                value={wordStatusCounts.known}
                color="bg-green-500/70"
              />
              <StatRow
                label="Learning"
                value={wordStatusCounts.learning}
                color="bg-yellow-500/70"
              />
              <StatRow
                label="Ignored"
                value={wordStatusCounts.ignored}
                color="bg-muted-foreground/40"
              />
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
              Total marked:{' '}
              <span className="font-medium text-foreground">
                {wordStatusCounts.known + wordStatusCounts.learning + wordStatusCounts.ignored}
              </span>{' '}
              words
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Leitner cards
            </h2>
            <p className="text-3xl font-bold">{cardStats.total}</p>
            <p className="text-xs text-muted-foreground">
              {cardStats.due} due now
            </p>
            <div className="grid grid-cols-5 gap-1.5 pt-2">
              {cardStats.boxes.map((n, i) => (
                <div
                  key={i}
                  className="rounded-md bg-primary/10 text-primary text-center py-1.5"
                  title={`Box ${i + 1}: ${n} cards`}
                >
                  <p className="text-[10px] uppercase tracking-wider opacity-70">
                    B{i + 1}
                  </p>
                  <p className="font-semibold">{n}</p>
                </div>
              ))}
            </div>
            <Link to="/leitner" className="block">
              <Button variant="outline" className="w-full" size="sm">
                <GraduationCap className="h-4 w-4 mr-1.5" />
                Open review
              </Button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] p-5 space-y-1 transition-colors ${
        highlight
          ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] m3-elevation-1'
          : 'bg-[hsl(var(--surface-container-low))] border border-outline-variant'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] font-medium opacity-70">
          {label}
        </span>
        <span className={highlight ? '' : 'text-muted-foreground'}>
          {icon}
        </span>
      </div>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] opacity-70">{sub}</p>}
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${color} shrink-0`} />
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ActivityCard({
  icon,
  title,
  today,
  last7,
  allTime,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  today: number;
  last7: number;
  allTime: number;
  extra?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="grid grid-cols-3 gap-2 pt-1">
        <Mini label="Today" value={formatDuration(today)} />
        <Mini label="7 days" value={formatDuration(last7)} />
        <Mini label="All-time" value={formatDuration(allTime)} />
      </div>
      {extra && (
        <p className="text-xs text-muted-foreground pt-2 border-t border-border/50 flex items-center gap-1.5">
          <Library className="h-3.5 w-3.5" />
          {extra}
        </p>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default Stats;
