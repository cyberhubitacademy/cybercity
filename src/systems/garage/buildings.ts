import * as THREE from 'three';
import type { CollisionWorld } from '../../world/Collision';
import { buildVehicleMesh, VEHICLE_DEFS, type VehicleKind } from '../../vehicles/Vehicle';

// Procedural set pieces for VEHICLES+: Neon Customs (drive-in paint & tuning
// shop on Ocean Drive), Ocean Motors dealership, the safehouse garage next to
// Sunset Shield HQ and the HQ rooftop helipad.

/** Drive-in shop on the city block west of Coral Café, door facing the x=90 avenue. */
export const NEON_CUSTOMS = { x0: 97, x1: 111, z0: 40, z1: 54, bayX: 104.5, bayZ: 47, name: 'Neon Customs' };
/** Showroom on a downtown lot (inland, off the beach). */
export const OCEAN_MOTORS = { x0: 56, x1: 83, z0: -72, z1: -46, doorX: 67, doorZ: -59, name: 'Ocean Motors' };
export const SAFEHOUSE = { x0: 105, x1: 116, z0: -72.5, z1: -65, storeX: 110.5, storeZ: -69.5, doorX: 110.5, doorZ: -75.5, name: 'Safehouse Garage' };
export const HELIPAD = { x: 122, z: -40, y: 36, liftX: 134, liftZ: -34, lobbyX: 130, lobbyZ: -40 };
/** Where owned cars wait outside the safehouse (sidewalk bays north of HQ, nose to the road). */
export const PARKING_BAYS: { x: number; z: number; yaw: number }[] = [121, 125, 129, 133, 137, 141, 145].map((x) => ({ x, z: -68.6, yaw: Math.PI }));
/** Where purchased water craft are delivered. */
export const BOAT_DELIVERY = { x: 246, z: -78, yaw: Math.PI / 2 };

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.7, metal = 0, emissive?: string, ei = 0): THREE.MeshStandardMaterial {
  const k = `${color}|${rough}|${metal}|${emissive ?? ''}|${ei}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? '#000000', emissiveIntensity: ei });
    mats.set(k, m);
  }
  return m;
}

function box(g: THREE.Group, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function solid(col: CollisionWorld, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
  col.add({ x0, x1, z0, z1, y0, y1 });
}

/** Glowing neon text on a transparent plane (canvas texture). */
export function neonSign(text: string, color: string, width: number, height: number, sub?: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.max(64, Math.round((1024 * height) / width));
  const g = c.getContext('2d');
  if (g) {
    g.clearRect(0, 0, c.width, c.height);
    const fs = Math.min(c.height * (sub ? 0.58 : 0.8), (c.width * 1.6) / Math.max(4, text.length));
    g.font = `900 ${fs}px Anton, Bungee, Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const y = sub ? c.height * 0.4 : c.height / 2;
    for (const [blur, alpha] of [[40, 0.9], [18, 1], [6, 1]] as const) {
      g.shadowColor = color;
      g.shadowBlur = blur;
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillText(text, c.width / 2, y);
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.fillText(text, c.width / 2, y);
    if (sub) {
      g.font = `600 ${c.height * 0.2}px Oswald, Rajdhani, sans-serif`;
      g.fillStyle = '#ffffff';
      g.shadowColor = color;
      g.shadowBlur = 12;
      g.fillText(sub, c.width / 2, c.height * 0.82);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), m);
  mesh.renderOrder = 2;
  return mesh;
}

/** Neon tube strip (emissive box). */
function strip(g: THREE.Group, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, i = 2.4): void {
  box(g, x0, x1, y0, y1, z0, z1, mat(color, 0.4, 0, color, i), false);
}

