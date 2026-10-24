import { TOPIC_LABELS, type Topic } from '../cyber/types';
import { PLACES } from '../world/layout';
import { emptyMissionState } from '../missions/MissionManager';
import type { MissionSaveState } from '../missions/types';
import { emptyMastery } from './progression';
import {
  DEFAULT_SETTINGS, ORGS, SAVE_VERSION,
  type ChallengeRecord, type JournalEntry, type JournalKind, type Org, type PlayerProfile, type Quality, type Settings,
} from './types';

// Local-only persistence (localStorage in the browser, any StorageLike in tests).
// Everything loaded is validated and clamped; corrupt data never crashes the game.
// Only game state is stored — never real passwords or personal data.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'cybercity.save';
export const SETTINGS_KEY = 'cybercity.settings';

export function newProfile(now = Date.now()): PlayerProfile {
  const spawn = PLACES.spawn;
  const rep = {} as Record<Org, number>;
  for (const o of ORGS) rep[o] = 0;
  return {
    version: SAVE_VERSION,
    createdAt: now,
    level: 1,
    xp: 0,
    credits: 150,
    health: 100,
    rep,
    skillPoints: 0,
    skills: [],
    inventory: ['gps-tracker'],
    cosmetics: { shirt: 'default' },
    challengeHistory: [],
    mastery: emptyMastery(),
    journal: [],
    concepts: [],
    shards: [],
    discovered: [],
    missions: emptyMissionState(),
    position: { x: spawn.x, z: spawn.z, yaw: -Math.PI / 2 },
    hour: 16.5,
    stats: { distanceDriven: 0, challengesPassed: 0 },
    ext: {},
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, def: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
const strArr = (v: unknown, cap = 1000): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length < 200))].slice(0, cap) : [];
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);

/** Bring older save shapes up to the current version. Returns null if unusable. */
export function migrate(raw: Obj): Obj | null {
  const version = num(raw.version, 0);
  if (version < 1 || version > SAVE_VERSION) return null;
  const out: Obj = { ...raw };
  if (version < 2) {
    // v1 had no cosmetics, stats or discovered districts, and stored money as `money`.
    if (out.credits === undefined && typeof out.money === 'number') out.credits = out.money;
    delete out.money;
    out.cosmetics = { shirt: 'default' };
    out.stats = { distanceDriven: 0, challengesPassed: 0 };
    out.discovered = [];
  }
  out.version = SAVE_VERSION;
  return out;
}

const JOURNAL_KINDS: JournalKind[] = ['mission', 'challenge', 'concept', 'shard', 'mistake'];

