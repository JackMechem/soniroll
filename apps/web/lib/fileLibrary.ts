/** Audio kept in this browser (IndexedDB), so it's still there next visit. `meta` is whatever else
    a library keeps with each file (the Tuner's takes: length, where it came from, pitch track). */
export type LibraryEntry<M = undefined> = {
  id: string;
  name: string;
  size: number;
  added: number;
  type?: string;
  meta?: M;
};

type Stored<M> = LibraryEntry<M> & { type: string; blob: Blob };

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const STORE = "files";

/** A small blob library backed by its own IndexedDB database. Past `maxFiles`, the oldest go. */
export function createLibrary<M = undefined>(dbName: string, maxFiles = 20) {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await openDb();
    try {
      return await run(db.transaction(STORE, mode).objectStore(STORE));
    } finally {
      db.close();
    }
  }

  async function list(): Promise<LibraryEntry<M>[]> {
    try {
      const all = await withStore("readonly", (store) =>
        wrap(store.getAll() as IDBRequest<Stored<M>[]>),
      );
      return all
        .map(({ id, name, size, added, type, meta }) => ({ id, name, size, added, type, meta }))
        .sort((a, b) => b.added - a.added);
    } catch {
      return [];
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await withStore("readwrite", (store) => wrap(store.delete(id)));
    } catch {
      // ignore
    }
  }

  /** Resolves false when it couldn't be stored (storage full or unavailable). */
  async function save(id: string, name: string, blob: Blob, meta?: M): Promise<boolean> {
    try {
      // Ask the browser not to evict this data when space runs low.
      void navigator.storage?.persist?.();
      const record: Stored<M> = {
        id,
        name,
        size: blob.size,
        type: blob.type,
        added: Date.now(),
        blob,
        ...(meta === undefined ? {} : { meta }),
      };
      await withStore("readwrite", (store) => wrap(store.put(record)));
      const entries = await list();
      for (const old of entries.slice(maxFiles)) await remove(old.id);
      return true;
    } catch {
      // Storage full or unavailable; the audio still plays for this visit.
      return false;
    }
  }

  async function get(id: string): Promise<File | null> {
    try {
      const record = await withStore("readonly", (store) =>
        wrap(store.get(id) as IDBRequest<Stored<M> | undefined>),
      );
      return record ? new File([record.blob], record.name, { type: record.type }) : null;
    } catch {
      return null;
    }
  }

  async function patch(id: string, change: Partial<Pick<Stored<M>, "name" | "meta">>): Promise<void> {
    try {
      await withStore("readwrite", async (store) => {
        const record = await wrap(store.get(id) as IDBRequest<Stored<M> | undefined>);
        if (record) await wrap(store.put({ ...record, ...change }));
      });
    } catch {
      // ignore
    }
  }

  const rename = (id: string, name: string) => patch(id, { name });
  /** Replaces the file's `meta`. */
  const setMeta = (id: string, meta: M) => patch(id, { meta });

  return { list, save, get, remove, rename, setMeta };
}

const files = createLibrary("jam-practice-files");

export function fileId(file: File): string {
  return `${file.name}|${file.size}`;
}

export const listFiles = files.list;
export const getFile = files.get;
export const deleteFile = files.remove;
export async function saveFile(file: File): Promise<void> {
  await files.save(fileId(file), file.name, file);
}
