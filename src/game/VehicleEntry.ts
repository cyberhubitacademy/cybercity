import * as THREE from 'three';
import type { Vehicle } from '../vehicles/Vehicle';
import type { Rig } from '../actors/CharacterModel';

// Animated car entry/exit and carjacking: walk to the driver's door, swing it
// open, climb in (or drag the current driver out first), sit, close the door.
// Doors are panels added to the car on first use and hinged at their front edge.

type Kind = 'enter' | 'exit' | 'jack';

interface Door {
  hinge: THREE.Group;
  angle: number;
}

interface Seq {
  kind: Kind;
  v: Vehicle;
  t: number;
  stage: number;
  from: THREE.Vector3;
  driver?: Rig;
  onDone: () => void;
}

const DOOR_OPEN = 1.15;
const WALK_TIME = 0.55;
const OPEN_TIME = 0.32;
const SEAT_TIME = 0.5;
const PULL_TIME = 0.55;
const CLOSE_TIME = 0.28;

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function findPaint(root: THREE.Object3D): THREE.Material | null {
  let paint: THREE.Material | null = null;
  root.traverse((o) => {
    if (paint) return;
    const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
    if (m && !Array.isArray(m) && 'clearcoat' in m && m.clearcoat > 0 && !m.transparent) paint = m;
  });
  return paint;
}

function findGlass(root: THREE.Object3D): THREE.Material | null {
  let glass: THREE.Material | null = null;
  root.traverse((o) => {
    if (glass) return;
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && !Array.isArray(m) && m.transparent) glass = m;
  });
  return glass;
}

export class VehicleEntry {
  private seq: Seq | null = null;
  private doors = new WeakMap<Vehicle, Door>();
  private tmp = new THREE.Vector3();

  get busy(): boolean {
    return this.seq !== null;
  }

  /** Vehicles without side doors (bikes, boats, open craft) skip the door animation. */
  static hasDoor(v: Vehicle): boolean {
    return !['bike', 'boat'].includes(v.def.kind) && !/jetski|kayak|airboat|bicycle|dirt/i.test(v.def.kind);
  }

  /** Local seat and door positions (driver on the left: +x when facing +z). */
  seatLocal(v: Vehicle): THREE.Vector3 {
    if (v.def.kind === 'bike') return new THREE.Vector3(0, 0.55, -0.25);
    if (v.def.kind === 'boat') return new THREE.Vector3(0, 0.75, -0.9);
    // low enough that the seated driver's head stays under the roof
    return new THREE.Vector3(v.def.width * 0.2, Math.max(-0.12, v.height * 0.12 - 0.32), -v.def.length * 0.06);
  }

  doorLocal(v: Vehicle): THREE.Vector3 {
    return new THREE.Vector3(v.def.width / 2 + 0.75, 0, -v.def.length * 0.02);
  }

  toWorld(v: Vehicle, local: THREE.Vector3): THREE.Vector3 {
    v.root.updateMatrixWorld(true);
    return v.root.localToWorld(local.clone());
  }

