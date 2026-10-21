import type { DialogueLine } from '../story/characters';
import type { Org } from '../progression/types';

export type { DialogueLine };

export interface CollectItem {
  id: string;
  x: number;
  z: number;
  label: string;
}

export type ObjectiveDef =
  | { type: 'goto'; place: string; text: string; radius?: number }
  | { type: 'talk'; npc: string; text: string; lines: DialogueLine[] }
  | { type: 'challenge'; challenge: string; terminal: string; text: string }
  | { type: 'chase'; text: string; spawnPlace: string; duration: number; tagSeconds: number; radius: number }
  | { type: 'collect'; text: string; items: CollectItem[]; timeLimit?: number }
  | { type: 'drive'; text: string };

export interface MissionRewards {
  xp: number;
  credits: number;
  rep: Partial<Record<Org, number>>;
  item?: string;
  unlockNote?: string;
}

export interface MissionDef {
  id: string;
  title: string;
  chapter: number | 'side';
  /** NPC id who offers the mission, or null when it starts automatically. */
  giver: string | null;
  district: string;
  difficulty: 1 | 2 | 3;
  prerequisites: string[];
  briefing: DialogueLine[];
  objectives: ObjectiveDef[];
  rewards: MissionRewards;
  learning: string[];
  completion: DialogueLine[];
  summary: string;
  failHint?: string;
}

export type MissionStatus = 'locked' | 'available' | 'active' | 'completed';

export interface MissionSaveState {
  completed: string[];
  active: string | null;
  objectiveIndex: number;
  /** Items collected for the active collect objective. */
  collected: string[];
  /** Missions that have been offered at least once (auto-start bookkeeping). */
  started: string[];
}

export type MissionEvent =
  | { type: 'reach'; place: string }
  | { type: 'talk'; npc: string }
  | { type: 'challenge'; id: string; passed: boolean }
  | { type: 'drive' }
  | { type: 'chase'; success: boolean }
  | { type: 'collect'; item: string }
  | { type: 'timeout' };

export interface MissionUpdate {
  advanced: boolean;
  /** The new current objective after advancing (undefined when completed). */
  objective?: ObjectiveDef;
  /** Set exactly once, the first time a mission is completed (grant rewards on this). */
  completed?: MissionDef;
  /** Set whenever a mission run finishes, including practice replays (no rewards). */
  finished?: MissionDef;
  /** Reason text when the active mission failed (it returns to 'available'). */
  failed?: string;
}
