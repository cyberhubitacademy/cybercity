import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';
import { isWater } from '../world/layout';

// Arcade vehicle model (GTA-feel rather than simulation): forward/lateral
// velocity split with grip, handbrake drifts, speed-scaled steering, and
// two-circle collision against the city boxes. Boats only move on water.

export type VehicleKind = 'stinger' | 'cabrio' | 'shield' | 'sedan' | 'taxi' | 'van' | 'bike' | 'boat';

export interface VehicleDef {
  kind: VehicleKind;
  name: string;
  maxSpeed: number; // m/s
  accel: number;
  brake: number;
  turn: number; // rad/s at full lock
  grip: number;
  length: number;
  width: number;
  colors: string[];
}

export const VEHICLE_DEFS: Record<VehicleKind, VehicleDef> = {
  stinger: { kind: 'stinger', name: 'Vortex Stinger', maxSpeed: 52, accel: 17, brake: 34, turn: 2.2, grip: 7, length: 4.5, width: 1.95, colors: ['#ff2fa0', '#ff4d6d', '#ffd23f', '#ffffff'] },
  cabrio: { kind: 'cabrio', name: 'Palmetto Cabrio', maxSpeed: 44, accel: 13, brake: 30, turn: 2.1, grip: 6.5, length: 4.6, width: 1.9, colors: ['#19c3d6', '#9ff0e0', '#ff9fc8', '#f6e3b4'] },
  shield: { kind: 'shield', name: 'Sunset Shield Interceptor', maxSpeed: 46, accel: 14, brake: 32, turn: 2.0, grip: 7, length: 4.8, width: 2.05, colors: ['#f7f7fb'] },
  sedan: { kind: 'sedan', name: 'Coral Sedan', maxSpeed: 38, accel: 10, brake: 28, turn: 1.9, grip: 6, length: 4.7, width: 1.9, colors: ['#7fb4d6', '#c8b6ff', '#a0e7ff', '#ffd6a5', '#b8f2b0', '#e8e8f0', '#3a3a4a'] },
  taxi: { kind: 'taxi', name: 'Bay Cab', maxSpeed: 38, accel: 10, brake: 28, turn: 1.9, grip: 6, length: 4.8, width: 1.9, colors: ['#ffd23f'] },
  van: { kind: 'van', name: 'Pink Tide Van', maxSpeed: 36, accel: 9, brake: 24, turn: 1.6, grip: 5.5, length: 5.4, width: 2.1, colors: ['#f2eef5'] },
  bike: { kind: 'bike', name: 'Neon PCJ', maxSpeed: 50, accel: 18, brake: 30, turn: 2.6, grip: 8, length: 2.1, width: 0.7, colors: ['#ffd23f', '#ff2fa0', '#19e6ff'] },
  boat: { kind: 'boat', name: 'Squalo Speedboat', maxSpeed: 40, accel: 11, brake: 12, turn: 1.4, grip: 2.2, length: 7, width: 2.4, colors: ['#ffffff'] },
};

export interface Controls {
  throttle: number; // -1..1 (negative = reverse)
  steer: number; // -1..1 (positive = left)
  handbrake: boolean;
}

// --- shared materials ---
const paintCache = new Map<string, THREE.MeshPhysicalMaterial>();
function paint(color: string): THREE.MeshPhysicalMaterial {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 });
    paintCache.set(color, m);
  }
  return m;
}
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#16202e', metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.8, transparent: true, opacity: 0.88 });
const tireMat = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#d9dde6', metalness: 0.9, roughness: 0.25 });
const chromeMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', metalness: 1, roughness: 0.15 });
const darkMat = new THREE.MeshStandardMaterial({ color: '#202028', roughness: 0.6 });
const seatMat = new THREE.MeshStandardMaterial({ color: '#f2e6d8', roughness: 0.7 });
export const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0.4 });
export const tailMat = new THREE.MeshStandardMaterial({ color: '#550010', emissive: '#ff1030', emissiveIntensity: 0.6 });

/** Car side profile (x = along length, y = up), extruded across the width with a bevel. */
function profileBody(points: [number, number][], width: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const bevel = 0.12;
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // length now along +z
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function smoothProfile(pts: [number, number][], segs = 4): [number, number][] {
  // Catmull-Rom through the control points for curvy bodywork.
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'catmullrom', 0.15);
  return curve.getPoints(pts.length * segs).map((p) => [p.x, p.y] as [number, number]);
}

