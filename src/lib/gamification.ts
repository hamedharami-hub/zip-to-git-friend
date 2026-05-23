/**
 * Gamification primitives: XP, level, streak, hearts, daily quests.
 * All state lives in `user_gamification` + `daily_quests` (RLS-protected).
 */
import { supabase } from '@/integrations/supabase/client';

export interface GamificationState {
  userId: string;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  hearts: number;
  heartsRefilledAt: string;
  gems: number;
  comboBest: number;
  totalReviews: number;
}

export interface DailyQuest {
  id: string;
  questKey: string;
  title: string;
  description: string | null;
  target: number;
  progress: number;
  rewardXp: number;
  completed: boolean;
  claimed: boolean;
  expiresAt: string;
}

const MAX_HEARTS = 5;
/** XP needed to reach a given level (Duolingo-style cumulative curve). */
export function xpForLevel(level: number): number {
  // 0 → L1, 50 → L2, 150 → L3, 300 → L4 ...
  return Math.round(50 * level * (level - 1) / 2 + 50 * (level - 1));
}
export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}
export function xpProgress(xp: number) {
  const level = levelFromXp(xp);
  const cur = xpForLevel(level);
  const nxt = xpForLevel(level + 1);
  return { level, cur, nxt, into: xp - cur, span: nxt - cur, pct: ((xp - cur) / (nxt - cur)) * 100 };
}

function mapState(row: any): GamificationState {
  return {
    userId: row.user_id,
    xp: row.xp,
    level: row.level,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActiveDate: row.last_active_date,
    hearts: row.hearts,
    heartsRefilledAt: row.hearts_refilled_at,
    gems: row.gems,
    comboBest: row.combo_best,
    totalReviews: row.total_reviews,
  };
}

function mapQuest(row: any): DailyQuest {
  return {
    id: row.id,
    questKey: row.quest_key,
    title: row.title,
    description: row.description,
    target: row.target,
    progress: row.progress,
    rewardXp: row.reward_xp,
    completed: row.completed,
    claimed: row.claimed,
    expiresAt: row.expires_at,
  };
}

export async function getOrCreateState(): Promise<GamificationState | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from('user_gamification')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return refillHeartsIfNeeded(mapState(data));
  const { data: created } = await supabase
    .from('user_gamification')
    .insert({ user_id: userId })
    .select()
    .single();
  return created ? mapState(created) : null;
}

/** Refill 1 heart every 30 minutes up to MAX_HEARTS. */
async function refillHeartsIfNeeded(s: GamificationState): Promise<GamificationState> {
  if (s.hearts >= MAX_HEARTS) return s;
  const last = new Date(s.heartsRefilledAt).getTime();
  const elapsedMin = (Date.now() - last) / 60000;
  const refills = Math.floor(elapsedMin / 30);
  if (refills <= 0) return s;
  const newHearts = Math.min(MAX_HEARTS, s.hearts + refills);
  if (newHearts === s.hearts) return s;
  const { data } = await supabase
    .from('user_gamification')
    .update({ hearts: newHearts, hearts_refilled_at: new Date().toISOString() })
    .eq('user_id', s.userId)
    .select()
    .single();
  return data ? mapState(data) : s;
}

/** XP rewards per FSRS grade. */
export const XP_BY_GRADE: Record<string, number> = {
  again: 0,
  hard: 3,
  good: 8,
  easy: 12,
};

