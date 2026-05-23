import { openDB, IDBPDatabase, DBSchema } from 'idb';
import type {
  Video,
  SubtitleTrack,
  LeitnerCard,
  LeitnerFolder,
  AppSettings,
  SegmentAnalysis,
  WordTranslation,
  WordStatus,
  WordStatusValue,
  ListeningSession,
  ShadowingTakeRecord,
} from '@/types';

interface LLVPSchema extends DBSchema {
  videos: {
    key: string;
    value: Video;
    indexes: { createdAt: number };
  };
  videoBlobs: {
    key: string; // videoId
    value: { id: string; blob: Blob; mimeType: string; savedAt: number };
  };
  subtitleTracks: {
    key: string;
    value: SubtitleTrack;
    indexes: { videoId: string; 'videoId+role': [string, string] };
  };
  leitnerCards: {
    key: string;
    value: LeitnerCard;
    indexes: { box: number; nextReview: number; sourceVideoId: string };
  };
  settings: {
    key: string;
    value: AppSettings & { key: string };
  };
  analysisCache: {
    key: [string, string];
    value: { videoId: string; cueId: string; analysis: SegmentAnalysis };
    indexes: { videoId: string };
  };
  wordTranslations: {
    key: string;
    value: WordTranslation;
  };
  appState: {
    key: string;
    value: { key: string; value: unknown };
  };
  wordStatus: {
    key: string; // normalized lowercased word
    value: WordStatus;
    indexes: { status: WordStatusValue };
  };
  listeningSessions: {
    key: string; // YYYY-MM-DD
    value: ListeningSession;
  };
  shadowingTakes: {
    key: string; // take id
    value: ShadowingTakeRecord;
    indexes: { 'videoId+cueId': [string, string]; videoId: string };
  };
  leitnerFolders: {
    key: string;
    value: LeitnerFolder;
    indexes: { kind: string; parentId: string };
  };
}

let dbPromise: Promise<IDBPDatabase<LLVPSchema>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LLVPSchema>('LLVPDatabase', 7, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const videos = db.createObjectStore('videos', { keyPath: 'id' });
          videos.createIndex('createdAt', 'createdAt');

          const tracks = db.createObjectStore('subtitleTracks', { keyPath: 'id' });
          tracks.createIndex('videoId', 'videoId');
          tracks.createIndex('videoId+role', ['videoId', 'role']);

          const cards = db.createObjectStore('leitnerCards', { keyPath: 'id' });
          cards.createIndex('box', 'box');
          cards.createIndex('nextReview', 'nextReview');

          db.createObjectStore('settings', { keyPath: 'key' });

          const analysis = db.createObjectStore('analysisCache', {
            keyPath: ['videoId', 'cueId'],
          });
          analysis.createIndex('videoId', 'videoId');
        }
        if (oldVersion < 2) {
          db.createObjectStore('wordTranslations', { keyPath: 'word' });
        }
        if (oldVersion < 3) {
          db.createObjectStore('videoBlobs', { keyPath: 'id' });
          db.createObjectStore('appState', { keyPath: 'key' });
        }
        if (oldVersion < 4) {
          // Add sourceVideoId index on leitnerCards for per-video filtering.
          const cardsStore = transaction.objectStore('leitnerCards');
          if (!cardsStore.indexNames.contains('sourceVideoId')) {
            cardsStore.createIndex('sourceVideoId', 'sourceVideoId');
          }
        }
        if (oldVersion < 5) {
          // Word knowledge tracking + per-day listening stats.
          const ws = db.createObjectStore('wordStatus', { keyPath: 'word' });
          ws.createIndex('status', 'status');
          db.createObjectStore('listeningSessions', { keyPath: 'date' });
        }
        if (oldVersion < 6) {
          // Shadowing takes (recorded user attempts per cue).
          const st = db.createObjectStore('shadowingTakes', { keyPath: 'id' });
          st.createIndex('videoId+cueId', ['videoId', 'cueId']);
          st.createIndex('videoId', 'videoId');
        }
        if (oldVersion < 7) {
          const folders = db.createObjectStore('leitnerFolders', { keyPath: 'id' });
          folders.createIndex('kind', 'kind');
          folders.createIndex('parentId', 'parentId');
        }
      },
    });
  }
  return dbPromise;
}