export function buildNeonCustoms(scene: THREE.Scene, col: CollisionWorld): { group: THREE.Group; update: (t: number) => void } {
  const g = new THREE.Group();
  g.name = 'neon-customs';
  const { x0, x1, z0, z1 } = NEON_CUSTOMS;
  const H = 6.2;
  const wall = mat('#2a1f4f', 0.6);
  const trim = mat('#f6f2ff', 0.5);
  box(g, x0, x1, H - 0.3, H + 0.3, z0, z1, mat('#1d1640', 0.7)); // roof
  box(g, x0, x0 + 0.6, 0, H, z0, z0 + 1, trim); // front pillars
  box(g, x0, x0 + 0.6, 0, H, z1 - 1, z1, trim);
  box(g, x0 + 0.6, x1, 0, H, z0, z0 + 0.6, wall);
  box(g, x0 + 0.6, x1, 0, H, z1 - 0.6, z1, wall);
  box(g, x1 - 0.6, x1, 0, H, z0, z1, wall);
  box(g, x0 - 0.2, x0 + 0.4, H - 1.4, H - 0.3, z0, z1, trim); // header over the door
  // glossy floor + turntable lift
  box(g, x0 + 0.6, x1 - 0.6, 0.0, 0.06, z0 + 0.6, z1 - 0.6, mat('#3a3150', 0.25, 0.3), false);
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.08, 40), mat('#c9c2d8', 0.3, 0.8));
  lift.position.set(NEON_CUSTOMS.bayX, 0.08, NEON_CUSTOMS.bayZ);
  lift.receiveShadow = true;
  g.add(lift);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.06, 6, 48).rotateX(Math.PI / 2), mat('#ff2fa0', 0.4, 0, '#ff2fa0', 3));
  ring.position.set(NEON_CUSTOMS.bayX, 0.12, NEON_CUSTOMS.bayZ);
  g.add(ring);
  // tool chests, tire stacks
  for (const z of [z0 + 1.6, z1 - 1.6]) {
    box(g, x1 - 3.5, x1 - 0.6, 0, 1.2, z - 0.5, z + 0.5, mat('#ff2fa0', 0.4, 0.6));
    box(g, x1 - 3.5, x1 - 0.6, 1.2, 1.25, z - 0.5, z + 0.5, mat('#dddddd', 0.3, 0.9));
  }
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.14, 8, 16).rotateX(Math.PI / 2), mat('#141418', 0.9));
    t.position.set(x0 + 2.5, 0.15 + i * 0.28, z1 - 1.6);
    g.add(t);
  }
  // neon interior strips
  strip(g, x0 + 0.7, x1 - 0.7, H - 0.45, H - 0.35, z0 + 0.7, z0 + 0.8, '#19e6ff');
  strip(g, x0 + 0.7, x1 - 0.7, H - 0.45, H - 0.35, z1 - 0.8, z1 - 0.7, '#ff2fa0');
  for (const zz of [z0 + 3, (z0 + z1) / 2, z1 - 3]) strip(g, x1 - 0.7, x1 - 0.62, 0.6, H - 0.7, zz - 0.06, zz + 0.06, '#b14dff', 1.4);
  strip(g, x0 - 0.25, x0 - 0.15, H - 1.4, H - 1.3, z0, z1, '#ffd23f', 3);
  // signs
  const sign = neonSign('NEON CUSTOMS', '#ff2fa0', 14, 3.2, 'PAINT · TUNING · REPAIR');
  sign.position.set(x0 + 0.5, H + 2.0, (z0 + z1) / 2);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  const back = neonSign('NEON CUSTOMS', '#19e6ff', 13, 2.2);
  back.position.set(x0 + 0.42, H - 0.85, (z0 + z1) / 2);
  back.rotation.y = -Math.PI / 2;
  g.add(back);
  // tall pole sign by Ocean Drive
  box(g, x0 + 0.8, x0 + 1.2, 0, 11, z0 - 1.7, z0 - 1.3, mat('#dddddd', 0.4, 0.8));
  const pole = neonSign('CUSTOMS', '#ffd23f', 7, 1.8);
  pole.position.set(x0 + 1, 11.6, z0 - 1.5);
  pole.rotation.y = -Math.PI / 2;
  g.add(pole);
  scene.add(g);
  // colliders: walls + roof (open front)
  solid(col, x0, x1, 0, H, z0, z0 + 0.6);
  solid(col, x0, x1, 0, H, z1 - 0.6, z1);
  solid(col, x1 - 0.6, x1, 0, H, z0, z1);
  solid(col, x0, x1, H - 0.3, H + 0.3, z0, z1);
  solid(col, x0 + 0.7, x0 + 1.3, 0, 11, z0 - 1.8, z0 - 1.2);
  solid(col, x1 - 3.5, x1 - 0.6, 0, 1.25, z0 + 1.1, z0 + 2.1);
  solid(col, x1 - 3.5, x1 - 0.6, 0, 1.25, z1 - 2.1, z1 - 1.1);
  return {
    group: g,
    update: (t) => {
      ring.material = mat(Math.sin(t * 2) > 0 ? '#ff2fa0' : '#19e6ff', 0.4, 0, Math.sin(t * 2) > 0 ? '#ff2fa0' : '#19e6ff', 3);
      lift.rotation.y = t * 0.2;
    },
  };
}