/** Apply a grade outcome: XP, streak, heart loss, combo. Returns updated state + delta info. */
export async function recordGrade(opts: {
  grade: 'again' | 'hard' | 'good' | 'easy';
  combo: number;
}): Promise<{ state: GamificationState | null; xpEarned: number; leveledUp: boolean; lostHeart: boolean }> {
  const state = await getOrCreateState();
  if (!state) return { state: null, xpEarned: 0, leveledUp: false, lostHeart: false };

  const baseXp = XP_BY_GRADE[opts.grade] ?? 0;
  const multiplier = opts.combo >= 10 ? 3 : opts.combo >= 5 ? 2 : 1;
  const xpEarned = baseXp * multiplier;
  const lostHeart = opts.grade === 'again' && state.hearts > 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let nextStreak = state.currentStreak;
  if (state.lastActiveDate !== today) {
    nextStreak = state.lastActiveDate === yesterday ? state.currentStreak + 1 : 1;
  }
  const newXp = state.xp + xpEarned;
  const oldLevel = levelFromXp(state.xp);
  const newLevel = levelFromXp(newXp);

  const update: {
    xp: number;
    level: number;
    current_streak: number;
    longest_streak: number;
    last_active_date: string;
    total_reviews: number;
    combo_best: number;
    hearts?: number;
  } = {
    xp: newXp,
    level: newLevel,
    current_streak: nextStreak,
    longest_streak: Math.max(state.longestStreak, nextStreak),
    last_active_date: today,
    total_reviews: state.totalReviews + 1,
    combo_best: Math.max(state.comboBest, opts.combo),
  };
  if (lostHeart) update.hearts = Math.max(0, state.hearts - 1);

  const { data } = await supabase
    .from('user_gamification')
    .update(update)
    .eq('user_id', state.userId)
    .select()
    .single();

  // Quest progress: review_n
  void incrementQuestProgress('review_count', 1);
  if (opts.grade === 'good' || opts.grade === 'easy') {
    void incrementQuestProgress('correct_count', 1);
  }
  if (opts.combo >= 10) {
    void incrementQuestProgress('combo_10', 1);
  }

  return {
    state: data ? mapState(data) : state,
    xpEarned,
    leveledUp: newLevel > oldLevel,
    lostHeart,
  };
}

/* ─────────────── Daily quests ─────────────── */

const QUEST_TEMPLATES = [
  { key: 'review_count', title: 'بازی‌گرم!', description: '۲۰ جمله را مرور کن', target: 20, rewardXp: 30 },
  { key: 'correct_count', title: 'دقت بالا', description: '۱۵ جواب خوب یا عالی بده', target: 15, rewardXp: 25 },
  { key: 'combo_10', title: 'کمبوی طلایی', description: 'یک Combo ×۱۰ بساز', target: 1, rewardXp: 40 },
];

function endOfDayISO(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export async function ensureDailyQuests(): Promise<DailyQuest[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const { data } = await supabase
    .from('daily_quests')
    .select('*')
    .eq('user_id', userId)
    .gte('expires_at', new Date().toISOString());
  if (data && data.length > 0) return data.map(mapQuest);
  const rows = QUEST_TEMPLATES.map((t) => ({
    user_id: userId,
    quest_key: t.key,
    title: t.title,
    description: t.description,
    target: t.target,
    reward_xp: t.rewardXp,
    expires_at: endOfDayISO(),
  }));
  const { data: created } = await supabase.from('daily_quests').insert(rows).select();
  return (created ?? []).map(mapQuest);
}

export async function incrementQuestProgress(questKey: string, by = 1): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;
  const { data: rows } = await supabase
    .from('daily_quests')
    .select('*')
    .eq('user_id', userId)
    .eq('quest_key', questKey)
    .eq('completed', false)
    .gte('expires_at', new Date().toISOString())
    .limit(1);
  const row = rows?.[0];
  if (!row) return;
  const newProgress = row.progress + by;
  const completed = newProgress >= row.target;
  await supabase
    .from('daily_quests')
    .update({ progress: newProgress, completed })
    .eq('id', row.id);
}

export async function claimQuest(questId: string): Promise<GamificationState | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data: q } = await supabase
    .from('daily_quests')
    .select('*')
    .eq('id', questId)
    .single();
  if (!q || !q.completed || q.claimed) return getOrCreateState();
  await supabase.from('daily_quests').update({ claimed: true }).eq('id', questId);
  const state = await getOrCreateState();
  if (!state) return null;
  const newXp = state.xp + q.reward_xp;
  const { data } = await supabase
    .from('user_gamification')
    .update({ xp: newXp, level: levelFromXp(newXp) })
    .eq('user_id', state.userId)
    .select()
    .single();
  return data ? mapState(data) : state;
}
