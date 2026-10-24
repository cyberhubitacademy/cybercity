// Pure top-down 2D ball physics for pool (8-ball, simplified) and mini-golf.

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pocketed: boolean;
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

// ---------------------------------------------------------------- pool

export const TABLE = { w: 2.54, h: 1.27, ballR: 0.028, pocketR: 0.06 };
export const POCKETS: [number, number][] = [
  [0, 0], [TABLE.w / 2, -0.01], [TABLE.w, 0], [0, TABLE.h], [TABLE.w / 2, TABLE.h + 0.01], [TABLE.w, TABLE.h],
];

/** Rack: cue ball (0) + 15 balls in a triangle. 1-7 solids, 8 black, 9-15 stripes. */
export function rack(): Ball[] {
  const r = TABLE.ballR;
  const balls: Ball[] = [{ id: 0, x: TABLE.w * 0.25, y: TABLE.h / 2, vx: 0, vy: 0, r, pocketed: false }];
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      balls.push({ id: order[k++], x: TABLE.w * 0.7 + row * r * 1.75, y: TABLE.h / 2 + (i - row / 2) * r * 2.02, vx: 0, vy: 0, r, pocketed: false });
    }
  }
  return balls;
}

export const isSolid = (id: number): boolean => id >= 1 && id <= 7;
export const isStripe = (id: number): boolean => id >= 9 && id <= 15;

/** Advance the table; returns ids pocketed during this step. Friction ~ rolling resistance. */
export function stepPool(balls: Ball[], dt: number, friction = 0.55): number[] {
  const potted: number[] = [];
  const sub = 4;
  const h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const b of balls) {
      if (b.pocketed) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const ns = Math.max(0, sp - friction * h);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      // pockets
      for (const [px, py] of POCKETS) {
        if (Math.hypot(b.x - px, b.y - py) < TABLE.pocketR) { b.pocketed = true; b.vx = b.vy = 0; potted.push(b.id); break; }
      }
      if (b.pocketed) continue;
      // cushions
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; }
      if (b.x > TABLE.w - b.r) { b.x = TABLE.w - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.8; }
      if (b.y > TABLE.h - b.r) { b.y = TABLE.h - b.r; b.vy = -Math.abs(b.vy) * 0.8; }
    }
    collideAll(balls);
  }
  return potted;
}

export function collideAll(balls: Ball[]): number {
  let hits = 0;
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      // separate
      const push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      // equal-mass elastic collision along the normal
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        const e = 0.96;
        const imp = rel * (1 + e) / 2;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
        hits++;
      }
    }
  }
  return hits;
}

export function moving(balls: Ball[], eps = 0.01): boolean {
  return balls.some((b) => !b.pocketed && Math.hypot(b.vx, b.vy) > eps);
}

export function shoot(cue: Ball, angle: number, power: number): void {
  const v = 0.4 + power * 4.2;
  cue.vx = Math.cos(angle) * v;
  cue.vy = Math.sin(angle) * v;
}

export type Group = 'solids' | 'stripes' | null;

export interface PoolTurnResult {
  /** Whose turn next: same player continues if they potted their own ball without foul. */
  continueTurn: boolean;
  foul: boolean;
  /** Game over: 'win' | 'loss' for the shooter, or null. */
  over: 'win' | 'loss' | null;
  /** Group assigned this shot (first legal pot on an open table). */
  assigned: Group;
}