export function buildOceanMotors(scene: THREE.Scene, col: CollisionWorld): { group: THREE.Group; update: (t: number, dt: number) => void } {
  const g = new THREE.Group();
  g.name = 'ocean-motors';
  const { x0, x1, z0, z1 } = OCEAN_MOTORS;
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9fe8ff', roughness: 0.05, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.32 });
  const px0 = x0 + 12;
  // pavilion: white frame, glass walls, flat roof
  box(g, px0, x1, 5.2, 5.6, z0, z1, mat('#f6f2ff', 0.5));
  for (const [x, z] of [[px0, z0], [px0, z1], [x1, z0], [x1, z1], [px0, (z0 + z1) / 2]]) box(g, x - 0.25, x + 0.25, 0, 5.2, z - 0.25, z + 0.25, mat('#f6f2ff', 0.5));
  box(g, px0 - 0.05, px0 + 0.05, 0, 5.2, z0, z1, glass, false);
  box(g, px0, x1, 0, 5.2, z0 - 0.05, z0 + 0.05, glass, false);
  box(g, px0, x1, 0, 5.2, z1 - 0.05, z1 + 0.05, glass, false);
  box(g, x1 - 0.3, x1, 0, 5.2, z0, z1, mat('#19c3d6', 0.6));
  box(g, px0, x1, 0, 0.1, z0, z1, mat('#e8f6ff', 0.2, 0.2), false);
  strip(g, px0 - 0.3, x1, 5.6, 5.75, z0 - 0.1, z0 + 0.1, '#19e6ff');
  strip(g, px0 - 0.3, x1, 5.6, 5.75, z1 - 0.1, z1 + 0.1, '#19e6ff');
  strip(g, px0 - 0.3, px0 - 0.1, 5.6, 5.75, z0, z1, '#ff2fa0');
  const sign = neonSign('OCEAN MOTORS', '#19e6ff', 13, 3, 'NEON BAY PREMIUM AUTOS');
  sign.position.set(px0 - 0.4, 7.6, (z0 + z1) / 2);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  // display podiums with slowly turning cars
  const displays: { holder: THREE.Group }[] = [];
  const showKinds: VehicleKind[] = ['stinger', 'cabrio', 'dirtbike'];
  const spots = [[x0 + 5, z0 + 6], [x0 + 5, (z0 + z1) / 2], [x0 + 5, z1 - 6]];
  showKinds.forEach((k, i) => {
    const [x, z] = spots[i];
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.1, 0.4, 36), mat('#f6f2ff', 0.3, 0.3));
    pod.position.set(x, 0.2, z);
    pod.receiveShadow = true;
    g.add(pod);
    const r = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.05, 6, 40).rotateX(Math.PI / 2), mat('#19e6ff', 0.4, 0, '#19e6ff', 3));
    r.position.set(x, 0.41, z);
    g.add(r);
    const holder = new THREE.Group();
    holder.position.set(x, 0.4, z);
    try {
      const def = VEHICLE_DEFS[k];
      const built = buildVehicleMesh(def, def.colors[i % def.colors.length]);
      holder.add(built.root);
    } catch (err) {
      console.warn('[garage] display car failed', err);
    }
    g.add(holder);
    displays.push({ holder });
    solid(col, x - 2.6, x + 2.6, 0, 1.4, z - 2.6, z + 2.6);
  });
  // inside: a desk
  box(g, x1 - 6, x1 - 3, 0, 1.1, (z0 + z1) / 2 - 1.5, (z0 + z1) / 2 + 1.5, mat('#2a1f4f', 0.4, 0.2));
  scene.add(g);
  solid(col, px0 - 0.3, px0 + 0.3, 0, 5.2, z0, (z0 + z1) / 2 - 3);
  solid(col, px0 - 0.3, px0 + 0.3, 0, 5.2, (z0 + z1) / 2 + 3, z1);
  solid(col, px0, x1, 0, 5.2, z0 - 0.2, z0 + 0.2);
  solid(col, px0, x1, 0, 5.2, z1 - 0.2, z1 + 0.2);
  solid(col, x1 - 0.3, x1, 0, 5.2, z0, z1);
  solid(col, px0, x1, 5.2, 5.6, z0, z1);
  return {
    group: g,
    update: (_t, dt) => { for (const d of displays) d.holder.rotation.y += dt * 0.35; },
  };
}

