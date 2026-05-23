import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain, Eye, Volume2, Repeat, Star, Undo2, Keyboard, ListChecks, Type as TypeIcon, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useLeitnerStore } from '@/store/leitnerStore';
import { useGamificationStore } from '@/store/gamificationStore';
import type { LeitnerCard, LeitnerRating } from '@/types';
import { speak, stopAllTts } from '@/lib/leitnerTts';
import { intervalLabel, applyRating } from '@/lib/srs';
import { youtubeIdFromUrl, buildYoutubeEmbedUrl } from '@/lib/youtubeEmbed';
import { pickDistractors, shuffled, answersMatch, buildCloze } from '@/lib/sessionModes';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export type ReviewProfile = 'due' | 'quick' | 'cram' | 'listening' | 'starred';
export type StudyMode = 'classic' | 'type' | 'mcq' | 'cloze';

interface Props {
  compact?: boolean;
  folderId?: string | null;
  profile?: ReviewProfile;
  audioOnly?: boolean;
  onEmpty?: () => void;
}

const BOX_LABEL: Record<number, string> = {
  1: 'Box 1', 2: 'Box 2', 3: 'Box 3', 4: 'Box 4', 5: 'Box 5',
};

const RATINGS: Array<{ key: LeitnerRating; label: string; hotkey: string; cls: string }> = [
  { key: 'again', label: 'Again',  hotkey: '1', cls: 'border-destructive/40 text-destructive hover:bg-destructive/10' },
  { key: 'hard',  label: 'Hard',   hotkey: '2', cls: 'border-amber-500/40 text-amber-600 hover:bg-amber-500/10' },
  { key: 'good',  label: 'Good',   hotkey: '3', cls: 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10' },
  { key: 'easy',  label: 'Easy',   hotkey: '4', cls: 'border-sky-500/40 text-sky-600 hover:bg-sky-500/10' },
];

const MODES: Array<{ key: StudyMode; label: string; icon: typeof Pencil; hint: string }> = [
  { key: 'classic', label: 'Classic', icon: Pencil,     hint: 'Reveal then self-grade' },
  { key: 'type',    label: 'Type',    icon: TypeIcon,   hint: 'Type the answer' },
  { key: 'mcq',     label: 'Choose',  icon: ListChecks, hint: '4 options, pick one' },
  { key: 'cloze',   label: 'Cloze',   icon: Keyboard,   hint: 'Fill the blank in the example' },
];

export function ReviewMode({
  compact = false,
  folderId = null,
  profile = 'due',
  audioOnly = false,
  onEmpty,
}: Props) {
  const getProfileQueue = useLeitnerStore((s) => s.getProfileQueue);
  const rateCard = useLeitnerStore((s) => s.rateCard);
  const undoLastReview = useLeitnerStore((s) => s.undoLastReview);
  const lastReviewSnapshot = useLeitnerStore((s) => s.lastReviewSnapshot);
  const toggleStar = useLeitnerStore((s) => s.toggleStar);
  const cards = useLeitnerStore((s) => s.cards);
  const grade = useGamificationStore((s) => s.grade);

  const [queue, setQueue] = useState<LeitnerCard[]>([]);
  const [initialSize, setInitialSize] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<StudyMode>('classic');
  const [typed, setTyped] = useState('');
  const [typedResult, setTypedResult] = useState<'pending' | 'correct' | 'wrong'>('pending');
  const [mcqPicked, setMcqPicked] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [looping, setLooping] = useState(false);

  const isCram = profile === 'cram';

  useEffect(() => {
    const q = getProfileQueue(profile, folderId ?? undefined);
    setQueue(q);
    setInitialSize(q.length);
    setRevealed(false);
    setTyped(''); setTypedResult('pending'); setMcqPicked(null);
    return () => stopAllTts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, profile]);

  useEffect(() => {
    setQueue((q) => q.filter((c) => cards.some((x) => x.id === c.id)));
  }, [cards]);

  const current = useMemo(() => {
    const head = queue[0];
    if (!head) return null;
    return cards.find((c) => c.id === head.id) ?? head;
  }, [queue, cards]);

  // Per-card MCQ options (memoized so they don't re-shuffle on every render)
  const mcqOptions = useMemo(() => {
    if (!current || mode !== 'mcq') return null;
    const distractors = pickDistractors(cards, current, 3);
    return shuffled([current.back, ...distractors]);
  }, [current?.id, mode, cards]);

  const cloze = useMemo(() => current ? buildCloze(current) : null, [current?.id]);
  // Auto-fallback: if Cloze mode but card has no example with the front, use classic
  const effectiveMode: StudyMode = mode === 'cloze' && !cloze ? 'classic' : mode;

  useEffect(() => {
    if (!current && queue.length === 0) onEmpty?.();
  }, [current, queue.length, onEmpty]);

  const shouldAutoplay = audioOnly ? !!current : revealed;
  useEffect(() => {
    if (compact || !current || !shouldAutoplay) return;
    playCardAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoplay, current?.id]);

  const playCardAudio = () => {
    if (!current) return;
    stopAllTts();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    if (current.audioUrl) {
      const a = new Audio(current.audioUrl);
      a.loop = looping;
      audioRef.current = a;
      a.play().catch(() => {
        const text = current.exampleSentence || current.front;
        void speak(text);
      });
    } else {
      const text = current.exampleSentence || current.front;
      void speak(text);
    }
  };

  useEffect(() => { if (audioRef.current) audioRef.current.loop = looping; }, [looping]);

  const previews = useMemo(() => {
    if (!current) return null;
    return RATINGS.reduce((acc, r) => {
      const next = applyRating(current, r.key);
      acc[r.key] = intervalLabel(next.lastIntervalMs ?? 0);
      return acc;
    }, {} as Record<LeitnerRating, string>);
  }, [current]);

  const handleRate = async (rating: LeitnerRating) => {
    if (!current) return;
    stopAllTts();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(rating === 'again' ? [12, 40, 12] : 20);
      }
    } catch { /* ignore */ }
    await rateCard(current.id, rating, { ephemeral: isCram });
    // Gamification: XP, combo, streak (skip in cram so it doesn't inflate)
    if (!isCram) void grade(rating);
    setQueue((q) => q.slice(1));
    setRevealed(false);
    setTyped(''); setTypedResult('pending'); setMcqPicked(null);
  };

  const handleUndo = async () => {
    const id = await undoLastReview();
    if (!id) return;
    const card = useLeitnerStore.getState().cards.find((c) => c.id === id);
    if (!card) return;
    setQueue((q) => [card, ...q]);
    setRevealed(true);
    toast.success('بازگردانده شد');
  };

  // Auto-grade based on a typed/MCQ outcome
  const submitAuto = (correct: boolean) => {
    setRevealed(true);
    void handleRate(correct ? 'good' : 'again');
  };

  const handleTypeSubmit = () => {
    if (!current) return;
    const correct = answersMatch(typed, current.back) || answersMatch(typed, current.front);
    setTypedResult(correct ? 'correct' : 'wrong');
    setRevealed(true);
    // Slight delay so user sees feedback before card flips
    setTimeout(() => submitAuto(correct), 700);
  };

  const handleMcqPick = (val: string) => {
    if (!current || mcqPicked) return;
    setMcqPicked(val);
    const correct = val === current.back;
    setRevealed(true);
    setTimeout(() => submitAuto(correct), 700);
  };

  const handleClozeSubmit = () => {
    if (!current || !cloze) return;
    const correct = answersMatch(typed, cloze.answer);
    setTypedResult(correct ? 'correct' : 'wrong');
    setRevealed(true);
    setTimeout(() => submitAuto(correct), 700);
  };

  // Keyboard shortcuts (classic-only for grading; Enter submits in type/cloze)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); void handleUndo(); return;
      }
      if (effectiveMode === 'classic') {
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault(); setRevealed(true); return;
        }
        if (revealed) {
          const r = RATINGS.find((x) => x.hotkey === e.key);
          if (r) { e.preventDefault(); void handleRate(r.key); }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, revealed, effectiveMode]);

  if (!current) {
    const isListening = profile === 'listening';
    return (
      <div className={compact
        ? 'rounded-lg border border-border bg-card/50 p-4 text-center'
        : 'rounded-xl border border-border bg-card p-8 text-center space-y-3'
      }>
        <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        {isListening ? (
          <>
            <p className="text-sm">هیچ کارتی صدا نداره ❌</p>
            <p className="text-xs text-muted-foreground">
              برای استفاده از حالت Listening، کارت‌ها رو از پادکست/ویدئو با کلیپ صوتی اضافه کن.
            </p>
            <Link to="/" className="inline-block">
              <Button size="sm" variant="outline">رفتن به کتابخانه</Button>
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No cards in this queue. Great job!</p>
        )}
      </div>
    );
  }

  const hideFront = audioOnly && !revealed;
  const progressPct = initialSize > 0 ? ((initialSize - queue.length) / initialSize) * 100 : 0;

  return (
    <div className={compact
      ? 'rounded-lg border border-border bg-card p-3 space-y-3'
      : 'rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4 max-w-xl mx-auto'
    }>
      {/* Progress bar */}
      {!compact && (
        <div className="space-y-1">
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>{initialSize - queue.length} / {initialSize}</span>
            {isCram && <span className="text-amber-500">Cram (ephemeral)</span>}
          </div>
        </div>
      )}

      {/* Mode tabs */}
      {!compact && !audioOnly && (
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => { setMode(m.key); setRevealed(false); setTyped(''); setTypedResult('pending'); setMcqPicked(null); }}
                title={m.hint}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                  active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-3 w-3" />{m.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          {BOX_LABEL[current.box]}
          {current.cefr && <span className="ml-1 px-1.5 py-0.5 rounded bg-muted">{current.cefr}</span>}
          {current.partOfSpeech && <span className="ml-1 italic">{current.partOfSpeech}</span>}
        </span>
        <span className="inline-flex items-center gap-2">
          {lastReviewSnapshot && (
            <button onClick={handleUndo} className="hover:text-foreground transition-colors" aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => toggleStar(current.id)}
            className="hover:text-amber-500 transition-colors"
            aria-label={current.starred ? 'Unstar' : 'Star'}
          >
            <Star className={`h-4 w-4 ${current.starred ? 'fill-amber-500 text-amber-500' : ''}`} />
          </button>
          <span>{queue.length} left</span>
        </span>
      </div>

      {!compact && current.imageUrl && !youtubeIdFromUrl(current.sourceUrl) && (
        <img src={current.imageUrl} alt=""
          className="rounded-lg w-full max-w-xs mx-auto aspect-square object-cover" loading="lazy" />
      )}

      {!compact && (() => {
        const ytId = youtubeIdFromUrl(current.sourceUrl);
        if (!ytId || !revealed) return null;
        return (
          <div className="rounded-lg overflow-hidden border border-border aspect-video max-w-md mx-auto">
            <iframe
              key={current.id}
              src={buildYoutubeEmbedUrl({
                videoId: ytId,
                startMs: current.sourceStartMs,
                endMs: current.sourceEndMs,
                autoplay: true,
                loop: looping,
              })}
              title="YouTube clip"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      })()}

      {/* PROMPT AREA — varies by mode */}
      <div className={compact
        ? 'min-h-[3rem] flex items-center justify-center text-center'
        : 'min-h-[8rem] flex flex-col items-center justify-center text-center gap-3'
      }>
        <div className="space-y-2 w-full">
          {effectiveMode === 'cloze' && cloze ? (
            <p className={compact ? 'text-base' : 'text-lg'}>{cloze.masked}</p>
          ) : (
            <p className={compact ? 'text-base font-medium' : 'text-2xl font-semibold'}>
              {hideFront ? '👂' : current.front}
            </p>
          )}
          {revealed && (
            <>
              {hideFront && <p className="text-2xl font-semibold">{current.front}</p>}
              <p dir="auto" className={compact ? 'text-sm text-primary' : 'text-xl text-primary'}>
                {current.back}
              </p>
              {current.exampleSentence && !compact && effectiveMode !== 'cloze' && (
                <p className="text-sm text-muted-foreground italic mt-2">"{current.exampleSentence}"</p>
              )}
              {current.sourceTitle && !compact && (
                <p className="text-xs text-muted-foreground/70 mt-1">— {current.sourceTitle}</p>
              )}
            </>
          )}
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center justify-center gap-1">
            <Button variant="ghost" size="sm" onClick={playCardAudio} className="text-muted-foreground">
              <Volume2 className="h-4 w-4 mr-1.5" />{current.audioUrl ? 'Play clip' : 'Pronounce'}
            </Button>
            {current.audioUrl && (
              <Button variant={looping ? 'secondary' : 'ghost'} size="sm" onClick={() => setLooping((v) => !v)} className="text-muted-foreground">
                <Repeat className="h-4 w-4 mr-1.5" />Loop
              </Button>
            )}
          </div>
        )}
      </div>

      {/* INTERACTION AREA */}
      {effectiveMode === 'classic' && (
        !revealed ? (
          <Button onClick={() => setRevealed(true)} className="w-full" size={compact ? 'sm' : 'default'}>
            <Eye className="h-4 w-4 mr-2" /> Show answer <span className="ml-2 text-xs opacity-60">Space</span>
          </Button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <Button
                key={r.key}
                variant="outline"
                size={compact ? 'sm' : 'default'}
                onClick={() => handleRate(r.key)}
                className={`flex-col h-auto py-2 ${r.cls}`}
              >
                <span className="font-medium">{r.label}</span>
                {previews && (
                  <span className="text-[10px] opacity-70 mt-0.5">{previews[r.key]} · {r.hotkey}</span>
                )}
              </Button>
            ))}
          </div>
        )
      )}

      {(effectiveMode === 'type' || effectiveMode === 'cloze') && !revealed && (
        <div className="space-y-2">
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                effectiveMode === 'cloze' ? handleClozeSubmit() : handleTypeSubmit();
              }
            }}
            placeholder={effectiveMode === 'cloze' ? 'کلمه‌ی جا افتاده…' : 'جواب رو تایپ کن…'}
            className="text-center"
            autoFocus
          />
          <Button
            className="w-full"
            onClick={effectiveMode === 'cloze' ? handleClozeSubmit : handleTypeSubmit}
            disabled={!typed.trim()}
          >
            بررسی <span className="ml-2 text-xs opacity-60">Enter</span>
          </Button>
        </div>
      )}

      {(effectiveMode === 'type' || effectiveMode === 'cloze') && revealed && typedResult !== 'pending' && (
        <div className={`text-center text-sm py-2 rounded-md ${
          typedResult === 'correct' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-destructive/15 text-destructive'
        }`}>
          {typedResult === 'correct' ? '✓ آفرین!' : `✗ جواب: ${effectiveMode === 'cloze' ? cloze?.answer : current.back}`}
        </div>
      )}

      {effectiveMode === 'mcq' && mcqOptions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {mcqOptions.map((opt) => {
            const picked = mcqPicked === opt;
            const isCorrect = opt === current.back;
            const showState = mcqPicked != null;
            return (
              <Button
                key={opt}
                variant="outline"
                onClick={() => handleMcqPick(opt)}
                disabled={!!mcqPicked}
                className={`justify-start text-left h-auto py-2.5 whitespace-normal ${
                  showState && isCorrect ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700' :
                  showState && picked && !isCorrect ? 'border-destructive/60 bg-destructive/10 text-destructive' : ''
                }`}
              >
                {opt}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
