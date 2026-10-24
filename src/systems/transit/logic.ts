// Pure transit logic: the Neon Line tram route (Ocean Drive x=165, then the
// z=5 avenue), a ping-pong tram controller with stops, ETAs and taxi fares.

export interface Pt { x: number; z: number }

/** Tram route polyline (road center lines). */
export const TRAM_ROUTE: Pt[] = [{ x: 165, z: -160 }, { x: 165, z: 5 }, { x: -160, z: 5 }];

export interface TramStop {
  id: string;
  name: string;
  /** Distance along the route. */
  s: number;
  /** Shelter / boarding point on the sidewalk. */
  x: number;
  z: number;
}

export const TRAM_STOPS: TramStop[] = [
  { id: 'north-beach', name: 'North Beach', s: 0, x: 156.5, z: -160 },
  { id: 'hq', name: 'Sunset Shield HQ', s: 118, x: 156.5, z: -42 },
  { id: 'midtown', name: 'Midtown', s: 220, x: 110, z: -3.5 },
  { id: 'bazaar', name: 'Byte Bazaar', s: 360, x: -30, z: -3.5 },
  { id: 'oldtown', name: 'Old Town', s: 450, x: -120, z: -3.5 },
  { id: 'west-end', name: 'West End', s: 490, x: -160, z: -3.5 },
];

export function routeLength(pts: Pt[] = TRAM_ROUTE): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return d;
}

/** Point and heading (yaw, 0 = +z) at distance s along the polyline. */
export function pointAt(s: number, pts: Pt[] = TRAM_ROUTE): { x: number; z: number; yaw: number } {
  let rest = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (rest <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, rest / len) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    rest -= len;
  }
  const p = pts[pts.length - 1];
  return { x: p.x, z: p.z, yaw: 0 };
}

export const TRAM_MAX_SPEED = 12;
export const TRAM_ACCEL = 1.6;
export const TRAM_DECEL = 2.0;
export const TRAM_DWELL = 7;

/** Tram that shuttles end to end, stopping at every stop. */
export class TramController {
  s: number;
  v = 0;
  dir: 1 | -1 = 1;
  /** Index of the stop the tram is at (when dwelling) or last left. */
  at = 0;
  /** Index of the next stop it is heading to. */
  next = 1;
  dwell = TRAM_DWELL;

  constructor(readonly stops: number[], start = 0) {
    this.at = Math.max(0, Math.min(stops.length - 1, start));
    this.s = stops[this.at];
    this.next = this.at + 1 < stops.length ? this.at + 1 : this.at - 1;
    this.dir = this.next > this.at ? 1 : -1;
  }

  get docked(): boolean {
    return this.dwell > 0;
  }

  /** Advance; returns the stop index when the tram arrives there this step. */
  step(dt: number): number | null {
    if (!(dt > 0)) return null;
    if (this.dwell > 0) {
      this.dwell -= dt;
      this.v = 0;
      if (this.dwell <= 0) {
        this.dwell = 0;
        let n = this.at + this.dir;
        if (n < 0 || n >= this.stops.length) { this.dir = this.dir === 1 ? -1 : 1; n = this.at + this.dir; }
        this.next = n;
      }
      return null;
    }
    const target = this.stops[this.next];
    const remaining = (target - this.s) * this.dir;
    const brakeDist = (this.v * this.v) / (2 * TRAM_DECEL);
    if (remaining <= brakeDist + 0.02) this.v = Math.max(0.8, this.v - TRAM_DECEL * dt);
    else this.v = Math.min(TRAM_MAX_SPEED, this.v + TRAM_ACCEL * dt);
    const move = Math.min(remaining, this.v * dt);
    this.s += move * this.dir;
    if (remaining - move <= 0.05) {
      this.s = target;
      this.v = 0;
      this.at = this.next;
      this.dwell = TRAM_DWELL;
      return this.at;
    }
    return null;
  }

  /** Rough seconds until the tram is docked at stop `i`. */
  eta(i: number): number {
    if (this.docked && this.at === i) return 0;
    const avg = TRAM_MAX_SPEED * 0.75;
    let t = Math.max(0, this.dwell);
    let pos = this.s, dir = this.dir, cur = this.docked ? this.at : this.next;
    if (!this.docked) t += Math.abs(this.stops[cur] - pos) / avg;
    pos = this.stops[cur];
    for (let guard = 0; guard < this.stops.length * 2 + 2 && cur !== i; guard++) {
      let n = cur + dir;
      if (n < 0 || n >= this.stops.length) { dir = dir === 1 ? -1 : 1; n = cur + dir; }
      t += (cur === (this.docked ? this.at : this.next) && this.docked ? 0 : TRAM_DWELL) + Math.abs(this.stops[n] - pos) / avg;
      pos = this.stops[n];
      cur = n;
    }
    return t;
  }
}

/** Taxi fare for a trip of `dist` meters. */
export function taxiFare(dist: number): number {
  return Math.round(15 + Math.max(0, dist) * 0.12);
}

export const TRAM_FARE = 5;
