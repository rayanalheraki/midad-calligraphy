// Local persistence in IndexedDB. Nothing leaves the browser.
const DB_NAME = 'khattat';
const DB_VERSION = 1;
// Database used before the app was renamed; its contents are moved over once.
const LEGACY_DB_NAME = 'midad';
const STORES = ['autosave', 'works', 'fonts'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB غير متاح'));
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let created = false;
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        created = e.oldVersion === 0;
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => {
        if (!created) return resolve(req.result);
        migrateLegacy(req.result).finally(() => resolve(req.result));
      };
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

/** Copies every store of the legacy database into `db`, then deletes the legacy database. */
function migrateLegacy(db: IDBDatabase): Promise<void> {
  return new Promise<void>((resolve) => {
    const req = indexedDB.open(LEGACY_DB_NAME);
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const old = req.result;
      const names = STORES.filter((s) => old.objectStoreNames.contains(s));
      const finish = (ok: boolean) => {
        old.close();
        if (ok) indexedDB.deleteDatabase(LEGACY_DB_NAME);
        resolve();
      };
      if (!names.length) return finish(true);
      // Read everything first: a write transaction left idle while waiting on another database would auto-commit.
      const from = old.transaction(names, 'readonly');
      const data = names.map((s) => ({ s, keys: from.objectStore(s).getAllKeys(), values: from.objectStore(s).getAll() }));
      from.onerror = from.onabort = () => finish(false);
      from.oncomplete = () => {
        const to = db.transaction(names, 'readwrite');
        for (const { s, keys, values } of data) keys.result.forEach((k, i) => to.objectStore(s).put(values.result[i], k));
        to.oncomplete = () => finish(true);
        to.onerror = to.onabort = () => finish(false);
      };
    };
  });
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idbGet = <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key));
export const idbPut = (store: StoreName, key: string, value: unknown) => tx(store, 'readwrite', (s) => s.put(value, key));
export const idbDelete = (store: StoreName, key: string) => tx(store, 'readwrite', (s) => s.delete(key));
export const idbAll = <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll());

export interface SavedWork {
  id: string;
  title: string;
  modified: string;
  thumb: string;
  json: string;
}

export interface StoredFont {
  id: string;
  name: string;
  data: ArrayBuffer;
}

export async function loadUserFontData(id: string): Promise<ArrayBuffer | null> {
  const f = await idbGet<StoredFont>('fonts', id).catch(() => undefined);
  return f?.data ?? null;
}
