import type { ChallengeDefinition, ConceptCard } from './types';
import { phishingChallenge } from './challenges/phishing';
import { socialChallenge } from './challenges/social';
import { passwordChallenge } from './challenges/password';
import { trafficChallenge } from './challenges/traffic';
import { firewallChallenge } from './challenges/firewall';
import { incidentChallenge } from './challenges/incident';
import { cryptoChallenge } from './challenges/crypto';
import { forensicsChallenge } from './challenges/forensics';
import { malwareChallenge } from './challenges/malware';
import { detectionChallenge } from './challenges/detection';
import { socChallenge } from './challenges/soc';

export const CHALLENGES: ChallengeDefinition[] = [
  phishingChallenge,
  trafficChallenge,
  firewallChallenge,
  passwordChallenge,
  socialChallenge,
  malwareChallenge,
  forensicsChallenge,
  cryptoChallenge,
  incidentChallenge,
  detectionChallenge,
  socChallenge,
];

const byId = new Map(CHALLENGES.map((c) => [c.id, c]));

export function getChallenge(id: string): ChallengeDefinition | undefined {
  return byId.get(id);
}

/** Every concept card from every challenge, de-duplicated by id. */
export function allConcepts(): ConceptCard[] {
  const seen = new Map<string, ConceptCard>();
  for (const c of CHALLENGES) for (const card of c.conceptCards) if (!seen.has(card.id)) seen.set(card.id, card);
  return [...seen.values()];
}