function wheel(radius: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20).rotateZ(Math.PI / 2), tireMat);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 12).rotateZ(Math.PI / 2), rimMat);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, radius * 1.1, 0.06), rimMat);
    spoke.rotation.x = (i / 5) * Math.PI;
    g.add(spoke);
  }
  tire.castShadow = true;
  g.add(tire, rim);
  return g;
}

export function buildVehicleMesh(def: VehicleDef, color: string): { root: THREE.Group; wheels: THREE.Group[]; steerWheels: THREE.Group[] } {
  const root = new THREE.Group();
  const wheels: THREE.Group[] = [];
  const steer: THREE.Group[] = [];
  const W = def.width, L = def.length;
  const body = paint(color);

  if (def.kind === 'boat') {
    const hull = profileBody(smoothProfile([[-3.4, 0.9], [-3.5, 0.2], [-2, -0.4], [2, -0.3], [3.6, 0.9], [2.4, 1.15], [-3.2, 1.1]], 3), W, paint('#ffffff'));
    const stripe = profileBody([[-3.3, 0.55], [3.2, 0.55], [3.4, 0.75], [-3.3, 0.75]], W + 0.04, paint('#ff2fa0'));
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.15, 3.2), seatMat);
    deck.position.set(0, 1.12, -0.9);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.5, 0.08), glassMat);
    shield.position.set(0, 1.45, 0.6);
    shield.rotation.x = -0.5;
    root.add(hull, stripe, deck, shield);
    return { root, wheels, steerWheels: steer };
  }

  if (def.kind === 'bike') {
    const frame = profileBody(smoothProfile([[-0.8, 0.55], [-0.2, 0.75], [0.5, 0.95], [0.85, 0.7], [0.3, 0.45]], 3), 0.32, body);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.7), darkMat);
    seat.position.set(0, 0.88, -0.35);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8).rotateZ(Math.PI / 2), chromeMat);
    bar.position.set(0, 1.1, 0.62);
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), chromeMat);
    fork.position.set(0, 0.7, 0.78);
    fork.rotation.x = 0.35;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), headMat);
    lamp.position.set(0, 1.0, 0.85);
    root.add(frame, seat, bar, fork, lamp);
    for (const z of [-0.75, 0.82]) {
      const w = wheel(0.34, 0.14);
      w.position.set(0, 0.34, z);
      root.add(w);
      wheels.push(w);
      if (z > 0) steer.push(w);
    }
    return { root, wheels, steerWheels: steer };
  }

  // Profiles per body style (x from rear to front, y from 0.25 ground clearance).
  const profiles: Record<string, [number, number][]> = {
    stinger: [[-2.25, 0.35], [-2.3, 0.85], [-1.4, 0.95], [-0.7, 1.25], [0.4, 1.22], [1.2, 0.85], [2.25, 0.7], [2.3, 0.35]],
    cabrio: [[-2.3, 0.35], [-2.35, 0.95], [-0.6, 0.98], [0.6, 0.98], [1.3, 0.92], [2.3, 0.78], [2.35, 0.35]],
    shield: [[-2.4, 0.4], [-2.45, 1.15], [-2.2, 1.65], [0.5, 1.68], [1.2, 1.15], [2.4, 1.0], [2.45, 0.4]],
    sedan: [[-2.35, 0.35], [-2.4, 0.95], [-1.6, 1.0], [-0.9, 1.45], [0.6, 1.45], [1.3, 0.98], [2.35, 0.85], [2.4, 0.35]],
    taxi: [[-2.4, 0.35], [-2.45, 0.95], [-1.6, 1.0], [-0.9, 1.48], [0.6, 1.48], [1.3, 1.0], [2.4, 0.86], [2.45, 0.35]],
    van: [[-2.7, 0.4], [-2.7, 2.2], [1.2, 2.2], [1.9, 1.3], [2.7, 1.05], [2.72, 0.4]],
  };
  const prof = profiles[def.kind];
  const shell = profileBody(smoothProfile(prof, 3), W, body);
  root.add(shell);

  // Glass greenhouse: a slimmer, darker copy of the cabin region.
  const cabinTop = Math.max(...prof.map((p) => p[1]));
  if (def.kind !== 'cabrio') {
    const g = profileBody(
      smoothProfile(
        def.kind === 'van'
          ? [[0.9, 1.45], [1.15, 2.05], [1.75, 1.35]]
          : def.kind === 'shield'
            ? [[-2.15, 1.2], [-2.0, 1.6], [0.45, 1.62], [1.1, 1.2]]
            : [[-1.45, 0.98], [-0.75, cabinTop - 0.04], [0.48, cabinTop - 0.06], [1.15, 0.92]],
        3,
      ),
      W + 0.02,
      glassMat,
    );
    g.scale.set(def.kind === 'van' ? 1.005 : 0.995, 1, 1);
    root.add(g);
  } else {
    // convertible: windshield + seats + roll hoop
    const ws = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, 0.45, 0.06), glassMat);
    ws.position.set(0, 1.2, 0.55);
    ws.rotation.x = -0.6;
    root.add(ws);
    for (const x of [-0.45, 0.45]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), seatMat);
      seat.position.set(x, 1.0, -0.4);
      root.add(seat);
    }
  }
  // two-tone details
  if (def.kind === 'shield') {
    for (const [y, c] of [[0.8, '#ff2fa0'], [0.95, '#19e6ff']] as const) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.1, L - 0.4), paint(c));
      s.position.y = y;
      root.add(s);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: '#19e6ff', emissive: '#19e6ff', emissiveIntensity: 2 }));
    bar.position.set(0, 1.74, -0.6);
    root.add(bar);
  }
  if (def.kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffd23f', emissiveIntensity: 1 }));
    sign.position.set(0, 1.62, -0.2);
    const checker = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.12, L - 0.6), paint('#1a1a1a'));
    checker.position.y = 0.72;
    root.add(sign, checker);
  }
  if (def.kind === 'van') {
    for (const side of [-1, 1]) {
      const wave = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), new THREE.MeshStandardMaterial({ color: '#ff2fa0', emissive: '#ff2fa0', emissiveIntensity: 0.4, side: THREE.DoubleSide }));
      wave.position.set(side * (W / 2 + 0.01), 1.3, -0.6);
      wave.rotation.y = Math.PI / 2;
      root.add(wave);
    }
  }
  // lights, bumpers, mirrors
  const front = L / 2, rear = -L / 2;
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), headMat);
    hl.position.set(s * (W / 2 - 0.35), def.kind === 'van' ? 0.95 : 0.72, front + 0.02);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.08), tailMat);
    tl.position.set(s * (W / 2 - 0.33), def.kind === 'van' ? 1.2 : 0.82, rear - 0.02);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.12), body);
    mirror.position.set(s * (W / 2 + 0.08), def.kind === 'van' ? 1.6 : 1.05, 0.7);
    root.add(hl, tl, mirror);
  }
  for (const z of [front + 0.06, rear - 0.06]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.16, 0.12), darkMat);
    b.position.set(0, 0.45, z);
    root.add(b);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.02), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  plate.position.set(0, 0.55, rear - 0.13);
  root.add(plate);

  const wr = def.kind === 'van' ? 0.42 : 0.36;
  const axle = L / 2 - 0.85;
  for (const z of [axle, -axle]) {
    for (const s of [-1, 1]) {
      const w = wheel(wr, 0.26);
      w.position.set(s * (W / 2 - 0.12), wr, z);
      root.add(w);
      wheels.push(w);
      if (z > 0) steer.push(w);
    }
  }
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { root, wheels, steerWheels: steer };
}

