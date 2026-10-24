import * as THREE from 'three';
import { chromeMat, darkMat, glassMat, headMat, neonMat, paint, rimMat, seatMat, tailMat, tireMat } from './materials';

// Procedural meshes for the VEHICLES+ types (no suitable CC0 models were
// available): jet ski, kayak, airboat, bicycle, dirt bike and helicopter.
// Length runs along +z (front), y up, origin at ground/water contact.

export interface BuiltMesh {
  root: THREE.Group;
  wheels: THREE.Group[];
  steerWheels: THREE.Group[];
  /** Spun about local y (helicopter main rotor). */
  rotors: THREE.Object3D[];
  /** Spun about local x (tail rotor). */
  tailRotors: THREE.Object3D[];
  /** Spun about local z (airboat fan). */
  fans: THREE.Object3D[];
  /** Swung for paddling (kayak). */
  paddle: THREE.Object3D | null;
  /** Pedal crank (bicycle), spun about x. */
  crank: THREE.Object3D | null;
}

export function emptyBuilt(root: THREE.Group): BuiltMesh {
  return { root, wheels: [], steerWheels: [], rotors: [], tailRotors: [], fans: [], paddle: null, crank: null };
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Cylinder between two points. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

function hullProfile(points: [number, number][], width: number, mat: THREE.Material, bevel = 0.08): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function thinWheel(radius: number, width: number, knobby = false): THREE.Group {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius - width * 0.6, width * 0.6, 8, knobby ? 14 : 22).rotateY(Math.PI / 2), tireMat);
  tire.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, width + 0.04, 8).rotateZ(Math.PI / 2), chromeMat);
  g.add(tire, hub);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, (radius - width) * 2, 0.012), rimMat);
    s.rotation.x = (i / 6) * Math.PI;
    g.add(s);
  }
  return g;
}

export function buildJetSki(color: string): BuiltMesh {
  const root = new THREE.Group();
  const out = emptyBuilt(root);
  const body = paint(color);
  root.add(hullProfile([[-1.5, -0.15], [-1.5, 0.35], [-0.4, 0.45], [0.7, 0.62], [1.55, 0.3], [1.2, -0.05], [-1.2, -0.25]], 1.05, paint('#f4f6fb')));
  const top = hullProfile([[-1.3, 0.34], [-0.4, 0.48], [0.7, 0.66], [1.2, 0.42], [0.6, 0.38], [-1.3, 0.3]], 0.9, body, 0.05);
  top.position.y = 0.02;
  root.add(top);
  root.add(box(0.36, 0.14, 1.05, seatMat, 0, 0.6, -0.45));
  root.add(tube(new THREE.Vector3(0, 0.6, 0.45), new THREE.Vector3(0, 0.95, 0.62), 0.04, darkMat));
  root.add(tube(new THREE.Vector3(-0.32, 0.97, 0.6), new THREE.Vector3(0.32, 0.97, 0.6), 0.025, chromeMat));
  root.add(box(1.08, 0.06, 2.6, neonMat('#19e6ff', 1.5), 0, 0.33, -0.1));
  return out;
}

export function buildKayak(color: string): BuiltMesh {
  const root = new THREE.Group();
  const out = emptyBuilt(root);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), paint(color));
  hull.scale.set(0.38, 0.2, 1.8);
  hull.position.y = 0.05;
  hull.castShadow = true;
  const cockpit = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 16), darkMat);
  cockpit.scale.set(1, 1, 1.6);
  cockpit.position.set(0, 0.23, -0.1);
  root.add(hull, cockpit);
  const paddle = new THREE.Group();
  paddle.position.set(0, 0.62, 0.15);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.1, 6).rotateZ(Math.PI / 2), darkMat);
  paddle.add(shaft);
  for (const s of [-1, 1]) {
    const blade = box(0.32, 0.03, 0.16, paint('#ffd23f'), s * 1.08, 0, 0);
    blade.rotation.x = s * 0.6;
    paddle.add(blade);
  }
  root.add(paddle);
  out.paddle = paddle;
  return out;
}