// Videos
export async function getVideo(id: string): Promise<Video | undefined> {
  return (await getDb()).get('videos', id);
}
export async function getAllVideos(): Promise<Video[]> {
  return (await getDb()).getAllFromIndex('videos', 'createdAt');
}
export async function saveVideo(video: Video): Promise<void> {
  await (await getDb()).put('videos', video);
}
export async function deleteVideo(id: string): Promise<void> {
  const db = await getDb();
  // Revoke blob URL on the in-memory video record (if any) to free RAM.
  try {
    const v = await db.get('videos', id);
    if (v?.blobUrl && v.blobUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(v.blobUrl);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  await db.delete('videos', id);
  try {
    await db.delete('videoBlobs', id);
  } catch {
    /* ignore */
  }
  // Also delete subtitle tracks + analyses + word translations linked to this video.
  try {
    const tracks = await db.getAllFromIndex('subtitleTracks', 'videoId', id);
    for (const t of tracks) await db.delete('subtitleTracks', t.id);
  } catch {
    /* ignore */
  }
  try {
    const analyses = await db.getAllFromIndex('analysisCache', 'videoId', id);
    for (const a of analyses) await db.delete('analysisCache', [a.videoId, a.cueId]);
  } catch {
    /* ignore */
  }
  try {
    const takes = await db.getAllFromIndex('shadowingTakes', 'videoId', id);
    for (const t of takes) await db.delete('shadowingTakes', t.id);
  } catch {
    /* ignore */
  }
}

// Video file blobs (so files survive reloads without re-attach)
export async function saveVideoBlob(id: string, file: File | Blob): Promise<void> {
  const mimeType = (file as File).type || 'video/mp4';
  await (await getDb()).put('videoBlobs', {
    id,
    blob: file,
    mimeType,
    savedAt: Date.now(),
  });
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
  const row = await (await getDb()).get('videoBlobs', id);
  return row?.blob ?? null;
}

// Generic app state (last-opened video id, etc.)
export async function setAppState<T>(key: string, value: T): Promise<void> {
  await (await getDb()).put('appState', { key, value });
}

export async function getAppState<T>(key: string): Promise<T | null> {
  const row = await (await getDb()).get('appState', key);
  return (row?.value as T) ?? null;
}

// Leitner cards
export async function getAllLeitnerCards(): Promise<LeitnerCard[]> {
  return (await getDb()).getAll('leitnerCards');
}
export async function saveLeitnerCard(card: LeitnerCard): Promise<void> {
  await (await getDb()).put('leitnerCards', card);
}
export async function deleteLeitnerCard(id: string): Promise<void> {
  await (await getDb()).delete('leitnerCards', id);
}

// Tracks
export async function getTracks(videoId: string): Promise<SubtitleTrack[]> {
  return (await getDb()).getAllFromIndex('subtitleTracks', 'videoId', videoId);
}
export async function saveTrack(track: SubtitleTrack): Promise<void> {
  await (await getDb()).put('subtitleTracks', track);
}
export async function deleteTrack(id: string): Promise<void> {
  await (await getDb()).delete('subtitleTracks', id);
}

// Settings
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 'md',
  displayMode: 'outside',
  autoShowAnalysis: false,
  blindListen: false,
  autoPauseAtCueEnd: false,
  showInlineTranslation: true,
  geminiApiKey: '',
  groqApiKey: '',
  geminiTtsApiKey: '',
  geminiModel: 'gemini-3-flash-preview',
  analyzeModel: { provider: 'gemini', model: 'gemini-3-flash-preview' },
  translateModel: { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
  batchModel: { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
  wordMeaningModel: { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
  transcribeModel: 'whisper-large-v3-turbo',
  bookAnalysisModel: 'google/gemini-3-flash-preview',
  bookSingleAnalysisModel: 'google/gemini-3-flash-preview',
  bookBatchAnalysisModel: 'google/gemini-3.1-flash-lite-preview',
  bookRewriteModel: 'google/gemini-3-flash-preview',
  paragraphAnalysisModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
  paragraphBatchModelRef: { provider: 'gateway', model: 'google/gemini-3.1-flash-lite-preview' },
  rewriteModelRef: { provider: 'gateway', model: 'google/gemini-3-flash-preview' },
};

function migrateLegacyModel(m: string | undefined): AppSettings['geminiModel'] {
  if (!m) return DEFAULT_SETTINGS.geminiModel;
  if (m === 'gemini-1.5-flash' || m === 'gemini-1.5-pro') {
    return DEFAULT_SETTINGS.geminiModel;
  }
  return m as AppSettings['geminiModel'];
}

export async function getSettings(): Promise<AppSettings> {
  const row = await (await getDb()).get('settings', 'app');
  if (!row) return { ...DEFAULT_SETTINGS };
  const { key: _k, ...rest } = row as AppSettings & { key: string };
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...rest,
    geminiModel: migrateLegacyModel((rest as Partial<AppSettings>).geminiModel as string),
    analyzeModel: rest.analyzeModel ?? DEFAULT_SETTINGS.analyzeModel,
    translateModel: rest.translateModel ?? DEFAULT_SETTINGS.translateModel,
    batchModel: rest.batchModel ?? DEFAULT_SETTINGS.batchModel,
    wordMeaningModel: rest.wordMeaningModel ?? rest.translateModel ?? DEFAULT_SETTINGS.wordMeaningModel,
    transcribeModel: rest.transcribeModel ?? DEFAULT_SETTINGS.transcribeModel,
    bookAnalysisModel: rest.bookAnalysisModel ?? DEFAULT_SETTINGS.bookAnalysisModel,
    paragraphAnalysisModelRef:
      rest.paragraphAnalysisModelRef ?? rest.bookSingleAnalysisModelRef ?? DEFAULT_SETTINGS.paragraphAnalysisModelRef,
    paragraphBatchModelRef:
      rest.paragraphBatchModelRef ?? rest.bookBatchAnalysisModelRef ?? DEFAULT_SETTINGS.paragraphBatchModelRef,
    rewriteModelRef:
      rest.rewriteModelRef ?? rest.bookRewriteModelRef ?? rest.newsRewriteModelRef ?? DEFAULT_SETTINGS.rewriteModelRef,
    bookSingleAnalysisModel:
      rest.bookSingleAnalysisModel ?? rest.bookAnalysisModel ?? DEFAULT_SETTINGS.bookSingleAnalysisModel,
    bookBatchAnalysisModel:
      rest.bookBatchAnalysisModel ?? rest.bookAnalysisModel ?? DEFAULT_SETTINGS.bookBatchAnalysisModel,
    bookRewriteModel: rest.bookRewriteModel ?? DEFAULT_SETTINGS.bookRewriteModel,
  };
  return merged;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await (await getDb()).put('settings', { ...settings, key: 'app' });
}

// Word translation cache (key: lowercased trimmed word)
export async function getWordTranslation(word: string): Promise<string | null> {
  const key = word.trim().toLowerCase();
  if (!key) return null;
  const row = await (await getDb()).get('wordTranslations', key);
  return row?.translation ?? null;
}

export async function saveWordTranslation(word: string, translation: string): Promise<void> {
  const key = word.trim().toLowerCase();
  if (!key) return;
  await (await getDb()).put('wordTranslations', {
    word: key,
    translation,
    createdAt: Date.now(),
  });
}

// Analysis cache
export async function getAnalysis(
  videoId: string,
  cueId: string,
): Promise<SegmentAnalysis | null> {
  const row = await (await getDb()).get('analysisCache', [videoId, cueId]);
  return row?.analysis ?? null;
}

export async function saveAnalysis(
  videoId: string,
  cueId: string,
  analysis: SegmentAnalysis,
): Promise<void> {
  await (await getDb()).put('analysisCache', { videoId, cueId, analysis });
}

export async function getAllAnalysisForVideo(
  videoId: string,
): Promise<Array<{ cueId: string; analysis: SegmentAnalysis }>> {
  const rows = await (await getDb()).getAllFromIndex('analysisCache', 'videoId', videoId);
  return rows.map((r) => ({ cueId: r.cueId, analysis: r.analysis }));
}

// ───────────────────────────────────────── Word knowledge state ──
function normalizeWord(w: string): string {
  return w.trim().toLowerCase();
}

export async function getWordStatus(word: string): Promise<WordStatusValue> {
  const key = normalizeWord(word);
  if (!key) return 'new';
  const row = await (await getDb()).get('wordStatus', key);
  return row?.status ?? 'new';
}

export async function getAllWordStatus(): Promise<WordStatus[]> {
  return (await getDb()).getAll('wordStatus');
}

export async function setWordStatus(word: string, status: WordStatusValue): Promise<void> {
  const key = normalizeWord(word);
  if (!key) return;
  await (await getDb()).put('wordStatus', {
    word: key,
    status,
    updatedAt: Date.now(),
  });
}

// ───────────────────────────────────────── Listening / study sessions ──
function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function addListeningSeconds(seconds: number): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const db = await getDb();
  const date = todayKey();
  const existing = await db.get('listeningSessions', date);
  const next: ListeningSession = {
    date,
    seconds: (existing?.seconds ?? 0) + Math.round(seconds),
  };
  await db.put('listeningSessions', next);
}

export async function getAllListeningSessions(): Promise<ListeningSession[]> {
  return (await getDb()).getAll('listeningSessions');
}

// ───────────────────────────────────────── Leitner folders ──
export async function getAllLeitnerFolders(): Promise<LeitnerFolder[]> {
  return (await getDb()).getAll('leitnerFolders');
}
export async function saveLeitnerFolder(folder: LeitnerFolder): Promise<void> {
  await (await getDb()).put('leitnerFolders', folder);
}
export async function deleteLeitnerFolder(id: string): Promise<void> {
  await (await getDb()).delete('leitnerFolders', id);
}
