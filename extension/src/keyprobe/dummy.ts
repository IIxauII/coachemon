/**
 * One dummy key in each no-permission store an extension page has (§5.2 of the note on `research/preferences-page`),
 * so a press session can see which survive closing the page, a restart and a build swapped into the same folder.
 * It stands in for a key binding and holds nothing real.
 */
export const DUMMY_KEY = "coachemon-keyprobe-binding";
const DB = "coachemon-keyprobe";
const STORE = "kv";

export type DummyRecord = { first: string; last: string; opens: number; build: string; origin: string; by: string };

/** `available: false` where the store does not exist here (Chrome's service worker has no `localStorage`). */
export type DummyRead = { available: boolean; value: DummyRecord | null; error?: string };

export function nextRecord(before: DummyRecord | null, build: string, by: string): DummyRecord {
  const now = new Date().toISOString();
  return { first: before?.first ?? now, last: now, opens: (before?.opens ?? 0) + 1, build, origin: location.origin, by };
}

export function localRead(): DummyRead {
  try {
    if (typeof localStorage === "undefined") return { available: false, value: null };
    const raw = localStorage.getItem(DUMMY_KEY);
    return { available: true, value: raw ? (JSON.parse(raw) as DummyRecord) : null };
  } catch (e) {
    return { available: false, value: null, error: String(e) };
  }
}

export function localWrite(rec: DummyRecord | null): string | null {
  try {
    if (rec) localStorage.setItem(DUMMY_KEY, JSON.stringify(rec));
    else localStorage.removeItem(DUMMY_KEY);
    return null;
  } catch (e) {
    return String(e);
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((res, rej) => {
    const req = act(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { res(req.result); db.close(); };
    req.onerror = () => { rej(req.error); db.close(); };
  }));
}

export async function idbRead(): Promise<DummyRead> {
  try {
    if (typeof indexedDB === "undefined") return { available: false, value: null };
    const value = await run<DummyRecord | undefined>("readonly", s => s.get(DUMMY_KEY));
    return { available: true, value: value ?? null };
  } catch (e) {
    return { available: false, value: null, error: String(e) };
  }
}

export async function idbWrite(rec: DummyRecord | null): Promise<string | null> {
  try {
    await run<unknown>("readwrite", s => (rec ? s.put(rec, DUMMY_KEY) : s.delete(DUMMY_KEY)) as IDBRequest<unknown>);
    return null;
  } catch (e) {
    return String(e);
  }
}
