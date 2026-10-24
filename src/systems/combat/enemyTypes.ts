import type { WeaponId } from './weapons';
import type { BrainTuning } from './ai';
import type { ActorOutfit } from './actor';

// Enemy archetypes used by SPAWN_ENEMY / SPAWN_ENEMY_GROUP, police and the
// fight club. Pure data.

export type Faction = 'lotus' | 'gang' | 'police' | 'fighter' | 'civilian' | 'guard';

export interface EnemyType {
  id: string;
  name: string;
  faction: Faction;
  health: number;
  armor: number;
  weapons: WeaponId[];
  /** 0..1 base accuracy. */
  accuracy: number;
  /** Damage multiplier on their shots (police and pros hit harder). */
  damage: number;
  tune: BrainTuning;
  outfit: ActorOutfit;
  female?: number;
  cash: [number, number];
  /** Drops its weapon when killed. */
  drops: boolean;
}

const T = (sightRange: number, attackRange: number, cowardice: number, noticeTime: number, runner = false): BrainTuning => ({ sightRange, attackRange, cowardice, noticeTime, runner });

export const ENEMY_TYPES: Record<string, EnemyType> = {
  lotus: { id: 'lotus', name: 'Black Lotus Enforcer', faction: 'lotus', health: 100, armor: 40, weapons: ['smg', 'rifle', 'pistol'], accuracy: 0.42, damage: 1, tune: T(40, 30, 0.2, 1.0), outfit: { shirt: '#15151c', pants: '#1b1b22', skin: '#c98b5e', hair: '#111111', accent: '#b14dff' }, female: 0.25, cash: [40, 140], drops: true },
  lotus_heavy: { id: 'lotus_heavy', name: 'Black Lotus Heavy', faction: 'lotus', health: 140, armor: 100, weapons: ['shotgun', 'rifle'], accuracy: 0.38, damage: 1.2, tune: T(36, 22, 0.05, 0.9), outfit: { shirt: '#22142e', pants: '#15151c', skin: '#8a5a3c', hair: '#111111', accent: '#ff2fa0' }, cash: [80, 200], drops: true },
  lotus_sniper: { id: 'lotus_sniper', name: 'Black Lotus Marksman', faction: 'lotus', health: 90, armor: 20, weapons: ['sniper'], accuracy: 0.55, damage: 1, tune: T(90, 85, 0.3, 1.4), outfit: { shirt: '#1f1f2a', pants: '#1b1b22', skin: '#f1c7a3', hair: '#4a2c1a', accent: '#b14dff' }, cash: [60, 160], drops: true },
  gang: { id: 'gang', name: 'Vice Kings Gangster', faction: 'gang', health: 90, armor: 0, weapons: ['pistol', 'smg', 'bat'], accuracy: 0.3, damage: 0.9, tune: T(32, 24, 0.45, 1.2), outfit: { shirt: '#ffd23f', pants: '#2b3a55', skin: '#8a5a3c', hair: '#1b120d', accent: '#ff8a3d' }, female: 0.2, cash: [20, 90], drops: true },
  thug: { id: 'thug', name: 'Street Thug', faction: 'gang', health: 80, armor: 0, weapons: ['bat', 'knife', 'fists'], accuracy: 0.5, damage: 1, tune: T(26, 1.8, 0.5, 1.0), outfit: { shirt: '#ff4d6d', pants: '#1b1b22', skin: '#d9a27a', hair: '#2b2b2b' }, cash: [10, 60], drops: true },
  courier: { id: 'courier', name: 'Armed Courier', faction: 'lotus', health: 110, armor: 30, weapons: ['pistol'], accuracy: 0.35, damage: 1, tune: T(34, 22, 0.3, 0.8), outfit: { shirt: '#2b3a55', pants: '#1b1b22', skin: '#b07a52', hair: '#1b120d', accent: '#ffd23f' }, cash: [100, 250], drops: true },
  intruder: { id: 'intruder', name: 'Intruder', faction: 'lotus', health: 70, armor: 0, weapons: ['fists'], accuracy: 0, damage: 0.5, tune: T(30, 1.5, 1, 0.6, true), outfit: { shirt: '#3d3d4d', pants: '#2b2b33', skin: '#f1c7a3', hair: '#8a3a1e', accent: '#e8e8f0' }, cash: [0, 40], drops: false },
  guard: { id: 'guard', name: 'Security Guard', faction: 'guard', health: 100, armor: 20, weapons: ['pistol'], accuracy: 0.32, damage: 0.9, tune: T(30, 24, 0.4, 1.3), outfit: { shirt: '#2a3f66', pants: '#1b1b22', skin: '#c98b5e', hair: '#2b2b2b', accent: '#ffd23f' }, cash: [10, 50], drops: true },
  hostage_taker: { id: 'hostage_taker', name: 'Hostage Taker', faction: 'lotus', health: 100, armor: 30, weapons: ['pistol', 'smg'], accuracy: 0.4, damage: 1, tune: T(30, 22, 0.15, 0.7), outfit: { shirt: '#3a1f2e', pants: '#15151c', skin: '#d9a27a', hair: '#111111', accent: '#ff2fa0' }, cash: [50, 120], drops: true },
  officer: { id: 'officer', name: 'Neon Bay PD Officer', faction: 'police', health: 110, armor: 30, weapons: ['pistol'], accuracy: 0.4, damage: 1, tune: T(38, 26, 0.05, 0.6), outfit: { shirt: '#24365e', pants: '#1b2238', skin: '#b07a52', hair: '#1b120d', accent: '#24365e' }, female: 0.35, cash: [0, 30], drops: true },
  swat: { id: 'swat', name: 'NBPD SWAT', faction: 'police', health: 130, armor: 100, weapons: ['rifle', 'smg'], accuracy: 0.5, damage: 1.1, tune: T(44, 32, 0, 0.5), outfit: { shirt: '#1a1d24', pants: '#1a1d24', skin: '#8a5a3c', hair: '#111111', accent: '#1a1d24' }, cash: [0, 30], drops: true },
  fighter: { id: 'fighter', name: 'Cage Fighter', faction: 'fighter', health: 100, armor: 0, weapons: ['fists'], accuracy: 0.6, damage: 1, tune: T(40, 1.7, 0, 0.2), outfit: { shirt: '#c94f3d', pants: '#1b1b22', skin: '#8a5a3c', hair: '#111111' }, cash: [0, 0], drops: false },
};

export function enemyType(id: string): EnemyType {
  return ENEMY_TYPES[id] ?? ENEMY_TYPES.lotus;
}

/** Max simultaneous combatants (enemies + officers) per quality level. */
export function enemyCap(quality: string): number {
  return quality === 'low' ? 7 : quality === 'medium' ? 11 : quality === 'high' ? 15 : 20;
}
