// "The Neon Bay Score": heist planning data and pure payout / stage logic.

export type HeistApproach = 'stealth' | 'loud';
export type CrewRole = 'hacker' | 'gunman' | 'driver';

export interface CrewMember { id: string; name: string; role: CrewRole; cut: number; skill: number; blurb: string }

export const CREW: CrewMember[] = [
  { id: 'byte', name: 'Byte Ramirez', role: 'hacker', cut: 0.08, skill: 0.5, blurb: 'Cheap. Slow on the vault keypad.' },
  { id: 'ghost', name: 'Ghost Okoye', role: 'hacker', cut: 0.15, skill: 0.95, blurb: 'Kills cameras before the guards blink.' },
  { id: 'brick', name: 'Brick Delgado', role: 'gunman', cut: 0.07, skill: 0.45, blurb: 'Loud. Not subtle. Holds a doorway.' },
  { id: 'vex', name: 'Vex Marlow', role: 'gunman', cut: 0.14, skill: 0.9, blurb: 'Ex-military. Keeps the guards off you.' },
  { id: 'lil', name: 'Lil Turbo', role: 'driver', cut: 0.06, skill: 0.5, blurb: 'Knows two shortcuts. Both are alleys.' },
  { id: 'wren', name: 'Wren Castillo', role: 'driver', cut: 0.12, skill: 0.92, blurb: 'Rally champion. The cops never get a plate.' },
];

export interface GetawayDef { id: string; name: string; kind: 'stinger' | 'sedan' | 'van' | 'bike'; cost: number; blurb: string }
export const GETAWAYS: GetawayDef[] = [
  { id: 'sedan', name: 'Coral Sedan (blends in)', kind: 'sedan', cost: 0, blurb: 'Boring is invisible.' },
  { id: 'stinger', name: 'Vortex Stinger (fast)', kind: 'stinger', cost: 600, blurb: 'Outruns everything. Noticed by everyone.' },
  { id: 'bike', name: 'Neon PCJ (agile)', kind: 'bike', cost: 300, blurb: 'Threads traffic. No protection.' },
];

export interface HeistPlan { approach: HeistApproach; hacker: string; gunman: string; driver: string; getaway: string }

export const HEIST_TAKE = 60000;

export function crewById(id: string): CrewMember | undefined { return CREW.find((c) => c.id === id); }
export function getawayById(id: string): GetawayDef | undefined { return GETAWAYS.find((g) => g.id === id); }

export function validPlan(p: HeistPlan): boolean {
  return crewById(p.hacker)?.role === 'hacker' && crewById(p.gunman)?.role === 'gunman' && crewById(p.driver)?.role === 'driver' && !!getawayById(p.getaway);
}

/** Vault time (s): good hackers open it faster, loud uses a drill. */
export function vaultTime(p: HeistPlan): number {
  const h = crewById(p.hacker)?.skill ?? 0.5;
  return p.approach === 'stealth' ? 14 - h * 7 : 22 - h * 6;
}

/** Wanted stars when you leave the vault. */
export function escapeStars(p: HeistPlan, detected: boolean): number {
  const driver = crewById(p.driver)?.skill ?? 0.5;
  const base = p.approach === 'loud' ? 4 : detected ? 3 : 1;
  return Math.max(1, Math.min(5, base - (driver > 0.9 ? 1 : 0)));
}

/** Number of guards (fewer with a skilled gunman covering you). */
export function guardCount(p: HeistPlan): number {
  const g = crewById(p.gunman)?.skill ?? 0.5;
  return p.approach === 'loud' ? Math.round(8 - g * 3) : Math.round(6 - g * 2);
}

/**
 * Player take after crew cuts. Stealth without detection keeps the full take;
 * loud loses dye-packed bags; reputation adds a fence bonus.
 */
export function heistPayout(p: HeistPlan, detected: boolean, reputation: number): { gross: number; cuts: number; net: number } {
  const gross = Math.round(HEIST_TAKE * (p.approach === 'stealth' ? (detected ? 0.85 : 1) : 0.8) * (1 + Math.min(0.25, reputation / 400)));
  const cut = (crewById(p.hacker)?.cut ?? 0) + (crewById(p.gunman)?.cut ?? 0) + (crewById(p.driver)?.cut ?? 0);
  const cuts = Math.round(gross * cut);
  return { gross, cuts, net: gross - cuts };
}

export type HeistStage = 'planning' | 'approach' | 'infiltrate' | 'vault' | 'escape' | 'done' | 'failed';
export const HEIST_STAGES: HeistStage[] = ['planning', 'approach', 'infiltrate', 'vault', 'escape', 'done'];

export function nextStage(s: HeistStage): HeistStage {
  const i = HEIST_STAGES.indexOf(s);
  return i < 0 || i >= HEIST_STAGES.length - 1 ? s : HEIST_STAGES[i + 1];
}
