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

const BACKUP_PREFIX = `${TIMELINE_KEY}.backup.`;
const BACKUPS_KEPT = 3;

/**
 * Keep one untouched copy of the saved timeline per day (the first load of the day), and the
 * last BACKUPS_KEPT days, so a bad edit or a bug can never destroy recorded snippets.
 */
async function backupTimeline(stored: Partial<TrackItem>[]): Promise<void> {
  const key = BACKUP_PREFIX + new Date().toISOString().slice(0, 10);
  const keys = (await run<IDBValidKey[]>('readonly', s => s.getAllKeys())).map(String);
  if (!keys.includes(key)) await run('readwrite', s => s.put(stored, key));
  const backups = [...new Set([...keys, key])].filter(k => k.startsWith(BACKUP_PREFIX)).sort();
  for (const old of backups.slice(0, -BACKUPS_KEPT)) await run('readwrite', s => s.delete(old));
}

/** Dates (YYYY-MM-DD) of the automatic daily backups, newest first. */
export async function listBackups(): Promise<string[]> {
  const keys = (await run<IDBValidKey[]>('readonly', s => s.getAllKeys())).map(String);
  return keys.filter(k => k.startsWith(BACKUP_PREFIX)).map(k => k.slice(BACKUP_PREFIX.length)).sort().reverse();
}

export async function loadBackup(date: string): Promise<Partial<TrackItem>[] | null> {
  return (await run<Partial<TrackItem>[] | undefined>('readonly', s => s.get(BACKUP_PREFIX + date))) ?? null;
}

/** Load the saved timeline, migrating a legacy localStorage copy if IndexedDB has none. */
export async function loadTimeline(): Promise<Partial<TrackItem>[] | null> {
  const stored = await run<Partial<TrackItem>[] | undefined>('readonly', s => s.get(TIMELINE_KEY));
  if (stored) {
    await backupTimeline(stored).catch(err => console.error('Timeline backup failed', err));
    return stored;
  }
  const legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  if (!legacy) return null;
  try {
    return JSON.parse(legacy);
  } catch {
    return null;
  }
}

// Also back up on the first save of a session: a tab that was open (and hot-reloaded) before
// backups existed never runs loadTimeline again, but must not overwrite its only copy unguarded.
let savedThisSession = false;

export async function saveTimeline(items: TrackItem[]): Promise<void> {
  if (!savedThisSession) {
    savedThisSession = true;
    const stored = await run<Partial<TrackItem>[] | undefined>('readonly', s => s.get(TIMELINE_KEY));
    if (stored) await backupTimeline(stored).catch(err => console.error('Timeline backup failed', err));
  }
  await run('readwrite', s => s.put(items, TIMELINE_KEY));
  // Once IndexedDB holds the timeline, drop the legacy copy to free the localStorage quota.
  localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
}

/** Download the timeline (including recorded snippets) as a JSON file. */
export function exportTimeline(items: TrackItem[]): void {
  const blob = new Blob([JSON.stringify({ version: 1, items })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `club100-timeline-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Parse a file written by exportTimeline (or a bare TrackItem array). */
export async function readTimelineFile(file: File): Promise<Partial<TrackItem>[]> {
  const data = JSON.parse(await file.text());
  const items = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(items)) throw new Error('This file does not contain a Club 100 timeline');
  return items;
}
