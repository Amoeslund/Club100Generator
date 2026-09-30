import { TrackItem } from './types';

// The timeline is persisted in IndexedDB rather than localStorage: recorded/uploaded
// snippets are inlined as base64 data URLs and quickly exceed localStorage's ~5 MB quota.

const DB_NAME = 'club100';
const STORE = 'kv';
const TIMELINE_KEY = 'trackItems';
const LEGACY_LOCALSTORAGE_KEY = 'club100_trackItems';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? req.error);
        };
      }),
  );
}

/** Load the saved timeline, migrating a legacy localStorage copy if IndexedDB has none. */
export async function loadTimeline(): Promise<Partial<TrackItem>[] | null> {
  const stored = await run<Partial<TrackItem>[] | undefined>('readonly', s => s.get(TIMELINE_KEY));
  if (stored) return stored;
  const legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  if (!legacy) return null;
  try {
    return JSON.parse(legacy);
  } catch {
    return null;
  }
}

export async function saveTimeline(items: TrackItem[]): Promise<void> {
  await run('readwrite', s => s.put(items, TIMELINE_KEY));
  // Once IndexedDB holds the timeline, drop the legacy copy to free the localStorage quota.
  localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
}
