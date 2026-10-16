const DB_NAME = "blackletter-db";
const DB_VERSION = 1;
const KV_STORE = "kv";
const STATE_KEY = "app-state";

let dbPromise: Promise<IDBDatabase> | null = null;

function supportsIndexedDB(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!supportsIndexedDB()) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!supportsIndexedDB()) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }
  const db = await getDB();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(KV_STORE, "readonly");
    const request = tx.objectStore(KV_STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function kvPut(key: string, value: unknown): Promise<void> {
  if (!supportsIndexedDB()) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      localStorage.removeItem(key);
    }
    return;
  }
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    tx.objectStore(KV_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Atomically replace several application keys during a validated restore. */
export async function kvPutMany(entries: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(entries);
  if (!supportsIndexedDB()) {
    const previous = new Map(keys.map((key) => [key, localStorage.getItem(key)]));
    const serialised = new Map(keys.map((key) => [key, JSON.stringify(entries[key])]));
    try {
      for (const key of keys) localStorage.setItem(key, serialised.get(key)!);
    } catch (error) {
      for (const key of keys) {
        const old = previous.get(key);
        try {
          if (old === null || old === undefined) localStorage.removeItem(key);
          else localStorage.setItem(key, old);
        } catch {
          // Preserve the original failure; rollback is best-effort on the
          // quota-limited localStorage fallback.
        }
      }
      throw error;
    }
    return;
  }

  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    const store = tx.objectStore(KV_STORE);
    for (const key of keys) store.put(entries[key], key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("The restore transaction was aborted."));
    tx.onerror = () => reject(tx.error ?? new Error("The restore transaction failed."));
  });
}

export async function kvDelete(key: string): Promise<void> {
  if (!supportsIndexedDB()) {
    try {
      localStorage.removeItem(key);
    } catch {
      return;
    }
    return;
  }
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    tx.objectStore(KV_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPersisted<T>(): Promise<T | undefined> {
  try {
    return await kvGet<T>(STATE_KEY);
  } catch {
    return undefined;
  }
}

export async function persistState(value: unknown): Promise<void> {
  await kvPut(STATE_KEY, value);
}

export function resetDB(): Promise<void> {
  if (!supportsIndexedDB()) {
    try {
      localStorage.removeItem(STATE_KEY);
    } catch {
      return Promise.resolve();
    }
    return Promise.resolve();
  }
  return getDB()
    .then((db) => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KV_STORE, "readwrite");
      tx.objectStore(KV_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }))
    .catch(() => Promise.resolve());
}
