import type { GameSystem } from '../../game/Systems';
import { PoliceSystem } from './system';

// Police & wanted level system (auto-discovered).
export default function create(): GameSystem {
  return new PoliceSystem();
}

export { PoliceSystem };
