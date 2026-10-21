import type { PlayerProfile } from './types';
import { validateProfile } from './SaveManager';

// Save files on the player's own disk.
// - Chrome/Edge: the File System Access API lets the player pick a file once;
//   every autosave then writes it, and Continue syncs from whichever copy
//   (browser storage or file) is newer. The file handle is kept in IndexedDB.
// - Other browsers: export (download) and import (upload) of the same JSON.

export interface SaveEnvelope {
  game: 'cyber-city';
  savedAt: number;
  profile: PlayerProfile;
}

interface FsHandle {
  name: string;
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  getFile: () => Promise<File>;
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FsHandle[]>;
};

const DB = 'cybercity-files';
const STORE = 'handles';
const KEY = 'save-file';
const TYPES = [{ description: 'Cyber City save', accept: { 'application/json': ['.json'] } }];

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      };
    } catch {
      resolve(undefined);
    }
  });
}

export function envelope(profile: PlayerProfile, savedAt = Date.now()): SaveEnvelope {
  return { game: 'cyber-city', savedAt, profile };
}

/** Parse a save file's text. Returns null for anything that isn't a valid Cyber City save. */
export function parseSave(text: string): SaveEnvelope | null {
  try {
    const raw = JSON.parse(text) as Partial<SaveEnvelope>;
    if (raw?.game !== 'cyber-city' || typeof raw.savedAt !== 'number') return null;
    const profile = validateProfile(raw.profile);
    return profile ? { game: 'cyber-city', savedAt: raw.savedAt, profile } : null;
  } catch {
    return null;
  }
}

export class SaveFile {
  private handle: FsHandle | null = null;
  private writing = false;
  private pending: string | null = null;

  /** True in browsers that can keep writing to a chosen file (Chrome, Edge, Opera). */
  get supported(): boolean {
    return typeof (window as PickerWindow).showSaveFilePicker === 'function';
  }

  get linked(): boolean {
    return this.handle !== null;
  }

  get fileName(): string | null {
    return this.handle?.name ?? null;
  }

  /** Restore a previously linked file handle (permission may still need a click). */
  async restore(): Promise<void> {
    if (!this.supported) return;
    const h = await idb<FsHandle>('readonly', (s) => s.get(KEY) as IDBRequest<FsHandle>);
    if (h) this.handle = h;
  }

  /** Ask for write permission again; must be called from a click. */
  async ensurePermission(): Promise<boolean> {
    const h = this.handle;
    if (!h) return false;
    try {
      if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
      return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  /** Let the player choose where the save file lives, then write it. */
  async link(profile: PlayerProfile): Promise<boolean> {
    const w = window as PickerWindow;
    if (!w.showSaveFilePicker) return false;
    try {
      const h = await w.showSaveFilePicker({ suggestedName: 'cybercity-save.json', types: TYPES });
      this.handle = h;
      await idb('readwrite', (s) => s.put(h, KEY));
      await this.write(profile);
      return true;
    } catch {
      return false; // cancelled
    }
  }

  /** Pick an existing save file (also links it for future autosaves). */
  async openExisting(): Promise<SaveEnvelope | null> {
    const w = window as PickerWindow;
    if (!w.showOpenFilePicker) return null;
    try {
      const [h] = await w.showOpenFilePicker({ types: TYPES, multiple: false });
      const env = parseSave(await (await h.getFile()).text());
      if (env) {
        this.handle = h;
        await idb('readwrite', (s) => s.put(h, KEY));
      }
      return env;
    } catch {
      return null;
    }
  }

  async unlink(): Promise<void> {
    this.handle = null;
    await idb('readwrite', (s) => s.delete(KEY));
  }

  /** Read the linked file, if permission is already granted. */
  async read(): Promise<SaveEnvelope | null> {
    const h = this.handle;
    if (!h) return null;
    try {
      if ((await h.queryPermission?.({ mode: 'readwrite' })) !== 'granted') return null;
      return parseSave(await (await h.getFile()).text());
    } catch {
      return null;
    }
  }

  /** Write the save (coalesces overlapping writes). Silently skips without permission. */
  async write(profile: PlayerProfile, savedAt = Date.now()): Promise<boolean> {
    const h = this.handle;
    if (!h) return false;
    const text = JSON.stringify(envelope(profile, savedAt), null, 1);
    if (this.writing) {
      this.pending = text;
      return true;
    }
    this.writing = true;
    try {
      if ((await h.queryPermission?.({ mode: 'readwrite' })) !== 'granted') return false;
      let next: string | null = text;
      while (next) {
        this.pending = null;
        const f = await h.createWritable();
        await f.write(next);
        await f.close();
        next = this.pending;
      }
      return true;
    } catch {
      return false;
    } finally {
      this.writing = false;
    }
  }

  /** Download a copy of the save (works in every browser). */
  exportDownload(profile: PlayerProfile): void {
    const blob = new Blob([JSON.stringify(envelope(profile), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cybercity-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** Let the player choose a save file to load (works in every browser). */
  importUpload(): Promise<SaveEnvelope | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(file ? parseSave(await file.text()) : null);
      };
      input.click();
    });
  }
}
