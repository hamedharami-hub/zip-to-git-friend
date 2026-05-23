import { useCallback, useEffect, useState } from 'react';
import type { WordStatus, WordStatusValue } from '@/types';
import { getAllWordStatus, setWordStatus } from '@/lib/db';

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: Record<string, WordStatusValue> = {};
let loaded = false;

function normalize(w: string): string {
  return w.trim().toLowerCase();
}

async function ensureLoaded() {
  if (loaded) return;
  const rows = await getAllWordStatus();
  cache = {};
  for (const r of rows) cache[r.word] = r.status;
  loaded = true;
}

function notify() {
  for (const l of listeners) l();
}

export async function setWordStatusGlobal(word: string, status: WordStatusValue) {
  const key = normalize(word);
  if (!key) return;
  await ensureLoaded();
  if (status === 'new') {
    delete cache[key];
  } else {
    cache[key] = status;
  }
  await setWordStatus(key, status);
  notify();
}

export function getWordStatusSync(word: string): WordStatusValue {
  const key = normalize(word);
  return cache[key] ?? 'new';
}

/** Subscribe to live word-status changes; returns the current map. */
export function useAllWordStatus(): Record<string, WordStatusValue> {
  const [, force] = useState(0);
  useEffect(() => {
    ensureLoaded().then(() => force((n) => n + 1));
    const l: Listener = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return cache;
}

export function useWordStatus(word: string | undefined | null) {
  const map = useAllWordStatus();
  const key = word ? normalize(word) : '';
  const status: WordStatusValue = key ? map[key] ?? 'new' : 'new';
  const setStatus = useCallback(
    (next: WordStatusValue) => {
      if (!key) return Promise.resolve();
      return setWordStatusGlobal(key, next);
    },
    [key],
  );
  /** Cycle: new → learning → known → new (skips ignored — that's manual). */
  const cycle = useCallback(() => {
    const order: WordStatusValue[] = ['new', 'learning', 'known'];
    const idx = order.indexOf(status === 'ignored' ? 'new' : status);
    const next = order[(idx + 1) % order.length];
    return setStatus(next);
  }, [status, setStatus]);
  return { status, setStatus, cycle };
}

export function statusColorClass(status: WordStatusValue): string {
  switch (status) {
    case 'learning':
      return 'bg-yellow-500/20 text-yellow-200 border-b-2 border-yellow-400/70';
    case 'known':
      return 'opacity-60';
    case 'ignored':
      return 'opacity-40';
    default:
      return '';
  }
}

export function statusLabel(status: WordStatusValue): string {
  switch (status) {
    case 'learning':
      return 'Learning';
    case 'known':
      return 'Known';
    case 'ignored':
      return 'Ignored';
    default:
      return 'New';
  }
}
