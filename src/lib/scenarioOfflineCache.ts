/**
 * IndexedDB-backed cache for AI-generated scenarios so users can replay
 * planner sessions fully offline (PWA / mobile usage).
 */

export interface ScenarioStep {
  stepIndex: number;
  prompt_fa: string;
  prompt_en: string;
  target_english: string;
  hint?: string | null;
  sourceSentenceId?: string | null;
}

export interface CachedScenario {
  id: string;
  title: string;
  scenario: string;
  topic?: string;
  role?: string;
  steps: ScenarioStep[];
  createdAt: number;
  sentenceIds: string[];
}

const DB_NAME = 'sentence-lab-scenarios';
const STORE = 'scenarios';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveScenario(s: CachedScenario): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(s);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listScenarios(): Promise<CachedScenario[]> {
  const db = await openDb();
  const items = await new Promise<CachedScenario[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as CachedScenario[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getScenario(id: string): Promise<CachedScenario | null> {
  const db = await openDb();
  const item = await new Promise<CachedScenario | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as CachedScenario) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item;
}

export async function deleteScenario(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
