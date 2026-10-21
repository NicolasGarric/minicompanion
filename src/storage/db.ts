import type { ProjectMeta, ProjectRecord, Scheme, Paint } from '../types';

const DB_NAME = 'chromaforge';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
      }),
  );
}

export const db = {
  async saveProject(p: ProjectRecord) {
    const meta: ProjectMeta = { id: p.id, name: p.name, updatedAt: p.updatedAt, thumb: p.thumb };
    await tx('projects', 'readwrite', (s) => s.put(p));
    await tx('meta', 'readwrite', (s) => s.put(meta));
  },
  loadProject: (id: string) => tx<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id)),
  async listProjects(): Promise<ProjectMeta[]> {
    const all = await tx<ProjectMeta[]>('meta', 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async deleteProject(id: string) {
    await tx('projects', 'readwrite', (s) => s.delete(id));
    await tx('meta', 'readwrite', (s) => s.delete(id));
  },
  getKV: <T,>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key)),
  setKV: (key: string, value: unknown) => tx('kv', 'readwrite', (s) => s.put(value, key)),
};

export interface Library {
  schemes: Scheme[];
  customPaints: Paint[];
  favorites: string[];
  ownedOnly: boolean;
  owned: string[];
  /** Optional retailer search URL chosen by the user, with a `{q}` placeholder. */
  retailerTemplate: string;
}

export const emptyLibrary = (): Library => ({ schemes: [], customPaints: [], favorites: [], owned: [], ownedOnly: false, retailerTemplate: '' });
