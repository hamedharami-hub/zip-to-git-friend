import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Brain, Layers, LineChart, Zap, Headphones, Star, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeitnerStore } from '@/store/leitnerStore';
import { ReviewMode, type ReviewProfile } from '@/components/leitner/ReviewMode';
import { FoldersSidebar } from '@/components/leitner/FoldersSidebar';
import { CardList } from '@/components/leitner/CardList';
import { CardEditor } from '@/components/leitner/CardEditor';
import { AccountButton, SyncBadge } from '@/components/auth/AccountButton';
import type { LeitnerCard } from '@/types';

const PROFILES: Array<{ key: ReviewProfile; label: string; icon: typeof Zap; hint: string }> = [
  { key: 'due',       label: 'Due',       icon: Brain,      hint: 'All cards scheduled for today' },
  { key: 'quick',     label: 'Quick 10',  icon: Zap,        hint: 'Top 10 due cards — a 5 min sprint' },
  { key: 'cram',      label: 'Cram',      icon: Repeat,     hint: 'Review every card (ignore schedule)' },
  { key: 'listening', label: 'Listening', icon: Headphones, hint: 'Audio first — guess before you see' },
  { key: 'starred',   label: 'Starred',   icon: Star,       hint: 'Only your flagged cards' },
];

const BOX_META: Array<{ box: 1 | 2 | 3 | 4 | 5; label: string; interval: string }> = [
  { box: 1, label: 'Box 1', interval: '1 day' },
  { box: 2, label: 'Box 2', interval: '3 days' },
  { box: 3, label: 'Box 3', interval: '7 days' },
  { box: 4, label: 'Box 4', interval: '14 days' },
  { box: 5, label: 'Box 5', interval: '30 days' },
];

const Leitner = () => {
  const cards = useLeitnerStore((s) => s.cards);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tab, setTab] = useState<'browse' | 'review' | 'stats'>('browse');
  const [editing, setEditing] = useState<LeitnerCard | null>(null);
  const [profile, setProfile] = useState<ReviewProfile>('due');

  const stats = useMemo(() => {
    const now = Date.now();
    const list = folderId ? cards.filter((c) => c.folderId === folderId) : cards;
    const s = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0, due: 0 } as Record<string, number>;
    for (const c of list) {
      s[c.box] += 1;
      s.total += 1;
      if (c.nextReview <= now) s.due += 1;
    }
    return s as { 1: number; 2: number; 3: number; 4: number; 5: number; total: number; due: number };
  }, [cards, folderId]);

  // Keep `editing` in sync with the underlying card (after AI updates).
  useEffect(() => {
    if (!editing) return;
    const fresh = cards.find((c) => c.id === editing.id);
    if (!fresh) {
      setEditing(null);
    } else if (fresh !== editing) {
      setEditing(fresh);
    }
  }, [cards, editing]);

  useEffect(() => {
    document.title = 'Leitner — Language Learning Player';
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Library
            </Button>
          </Link>
          <h1 className="text-base font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Leitner
          </h1>
          <AccountButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-semibold">Spaced repetition</h2>
            <p className="text-sm text-muted-foreground inline-flex items-center gap-2 flex-wrap">
              <span>
                {stats.total} cards · <span className="text-primary font-medium">{stats.due} due now</span>
              </span>
              <SyncBadge />
            </p>
          </div>
          <Button
            onClick={() => setTab('review')}
            disabled={stats.due === 0}
            size="lg"
            className="shadow-sm"
          >
            <Layers className="h-4 w-4 mr-2" />
            Review {stats.due} due
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="browse" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              Review
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <LineChart className="h-3.5 w-3.5" />
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-6">
              <FoldersSidebar
                selectedId={folderId}
                onSelect={setFolderId}
                onReview={(id) => { setFolderId(id); setProfile('due'); setTab('review'); }}
              />
              <div className="flex-1 min-w-0 space-y-4">
                <CardList folderId={folderId} onEdit={setEditing} />
                {editing && (
                  <CardEditor card={editing} onClose={() => setEditing(null)} />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="review" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Reviewing {folderId ? 'this folder' : 'all folders'}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setTab('browse')}>
                Back to browse
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {PROFILES.map((p) => {
                const Icon = p.icon;
                const active = profile === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setProfile(p.key)}
                    title={p.hint}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {p.label}
                  </button>
                );
              })}
            </div>
            <ReviewMode
              key={`${profile}-${folderId ?? 'all'}`}
              folderId={folderId}
              profile={profile}
              audioOnly={profile === 'listening'}
              onEmpty={() => { /* stay on screen */ }}
            />
          </TabsContent>

          <TabsContent value="stats" className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {BOX_META.map((m) => (
                <div
                  key={m.box}
                  className="rounded-lg border border-border bg-card p-4 text-center"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="text-3xl font-semibold mt-1 tabular-nums">{stats[m.box]}</p>
                  <p className="text-xs text-muted-foreground mt-1">{m.interval}</p>
                </div>
              ))}
            </div>
            {stats.total === 0 && (
              <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
                No cards yet. Add words from subtitle analyses, books, or news.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Leitner;