let nextId = 1;

export class Vehicle {
  readonly id = nextId++;
  readonly root: THREE.Group;
  private wheels: THREE.Group[];
  private steerWheels: THREE.Group[];
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  /** Signed forward speed (m/s). */
  speed = 0;
  controls: Controls = { throttle: 0, steer: 0, handbrake: false };
  driver: 'player' | 'ai' | null = null;
  speedMult = 1;
  private wheelSpin = 0;
  private lean = 0;
  private bob = Math.random() * 10;
  /** Called with impact strength when hitting something. */
  onImpact?: (strength: number) => void;
  readonly color: string;

  constructor(readonly def: VehicleDef, color?: string) {
    this.color = color ?? def.colors[Math.floor(Math.random() * def.colors.length)];
    const built = buildVehicleMesh(def, this.color);
    this.root = built.root;
    this.wheels = built.wheels;
    this.steerWheels = built.steerWheels;
  }

  place(x: number, z: number, yaw: number): void {
    this.position.set(x, this.def.kind === 'boat' ? -0.35 : 0, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.sync(0);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt: number, world: CollisionWorld): void {
    const d = this.def;
    const c = this.controls;
    const f = this.forward;
    const vFwd = this.velocity.dot(f);
    const lat = this.velocity.clone().addScaledVector(f, -vFwd);
    const maxSpeed = d.maxSpeed * this.speedMult;

    let fwdSpeed = vFwd;
    if (c.throttle > 0) {
      if (fwdSpeed < -0.5) fwdSpeed += d.brake * dt;
      else fwdSpeed += d.accel * c.throttle * (1 - Math.max(0, fwdSpeed) / maxSpeed) * dt * 1.6;
    } else if (c.throttle < 0) {
      if (fwdSpeed > 0.5) fwdSpeed -= d.brake * dt;
      else fwdSpeed = Math.max(-maxSpeed * 0.35, fwdSpeed - d.accel * 0.6 * dt);
    } else {
      fwdSpeed *= Math.max(0, 1 - dt * (d.kind === 'boat' ? 0.5 : 0.35));
      if (Math.abs(fwdSpeed) < 0.15) fwdSpeed = 0;
    }
    if (c.handbrake) fwdSpeed *= Math.max(0, 1 - dt * 1.6);

    // steering scales with speed, reversed when backing up
    const steerFactor = Math.min(1, Math.abs(fwdSpeed) / 7) * Math.sign(fwdSpeed || 1);
    const grip = c.handbrake ? d.grip * 0.18 : d.grip;
    this.yaw += c.steer * d.turn * steerFactor * dt * (c.handbrake ? 1.35 : 1) * (1 - Math.min(0.45, Math.abs(fwdSpeed) / maxSpeed * 0.45));

    lat.multiplyScalar(Math.max(0, 1 - grip * dt));
    const nf = this.forward;
    this.velocity.copy(nf).multiplyScalar(fwdSpeed).add(lat);
    this.speed = fwdSpeed;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    if (d.kind === 'boat') {
      // stay on water
      if (!isWater(this.position.x, this.position.z)) {
        this.position.x -= this.velocity.x * dt * 1.5;
        this.position.z -= this.velocity.z * dt * 1.5;
        this.velocity.multiplyScalar(-0.3);
        this.onImpact?.(Math.abs(fwdSpeed) / 10);
      }
      this.bob += dt * 2;
      this.position.y = -0.35 + Math.sin(this.bob) * 0.08;
    } else {
      // two contact circles along the body
      const half = Math.max(0, d.length / 2 - d.width / 2);
      const r = d.width / 2 + 0.05;
      let impact = 0;
      for (const o of half > 0 ? [half, -half] : [0]) {
        const p = { x: this.position.x + nf.x * o, z: this.position.z + nf.z * o };
        const before = { ...p };
        const n = world.resolveCircle(p, r, this.position.y, 1.4, true, 0.45);
        if (n) {
          this.position.x += p.x - before.x;
          this.position.z += p.z - before.z;
          const vn = this.velocity.x * n.nx + this.velocity.z * n.nz;
          if (vn < 0) {
            this.velocity.x -= n.nx * vn * 1.3;
            this.velocity.z -= n.nz * vn * 1.3;
            impact = Math.max(impact, -vn);
          }
        }
      }
      if (impact > 0) {
        this.velocity.multiplyScalar(0.75);
        this.speed = this.velocity.dot(this.forward);
        if (impact > 3) this.onImpact?.(impact / 12);
      }
      // keep cars out of the sea
      if (isWater(this.position.x, this.position.z)) {
        this.position.x -= this.velocity.x * dt * 2;
        this.position.z -= this.velocity.z * dt * 2;
        this.velocity.multiplyScalar(-0.2);
      }
      this.position.y = world.groundHeight(this.position.x, this.position.z, this.position.y + 0.3);
    }
    this.sync(dt);
  }

  sync(dt: number): void {
    this.root.position.copy(this.position);
    this.root.rotation.set(0, this.yaw, 0);
    this.wheelSpin += (this.speed * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.steerWheels) w.rotation.y = this.controls.steer * 0.45;
    if (this.def.kind === 'bike') {
      const target = -this.controls.steer * Math.min(1, Math.abs(this.speed) / 12) * 0.45;
      this.lean += (target - this.lean) * Math.min(1, dt * 6);
      this.root.rotation.z = this.lean;
    } else if (this.def.kind === 'boat') {
      this.root.rotation.x = -Math.min(0.12, Math.abs(this.speed) / 200) + Math.sin(this.bob * 1.3) * 0.02;
      this.root.rotation.z = Math.sin(this.bob) * 0.03;
    } else {
      // subtle body roll on turns
      const roll = this.controls.steer * Math.min(1, Math.abs(this.speed) / 20) * 0.04;
      this.root.children[0].rotation.z = roll;
    }
  }

  get kmh(): number {
    return Math.abs(this.speed) * 3.6;
  }
}