/** Simplified 8-ball rules for one shot. */
export function judgeShot(shooterGroup: Group, potted: number[], firstHit: number | null, remainingOwn: number): PoolTurnResult {
  const scratch = potted.includes(0);
  const eight = potted.includes(8);
  let assigned: Group = null;
  let group = shooterGroup;
  const own = potted.filter((id) => id !== 0 && id !== 8);
  if (!group && own.length) {
    group = isSolid(own[0]) ? 'solids' : 'stripes';
    assigned = group;
  }
  const mine = (id: number) => (group === 'solids' ? isSolid(id) : group === 'stripes' ? isStripe(id) : id !== 8 && id !== 0);
  const wrongFirst = firstHit === null || (group !== null && firstHit !== 8 && !mine(firstHit)) || (firstHit === 8 && remainingOwn > 0);
  const foul = scratch || wrongFirst;
  if (eight) {
    const legal = !scratch && shooterGroup !== null && remainingOwn === 0;
    return { continueTurn: false, foul, over: legal ? 'win' : 'loss', assigned };
  }
  const pottedOwn = potted.some((id) => id !== 0 && mine(id));
  return { continueTurn: !foul && pottedOwn, foul, over: null, assigned };
}

/** AI aim: best (target, pocket) by straightness; returns angle + power with some noise. */
export function aiAim(balls: Ball[], group: Group, rnd: () => number, skill = 0.6): { angle: number; power: number } {
  const cue = balls.find((b) => b.id === 0)!;
  const remainingOwn = balls.filter((b) => !b.pocketed && (group === 'solids' ? isSolid(b.id) : group === 'stripes' ? isStripe(b.id) : b.id !== 0 && b.id !== 8)).length;
  const targets = balls.filter((b) => !b.pocketed && b.id !== 0 && (remainingOwn === 0 ? b.id === 8 : b.id !== 8 && (group === 'solids' ? isSolid(b.id) : group === 'stripes' ? isStripe(b.id) : true)));
  let best: { angle: number; score: number; dist: number } | null = null;
  for (const t of targets) {
    for (const [px, py] of POCKETS) {
      const tx = px - t.x, ty = py - t.y;
      const tl = Math.hypot(tx, ty);
      const gx = t.x - (tx / tl) * t.r * 2, gy = t.y - (ty / tl) * t.r * 2; // ghost ball
      const cx = gx - cue.x, cy = gy - cue.y;
      const cl = Math.hypot(cx, cy);
      const cut = (cx * tx + cy * ty) / (cl * tl); // 1 = straight
      if (cut < 0.2) continue;
      const score = cut * 2 - (cl + tl) * 0.3;
      if (!best || score > best.score) best = { angle: Math.atan2(cy, cx), score, dist: cl + tl };
    }
  }
  if (!best) return { angle: rnd() * Math.PI * 2, power: 0.5 };
  const noise = (rnd() - 0.5) * 0.12 * (1 - skill);
  return { angle: best.angle + noise, power: Math.min(1, 0.25 + best.dist * 0.25 + rnd() * 0.1) };
}

// ---------------------------------------------------------------- mini golf

export interface Hole {
  name: string;
  par: number;
  w: number;
  h: number;
  start: [number, number];
  cup: [number, number];
  walls: Rect[];
  /** Rotating bar (windmill) obstacle. */
  spinner?: { x: number; y: number; len: number; speed: number };
  /** Sand trap rects (extra friction). */
  sand?: Rect[];
}

export const HOLES: Hole[] = [
  { name: 'Palm Straight', par: 2, w: 8, h: 3, start: [0.8, 1.5], cup: [7.2, 1.5], walls: [{ x0: 3.6, y0: 0, x1: 4.0, y1: 1.1 }, { x0: 3.6, y0: 1.9, x1: 4.0, y1: 3 }] },
  { name: 'Flamingo Dogleg', par: 3, w: 8, h: 5, start: [0.8, 0.8], cup: [7.0, 4.2], walls: [{ x0: 0, y0: 2.0, x1: 5.5, y1: 2.5 }], sand: [{ x0: 5.8, y0: 0.2, x1: 7.6, y1: 1.6 }] },
  { name: 'Gator Windmill', par: 3, w: 9, h: 4, start: [0.8, 2], cup: [8.2, 2], walls: [{ x0: 2.5, y0: 0, x1: 2.9, y1: 1.4 }, { x0: 2.5, y0: 2.6, x1: 2.9, y1: 4 }, { x0: 6.2, y0: 1.2, x1: 6.6, y1: 2.8 }], spinner: { x: 4.6, y: 2, len: 1.6, speed: 1.6 } },
];

