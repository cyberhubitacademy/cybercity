import type { ConceptCard } from '../types';
import { getBank } from './banks';
import { getCategory } from './catalog';
import { slugify } from './rng';

// Concept cards for the arcade: one per category, from that category's bank.

export function categoryCard(categoryId: string): ConceptCard {
  const cat = getCategory(categoryId);
  if (!cat) throw new Error(`Unknown arcade category "${categoryId}"`);
  const c = getBank(cat.bank).card;
  return {
    id: `arcade-${cat.id}-${slugify(c.title)}`,
    title: c.title,
    topic: cat.topic,
    definition: c.definition,
    whyItMatters: c.whyItMatters,
    example: c.example,
    bestPractice: c.bestPractice,
  };
}
