import type { GameSystem } from '../../game/Systems';
import { CrimeSystem } from './system';

// Crime system (auto-discovered): robberies, chop shop, fence, stash, containers, heist.
export default function create(): GameSystem {
  return new CrimeSystem();
}

export { CrimeSystem };
