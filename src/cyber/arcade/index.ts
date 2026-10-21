import type { ChallengeDefinition, ConceptCard } from '../types';
import { MECHANICS } from './types';
import { ARCADE_CATEGORIES, getCategory, getEntry } from './catalog';
import { getBank } from './banks';
import { categoryCard } from './cards';
import { mountArcadeRound } from './mechanics/ui';

// Public entry points for the Cyber Arcade.

export { ARCADE_CATEGORIES, ARCADE_ENTRIES, getEntry } from './catalog';
export type { ArcadeCategory, ArcadeEntry } from './catalog';
export { mountArcadeBoard } from './board';
export type { BoardOptions } from './board';

const cache = new Map<string, ChallengeDefinition>();

/** ChallengeDefinition for one arcade entry (id `arcade:<slug>`). */
export function arcadeChallenge(entryId: string): ChallengeDefinition {
  const hit = cache.get(entryId);
  if (hit) return hit;
  const e = getEntry(entryId);
  if (!e) throw new Error(`Unknown arcade entry "${entryId}"`);
  const primary = getCategory(e.categoryIds[0]);
  if (!primary) throw new Error(`Arcade entry "${entryId}" has no category`);
  const bank = getBank(e.bank);
  const mech = MECHANICS.find((m) => m.id === e.mechanic) ?? MECHANICS[0];
  // Cards: the entry's categories plus the routed bank's own category (max 3).
  const cardCats = [...new Set([...e.categoryIds, ARCADE_CATEGORIES.find((c) => c.bank === e.bank)?.id ?? primary.id])].slice(0, 3);
  const cards: ConceptCard[] = cardCats.map((c) => categoryCard(c));
  const def: ChallengeDefinition = {
    id: `arcade:${e.id}`,
    title: e.name,
    topic: bank.topic,
    difficulty: e.difficulty,
    objective: `${mech.verb} — ${bank.card.title.toLowerCase()}.`,
    intro: `${primary.icon} ${primary.title}. ${primary.blurb} ${bank.card.definition}`,
    passScore: 60,
    conceptCards: cards,
    mount: (ctx) => mountArcadeRound(ctx, {
      entryId: e.id, name: e.name, mechanic: e.mechanic, difficulty: e.difficulty, seed: e.seed,
      bank, passScore: 60, conceptIds: cards.map((c) => c.id),
    }),
  };
  cache.set(entryId, def);
  return def;
}

/** Accepts either a bare slug or an `arcade:` challenge id. */
export function isArcadeId(id: string): boolean {
  return id.startsWith('arcade:') && !!getEntry(id.slice(7));
}