  private door(v: Vehicle): Door | null {
    if (!VehicleEntry.hasDoor(v)) return null;
    let d = this.doors.get(v);
    if (d) return d;
    const W = v.def.width, L = v.def.length, H = v.height;
    const hinge = new THREE.Group();
    hinge.position.set(W / 2 + 0.02, H * 0.28, L * 0.13);
    const paint = findPaint(v.root) ?? new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.35, metalness: 0.4 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, H * 0.36, L * 0.3), paint);
    panel.position.set(0, H * 0.18, -L * 0.15);
    panel.castShadow = true;
    const glassMat = findGlass(v.root) ?? new THREE.MeshPhysicalMaterial({ color: '#16202e', transparent: true, opacity: 0.6, roughness: 0.05 });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, H * 0.24, L * 0.26), glassMat);
    glass.position.set(0, H * 0.48, -L * 0.15);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.16), new THREE.MeshStandardMaterial({ color: '#c8ccd4', metalness: 0.9, roughness: 0.25 }));
    handle.position.set(0.04, H * 0.3, -L * 0.25);
    hinge.add(panel, glass, handle);
    v.root.add(hinge);
    d = { hinge, angle: 0 };
    this.doors.set(v, d);
    return d;
  }

  private setDoor(v: Vehicle, a: number): void {
    const d = this.door(v);
    if (!d) return;
    d.angle = a;
    d.hinge.rotation.y = a; // swings outward around the front edge
  }

  start(kind: Kind, v: Vehicle, playerPos: THREE.Vector3, onDone: () => void, driver?: Rig): void {
    this.seq = { kind, v, t: 0, stage: 0, from: playerPos.clone(), driver, onDone };
    v.controls = { throttle: 0, steer: 0, handbrake: true };
  }

  /**
   * Advance the sequence. Moves/poses the player rig directly.
   * Returns true while a sequence is running.
   */
  update(dt: number, rig: Rig, playerPos: THREE.Vector3): boolean {
    const s = this.seq;
    if (!s) return false;
    const v = s.v;
    // Hold the car still while someone climbs in or out.
    v.velocity.multiplyScalar(Math.max(0, 1 - dt * 10));
    v.controls = { throttle: 0, steer: 0, handbrake: true };
    s.t += dt;
    const doorPos = this.toWorld(v, this.doorLocal(v));
    const seatPos = this.toWorld(v, this.seatLocal(v));
    const faceCar = Math.atan2(v.position.x - doorPos.x, v.position.z - doorPos.z);
    const hasDoor = VehicleEntry.hasDoor(v);
    const stages: { len: number; run: (k: number) => void }[] = [];

    if (s.kind === 'enter' || s.kind === 'jack') {
      // 1. walk to the door
      stages.push({ len: WALK_TIME, run: (k) => {
        playerPos.lerpVectors(s.from, doorPos, ease(k));
        rig.root.position.copy(playerPos);
        rig.body.rotation.y = faceCar;
        rig.animate(dt, 1.6);
      } });
      // 2. open the door
      if (hasDoor) stages.push({ len: OPEN_TIME, run: (k) => { this.setDoor(v, DOOR_OPEN * ease(k)); rig.animate(dt, 0); } });
      if (s.kind === 'jack' && s.driver) {
        // 3. drag the driver out of the seat to the door, facing away
        const d = s.driver;
        stages.push({ len: PULL_TIME, run: (k) => {
          d.root.visible = true;
          d.root.position.lerpVectors(seatPos, doorPos.clone().add(this.tmp.set(0, 0, 0)), ease(k));
          d.body.rotation.y = faceCar + Math.PI;
          d.animate(dt, 0, k < 0.5, k < 0.5);
          rig.animate(dt, 0);
        } });
      }
      // 4. climb into the seat
      stages.push({ len: SEAT_TIME, run: (k) => {
        playerPos.lerpVectors(doorPos, seatPos, ease(k));
        rig.root.position.copy(playerPos);
        rig.body.rotation.y = v.yaw;
        rig.animate(dt, 0, false, k > 0.35);
      } });
      // 5. close the door
      if (hasDoor) stages.push({ len: CLOSE_TIME, run: (k) => { this.setDoor(v, DOOR_OPEN * (1 - ease(k))); this.seat(v, rig, dt); } });
    } else {
      // exit: open, climb out, close
      if (hasDoor) stages.push({ len: OPEN_TIME, run: (k) => { this.setDoor(v, DOOR_OPEN * ease(k)); this.seat(v, rig, dt); } });
      stages.push({ len: SEAT_TIME, run: (k) => {
        playerPos.lerpVectors(seatPos, doorPos, ease(k));
        rig.root.position.copy(playerPos);
        rig.body.rotation.y = faceCar + Math.PI;
        rig.animate(dt, 0, false, k < 0.4);
      } });
      if (hasDoor) stages.push({ len: CLOSE_TIME, run: (k) => { this.setDoor(v, DOOR_OPEN * (1 - ease(k))); rig.animate(dt, 0); } });
    }

    let acc = 0;
    for (const st of stages) {
      if (s.t < acc + st.len) {
        st.run((s.t - acc) / st.len);
        return true;
      }
      acc += st.len;
    }
    // finished
    if (hasDoor) this.setDoor(v, 0);
    this.seq = null;
    s.onDone();
    return false;
  }

  /** Keep a rig sitting in the driver's seat (visible through the windows). */
  seat(v: Vehicle, rig: Rig, dt: number): void {
    const p = this.toWorld(v, this.seatLocal(v));
    rig.root.position.copy(p);
    rig.body.rotation.y = v.yaw;
    rig.animate(dt, 0, false, true);
  }
}
