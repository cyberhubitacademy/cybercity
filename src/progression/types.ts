import type { Topic } from '../cyber/types';
import type { MissionSaveState } from '../missions/types';

export type Org = 'agency' | 'corporate' | 'university' | 'community';

export const ORGS: Org[] = ['agency', 'corporate', 'university', 'community'];

export const ORG_LABELS: Record<Org, string> = {
  agency: 'City Cyber Defense Agency',
  corporate: 'Corporate Security Alliance',
  university: 'University Research Network',
  community: 'Community Digital Safety Program',
};

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  voice: number;
  mouseSensitivity: number;
  invertY: boolean;
  quality: Quality;
  bloom: boolean;
  shadows: boolean;
  reducedMotion: boolean;
  showHints: boolean;
  voiceTTS: boolean;
  subtitles: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  ambient: 0.6,
  voice: 0.8,
  mouseSensitivity: 1,
  invertY: false,
  quality: 'high',
  bloom: true,
  shadows: true,
  reducedMotion: false,
  showHints: true,
  voiceTTS: false,
  subtitles: true,
};

export type JournalKind = 'mission' | 'challenge' | 'concept' | 'shard' | 'mistake';

export interface JournalEntry {
  time: number;
  kind: JournalKind;
  title: string;
  text: string;
}

export interface ChallengeRecord {
  id: string;
  score: number;
  passed: boolean;
  hintsUsed: number;
  at: number;
}

export interface MasteryStat {
  attempts: number;
  best: number;
  total: number;
}

export interface PlayerProfile {
  version: number;
  createdAt: number;
  level: number;
  xp: number;
  credits: number;
  health: number;
  rep: Record<Org, number>;
  skillPoints: number;
  skills: string[];
  inventory: string[];
  cosmetics: { shirt: string };
  challengeHistory: ChallengeRecord[];
  mastery: Record<Topic, MasteryStat>;
  journal: JournalEntry[];
  concepts: string[];
  shards: string[];
  discovered: string[];
  missions: MissionSaveState;
  position: { x: number; z: number; yaw: number };
  hour: number;
  stats: { distanceDriven: number; challengesPassed: number };
  /** Per-gameplay-system saved data (movement, life sim, garage, police...). JSON-safe. */
  ext: Record<string, unknown>;
}

export const SAVE_VERSION = 2;
