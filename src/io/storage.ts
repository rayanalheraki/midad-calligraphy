// Local persistence in IndexedDB. Nothing leaves the browser.
const DB_NAME = 'midad';
const DB_VERSION = 1;
const STORES = ['autosave', 'works', 'fonts'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB غير متاح'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
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
