// Photo gallery stored in IndexedDB ('cc-gallery'), with an in-memory
// fallback when IndexedDB is unavailable (private mode).

export interface Photo {
  id: string;
  time: number;
  dataUrl: string;
  filter: string;
  animals: string[];
  shared?: boolean;
}

const DB = 'cc-gallery';
const STORE = 'photos';
const memory: Photo[] = [];
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

export async function savePhoto(p: Photo): Promise<void> {
  const d = await db();
  if (!d) { memory.push(p); return; }
  await new Promise<void>((res) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(p);
    tx.oncomplete = () => res();
    tx.onerror = () => { memory.push(p); res(); };
  });
}

export async function listPhotos(): Promise<Photo[]> {
  const d = await db();
  if (!d) return [...memory].sort((a, b) => b.time - a.time);
  return new Promise((res) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res([...(req.result as Photo[]), ...memory].sort((a, b) => b.time - a.time));
    req.onerror = () => res([...memory]);
  });
}

export async function getPhoto(id: string): Promise<Photo | null> {
  const all = await listPhotos();
  return all.find((p) => p.id === id) ?? null;
}

export async function deletePhoto(id: string): Promise<void> {
  const i = memory.findIndex((p) => p.id === id);
  if (i >= 0) memory.splice(i, 1);
  const d = await db();
  if (!d) return;
  await new Promise<void>((res) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}