export function buildAirboat(color: string): BuiltMesh {
  const root = new THREE.Group();
  const out = emptyBuilt(root);
  root.add(hullProfile([[-2.3, 0.0], [-2.3, 0.45], [2.0, 0.45], [2.35, 0.25], [2.1, -0.05], [-2.2, -0.1]], 2.1, paint(color)));
  root.add(box(2.0, 0.06, 4.2, paint('#3a3a44'), 0, 0.48, 0));
  // raised driver seat on a frame
  root.add(box(0.7, 0.12, 0.6, seatMat, 0, 1.25, -0.6));
  root.add(box(0.7, 0.6, 0.1, seatMat, 0, 1.55, -0.9));
  for (const x of [-0.3, 0.3]) for (const z of [-0.85, -0.35]) root.add(tube(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(x, 1.2, z), 0.03, chromeMat));
  // fan cage + engine
  const cage = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 28), chromeMat);
  cage.position.set(0, 1.45, -1.75);
  root.add(cage);
  root.add(box(0.5, 0.45, 0.6, darkMat, 0, 0.85, -1.4));
  const fan = new THREE.Group();
  fan.position.set(0, 1.45, -1.7);
  for (let i = 0; i < 2; i++) {
    const blade = box(1.85, 0.16, 0.04, paint('#d9b46a'), 0, 0, 0);
    blade.rotation.z = (i * Math.PI) / 2;
    fan.add(blade);
  }
  root.add(fan);
  out.fans.push(fan);
  for (const x of [-0.45, 0.45]) root.add(box(0.04, 1.1, 0.5, paint('#ff2fa0'), x, 1.3, -2.25));
  root.add(box(2.12, 0.08, 4.0, neonMat('#ff2fa0', 1.5), 0, 0.22, 0));
  return out;
}

function bikeFrame(root: THREE.Group, mat: THREE.Material, rearZ: number, frontZ: number, r: number): void {
  const rear = new THREE.Vector3(0, r, rearZ), front = new THREE.Vector3(0, r, frontZ);
  const seat = new THREE.Vector3(0, r + 0.55, rearZ + 0.35), head = new THREE.Vector3(0, r + 0.62, frontZ - 0.18);
  const crank = new THREE.Vector3(0, r - 0.05, (rearZ + frontZ) / 2 - 0.05);
  for (const [a, b] of [[rear, seat], [seat, crank], [crank, rear], [seat, head], [crank, head], [head, front]] as const) root.add(tube(a, b, 0.025, mat));
}

export function buildBicycle(color: string): BuiltMesh {
  const root = new THREE.Group();
  const out = emptyBuilt(root);
  const r = 0.34, rearZ = -0.52, frontZ = 0.55;
  bikeFrame(root, paint(color), rearZ, frontZ, r);
  root.add(box(0.14, 0.05, 0.26, darkMat, 0, r + 0.6, rearZ + 0.3));
  root.add(tube(new THREE.Vector3(-0.3, r + 0.75, frontZ - 0.25), new THREE.Vector3(0.3, r + 0.75, frontZ - 0.25), 0.018, chromeMat));
  root.add(tube(new THREE.Vector3(0, r + 0.62, frontZ - 0.18), new THREE.Vector3(0, r + 0.76, frontZ - 0.24), 0.02, chromeMat));
  for (const z of [rearZ, frontZ]) {
    const w = thinWheel(r, 0.05);
    w.position.set(0, r, z);
    root.add(w);
    out.wheels.push(w);
    if (z > 0) out.steerWheels.push(w);
  }
  const crank = new THREE.Group();
  crank.position.set(0, r - 0.05, (rearZ + frontZ) / 2 - 0.05);
  crank.add(box(0.03, 0.34, 0.04, chromeMat));
  for (const s of [-1, 1]) crank.add(box(0.1, 0.02, 0.05, darkMat, s * 0.08, s * 0.17, 0));
  root.add(crank);
  out.crank = crank;
  return out;
}

