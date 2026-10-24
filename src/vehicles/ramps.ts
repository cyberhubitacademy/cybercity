// Stunt ramps: pure data + height lookup (used by vehicle physics) so cars
// actually launch off them. Meshes are built by the racing/stunt system.

export interface Ramp {
  id: string;
  name: string;
  /** Center of the ramp footprint. */
  x: number;
  z: number;
  /** Travel direction (radians, 0 = +z). The ramp rises along it. */
  yaw: number;
  length: number;
  width: number;
  /** Lip height in meters. */
  height: number;
}

export const RAMPS: Ramp[] = [
  { id: 'ramp-beach-north', name: 'Starlight Sand Leap', x: 222, z: -50, yaw: Math.PI, length: 11, width: 6, height: 3 },
  { id: 'ramp-beach-south', name: 'Lifeguard Launch', x: 225, z: 18, yaw: 0, length: 11, width: 6, height: 3 },
  { id: 'ramp-oldtown', name: 'Old Town Alley Hop', x: -236, z: -120, yaw: Math.PI / 2, length: 10, width: 5.5, height: 2.6 },
  { id: 'ramp-industrial', name: 'Factory Yard Flyer', x: -236, z: 190, yaw: Math.PI / 2, length: 11, width: 6, height: 3.2 },
  { id: 'ramp-harbor', name: 'Container Dock Drop', x: 25, z: 202, yaw: Math.PI, length: 10, width: 6, height: 2.8 },
];

/** Position of a point in ramp space: `along` from -L/2 (ground) to +L/2 (lip), `side` across. */
export function rampLocal(r: Ramp, x: number, z: number): { along: number; side: number } {
  const dx = x - r.x, dz = z - r.z;
  const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
  return { along: dx * s + dz * c, side: dx * c - dz * s };
}

/** Surface height of ramp `r` at (x,z), or -1 when outside its footprint. */
export function rampSurface(r: Ramp, x: number, z: number): number {
  const dx = x - r.x, dz = z - r.z;
  if (dx * dx + dz * dz > (r.length * r.length + r.width * r.width) * 0.3) return -1;
  const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
  const along = dx * s + dz * c;
  const side = dx * c - dz * s;
  if (Math.abs(side) > r.width / 2 || along < -r.length / 2 || along > r.length / 2) return -1;
  return r.height * ((along + r.length / 2) / r.length);
}

/** Highest ramp surface under a point (0 when on no ramp). */
export function rampHeightAt(x: number, z: number): number {
  let h = 0;
  for (const r of RAMPS) {
    const y = rampSurface(r, x, z);
    if (y > h) h = y;
  }
  return h;
}

/** The ramp under a point, if any. */
export function rampAt(x: number, z: number): Ramp | null {
  for (const r of RAMPS) if (rampSurface(r, x, z) >= 0) return r;
  return null;
}
