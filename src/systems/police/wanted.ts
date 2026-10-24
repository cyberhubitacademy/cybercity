// Wanted level model (pure): crimes add heat, witnesses decide whether a crime
// is reported, stars escalate with heat and clear after the player stays out
// of sight and outside the police search area long enough.

export type CrimeKind =
  | 'carjack' | 'vehicleTheft' | 'assault' | 'shots' | 'murder' | 'copAssault' | 'copMurder'
  | 'robbery' | 'pedHit' | 'openCarry' | 'resistArrest' | 'intimidation' | 'trespass';

export const CRIME_HEAT: Record<CrimeKind, number> = {
  carjack: 30, vehicleTheft: 20, assault: 25, shots: 45, murder: 130, copAssault: 120, copMurder: 300,
  robbery: 160, pedHit: 30, openCarry: 8, resistArrest: 120, intimidation: 20, trespass: 15,
};

/** Minimum stars a reported crime always brings. */
export const CRIME_MIN_STARS: Record<CrimeKind, number> = {
  carjack: 1, vehicleTheft: 1, assault: 1, shots: 1, murder: 2, copAssault: 2, copMurder: 3,
  robbery: 2, pedHit: 1, openCarry: 0, resistArrest: 2, intimidation: 1, trespass: 0,
};

export const CRIME_LABEL: Record<CrimeKind, string> = {
  carjack: 'Carjacking', vehicleTheft: 'Grand theft auto', assault: 'Assault', shots: 'Shots fired', murder: 'Homicide',
  copAssault: 'Assaulting an officer', copMurder: 'Officer down', robbery: 'Armed robbery', pedHit: 'Hit and run',
  openCarry: 'Brandishing a weapon', resistArrest: 'Evading arrest', intimidation: 'Threatening a civilian', trespass: 'Trespassing',
};

/** Heat needed for each star (index = stars). */
export const STAR_HEAT = [0, 1, 110, 260, 520, 900];

export function starsForHeat(heat: number): number {
  let s = 0;
  for (let i = 1; i < STAR_HEAT.length; i++) if (heat >= STAR_HEAT[i]) s = i;
  return s;
}

/** Seconds out of sight (outside the search circle) to lose the cops at each star level. */
export function evadeTime(stars: number): number {
  return 6 + stars * 5;
}

/** Search circle radius (m) around the last known position. */
export function searchRadius(stars: number): number {
  return 45 + stars * 28;
}

export interface Point { x: number; z: number }

export interface SuspectDescription {
  shirt: string | null;
  vehicleId: number | null;
  vehicleColor: string | null;
  vehicleKind: string | null;
  weapon: string | null;
}

/**
 * Civilians and officers who saw a crime at (x, z): within radius and, when
 * a line-of-sight test is supplied, with a clear view.
 */
export function witnesses(observers: readonly Point[], crime: Point, radius: number, los?: (o: Point) => boolean): number {
  let n = 0;
  const r2 = radius * radius;
  for (const o of observers) {
    const dx = o.x - crime.x, dz = o.z - crime.z;
    if (dx * dx + dz * dz > r2) continue;
    if (los && !los(o)) continue;
    n++;
  }
  return n;
}

export interface WantedSave { stars: number; heat: number }

export class WantedLevel {
  heat = 0;
  stars = 0;
  /** True while police lost sight and are searching. */
  searching = false;
  readonly lastSeen: Point = { x: 0, z: 0 };
  /** Seconds the player has been hidden from police. */
  hidden = 0;
  /** Seconds accumulated toward losing the cops. */
  evade = 0;
  /** Chance-weight the police recognize the player (1 = matches the description). */
  recognition = 1;
  readonly suspect: SuspectDescription = { shirt: null, vehicleId: null, vehicleColor: null, vehicleKind: null, weapon: null };
  /** Fired when the star level changes (old, new). */
  onChange?: (from: number, to: number) => void;
  /** Max stars allowed (scripts may lock it). */
  cap = 5;

  /** A crime was committed. `witnessed` false means nobody saw: no heat. Returns stars gained. */
  report(kind: CrimeKind, at: Point, witnessed: boolean): number {
    if (!witnessed) return 0;
    const before = this.stars;
    this.heat += CRIME_HEAT[kind] * (this.stars > 0 ? 1.15 : 1);
    const target = Math.min(this.cap, Math.max(this.stars, CRIME_MIN_STARS[kind], starsForHeat(this.heat)));
    if (target > 0) {
      this.lastSeen.x = at.x;
      this.lastSeen.z = at.z;
      this.searching = false;
      this.hidden = 0;
      this.evade = 0;
    }
    this.setStars(target);
    return this.stars - before;
  }

  setStars(n: number): void {
    const s = Math.max(0, Math.min(5, Math.round(n)));
    if (s > 0 && this.heat < STAR_HEAT[s]) this.heat = STAR_HEAT[s];
    if (s === 0) { this.heat = 0; this.searching = false; this.evade = 0; this.hidden = 0; }
    if (s !== this.stars) {
      const from = this.stars;
      this.stars = s;
      this.onChange?.(from, s);
    }
  }

  clear(): void {
    this.setStars(0);
    this.suspect.shirt = this.suspect.vehicleColor = this.suspect.vehicleKind = this.suspect.weapon = null;
    this.suspect.vehicleId = null;
    this.recognition = 1;
  }

  /**
   * Advance the chase. `seen`: any officer/helicopter currently sees (and recognizes) the player.
   * Returns true on the frame the stars clear.
   */
  update(dt: number, seen: boolean, player: Point): boolean {
    if (this.stars === 0) return false;
    if (seen) {
      this.lastSeen.x = player.x;
      this.lastSeen.z = player.z;
      this.hidden = 0;
      this.evade = Math.max(0, this.evade - dt * 2);
      this.searching = false;
      return false;
    }
    this.hidden += dt;
    if (this.hidden > 1.5) this.searching = true;
    if (!this.searching) return false;
    const d = Math.hypot(player.x - this.lastSeen.x, player.z - this.lastSeen.z);
    const outside = d > searchRadius(this.stars);
    // Hiding inside the circle still works, just slower; a changed look helps.
    const rate = (outside ? 1 : 0.35) * (1.6 - Math.min(1, this.recognition) * 0.6);
    this.evade += dt * rate;
    if (this.evade >= evadeTime(this.stars)) {
      this.clear();
      return true;
    }
    return false;
  }

  /** 0..1 progress toward losing the cops (for the HUD). */
  get evadeProgress(): number {
    return this.stars ? Math.min(1, this.evade / evadeTime(this.stars)) : 0;
  }

  save(): WantedSave { return { stars: this.stars, heat: this.heat }; }
}
