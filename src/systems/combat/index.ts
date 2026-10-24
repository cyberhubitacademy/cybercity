import type { GameSystem } from '../../game/Systems';
import { CombatSystem } from './system';

// Combat system (auto-discovered): weapons, aiming, shooting, melee, cover,
// enemies, pickups, Ammu-Bay, the shooting range and the fight club.
export default function create(): GameSystem {
  return new CombatSystem();
}

export { CombatSystem };
