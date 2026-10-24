import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';
import { BEACH_X, isWater } from '../world/layout';
import { ASSETS, type CarModel } from '../assets/Assets';
import { chromeMat, customPaint, darkMat, glassMat, headMat, paint, rimMat, seatMat, tailMat, tireMat, type Finish } from './materials';
import { buildAirboat, buildBicycle, buildDirtBike, buildHeli, buildJetSki, buildKayak, emptyBuilt, type BuiltMesh } from './meshes';
import {
  NO_UPGRADES, applyDamage, gripCurve, healthState, impactDamage, landingDamage, sanitizeUpgrades, springStep, torqueCurve, tunedStats,
  type HealthState, type TunedStats, type Upgrades,
} from './physics';
import { rampAt, rampHeightAt } from './ramps';

export { headMat, tailMat };

// Arcade vehicle model with a GTA feel: forward/lateral velocity split with
// a tire grip curve (drifts, handbrake slides), weight transfer shown as body
// pitch/roll on springs, curb bounces, airborne physics (ramps, roofs),
// damage with dents, and per-medium handling (land, water, amphibious, air).

export type VehicleKind =
  | 'stinger' | 'cabrio' | 'shield' | 'sedan' | 'taxi' | 'van' | 'bike' | 'boat' | 'police' | 'pickup'
  | 'jetski' | 'kayak' | 'airboat' | 'bicycle' | 'dirtbike' | 'heli';

export type Medium = 'land' | 'water' | 'amphibious' | 'air';

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
  medium?: Medium;
  /** Max health (hp). */
  health?: number;
  /** Showroom price in $. */
  value?: number;
  /** Grip multiplier on sand/dirt (road cars ~0.7, dirt bikes > 1). */
  offroad?: number;
  /** Bikes, bicycles: lean into turns. */
  twoWheel?: boolean;
  /** Shift = lean back for a wheelie. */
  canWheelie?: boolean;
  /** Human powered (no engine sound / exhaust). */
  pedal?: boolean;
  /** Rider visible (open cockpit). */
  open?: boolean;
  /** Driver seat (local, x = left). */
  seat?: [number, number, number];
  /** Passenger seat (local). */
  passengerSeat?: [number, number, number];
}

export const VEHICLE_DEFS: Record<VehicleKind, VehicleDef> = {
  stinger: { kind: 'stinger', name: 'Vortex Stinger', maxSpeed: 52, accel: 17, brake: 34, turn: 2.2, grip: 7, length: 4.5, width: 1.95, colors: ['#ff2fa0', '#ff4d6d', '#ffd23f', '#ffffff'], health: 1000, value: 12000, offroad: 0.7, seat: [0.4, 0.45, -0.25], passengerSeat: [-0.4, 0.45, -0.25] },
  cabrio: { kind: 'cabrio', name: 'Palmetto Cabrio', maxSpeed: 44, accel: 13, brake: 30, turn: 2.1, grip: 6.5, length: 4.6, width: 1.9, colors: ['#19c3d6', '#9ff0e0', '#ff9fc8', '#f6e3b4'], health: 950, value: 7500, offroad: 0.7, open: true, seat: [0.42, 0.5, -0.3], passengerSeat: [-0.42, 0.5, -0.3] },
  shield: { kind: 'shield', name: 'Sunset Shield Interceptor', maxSpeed: 46, accel: 14, brake: 32, turn: 2.0, grip: 7, length: 4.8, width: 2.05, colors: ['#f7f7fb'], health: 1300, value: 9000, offroad: 0.85, seat: [0.45, 0.6, -0.1], passengerSeat: [-0.45, 0.6, -0.1] },
  sedan: { kind: 'sedan', name: 'Coral Sedan', maxSpeed: 38, accel: 10, brake: 28, turn: 1.9, grip: 6, length: 4.7, width: 1.9, colors: ['#7fb4d6', '#c8b6ff', '#a0e7ff', '#ffd6a5', '#b8f2b0', '#e8e8f0', '#3a3a4a'], health: 1000, value: 3500, offroad: 0.7, seat: [0.42, 0.5, -0.1], passengerSeat: [-0.42, 0.5, -0.1] },
  taxi: { kind: 'taxi', name: 'Bay Cab', maxSpeed: 38, accel: 10, brake: 28, turn: 1.9, grip: 6, length: 4.8, width: 1.9, colors: ['#ffd23f'], health: 1000, value: 3800, offroad: 0.7, seat: [0.42, 0.5, 0.1], passengerSeat: [-0.42, 0.5, -0.9] },
  van: { kind: 'van', name: 'Pink Tide Van', maxSpeed: 36, accel: 9, brake: 24, turn: 1.6, grip: 5.5, length: 5.4, width: 2.1, colors: ['#f2eef5'], health: 1400, value: 4800, offroad: 0.75, seat: [0.5, 0.8, 1.2], passengerSeat: [-0.5, 0.8, 1.2] },
  bike: { kind: 'bike', name: 'Neon PCJ', maxSpeed: 50, accel: 18, brake: 30, turn: 2.6, grip: 8, length: 2.1, width: 0.7, colors: ['#ffd23f', '#ff2fa0', '#19e6ff'], health: 500, value: 4000, offroad: 0.8, twoWheel: true, canWheelie: true, open: true, seat: [0, 0.62, -0.3] },
  police: { kind: 'police', name: 'Neon Bay PD Cruiser', maxSpeed: 46, accel: 14, brake: 32, turn: 2.0, grip: 7, length: 4.6, width: 1.95, colors: ['#f4f6fb'], health: 1300, value: 15000, offroad: 0.75, seat: [0.42, 0.5, -0.1], passengerSeat: [-0.42, 0.5, -0.1] },
  pickup: { kind: 'pickup', name: 'Gulf Coast Pickup', maxSpeed: 38, accel: 11, brake: 28, turn: 1.8, grip: 6, length: 5.0, width: 2.05, colors: ['#c94f3d', '#2f5d8a', '#e8e1d4', '#3a3a44'], health: 1400, value: 5200, offroad: 0.95, seat: [0.45, 0.65, 0.3], passengerSeat: [-0.45, 0.65, 0.3] },
  boat: { kind: 'boat', name: 'Squalo Speedboat', maxSpeed: 40, accel: 11, brake: 12, turn: 1.4, grip: 2.2, length: 7, width: 2.4, colors: ['#ffffff'], medium: 'water', health: 900, value: 9500, open: true, seat: [0.4, 0.75, 0.0], passengerSeat: [-0.4, 0.75, 0.0] },
  jetski: { kind: 'jetski', name: 'Wave Viper Jet Ski', maxSpeed: 30, accel: 13, brake: 8, turn: 2.4, grip: 2.8, length: 3.0, width: 1.1, colors: ['#ff2fa0', '#19e6ff', '#ffd23f', '#3dffb0'], medium: 'water', health: 500, value: 2600, twoWheel: true, open: true, seat: [0, 0.32, -0.42] },
  kayak: { kind: 'kayak', name: 'Mangrove Kayak', maxSpeed: 4.5, accel: 2.4, brake: 3, turn: 1.3, grip: 3, length: 3.6, width: 0.8, colors: ['#ff8a3d', '#ffd23f', '#19c3d6'], medium: 'water', health: 200, value: 400, pedal: true, open: true, seat: [0, -0.05, -0.1] },
  airboat: { kind: 'airboat', name: 'Everglade Airboat', maxSpeed: 26, accel: 9, brake: 6, turn: 1.6, grip: 2.0, length: 4.6, width: 2.2, colors: ['#2f8a5d', '#c94f3d', '#e8e1d4'], medium: 'amphibious', health: 800, value: 5500, open: true, seat: [0, 0.95, -0.6] },
  bicycle: { kind: 'bicycle', name: 'Boardwalk Cruiser Bicycle', maxSpeed: 11, accel: 4.5, brake: 12, turn: 2.6, grip: 8, length: 1.75, width: 0.6, colors: ['#19e6ff', '#ff7cc6', '#ffd23f', '#3dffb0'], health: 250, value: 300, offroad: 0.9, twoWheel: true, canWheelie: true, pedal: true, open: true, seat: [0, 0.55, -0.25] },
  dirtbike: { kind: 'dirtbike', name: 'Dune Ripper 250', maxSpeed: 40, accel: 17, brake: 26, turn: 2.7, grip: 8.5, length: 2.1, width: 0.75, colors: ['#ff8a3d', '#3dffb0', '#ff2fa0'], health: 450, value: 2800, offroad: 1.1, twoWheel: true, canWheelie: true, open: true, seat: [0, 0.62, -0.3] },
  heli: { kind: 'heli', name: 'Skylark Helicopter', maxSpeed: 48, accel: 10, brake: 8, turn: 1.5, grip: 1, length: 9, width: 2.4, colors: ['#19e6ff', '#ff2fa0', '#f4f6fb'], medium: 'air', health: 900, value: 45000, seat: [0.4, 0.9, 0.55], passengerSeat: [-0.4, 0.9, 0.55] },
};

