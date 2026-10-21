import * as THREE from 'three';
import { LANE_OFFSET, RoadNode, buildRoadGraph } from '../world/layout';
import type { CollisionWorld } from '../world/Collision';
import { VEHICLE_DEFS, Vehicle, VehicleKind } from './Vehicle';

// Ambient traffic: AI drivers follow right-hand lanes along the road graph,
// choose random turns at intersections, and slow for obstacles ahead.
// A fixed pool is recycled around the player so nearby streets stay busy.

interface AiState {
  from: RoadNode;
  to: RoadNode;
  cruise: number;
  stuck: number;
  /** Optional fixed route for scripted vehicles (node ids, looped). */
  route?: number[];
  routeIdx?: number;
  /** Scripted vehicles flee faster and don't respawn. */
  scripted?: boolean;
}

const TRAFFIC_KINDS: VehicleKind[] = ['sedan', 'sedan', 'sedan', 'taxi', 'cabrio', 'stinger', 'sedan', 'bike', 'cabrio'];

export class Traffic {
  readonly nodes = buildRoadGraph();
  readonly cars: Vehicle[] = [];
  private ai = new Map<Vehicle, AiState>();
  private rnd = Math.random;

  constructor(private scene: THREE.Scene, private world: CollisionWorld, private poolSize = 22) {}

  /** Lane point: node position offset to the right of the travel direction. */
  private lanePoint(a: RoadNode, b: RoadNode, atB: boolean): THREE.Vector3 {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len;
    const rx = -fz, rz = fx;
    const base = atB ? b : a;
    return new THREE.Vector3(base.x + rx * LANE_OFFSET, 0, base.z + rz * LANE_OFFSET);
  }

  spawnAround(center: THREE.Vector3): void {
    while (this.cars.length < this.poolSize) {
      const kind = TRAFFIC_KINDS[Math.floor(this.rnd() * TRAFFIC_KINDS.length)];
      const v = new Vehicle(VEHICLE_DEFS[kind]);
      v.driver = 'ai';
      this.scene.add(v.root);
      this.cars.push(v);
      this.respawn(v, center, 30, 200);
    }
  }

  /** Put a car on a random lane segment between minD and maxD from center. */
  private respawn(v: Vehicle, center: THREE.Vector3, minD: number, maxD: number): void {
    for (let tries = 0; tries < 40; tries++) {
      const a = this.nodes[Math.floor(this.rnd() * this.nodes.length)];
      const b = this.nodes[a.links[Math.floor(this.rnd() * a.links.length)]];
      const t = 0.2 + this.rnd() * 0.6;
      const p0 = this.lanePoint(a, b, false), p1 = this.lanePoint(a, b, true);
      const p = p0.lerp(p1, t);
      const d = p.distanceTo(center);
      if (d < minD || d > maxD) continue;
      if (this.cars.some((c) => c !== v && c.position.distanceTo(p) < 9)) continue;
      v.place(p.x, p.z, Math.atan2(b.x - a.x, b.z - a.z));
      v.velocity.copy(v.forward).multiplyScalar(8);
      this.ai.set(v, { from: a, to: b, cruise: 10 + this.rnd() * 5, stuck: 0 });
      return;
    }
  }