/** Validate + clamp an unknown value into a PlayerProfile, or null if it is not a save. */
export function validateProfile(input: unknown): PlayerProfile | null {
  if (!isObj(input)) return null;
  const raw = migrate(input);
  if (!raw) return null;
  // Core fields must exist and be numbers; everything else falls back to defaults.
  if (typeof raw.level !== 'number' || typeof raw.credits !== 'number' || typeof raw.xp !== 'number') return null;
  const base = newProfile(num(raw.createdAt, Date.now()));

  const rep = { ...base.rep };
  if (isObj(raw.rep)) for (const o of ORGS) rep[o] = num(raw.rep[o], 0, 0, 100);

  const mastery = emptyMastery();
  if (isObj(raw.mastery)) {
    for (const t of Object.keys(TOPIC_LABELS) as Topic[]) {
      const m = raw.mastery[t];
      if (isObj(m)) {
        const attempts = Math.floor(num(m.attempts, 0, 0, 1e6));
        mastery[t] = { attempts, best: num(m.best, 0, 0, 100), total: num(m.total, 0, 0, attempts * 100) };
      }
    }
  }

  const history: ChallengeRecord[] = Array.isArray(raw.challengeHistory)
    ? raw.challengeHistory.filter(isObj).filter((h) => typeof h.id === 'string').slice(-500).map((h) => ({
        id: String(h.id),
        score: num(h.score, 0, 0, 100),
        passed: bool(h.passed, false),
        hintsUsed: Math.floor(num(h.hintsUsed, 0, 0, 99)),
        at: num(h.at, 0),
      }))
    : [];

  const journal: JournalEntry[] = Array.isArray(raw.journal)
    ? raw.journal.filter(isObj).filter((j) => typeof j.title === 'string' && typeof j.text === 'string').slice(-300).map((j) => ({
        time: num(j.time, 0),
        kind: JOURNAL_KINDS.includes(j.kind as JournalKind) ? (j.kind as JournalKind) : 'mission',
        title: String(j.title).slice(0, 200),
        text: String(j.text).slice(0, 1000),
      }))
    : [];

  const missions: MissionSaveState = isObj(raw.missions)
    ? {
        completed: strArr(raw.missions.completed),
        active: typeof raw.missions.active === 'string' ? raw.missions.active : null,
        objectiveIndex: Math.floor(num(raw.missions.objectiveIndex, 0, 0, 100)),
        collected: strArr(raw.missions.collected),
        started: strArr(raw.missions.started),
      }
    : emptyMissionState();

  const pos = isObj(raw.position) ? raw.position : {};
  const cos = isObj(raw.cosmetics) ? raw.cosmetics : {};
  const stats = isObj(raw.stats) ? raw.stats : {};

  return {
    version: SAVE_VERSION,
    createdAt: base.createdAt,
    level: Math.floor(num(raw.level, 1, 1, 30)),
    xp: Math.floor(num(raw.xp, 0, 0, 1e7)),
    credits: Math.floor(num(raw.credits, 0, 0, 1e9)),
    health: num(raw.health, 100, 1, 150),
    rep,
    skillPoints: Math.floor(num(raw.skillPoints, 0, 0, 100)),
    skills: strArr(raw.skills, 50),
    inventory: strArr(raw.inventory, 100),
    cosmetics: { shirt: typeof cos.shirt === 'string' ? cos.shirt : 'default' },
    challengeHistory: history,
    mastery,
    journal,
    concepts: strArr(raw.concepts),
    shards: strArr(raw.shards, 100),
    discovered: strArr(raw.discovered, 50),
    missions,
    position: { x: num(pos.x, base.position.x, -400, 400), z: num(pos.z, base.position.z, -400, 400), yaw: num(pos.yaw, base.position.yaw) },
    hour: num(raw.hour, base.hour, 0, 24) % 24,
    stats: { distanceDriven: num(stats.distanceDriven, 0, 0), challengesPassed: Math.floor(num(stats.challengesPassed, 0, 0)) },
    ext: isObj(input.ext) ? (JSON.parse(JSON.stringify(input.ext)) as Record<string, unknown>) : {},
  };
}

const QUALITIES: Quality[] = ['low', 'medium', 'high', 'ultra'];

export function validateSettings(input: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!isObj(input)) return s;
  for (const k of ['master', 'music', 'sfx', 'ambient', 'voice'] as const) s[k] = num(input[k], s[k], 0, 1);
  s.mouseSensitivity = num(input.mouseSensitivity, s.mouseSensitivity, 0.1, 3);
  for (const k of ['invertY', 'bloom', 'shadows', 'reducedMotion', 'showHints', 'voiceTTS', 'subtitles'] as const) s[k] = bool(input[k], s[k]);
  if (QUALITIES.includes(input.quality as Quality)) s.quality = input.quality as Quality;
  return s;
}

export class SaveManager {
  constructor(private storage: StorageLike | null = SaveManager.defaultStorage()) {}

  static defaultStorage(): StorageLike | null {
    try {
      const g = globalThis as { localStorage?: StorageLike };
      return g.localStorage ?? null;
    } catch {
      return null;
    }
  }

  get available(): boolean {
    return this.storage !== null;
  }

  newProfile(): PlayerProfile {
    return newProfile();
  }

  hasSave(): boolean {
    return this.load() !== null;
  }

  save(profile: PlayerProfile): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify({ ...profile, version: SAVE_VERSION }));
      return true;
    } catch {
      return false;
    }
  }

  load(): PlayerProfile | null {
    if (!this.storage) return null;
    try {
      const text = this.storage.getItem(SAVE_KEY);
      if (!text) return null;
      return validateProfile(JSON.parse(text));
    } catch {
      return null;
    }
  }

  reset(): void {
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  saveSettings(settings: Settings): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }

  loadSettings(): Settings {
    if (!this.storage) return { ...DEFAULT_SETTINGS };
    try {
      const text = this.storage.getItem(SETTINGS_KEY);
      return validateSettings(text ? JSON.parse(text) : null);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}
