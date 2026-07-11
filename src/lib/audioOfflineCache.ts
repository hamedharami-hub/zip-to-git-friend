/**
 * IndexedDB-backed offline cache for sentence audio (Blob storage).
 *
 * Used by PodcastMode so users can pre-download a session and listen
 * offline (PWA / mobile / no network). Keys are `${sentenceId}::${lang}`.
 */

const DB_NAME = "sentence-lab-audio";
const STORE = "audio_blobs";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const cacheKey = (id: string, lang: string) => `${id}::${lang}`;

/** Object URLs we created in this page session — keep alive, revoke on unload. */
const liveUrls = new Map<string, string>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    liveUrls.forEach((u) => URL.revokeObjectURL(u));
    liveUrls.clear();
  });
}

export async function getOfflineAudioUrl(sentenceId: string, lang: string): Promise<string | null> {
  const k = cacheKey(sentenceId, lang);
  if (liveUrls.has(k)) return liveUrls.get(k)!;
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(k);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    liveUrls.set(k, url);
    return url;
  } catch (e) {
    console.warn("[audioOfflineCache] read error", e);
    return null;
  }
}

export async function saveOfflineAudio(
  sentenceId: string,
  lang: string,
  blob: Blob,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, cacheKey(sentenceId, lang));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[audioOfflineCache] write error", e);
  }
}

/** Download a remote audio URL and store it offline. Returns a blob URL. */
export async function downloadAndCache(
  sentenceId: string,
  lang: string,
  remoteUrl: string,
): Promise<string> {
  const res = await fetch(remoteUrl);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const blob = await res.blob();
  await saveOfflineAudio(sentenceId, lang, blob);
  const url = URL.createObjectURL(blob);
  liveUrls.set(cacheKey(sentenceId, lang), url);
  return url;
}

export async function clearOfflineCache(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  liveUrls.forEach((u) => URL.revokeObjectURL(u));
  liveUrls.clear();
}

export async function getCacheSize(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      let count = 0;
      let bytes = 0;
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          count++;
          const v = cursor.value as Blob;
          bytes += v.size ?? 0;
          cursor.continue();
        } else {
          resolve({ count, bytes });
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return { count: 0, bytes: 0 };
  }
}
