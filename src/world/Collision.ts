// Axis-aligned box colliders on the XZ plane with a uniform spatial hash.
// Characters and vehicles are circles; boxes have a height so the camera can
// test against them in 3D.

export interface Box {
  x0: number; x1: number; z0: number; z1: number;
  y0: number; y1: number;
  /** Pedestrian-only blockers (e.g. lobby desks) don't stop cars. */
  solidForCars?: boolean;
}

const CELL = 32;

export class CollisionWorld {
  readonly boxes: Box[] = [];
  private grid = new Map<string, Box[]>();

  add(box: Box): void {
    this.boxes.push(box);
    for (let cx = Math.floor(box.x0 / CELL); cx <= Math.floor(box.x1 / CELL); cx++) {
      for (let cz = Math.floor(box.z0 / CELL); cz <= Math.floor(box.z1 / CELL); cz++) {
        const k = `${cx},${cz}`;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(box);
      }
    }
  }

  addRect(x0: number, z0: number, x1: number, z1: number, height: number, y0 = 0): void {
    this.add({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1: y0 + height });
  }

  near(x: number, z: number, r: number): Box[] {
    const out = new Set<Box>();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const list = this.grid.get(`${cx},${cz}`);
        if (list) for (const b of list) out.add(b);
      }
    }
    return [...out];
  }

  /**
   * Push a circle out of all boxes it overlaps (only boxes whose vertical span
   * overlaps [y, y+height]). Returns the push normal if a collision happened.
   */
  resolveCircle(
    pos: { x: number; z: number },
    r: number,
    y = 0,
    height = 1.8,
    forCar = false,
    step = 0.45,
  ): { nx: number; nz: number } | null {
    let hit: { nx: number; nz: number } | null = null;
    for (const b of this.near(pos.x, pos.z, r + 1)) {
      if (b.y1 <= y + step || b.y0 >= y + height) continue;
      if (forCar && b.solidForCars === false) continue;
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        pos.x = cx + dx * r;
        pos.z = cz + dz * r;
        hit = { nx: dx, nz: dz };
      } else {
        // center inside the box: push out along the smallest axis
        const opts = [
          { d: pos.x - b.x0, nx: -1, nz: 0 },
          { d: b.x1 - pos.x, nx: 1, nz: 0 },
          { d: pos.z - b.z0, nx: 0, nz: -1 },
          { d: b.z1 - pos.z, nx: 0, nz: 1 },
        ].sort((a, c) => a.d - c.d)[0];
        pos.x += opts.nx * (opts.d + r);
        pos.z += opts.nz * (opts.d + r);
        hit = { nx: opts.nx, nz: opts.nz };
      }
    }
    return hit;
  }

  /** Highest box top under a point (for standing on low platforms like the pier). */
  groundHeight(x: number, z: number, maxY: number): number {
    let h = 0;
    for (const b of this.near(x, z, 0.5)) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= maxY + 0.46 && b.y1 > h) h = b.y1;
    }
    return h;
  }

  /** Distance along a ray (ox,oy,oz)+t*(dx,dy,dz) to the first box, or maxT. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
    let best = maxT;
    const mx = ox + dx * maxT, mz = oz + dz * maxT;
    const r = Math.hypot(mx - ox, mz - oz) / 2 + 2;
    for (const b of this.near((ox + mx) / 2, (oz + mz) / 2, r)) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (t !== null && t < best) best = t;
    }
    return best;
  }
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number | null {
  let tmin = 0, tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.x0, b.x1],
    [oy, dy, b.y0, b.y1],
    [oz, dz, b.z0, b.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