export function mediumOf(def: VehicleDef): Medium {
  return def.medium ?? 'land';
}

export interface Controls {
  throttle: number; // -1..1 (negative = reverse)
  steer: number; // -1..1 (positive = left)
  handbrake: boolean;
}

/** Helicopter inputs (each -1..1). Set every frame by the vehicles system. */
export interface FlightInput {
  lift: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface Look {
  color: string;
  finish: Finish;
  /** Rim color (null = stock). */
  wheel: string | null;
  /** Window tint 0 (stock) .. 3 (limo). */
  tint: number;
}

export type PanelId = 'doorL' | 'doorR' | 'hood' | 'trunk';

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

/** Which CC0 model represents each vehicle kind (variants picked by color hash). */
const MODEL_FOR: Partial<Record<VehicleKind, CarModel[]>> = {
  stinger: ['sports'], cabrio: ['sports2'], shield: ['suv'], sedan: ['sedan', 'hatch'], taxi: ['taxi'],
  van: ['truck'], police: ['police'], pickup: ['pickup'],
};
const KEEP_COLOR = /taxi|police|truck|pickup/;

/** Build a vehicle from a loaded CC0 model: paint, glass, lights, pivoted wheels. */
function modelVehicle(def: VehicleDef, color: string): { root: THREE.Group; wheels: THREE.Group[]; steerWheels: THREE.Group[] } | null {
  const options = MODEL_FOR[def.kind];
  if (!options) return null;
  const model = options[[...color].reduce((n, c) => n + c.charCodeAt(0), 0) % options.length];
  const src = ASSETS.cars.get(model);
  if (!src) return null;
  const obj = src.scene.clone(true);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = def.length / (size.z || 1);
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.scale.setScalar(s);
  holder.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  holder.add(obj);
  root.add(holder);
  root.updateMatrixWorld(true);
  const wheels: THREE.Group[] = [];
  const steer: THREE.Group[] = [];
  const paintMat = paint(color);
  const wheelMeshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (/wheel/i.test(mesh.name) || /wheel/i.test(mesh.parent?.name ?? '')) wheelMeshes.push(mesh);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m) => {
      const n = (m.name || '').toLowerCase();
      if (n.includes('window')) return glassMat;
      if (n.includes('headlight') || n === 'whitelights') return headMat;
      if (n.includes('taillight') || n.includes('brake')) return tailMat;
      if (n === 'bluelights') return new THREE.MeshStandardMaterial({ color: '#2244ff', emissive: '#3355ff', emissiveIntensity: 2 });
      if (n === 'black') return tireMat;
      if (n === 'grey' || n === 'gray') return rimMat;
      if (n === 'atlas' || KEEP_COLOR.test(model)) {
        const k = (m as THREE.MeshStandardMaterial).clone();
        k.roughness = 0.35;
        k.metalness = 0.3;
        return k;
      }
      return paintMat; // body color
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  // Re-parent each wheel under a pivot at its own center so it spins on its axle.
  for (const w of wheelMeshes) {
    const wb = new THREE.Box3().setFromObject(w);
    const c = wb.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.copy(root.worldToLocal(c.clone()));
    root.add(pivot);
    pivot.attach(w);
    wheels.push(pivot);
    if (/front/i.test(w.name) || /front/i.test(w.parent?.name ?? '')) steer.push(pivot);
  }
  return { root, wheels, steerWheels: steer };
}

function buildCarMesh(def: VehicleDef, color: string): { root: THREE.Group; wheels: THREE.Group[]; steerWheels: THREE.Group[] } {
  const fromModel = modelVehicle(def, color);
  if (fromModel) return fromModel;
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
  const prof = profiles[def.kind] ?? profiles.sedan;
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

export function buildVehicleMesh(def: VehicleDef, color: string): BuiltMesh {
  switch (def.kind) {
    case 'jetski': return buildJetSki(color);
    case 'kayak': return buildKayak(color);
    case 'airboat': return buildAirboat(color);
    case 'bicycle': return buildBicycle(color);
    case 'dirtbike': return buildDirtBike(color);
    case 'heli': return buildHeli(color);
    default: {
      const r = buildCarMesh(def, color);
      return { ...emptyBuilt(r.root), wheels: r.wheels, steerWheels: r.steerWheels };
    }
  }
}

let nextId = 1;

/** Arcade gravity (a bit stronger than real for snappy jumps). */
export const GRAVITY = 20;
const WATER_Y = -0.35;
const HELI_CEILING = 260;

const _v = new THREE.Vector3();
const _q = new THREE.Vector3();

interface Slot { mesh: THREE.Mesh; index: number }

interface Panel { open: boolean; angle: number; pivot: THREE.Group | null }

/** Sand / dirt (beach east of Ocean Drive). */
export function isSand(x: number, z: number): boolean {
  return x > BEACH_X - 3 && !isWater(x, z);
}

export class Vehicle {
  readonly id = nextId++;
  readonly root: THREE.Group;
  /** Visual body (suspension pitch/roll/heave applied here). */
  readonly body: THREE.Group;
  private wheels: THREE.Group[];
  private steerWheels: THREE.Group[];
  private built: BuiltMesh;
  readonly position = new THREE.Vector3();
  /** World velocity; y is vertical speed. */
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  /** Signed forward speed (m/s). */
  speed = 0;
  controls: Controls = { throttle: 0, steer: 0, handbrake: false };
  driver: 'player' | 'ai' | null = null;
  speedMult = 1;
  /** Called with impact strength when hitting something. */
  onImpact?: (strength: number) => void;
  /** Called after health drops (amount in hp, world contact point). */
  onDamage?: (amount: number, x: number, z: number) => void;
  /** Left the ground with upward speed (ramp id when launched from a stunt ramp). */
  onLaunch?: (rampId: string | null) => void;
  /** Touched down after `airTime` seconds with `impact` m/s vertical speed. */
  onLand?: (impact: number, airTime: number) => void;
  color: string;
  /** Body height in meters (for the first-person windshield camera). */
  height = 1.4;

  // --- damage & tuning ---
  maxHealth: number;
  health: number;
  upgrades: Upgrades = { ...NO_UPGRADES };
  stats: TunedStats;
  engineOn = true;
  /** Nitro tank 0..1 (only used when upgrades.nitro). */
  nitro = 1;
  /** Set by the vehicles system while N is held. */
  nitroActive = false;
  /** Set by the vehicles system while Shift is held (bikes: wheelie). */
  leanBack = false;
  /** Helicopter input for this frame (consumed by update). */
  flight: FlightInput | null = null;
  /** Owner tag (personal vehicle id) or null. */
  tag: string | null = null;
  /** Vertex dents on impact (enabled for the player's car only). */
  dentable = false;
  lightsOn = false;
  look: Look | null = null;

  // --- dynamic state ---
  airborne = false;
  airTime = 0;
  /** Lateral (sideways) sliding speed, m/s. */
  slip = 0;
  /** Slip angle (radians, absolute). */
  slipAngle = 0;
  /** Wheelie angle (radians). */
  wheelie = 0;
  /** Rotor/engine spool 0..1 (helicopter). */
  spool = 0;
  yawRate = 0;
  braking = false;
  onSand = false;
  /** Water craft currently in water. */
  inWater = false;
  launchRamp: string | null = null;
  readonly launchPos = { x: 0, z: 0 };
  private pitch = 0; private pitchV = 0;
  private roll = 0; private rollV = 0;
  private heave = 0; private heaveV = 0;
  private lean = 0;
  private tiltF = 0; private tiltS = 0;
  private bob = Math.random() * 10;
  private wheelSpin = 0;
  private wheelR: number;
  private rotorSpin = 0;
  private paddleT = 0;
  private lastSafe = new THREE.Vector3();
  private paintSlots: Slot[] = [];
  private rimSlots: Slot[] = [];
  private glassSlots: Slot[] = [];
  private panels: Record<PanelId, Panel> = {
    doorL: { open: false, angle: 0, pivot: null }, doorR: { open: false, angle: 0, pivot: null },
    hood: { open: false, angle: 0, pivot: null }, trunk: { open: false, angle: 0, pivot: null },
  };
  private dents = new Map<THREE.Mesh, THREE.BufferGeometry>();
  private dentTotal = 0;

  constructor(readonly def: VehicleDef, color?: string) {
    this.color = color ?? def.colors[Math.floor(Math.random() * def.colors.length)];
    this.built = buildVehicleMesh(def, this.color);
    this.root = this.built.root;
    // Wrap everything in a body group so suspension can tilt the whole car.
    this.body = new THREE.Group();
    this.body.name = 'body';
    for (const ch of [...this.root.children]) this.body.add(ch);
    this.root.add(this.body);
    this.wheels = this.built.wheels;
    this.steerWheels = this.built.steerWheels;
    // Steer (Y) first, then spin (X) around the wheel's own axle. With the default
    // XYZ order the spin axis tilts whenever the wheel is steered and the tire wobbles.
    for (const w of this.wheels) w.rotation.order = 'YXZ';
    this.height = new THREE.Box3().setFromObject(this.root).getSize(new THREE.Vector3()).y || 1.4;
    this.wheelR = this.measureWheelRadius();
    this.maxHealth = def.health ?? 1000;
    this.health = this.maxHealth;
    this.stats = tunedStats(def, this.upgrades);
    this.collectSlots();
  }

  private measureWheelRadius(): number {
    if (!this.wheels.length) return 0.36;
    this.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(this.wheels[0]);
    const s = b.getSize(new THREE.Vector3());
    const r = Math.max(s.y, s.z) / 2;
    return r > 0.1 && r < 1.2 ? r : 0.36;
  }

  private collectSlots(): void {
    const body = paint(this.color);
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m, index) => {
        if (m === body) this.paintSlots.push({ mesh, index });
        else if (m === rimMat) this.rimSlots.push({ mesh, index });
        else if (m === glassMat) this.glassSlots.push({ mesh, index });
      });
    });
  }

  get medium(): Medium {
    return mediumOf(this.def);
  }

  get dead(): boolean {
    return this.health <= 0;
  }

  get healthState(): HealthState {
    return healthState(this.health, this.maxHealth);
  }

  /** Visual body pitch (radians, + = nose down) for effects/HUD. */
  get bodyPitch(): number {
    return this.pitch;
  }

  setUpgrades(u: Partial<Upgrades>): void {
    this.upgrades = sanitizeUpgrades(u);
    this.stats = tunedStats(this.def, this.upgrades);
  }

  place(x: number, z: number, yaw: number, y?: number): void {
    const m = this.medium;
    this.position.set(x, y ?? (m === 'water' || (m === 'amphibious' && isWater(x, z)) ? WATER_Y : 0), z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.yawRate = 0;
    this.airborne = false;
    this.airTime = 0;
    this.pitch = this.roll = this.heave = this.pitchV = this.rollV = this.heaveV = 0;
    this.lastSafe.copy(this.position);
    this.sync(0);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // ------------------------------------------------------------ damage

  /** Apply damage (armor reduces it). Returns hp removed. */
  damage(amount: number, x = this.position.x, z = this.position.z): number {
    if (!(amount > 0) || this.health <= 0) return 0;
    const before = this.health;
    this.health = applyDamage(this.health, amount);
    const d = before - this.health;
    if (d > 0) this.onDamage?.(d, x, z);
    return d;
  }

  repair(): void {
    this.health = this.maxHealth;
    this.engineOn = true;
    this.resetDents();
  }

  /** Push vertices near a world point inward (cheap dents; player car only). */
  dent(px: number, py: number, pz: number, amount: number): void {
    if (!this.dentable || amount <= 0.002 || this.dentTotal > 3) return;
    const a = Math.min(0.12, amount);
    this.dentTotal += a;
    const wheelSet = new Set<THREE.Object3D>();
    for (const w of this.wheels) w.traverse((o) => wheelSet.add(o));
    this.root.updateMatrixWorld(true);
    this.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || wheelSet.has(mesh) || this.dentTotal > 3) return;
      const ws = mesh.getWorldScale(_q).x || 1;
      _v.set(px, py, pz);
      mesh.worldToLocal(_v);
      const g0 = mesh.geometry;
      if (!g0.boundingSphere) g0.computeBoundingSphere();
      const bs = g0.boundingSphere!;
      const rad = 0.9 / ws;
      if (bs.center.distanceTo(_v) > bs.radius + rad) return;
      if (!this.dents.has(mesh)) {
        this.dents.set(mesh, g0);
        mesh.geometry = g0.clone();
      }
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const cx = bs.center.x, cy = bs.center.y, cz = bs.center.z;
      let moved = false;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const dx = x - _v.x, dy = y - _v.y, dz = z - _v.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > rad * rad) continue;
        const f = 1 - Math.sqrt(d2) / rad;
        const tx = cx - x, ty = cy - y, tz = cz - z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        const push = (a / ws) * f * f;
        pos.setXYZ(i, x + (tx / tl) * push, y + (ty / tl) * push * 0.5, z + (tz / tl) * push);
        moved = true;
      }
      if (moved) {
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      }
    });
  }

  resetDents(): void {
    for (const [mesh, g] of this.dents) {
      mesh.geometry.dispose();
      mesh.geometry = g;
    }
    this.dents.clear();
    this.dentTotal = 0;
  }

  // ------------------------------------------------------------ look & panels

  applyLook(look: Look): void {
    this.look = { ...look };
    this.color = look.color;
    const p = customPaint(look.color, look.finish);
    for (const s of this.paintSlots) setSlot(s, p);
    const rim = look.wheel ? new THREE.MeshStandardMaterial({ color: look.wheel, metalness: 0.85, roughness: 0.25 }) : rimMat;
    for (const s of this.rimSlots) setSlot(s, rim);
    const t = Math.max(0, Math.min(3, Math.round(look.tint)));
    const glass = t === 0 ? glassMat : glassMat.clone();
    if (t > 0) {
      glass.color.set(['#16202e', '#0e131c', '#07090e', '#020203'][t]);
      glass.opacity = 0.88 + t * 0.035;
    }
    for (const s of this.glassSlots) setSlot(s, glass);
    for (const k of Object.keys(this.panels) as PanelId[]) {
      const pv = this.panels[k].pivot;
      if (pv) pv.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = p; });
    }
  }

  isPanelOpen(id: PanelId): boolean {
    return this.panels[id].open;
  }

  setPanel(id: PanelId, open: boolean): void {
    const p = this.panels[id];
    p.open = open;
    if (open && !p.pivot) p.pivot = this.makePanel(id);
  }

  private makePanel(id: PanelId): THREE.Group {
    const W = this.def.width, L = this.def.length;
    const mat = this.paintSlots.length ? (materialOf(this.paintSlots[0]) ?? paint(this.color)) : paint(this.color);
    const pivot = new THREE.Group();
    let panel: THREE.Mesh;
    const top = Math.max(0.9, Math.min(1.3, this.height * 0.62));
    if (id === 'doorL' || id === 'doorR') {
      const s = id === 'doorL' ? 1 : -1;
      pivot.position.set(s * (W / 2 + 0.02), 0.45, 0.65);
      panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, top - 0.45, 1.15), mat);
      panel.position.set(0, (top - 0.45) / 2, -0.575);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.9), glassMat);
      win.position.set(0, top - 0.45 + 0.19, -0.5);
      pivot.add(win);
    } else if (id === 'hood') {
      pivot.position.set(0, top - 0.05, L / 2 - 1.35);
      panel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, 0.05, 1.2), mat);
      panel.position.set(0, 0, 0.6);
    } else {
      pivot.position.set(0, top + 0.05, -L / 2 + 1.1);
      panel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, 0.05, 1.0), mat);
      panel.position.set(0, 0, -0.5);
    }
    panel.castShadow = true;
    pivot.add(panel);
    pivot.visible = false;
    this.body.add(pivot);
    return pivot;
  }

  private animatePanels(dt: number): void {
    for (const k of Object.keys(this.panels) as PanelId[]) {
      const p = this.panels[k];
      if (!p.pivot) continue;
      const target = p.open ? 1 : 0;
      p.angle += (target - p.angle) * Math.min(1, dt * 5);
      p.pivot.visible = p.angle > 0.03;
      const a = p.angle;
      if (k === 'doorL') p.pivot.rotation.y = a * 1.05;
      else if (k === 'doorR') p.pivot.rotation.y = -a * 1.05;
      else if (k === 'hood') p.pivot.rotation.x = -a * 0.95;
      else p.pivot.rotation.x = a * 1.0;
    }
  }

  /** Local seat point → world (driver or passenger). */
  seatWorld(out: THREE.Vector3, passenger = false): THREE.Vector3 {
    const s = (passenger ? this.def.passengerSeat : this.def.seat) ?? [0.4, 0.5, 0];
    out.set(s[0], s[1], s[2]);
    this.body.updateMatrixWorld(true);
    return this.body.localToWorld(out);
  }

  /** Visual body rotation (for seating riders). */
  get bodyRoll(): number {
    return this.roll + this.lean;
  }

  /** World position of a local point on the (tilted) body. */
  localToWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(x, y, z);
    this.body.updateMatrixWorld(true);
    return this.body.localToWorld(out);
  }

  // ------------------------------------------------------------ physics

  private groundAt(world: CollisionWorld, x: number, z: number, y: number): number {
    return Math.max(world.groundHeight(x, z, y + 0.5), rampHeightAt(x, z));
  }

  update(dt: number, world: CollisionWorld): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    const m = this.medium;
    if (m === 'air') this.updateAir(dt, world);
    else if (m === 'water' || (m === 'amphibious' && (isWater(this.position.x, this.position.z) || this.inWater && !isSand(this.position.x, this.position.z)))) this.updateWater(dt, world);
    else this.updateLand(dt, world);
    // stability guard: never let NaN/Infinity escape into the world
    const p = this.position, v = this.velocity;
    if (!Number.isFinite(p.x + p.y + p.z + v.x + v.y + v.z + this.yaw)) {
      p.copy(this.lastSafe);
      v.set(0, 0, 0);
      this.speed = 0;
      this.yawRate = 0;
      if (!Number.isFinite(this.yaw)) this.yaw = 0;
    } else this.lastSafe.copy(p);
    this.sync(dt);
  }

  /** Engine force direction & strength this frame (0 when dead or off). */
  private throttleInput(): number {
    const t = this.controls.throttle;
    if (!Number.isFinite(t)) return 0;
    if ((!this.engineOn || this.health <= 0) && !this.def.pedal) return Math.min(0, t) * 0.0001; // no drive; brake handled separately
    return Math.max(-1, Math.min(1, t));
  }

  /** Shared longitudinal model. Returns the new forward speed. */
  private longitudinal(vF: number, dt: number, maxV: number, accel: number, drag: number): number {
    const c = this.controls;
    const t = this.throttleInput();
    const rawT = Number.isFinite(c.throttle) ? c.throttle : 0;
    const brake = this.stats.brake;
    this.braking = false;
    if (t > 0) {
      if (vF < -0.5) { vF = Math.min(0, vF + brake * dt); this.braking = true; }
      else vF += accel * t * torqueCurve(Math.max(0, vF) / maxV) * dt;
    } else if (rawT < 0) {
      if (vF > 0.5) { vF = Math.max(0, vF - brake * dt); this.braking = true; }
      else if (t < 0) vF = Math.max(-maxV * 0.35, vF - accel * 0.6 * dt);
    } else {
      vF *= Math.max(0, 1 - dt * drag);
      if (Math.abs(vF) < 0.15) vF = 0;
    }
    if (vF > maxV) vF += (maxV - vF) * Math.min(1, dt * 2);
    if (vF < -maxV * 0.4) vF = -maxV * 0.4;
    if (c.handbrake) {
      vF *= Math.max(0, 1 - dt * (this.medium === 'land' ? 1.2 : 0.8));
      if (Math.abs(vF) > 2) this.braking = true;
    }
    return vF;
  }

  private updateLand(dt: number, world: CollisionWorld): void {
    const d = this.def, c = this.controls, s = this.stats;
    const p = this.position, vel = this.velocity;
    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const vF0 = vel.x * fx + vel.z * fz;
    let latX = vel.x - fx * vF0, latZ = vel.z - fz * vF0;
    const nitro = this.nitroActive && this.upgrades.nitro && this.nitro > 0 && this.engineOn && this.health > 0;
    const maxV = s.maxSpeed * this.speedMult * (nitro ? 1.3 : 1);
    const amphib = this.medium === 'amphibious';
    this.onSand = isSand(p.x, p.z) || amphib;
    const surf = this.onSand ? (amphib ? 0.9 : d.offroad ?? 0.75) : 1;
    let vF = vF0;
    const steerIn = Number.isFinite(c.steer) ? Math.max(-1, Math.min(1, c.steer)) : 0;

    if (!this.airborne) {
      const sandDrag = this.onSand ? (amphib ? 1.4 : Math.max(0, 1.1 - (d.offroad ?? 0.75)) * 1.2) : 0;
      vF = this.longitudinal(vF, dt, maxV * (this.onSand && !amphib ? Math.min(1, (d.offroad ?? 0.75) + 0.15) : 1), s.accel * (nitro ? 1.9 : 1), 0.35 + sandDrag);
      vF *= Math.max(0, 1 - dt * 0.0016 * vF * Math.sign(vF)); // aero
      // steering: speed-scaled, reversed when backing up, tighter at low speed
      const speedFactor = Math.min(1, Math.abs(vF) / 6) * (vF < -0.2 ? -1 : 1);
      const highSpeed = 1 - Math.min(0.5, (Math.abs(vF) / Math.max(1, s.maxSpeed)) * 0.5);
      const latSpeed = Math.hypot(latX, latZ);
      this.slipAngle = Math.atan2(latSpeed, Math.abs(vF) + 0.5);
      const drifting = (c.handbrake && Math.abs(vF) > 7) || this.slipAngle > 0.22;
      const target = steerIn * s.turn * speedFactor * highSpeed * (c.handbrake ? 1.45 : 1) * (drifting ? 1.15 : 1);
      this.yawRate += (target - this.yawRate) * Math.min(1, dt * 9);
      this.yaw += this.yawRate * dt;
      // engine/brake force acts along the old heading; momentum keeps its direction while the body rotates
      vel.x += fx * (vF - vF0);
      vel.z += fz * (vF - vF0);
      // tire grip curve: lateral speed bleeds off; less while sliding/handbraking
      const g = s.grip * gripCurve(this.slipAngle) * surf * (c.handbrake ? 0.16 : 1) * (d.twoWheel ? 1.2 : 1);
      const keep = Math.max(0, 1 - g * dt);
      fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
      const vF2 = vel.x * fx + vel.z * fz;
      latX = (vel.x - fx * vF2) * keep; latZ = (vel.z - fz * vF2) * keep;
      vel.x = fx * vF2 + latX;
      vel.z = fz * vF2 + latZ;
      this.slip = Math.hypot(latX, latZ);
    } else {
      // in the air: keep momentum, light air control
      this.yawRate *= Math.max(0, 1 - dt * 1.5);
      this.yaw += (this.yawRate + steerIn * 0.5) * dt;
      vel.x *= 1 - dt * 0.02;
      vel.z *= 1 - dt * 0.02;
      this.slip = 0;
      this.braking = false;
    }
    this.speed = vel.x * Math.sin(this.yaw) + vel.z * Math.cos(this.yaw);
    if (nitro) this.nitro = Math.max(0, this.nitro - dt * 0.22);
    else if (this.upgrades.nitro) this.nitro = Math.min(1, this.nitro + dt * 0.05);
    // hard cap (stability)
    const hs = Math.hypot(vel.x, vel.z), cap = s.maxSpeed * 1.6 + 5;
    if (hs > cap) { vel.x *= cap / hs; vel.z *= cap / hs; }

    // integrate horizontally
    const ox = p.x, oz = p.z, oy = p.y;
    p.x += vel.x * dt;
    p.z += vel.z * dt;

    // ground following / airborne
    const gh = this.groundAt(world, p.x, p.z, p.y);
    if (!this.airborne) {
      if (gh > p.y + 0.62) {
        // a wall-like step (ramp side, tall ledge): block it
        p.x = ox; p.z = oz;
        const imp = Math.hypot(vel.x, vel.z);
        vel.x *= -0.25; vel.z *= -0.25;
        this.speed *= -0.25;
        if (imp > 3) { this.onImpact?.(imp / 12); this.damage(impactDamage(imp * 0.8, s.armor)); }
      } else if (gh < p.y - 0.38) {
        // ground fell away (ramp lip, roof edge, big drop)
        const rampBefore = rampHeightAt(ox, oz);
        const vy = rampBefore > 0.3 ? Math.max(0, (rampBefore - rampHeightAt(ox - vel.x * dt, oz - vel.z * dt)) / dt) : 0;
        this.airborne = true;
        this.airTime = 0;
        vel.y = Math.min(25, vy);
        const r = rampAt(ox, oz);
        this.launchRamp = r && rampBefore > r.height * 0.7 ? r.id : null;
        this.launchPos.x = ox; this.launchPos.z = oz;
        if (vel.y > 1 || this.launchRamp) this.onLaunch?.(this.launchRamp);
      } else {
        const step = gh - p.y;
        if (step > 0.06 && !rampAt(p.x, p.z)) this.heaveV -= Math.min(1.6, step * Math.abs(vF) * 0.7); // curb bump
        else if (step < -0.06) this.heaveV += Math.min(0.8, -step * 2);
        p.y = gh;
        vel.y = 0;
      }
    }
    if (this.airborne) {
      vel.y -= GRAVITY * dt;
      if (vel.y < -60) vel.y = -60;
      p.y = oy + vel.y * dt;
      this.airTime += dt;
      const gh2 = this.groundAt(world, p.x, p.z, Math.max(p.y, oy));
      if (p.y <= gh2) {
        const impact = -vel.y;
        p.y = gh2;
        vel.y = 0;
        this.airborne = false;
        this.heaveV -= Math.min(3, impact * 0.28);
        this.pitchV += (this.pitch > 0 ? -1 : 1) * Math.min(2, impact * 0.08);
        const dmg = landingDamage(impact, s.armor);
        if (dmg > 0) this.damage(dmg);
        if (impact > 6) this.onImpact?.(Math.min(1, impact / 25));
        this.onLand?.(impact, this.airTime);
        this.airTime = 0;
      }
    }

    // building collisions: contact circles along the body
    const half = Math.max(0, d.length / 2 - d.width / 2);
    const r = d.width / 2 + 0.05;
    let impact = 0, cx = 0, cz = 0;
    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    for (let k = 0; k < (half > 0 ? 2 : 1); k++) {
      const o = half > 0 ? (k === 0 ? half : -half) : 0;
      const pt = { x: p.x + fx * o, z: p.z + fz * o };
      const bx = pt.x, bz = pt.z;
      const n = world.resolveCircle(pt, r, p.y, 1.4, true, 0.45);
      if (n) {
        p.x += pt.x - bx;
        p.z += pt.z - bz;
        const vn = vel.x * n.nx + vel.z * n.nz;
        if (vn < 0) {
          vel.x -= n.nx * vn * 1.3;
          vel.z -= n.nz * vn * 1.3;
          if (-vn > impact) { impact = -vn; cx = pt.x - n.nx * r; cz = pt.z - n.nz * r; }
        }
      }
    }
    if (impact > 0) {
      vel.x *= 0.75; vel.z *= 0.75;
      this.speed = vel.x * fx + vel.z * fz;
      if (impact > 3) {
        this.onImpact?.(impact / 12);
        const dmg = impactDamage(impact, s.armor);
        this.damage(dmg, cx, cz);
        this.dent(cx, p.y + 0.7, cz, dmg * 0.0012);
        this.pitchV += (impact * 0.05) * (Math.sign(this.speed) || 1);
      }
    }
    // keep land vehicles out of the sea (airboats may enter)
    if (!amphib && isWater(p.x, p.z) && p.y < 1) {
      p.x -= vel.x * dt * 2;
      p.z -= vel.z * dt * 2;
      vel.x *= -0.2; vel.z *= -0.2;
    }
    if (amphib && isWater(p.x, p.z)) { this.inWater = true; p.y = WATER_Y; }
    else if (amphib) this.inWater = false;
    this.suspension(dt, vF0);
  }

  /** Weight transfer → body pitch & roll on damped springs; heave from bumps. */
  private suspension(dt: number, prevFwd: number): void {
    const stiff = this.stats.stiffness;
    const aLong = (this.speed - prevFwd) / dt;
    const aLat = this.speed * this.yawRate;
    let pitchT = 0, rollT = 0;
    if (!this.airborne) {
      pitchT = Math.max(-0.075, Math.min(0.085, -aLong * 0.0075 / stiff));
      rollT = this.def.twoWheel ? 0 : Math.max(-0.08, Math.min(0.08, aLat * 0.0042 / stiff));
    } else {
      pitchT = Math.max(-0.3, Math.min(0.35, -this.velocity.y * 0.022));
    }
    const k = 70 * stiff, c = 9 * Math.sqrt(stiff);
    [this.pitch, this.pitchV] = springStep(this.pitch, this.pitchV, pitchT, this.airborne ? 8 : k, this.airborne ? 4 : c, dt);
    [this.roll, this.rollV] = springStep(this.roll, this.rollV, rollT, k, c, dt);
    [this.heave, this.heaveV] = springStep(this.heave, this.heaveV, 0, 120 * stiff, 11, dt);
    this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch));
    this.roll = Math.max(-0.3, Math.min(0.3, this.roll));
    this.heave = Math.max(-0.25, Math.min(0.25, this.heave));
    // wheelies (bikes): Shift + throttle lifts the front
    if (this.def.canWheelie) {
      const want = this.leanBack && !this.airborne && this.controls.throttle > 0 && this.speed > 1.5 ? (this.def.kind === 'dirtbike' ? 0.62 : 0.5) : 0;
      this.wheelie += (want - this.wheelie) * Math.min(1, dt * (want > this.wheelie ? 2.2 : 4));
      if (this.wheelie < 0.002) this.wheelie = 0;
    }
  }

  private updateWater(dt: number, world: CollisionWorld): void {
    const d = this.def, c = this.controls, s = this.stats;
    const p = this.position, vel = this.velocity;
    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const vF0 = vel.x * fx + vel.z * fz;
    let latX = vel.x - fx * vF0, latZ = vel.z - fz * vF0;
    const nitro = this.nitroActive && this.upgrades.nitro && this.nitro > 0 && this.engineOn && this.health > 0;
    const maxV = s.maxSpeed * this.speedMult * (nitro ? 1.25 : 1);
    let vF = this.longitudinal(vF0, dt, maxV, s.accel * (nitro ? 1.7 : 1), 0.5);
    const steerIn = Number.isFinite(c.steer) ? Math.max(-1, Math.min(1, c.steer)) : 0;
    const speedFactor = Math.min(1, (Math.abs(vF) + (d.pedal ? 1.2 : 0)) / 5) * (vF < -0.2 ? -1 : 1);
    const target = steerIn * s.turn * speedFactor * (c.handbrake ? 1.3 : 1);
    this.yawRate += (target - this.yawRate) * Math.min(1, dt * 3.5);
    this.yaw += this.yawRate * dt;
    const keep = Math.max(0, 1 - s.grip * (c.handbrake ? 0.5 : 1) * dt);
    vel.x += fx * (vF - vF0);
    vel.z += fz * (vF - vF0);
    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    vF = vel.x * fx + vel.z * fz;
    latX = (vel.x - fx * vF) * keep; latZ = (vel.z - fz * vF) * keep;
    vel.x = fx * vF + latX;
    vel.z = fz * vF + latZ;
    vel.y = 0;
    this.slip = Math.hypot(latX, latZ);
    this.slipAngle = Math.atan2(this.slip, Math.abs(vF) + 0.5);
    this.speed = vF;
    if (nitro) this.nitro = Math.max(0, this.nitro - dt * 0.22);
    else if (this.upgrades.nitro) this.nitro = Math.min(1, this.nitro + dt * 0.05);
    this.airborne = false;
    p.x += vel.x * dt;
    p.z += vel.z * dt;
    this.inWater = isWater(p.x, p.z);
    if (!this.inWater) {
      if (this.medium === 'amphibious' && isSand(p.x, p.z)) {
        // airboat slides up onto the sand
        p.y = Math.max(0, this.groundAt(world, p.x, p.z, 0));
      } else {
        p.x -= vel.x * dt * 1.5;
        p.z -= vel.z * dt * 1.5;
        vel.x *= -0.3; vel.z *= -0.3;
        this.speed *= -0.3;
        const imp = Math.abs(vF);
        if (imp > 3) { this.onImpact?.(imp / 10); this.damage(impactDamage(imp * 0.7, s.armor)); }
        this.inWater = true;
      }
    }
    // piers, quay walls
    const pt = { x: p.x, z: p.z };
    const n = world.resolveCircle(pt, d.width / 2 + 0.2, WATER_Y, 1.5, true, 0.6);
    if (n) {
      p.x = pt.x; p.z = pt.z;
      const vn = vel.x * n.nx + vel.z * n.nz;
      if (vn < 0) {
        vel.x -= n.nx * vn * 1.3; vel.z -= n.nz * vn * 1.3;
        if (-vn > 3) { this.onImpact?.(-vn / 12); this.damage(impactDamage(-vn, s.armor)); }
      }
    }
    if (this.inWater) {
      this.bob += dt * (2 + Math.abs(vF) * 0.05);
      const plane = Math.min(0.12, Math.abs(vF) * 0.004);
      p.y = WATER_Y + Math.sin(this.bob) * (d.kind === 'kayak' ? 0.04 : 0.08) + plane;
    }
    if (d.pedal) this.paddleT += dt * (Math.abs(c.throttle) > 0 ? 3.2 : Math.abs(steerIn) > 0 ? 2 : 0);
    // visual: nose lifts with speed, hull rocks on the swell
    const pitchT = -Math.min(0.12, Math.abs(vF) / 220) + Math.sin(this.bob * 1.3) * 0.02;
    const rollT = Math.sin(this.bob) * 0.03 + (d.twoWheel ? 0 : -this.yawRate * Math.abs(vF) * 0.004);
    [this.pitch, this.pitchV] = springStep(this.pitch, this.pitchV, pitchT, 30, 6, dt);
    [this.roll, this.rollV] = springStep(this.roll, this.rollV, rollT, 30, 6, dt);
    this.heave *= 1 - Math.min(1, dt * 4);
  }

  private updateAir(dt: number, world: CollisionWorld): void {
    const p = this.position, vel = this.velocity, s = this.stats;
    const c = this.controls;
    const fl = this.flight ?? { lift: Number.isFinite(c.throttle) ? c.throttle : 0, yaw: Number.isFinite(c.steer) ? c.steer : 0, pitch: 0, roll: 0 };
    this.flight = null;
    const cl = (x: number) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0);
    const lift = cl(fl.lift), yawIn = cl(fl.yaw), pitchIn = cl(fl.pitch), rollIn = cl(fl.roll);
    const powered = this.driver !== null && this.engineOn && this.health > 0;
    this.spool += ((powered ? 1 : 0) - this.spool) * Math.min(1, dt * (powered ? 0.6 : 0.35));
    const gh = this.groundAt(world, p.x, p.z, p.y);
    const grounded = p.y <= gh + 0.03;
    // collective: hover thrust balances gravity at full spool, W/S climbs/descends
    let thrust = this.spool * (GRAVITY + lift * 11);
    if (this.spool < 0.55) thrust *= 0.6;
    vel.y += (thrust - GRAVITY) * dt;
    vel.y *= Math.max(0, 1 - dt * 0.9);
    if (p.y > HELI_CEILING && vel.y > 0) vel.y = 0;
    // cyclic tilt → horizontal acceleration
    const airborneOk = !grounded || lift > 0.1;
    this.tiltF += ((airborneOk ? pitchIn * 0.36 : 0) * this.spool - this.tiltF) * Math.min(1, dt * 2.6);
    this.tiltS += ((airborneOk ? rollIn * 0.32 : 0) * this.spool - this.tiltS) * Math.min(1, dt * 2.6);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const aF = Math.tan(this.tiltF) * GRAVITY * 1.15, aS = Math.tan(this.tiltS) * GRAVITY * 1.15;
    vel.x += (fx * aF + rx * aS) * dt;
    vel.z += (fz * aF + rz * aS) * dt;
    vel.x *= Math.max(0, 1 - dt * 0.38);
    vel.z *= Math.max(0, 1 - dt * 0.38);
    const hs = Math.hypot(vel.x, vel.z), cap = s.maxSpeed * this.speedMult;
    if (hs > cap) { vel.x *= cap / hs; vel.z *= cap / hs; }
    const yawT = yawIn * s.turn * this.spool * (grounded ? 0.25 : 1);
    this.yawRate += (yawT - this.yawRate) * Math.min(1, dt * 2.5);
    this.yaw += this.yawRate * dt;
    p.x += vel.x * dt;
    p.z += vel.z * dt;
    p.y += vel.y * dt;
    this.airborne = !grounded;
    const gh2 = this.groundAt(world, p.x, p.z, Math.max(p.y, gh));
    if (p.y <= gh2) {
      const impact = -vel.y;
      p.y = gh2;
      if (vel.y < 0) vel.y = 0;
      vel.x *= Math.max(0, 1 - dt * 5);
      vel.z *= Math.max(0, 1 - dt * 5);
      if (impact > 7) {
        this.damage(landingDamage(impact + 4, s.armor));
        this.onImpact?.(Math.min(1, impact / 20));
        this.heaveV -= Math.min(2, impact * 0.2);
      }
      this.airborne = false;
    }
    // water: ditching
    if (isWater(p.x, p.z) && p.y < WATER_Y + 0.4) {
      p.y = WATER_Y + 0.4;
      if (vel.y < 0) vel.y = 0;
      vel.x *= 1 - Math.min(1, dt * 3);
      vel.z *= 1 - Math.min(1, dt * 3);
    }
    // buildings: hull circle + rotor disc
    const pt = { x: p.x, z: p.z };
    const n = world.resolveCircle(pt, 1.7, p.y, 3, true, 0.25);
    if (n) {
      p.x = pt.x; p.z = pt.z;
      const vn = vel.x * n.nx + vel.z * n.nz;
      if (vn < 0) {
        vel.x -= n.nx * vn * 1.4; vel.z -= n.nz * vn * 1.4;
        if (-vn > 3) { this.onImpact?.(-vn / 12); this.damage(impactDamage(-vn * 1.2, s.armor)); }
      }
    }
    this.speed = vel.x * fx + vel.z * fz;
    this.slip = 0;
    this.pitch = this.tiltF;
    this.roll = this.tiltS;
    [this.heave, this.heaveV] = springStep(this.heave, this.heaveV, 0, 80, 9, dt);
  }

  // ------------------------------------------------------------ visuals

  sync(dt: number): void {
    const d = this.def;
    this.root.position.copy(this.position);
    this.root.rotation.set(0, this.yaw, 0);
    this.wheelSpin += (this.speed * dt) / this.wheelR;
    if (!Number.isFinite(this.wheelSpin) || Math.abs(this.wheelSpin) > 1e5) this.wheelSpin = 0;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.steerWheels) w.rotation.y = this.controls.steer * 0.45;
    const b = this.body;
    if (d.twoWheel) {
      const target = -this.controls.steer * Math.min(1, Math.abs(this.speed) / (d.kind === 'bicycle' ? 6 : 12)) * (d.kind === 'jetski' ? 0.35 : 0.45);
      this.lean += (target - this.lean) * Math.min(1, dt * 6);
    } else this.lean = 0;
    // wheelie pivots about the rear axle: lift the body so the rear tire stays planted
    const rearArm = Math.max(0.3, d.length / 2 - 0.35);
    b.position.set(0, this.heave - this.stats.lower + Math.sin(this.wheelie) * rearArm, -rearArm * (1 - Math.cos(this.wheelie)));
    b.rotation.set(this.pitch - this.wheelie, 0, this.roll + this.lean);
    for (const r of this.built.rotors) { this.rotorSpin += dt * this.spool * 28; r.rotation.y = this.rotorSpin; }
    for (const r of this.built.tailRotors) r.rotation.x = this.rotorSpin * 1.6;
    const fanOn = this.engineOn && this.health > 0 && this.driver !== null;
    for (const f of this.built.fans) f.rotation.z += dt * (fanOn ? 8 + Math.abs(this.controls.throttle) * 30 : 0);
    if (this.built.paddle) {
      const a = this.paddleT;
      this.built.paddle.rotation.z = Math.sin(a) * 0.6;
      this.built.paddle.rotation.y = Math.cos(a) * 0.35;
    }
    if (this.built.crank) this.built.crank.rotation.x = this.wheelSpin * 0.55;
    if (dt > 0) this.animatePanels(dt);
  }

  get kmh(): number {
    return Math.abs(this.speed) * 3.6;
  }
}

function setSlot(s: Slot, m: THREE.Material): void {
  if (Array.isArray(s.mesh.material)) {
    const arr = s.mesh.material.slice();
    arr[s.index] = m;
    s.mesh.material = arr;
  } else s.mesh.material = m;
}

function materialOf(s: Slot): THREE.Material | null {
  const m = s.mesh.material;
  return Array.isArray(m) ? m[s.index] ?? null : m;
}