export interface GolfBall { x: number; y: number; vx: number; vy: number; sunk: boolean }

const CUP_R = 0.11, BALL_R = 0.05;

/** Step the golf ball; returns 'sunk' when it drops, 'stopped' when at rest. */
export function stepGolf(b: GolfBall, hole: Hole, dt: number, t: number): 'rolling' | 'stopped' | 'sunk' {
  if (b.sunk) return 'sunk';
  const sub = 4, hh = dt / sub;
  for (let s = 0; s < sub; s++) {
    b.x += b.vx * hh;
    b.y += b.vy * hh;
    const inSand = hole.sand?.some((r) => b.x > r.x0 && b.x < r.x1 && b.y > r.y0 && b.y < r.y1) ?? false;
    const fr = inSand ? 3.2 : 0.75;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) { const ns = Math.max(0, sp - fr * hh); b.vx *= ns / sp; b.vy *= ns / sp; }
    // borders
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.75; }
    if (b.x > hole.w - BALL_R) { b.x = hole.w - BALL_R; b.vx = -Math.abs(b.vx) * 0.75; }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.75; }
    if (b.y > hole.h - BALL_R) { b.y = hole.h - BALL_R; b.vy = -Math.abs(b.vy) * 0.75; }
    for (const r of hole.walls) bounceRect(b, r);
    if (hole.spinner) bounceSpinner(b, hole.spinner, t);
    // cup: sink if slow enough over the cup
    const d = Math.hypot(b.x - hole.cup[0], b.y - hole.cup[1]);
    if (d < CUP_R && Math.hypot(b.vx, b.vy) < 2.2) { b.sunk = true; b.vx = b.vy = 0; return 'sunk'; }
  }
  return Math.hypot(b.vx, b.vy) < 0.02 ? 'stopped' : 'rolling';
}

function bounceRect(b: GolfBall, r: Rect): void {
  const cx = Math.max(r.x0, Math.min(b.x, r.x1)), cy = Math.max(r.y0, Math.min(b.y, r.y1));
  const dx = b.x - cx, dy = b.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= BALL_R) return;
  let nx: number, ny: number;
  if (d > 1e-6) { nx = dx / d; ny = dy / d; }
  else {
    const opts = [[b.x - r.x0, -1, 0], [r.x1 - b.x, 1, 0], [b.y - r.y0, 0, -1], [r.y1 - b.y, 0, 1]].sort((a, c) => a[0] - c[0])[0];
    nx = opts[1]; ny = opts[2];
  }
  b.x = cx + nx * BALL_R; b.y = cy + ny * BALL_R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= 1.75 * vn * nx; b.vy -= 1.75 * vn * ny; }
}

function bounceSpinner(b: GolfBall, s: NonNullable<Hole['spinner']>, t: number): void {
  const a = t * s.speed;
  const ux = Math.cos(a), uy = Math.sin(a);
  const px = b.x - s.x, py = b.y - s.y;
  const along = Math.max(-s.len, Math.min(s.len, px * ux + py * uy));
  const cx = s.x + ux * along, cy = s.y + uy * along;
  const dx = b.x - cx, dy = b.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= BALL_R + 0.05 || d < 1e-6) return;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * (BALL_R + 0.05); b.y = cy + ny * (BALL_R + 0.05);
  const vn = b.vx * nx + b.vy * ny;
  b.vx -= 1.8 * Math.min(0, vn) * nx - nx * 0.6;
  b.vy -= 1.8 * Math.min(0, vn) * ny - ny * 0.6;
}

export function putt(b: GolfBall, angle: number, power: number): void {
  const v = 0.3 + power * 5.2;
  b.vx = Math.cos(angle) * v;
  b.vy = Math.sin(angle) * v;
}

export function golfScoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'HOLE IN ONE!';
  const d = strokes - par;
  return d <= -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double Bogey' : `+${d}`;
}
