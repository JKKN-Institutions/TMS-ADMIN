/**
 * A tiny key-value store for the boarding portal's offline data.
 *
 * Hand-rolled over IndexedDB instead of a package: a new dependency rewrites
 * bun.lock, and a stale bun.lock has broken production builds before.
 * `memoryKv` is the test double and the fallback when IndexedDB is missing
 * (some private-browsing modes): marks still queue, they just do not survive
 * a reload.
 */
export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  /** Every entry whose key starts with `prefix`, in key order. */
  list<T>(prefix: string): Promise<Array<{ key: string; value: T }>>;
}

export function memoryKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return m.has(key) ? (structuredClone(m.get(key)) as T) : undefined;
    },
    async set<T>(key: string, value: T) {
      m.set(key, structuredClone(value));
    },
    async del(key: string) {
      m.delete(key);
    },
    async list<T>(prefix: string) {
      return [...m.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((key) => ({ key, value: structuredClone(m.get(key)) as T }));
    },
  };
}

export function idbKv(dbName = 'tms-boarding'): Kv {
  const STORE = 'kv';
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  function run<R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    return db().then(
      (d) =>
        new Promise<R>((resolve, reject) => {
          const t = d.transaction(STORE, mode);
          const req = fn(t.objectStore(STORE));
          t.oncomplete = () => resolve(req.result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        }),
    );
  }

  return {
    get: <T,>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
    set: async <T,>(key: string, value: T) => {
      await run('readwrite', (s) => s.put(value, key));
    },
    del: async (key: string) => {
      await run('readwrite', (s) => s.delete(key));
    },
    list: <T,>(prefix: string) =>
      db().then(
        (d) =>
          new Promise<Array<{ key: string; value: T }>>((resolve, reject) => {
            const out: Array<{ key: string; value: T }> = [];
            const t = d.transaction(STORE, 'readonly');
            const req = t.objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, prefix + String.fromCharCode(0xffff)));
            req.onsuccess = () => {
              const c = req.result;
              if (c) {
                out.push({ key: String(c.key), value: c.value as T });
                c.continue();
              }
            };
            t.oncomplete = () => resolve(out);
            t.onerror = () => reject(t.error);
          }),
      ),
  };
}

/** Use `primary` until it fails once, then `fallback` for the rest of the session. */
export function resilientKv(primary: Kv, fallback: Kv): Kv {
  let broken = false;
  async function use<R>(f: (k: Kv) => Promise<R>): Promise<R> {
    if (!broken) {
      try {
        return await f(primary);
      } catch (e) {
        console.warn('boarding offline store unavailable; keeping data in memory only', e);
        broken = true;
      }
    }
    return f(fallback);
  }
  return {
    get: <T,>(key: string) => use((k) => k.get<T>(key)),
    set: <T,>(key: string, value: T) => use((k) => k.set<T>(key, value)),
    del: (key: string) => use((k) => k.del(key)),
    list: <T,>(prefix: string) => use((k) => k.list<T>(prefix)),
  };
}

let shared: Kv | null = null;

/** The one store the boarding portal uses in the browser. */
export function offlineKv(): Kv {
  if (!shared) {
    shared = typeof indexedDB === 'undefined' ? memoryKv() : resilientKv(idbKv(), memoryKv());
  }
  return shared;
}