  /** Hand a vehicle to the AI (e.g. scripted Pink Tide van). */
  adopt(v: Vehicle, routeNodeIds?: number[], cruise = 16): void {
    let best = this.nodes[0], bd = Infinity;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - v.position.x, n.z - v.position.z);
      if (d < bd) { bd = d; best = n; }
    }
    const to = this.nodes[best.links[0]];
    v.driver = 'ai';
    this.ai.set(v, { from: best, to, cruise, stuck: 0, route: routeNodeIds, routeIdx: 0, scripted: true });
  }

  release(v: Vehicle): void {
    this.ai.delete(v);
    const i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
  }

  isAi(v: Vehicle): boolean {
    return this.ai.has(v);
  }

  private nextNode(s: AiState): RoadNode {
    if (s.route && s.route.length) {
      s.routeIdx = ((s.routeIdx ?? 0) + 1) % s.route.length;
      const want = this.nodes[s.route[s.routeIdx]];
      if (s.to.links.includes(want.id)) return want;
    }
    const options = s.to.links.filter((id) => id !== s.from.id);
    const pick = options.length ? options[Math.floor(this.rnd() * options.length)] : s.from.id;
    return this.nodes[pick];
  }

  /**
   * obstacles: positions (player, pedestrians, other vehicles) the AI should brake for.
   * Returns nothing; drives each AI vehicle's controls and integrates physics.
   */
  update(dt: number, center: THREE.Vector3, obstacles: THREE.Vector3[], allVehicles: Vehicle[]): void {
    for (const [v, s] of this.ai) {
      if (v.driver !== 'ai') continue;
      // recycle far-away ambient cars toward the player
      if (!s.scripted && v.position.distanceTo(center) > 230) {
        this.respawn(v, center, 90, 200);
        continue;
      }
      const end = this.lanePoint(s.from, s.to, true);
      const start = this.lanePoint(s.from, s.to, false);
      const seg = end.clone().sub(start);
      const segLen = seg.length();
      seg.normalize();
      const along = v.position.clone().sub(start).dot(seg);
      if (segLen - along < 7) {
        const next = this.nextNode(s);
        s.from = s.to;
        s.to = next;
        continue;
      }
      const look = start.clone().addScaledVector(seg, Math.min(segLen, along + 9));
      const desired = Math.atan2(look.x - v.position.x, look.z - v.position.z);
      let diff = desired - v.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      v.controls.steer = THREE.MathUtils.clamp(diff * 2.2, -1, 1);

      // obstacle check: anything in a cone ahead
      const f = v.forward;
      let blocked = 99;
      const check = (p: THREE.Vector3) => {
        const dx = p.x - v.position.x, dz = p.z - v.position.z;
        const ahead = dx * f.x + dz * f.z;
        if (ahead < 0 || ahead > 16) return;
        const lateral = Math.abs(dx * f.z - dz * f.x);
        if (lateral < 2.2) blocked = Math.min(blocked, ahead);
      };
      for (const p of obstacles) check(p);
      for (const o of allVehicles) if (o !== v) check(o.position);

      let target = s.cruise * (1 - Math.min(0.55, Math.abs(diff)));
      if (blocked < 16) target = Math.min(target, Math.max(0, (blocked - 5) * 1.2));
      const spd = v.speed;
      v.controls.throttle = spd < target - 0.5 ? 0.8 : spd > target + 1 ? -0.6 : 0.1;
      v.controls.handbrake = false;
      if (target < 0.5 && spd < 1) v.controls.throttle = 0;

      // unstick: if not moving for a while with nothing ahead, reverse briefly / respawn
      if (Math.abs(spd) < 0.3 && blocked >= 16) s.stuck += dt;
      else s.stuck = 0;
      if (s.stuck > 4 && !s.scripted) {
        this.respawn(v, center, 90, 200);
        continue;
      }
      if (s.stuck > 2) v.controls.throttle = -0.6;
      v.update(dt, this.world);
    }
  }
}

/** Resolve overlaps between vehicles (simple circles). Returns impacts with the player car. */
export function separateVehicles(list: Vehicle[], onHit?: (a: Vehicle, b: Vehicle, strength: number) => void): void {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const ra = Math.max(a.def.width, a.def.length * 0.5) * 0.55;
      const rb = Math.max(b.def.width, b.def.length * 0.5) * 0.55;
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz);
      if (d === 0 || d > ra + rb) continue;
      const nx = dx / d, nz = dz / d;
      const push = (ra + rb - d) / 2;
      a.position.x -= nx * push; a.position.z -= nz * push;
      b.position.x += nx * push; b.position.z += nz * push;
      const rel = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
      if (rel < 0) {
        a.velocity.x += nx * rel * 0.6; a.velocity.z += nz * rel * 0.6;
        b.velocity.x -= nx * rel * 0.6; b.velocity.z -= nz * rel * 0.6;
        onHit?.(a, b, -rel);
      }
      a.sync(0);
      b.sync(0);
    }
  }
}