export function buildSafehouse(scene: THREE.Scene, col: CollisionWorld): THREE.Group {
  const g = new THREE.Group();
  g.name = 'safehouse-garage';
  const { x0, x1, z0, z1 } = SAFEHOUSE;
  const H = 4.4;
  const wall = mat('#ffb3c7', 0.7);
  box(g, x0, x0 + 0.5, 0, H, z0, z1, wall);
  box(g, x1 - 0.5, x1, 0, H, z0, z1, wall);
  box(g, x0, x1, 0, H, z1 - 0.4, z1, wall);
  box(g, x0, x1, H, H + 0.35, z0 - 0.3, z1, mat('#ff2fa0', 0.6));
  box(g, x0 + 0.5, x1 - 0.5, H - 0.9, H, z0, z0 + 0.25, mat('#d8d0e6', 0.5, 0.3)); // rolled-up door
  for (let i = 0; i < 4; i++) box(g, x0 + 0.5, x1 - 0.5, H - 0.85 + i * 0.2, H - 0.8 + i * 0.2, z0 - 0.03, z0, mat('#bdb3cf', 0.5, 0.3), false);
  box(g, x0 + 0.5, x1 - 0.5, 0.0, 0.05, z0 + 0.3, z1 - 0.4, mat('#4a4458', 0.6), false);
  strip(g, x0 + 0.6, x1 - 0.6, H - 0.2, H - 0.1, z1 - 0.6, z1 - 0.5, '#19e6ff');
  const sign = neonSign('SAFEHOUSE', '#19e6ff', 7, 1.4, 'PERSONAL GARAGE');
  sign.position.set((x0 + x1) / 2, H + 1.2, z0 - 0.35);
  sign.rotation.y = Math.PI;
  g.add(sign);
  // painted parking bays outside
  for (const b of PARKING_BAYS) {
    for (const s of [-1, 1]) box(g, b.x + s * 1.9 - 0.06, b.x + s * 1.9 + 0.06, 0.18, 0.2, b.z - 2.6, b.z + 2.6, mat('#ffffff', 0.6), false);
  }
  scene.add(g);
  solid(col, x0, x0 + 0.5, 0, H, z0, z1);
  solid(col, x1 - 0.5, x1, 0, H, z0, z1);
  solid(col, x0, x1, 0, H, z1 - 0.4, z1);
  solid(col, x0, x1, H, H + 0.35, z0 - 0.3, z1);
  return g;
}

export function buildHelipad(scene: THREE.Scene): { group: THREE.Group; update: (t: number) => void } {
  const g = new THREE.Group();
  g.name = 'helipad';
  const { x, z, y } = HELIPAD;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.06, 40), mat('#3a3a48', 0.8));
  pad.position.set(x, y + 0.03, z);
  pad.receiveShadow = true;
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.12, 6, 48).rotateX(Math.PI / 2), mat('#ffd23f', 0.5, 0, '#ffd23f', 1.5));
  ring.position.set(x, y + 0.08, z);
  g.add(ring);
  const hMat = mat('#ffffff', 0.6, 0, '#ffffff', 0.4);
  for (const dx of [-1.2, 1.2]) box(g, x + dx - 0.25, x + dx + 0.25, y + 0.06, y + 0.1, z - 2, z + 2, hMat, false);
  box(g, x - 1.2, x + 1.2, y + 0.06, y + 0.1, z - 0.25, z + 0.25, hMat, false);
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat('#3dffb0', 0.4, 0, '#3dffb0', 3));
    l.position.set(x + Math.cos(a) * 6.2, y + 0.15, z + Math.sin(a) * 6.2);
    g.add(l);
    lights.push(l);
  }
  // elevator hut on the roof
  const { liftX, liftZ } = HELIPAD;
  box(g, liftX - 1.5, liftX + 1.5, y, y + 3, liftZ + 1.2, liftZ + 3.2, mat('#ff9fc8', 0.7));
  strip(g, liftX - 1.2, liftX + 1.2, y + 2.5, y + 2.6, liftZ + 1.15, liftZ + 1.2, '#19e6ff');
  const sign = neonSign('ELEVATOR', '#19e6ff', 2.6, 0.6);
  sign.position.set(liftX, y + 2.85, liftZ + 1.14);
  sign.rotation.y = Math.PI;
  g.add(sign);
  scene.add(g);
  return {
    group: g,
    update: (t) => {
      lights.forEach((l, i) => { l.visible = Math.sin(t * 4 - i * 0.6) > -0.3; });
    },
  };
}