export function buildDirtBike(color: string): BuiltMesh {
  const root = new THREE.Group();
  const out = emptyBuilt(root);
  const r = 0.38, rearZ = -0.68, frontZ = 0.72;
  const body = paint(color);
  root.add(hullProfile([[-0.55, 0.62], [0.1, 0.72], [0.55, 0.95], [0.6, 0.78], [0.1, 0.5], [-0.3, 0.45]], 0.3, body, 0.04));
  root.add(box(0.26, 0.08, 0.8, darkMat, 0, 0.98, -0.3));
  root.add(box(0.2, 0.06, 0.55, body, 0, 0.96, rearZ + 0.1)); // rear fender
  root.add(box(0.16, 0.04, 0.4, body, 0, r * 2 + 0.06, frontZ)); // front fender
  root.add(box(0.34, 0.22, 0.03, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), 0, 1.0, frontZ - 0.12));
  root.add(tube(new THREE.Vector3(0, r, frontZ), new THREE.Vector3(0, 1.12, frontZ - 0.22), 0.035, chromeMat));
  root.add(tube(new THREE.Vector3(-0.36, 1.15, frontZ - 0.25), new THREE.Vector3(0.36, 1.15, frontZ - 0.25), 0.025, darkMat));
  root.add(tube(new THREE.Vector3(0, r, rearZ), new THREE.Vector3(0, 0.7, -0.1), 0.04, chromeMat));
  root.add(box(0.28, 0.3, 0.4, darkMat, 0, 0.55, 0.05)); // engine
  root.add(tube(new THREE.Vector3(0.12, 0.45, 0.1), new THREE.Vector3(0.14, 0.75, -0.75), 0.04, chromeMat)); // exhaust
  for (const z of [rearZ, frontZ]) {
    const w = thinWheel(r, 0.11, true);
    w.position.set(0, r, z);
    root.add(w);
    out.wheels.push(w);
    if (z > 0) out.steerWheels.push(w);
  }
  return out;
}

export function buildHeli(color: string): BuiltMesh {
  const root = new THREE.Group();
  const out = emptyBuilt(root);
  const body = paint(color);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14), body);
  cabin.scale.set(1.05, 0.95, 1.85);
  cabin.position.set(0, 1.35, 0.2);
  cabin.castShadow = true;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat);
  canopy.scale.set(0.98, 0.85, 1.25);
  canopy.position.set(0, 1.4, 0.75);
  canopy.rotation.x = 1.2;
  root.add(cabin, canopy);
  root.add(tube(new THREE.Vector3(0, 1.55, -1.3), new THREE.Vector3(0, 1.85, -5.0), 0.2, body));
  root.add(box(0.08, 1.1, 0.7, body, 0, 2.3, -4.95));
  root.add(box(1.3, 0.06, 0.45, body, 0, 1.9, -4.6));
  root.add(box(2.12, 0.08, 2.4, neonMat('#ff2fa0', 1.6), 0, 1.0, 0.2));
  // skids
  for (const s of [-1, 1]) {
    root.add(tube(new THREE.Vector3(s * 0.95, 0.06, -1.3), new THREE.Vector3(s * 0.95, 0.06, 1.5), 0.05, chromeMat));
    for (const z of [-0.8, 0.9]) root.add(tube(new THREE.Vector3(s * 0.95, 0.06, z), new THREE.Vector3(s * 0.6, 0.75, z), 0.04, chromeMat));
  }
  // rotor mast + blades
  root.add(tube(new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(0, 2.55, 0), 0.08, darkMat));
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.58, 0);
  for (let i = 0; i < 3; i++) {
    const blade = box(0.28, 0.04, 4.6, darkMat, 0, 0, 2.3);
    const arm = new THREE.Group();
    arm.rotation.y = (i / 3) * Math.PI * 2;
    arm.add(blade);
    rotor.add(arm);
  }
  root.add(rotor);
  out.rotors.push(rotor);
  const tail = new THREE.Group();
  tail.position.set(0.18, 2.1, -5.05);
  for (let i = 0; i < 2; i++) {
    const b = box(0.03, 1.1, 0.14, darkMat);
    b.rotation.x = (i * Math.PI) / 2;
    tail.add(b);
  }
  root.add(tail);
  out.tailRotors.push(tail);
  const lamp = box(0.3, 0.12, 0.1, headMat, 0, 0.75, 1.95);
  const beacon = box(0.12, 0.08, 0.12, tailMat, 0, 2.05, -1.8);
  root.add(lamp, beacon);
  return out;
}
