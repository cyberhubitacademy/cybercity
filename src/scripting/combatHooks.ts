import type { Vehicle } from '../vehicles/Vehicle';

// Bridge between the mission scripts (Season 3 natives) and the combat,
// police and crime gameplay systems. The MissionDirector first uses the
// callbacks the Game passes in (DirectorCallbacks.combat) and otherwise falls
// back to COMBAT_HOOKS, which the systems fill in themselves at init. This
// way the natives work even before the integrator wires anything.

export interface CombatHooks {
  giveWeapon?(weapon: string, ammo: number): void;
  /** Returns the combat system's enemy id. */
  spawnEnemy?(type: string, x: number, z: number, heading: number): number;
  /** Spawns `count` enemies around a named place; returns a group id. */
  spawnEnemyGroup?(type: string, place: string, count: number): number;
  /** Resolves when every member of the group is dead, down, tied, surrendered or gone. */
  enemiesCleared?(group: number): Promise<void>;
  /** Make an enemy (or group) hunt the player right away. */
  setEnemyTarget?(id: number, isGroup: boolean): void;
  isEnemyDead?(id: number, isGroup: boolean): boolean;
  enemyPosition?(id: number): { x: number; z: number } | null;
  setWanted?(level: number): void;
  clearWanted?(): void;
  wantedCleared?(): Promise<void>;
  spawnPickup?(item: string, x: number, z: number): void;
  /** Resolves true when the enemy is knocked out / tied / surrendered, false if killed or escaped. */
  arrestTarget?(id: number): Promise<boolean>;
  /** Resolves true when the store robbery succeeds. */
  startRobbery?(store: string): Promise<boolean>;
  /** Resolves true when the vehicle is disabled (tires/engine) and stopped, false when it escapes. */
  vehicleDisabled?(v: Vehicle, timeLimit: number): Promise<boolean>;
  /** Hostage negotiation scene; resolves true when the suspects surrender. */
  negotiate?(scene: string): Promise<boolean>;
  /** Mission ended: remove mission enemies and pickups. */
  clearMission?(): void;
}

export const COMBAT_HOOKS: CombatHooks = {};

/**
 * Engine services the director can lend to gameplay systems (slow motion and
 * camera shake are owned by the Game and reach the systems through here).
 */
export interface DirectorLink {
  slowMotion?(factor: number, ms: number): void;
  shake?(strength: number): void;
}

export const DIRECTOR_LINK: DirectorLink = {};
