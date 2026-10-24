// 3D builds for activity venues: beach basketball court, mini-golf course,
// beach-bar pool table, rental loungers, fish market stall, fishing rod, and
// the Club Afterglow interior (dance floor, DJ booth, lasers).
import * as THREE from 'three';
import { box, cyl, mat, neonSign } from '../life/world';

export function basketballCourt(): { group: THREE.Group; hoop: THREE.Vector3 } {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#2a6cc4'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#ff8a3d'; x.fillRect(88, 0, 80, 110);
  x.strokeStyle = '#fff'; x.lineWidth = 4;
  x.strokeRect(6, 6, 244, 244);
  x.strokeRect(88, 6, 80, 104);
  x.beginPath(); x.arc(128, 110, 40, 0, Math.PI); x.stroke();
  x.beginPath(); x.arc(128, 20, 112, 0.05, Math.PI - 0.05); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  g.add(floor);
  // hoop at -z end (local), facing +z
  const pole = mat('#cfcfcf', 0.4, 0.6);
  g.add(cyl(0.08, 0.08, 3.2, pole, 0, 1.6, -7.4));
  g.add(box(0.1, 0.1, 1.0, pole, 0, 3.15, -6.95));
  g.add(box(1.8, 1.05, 0.06, mat('#ffffff', 0.4), 0, 3.4, -6.45));
  g.add(box(0.6, 0.45, 0.07, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e0453a', emissiveIntensity: 0.3 }), 0, 3.25, -6.42));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 24), mat('#ff5a1f', 0.4, 0.5));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 3.05, -6.17);
  g.add(rim);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.15, 0.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true }));
  net.position.set(0, 2.85, -6.17);
  g.add(net);
  const sign = neonSign('Beach Court', '#ff8a3d', 4, 1);
  sign.position.set(0, 4.6, -6.5);
  g.add(sign);
  return { group: g, hoop: new THREE.Vector3(0, 3.05, -6.17) };
}

export function basketball(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8701f'; x.fillRect(0, 0, 64, 32);
  x.strokeStyle = '#2a1205'; x.lineWidth = 2;
  for (const xx of [16, 32, 48]) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, 32); x.stroke(); }
  x.beginPath(); x.moveTo(0, 16); x.lineTo(64, 16); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  m.castShadow = true;
  return m;
}

export function miniGolf(): THREE.Group {
  const g = new THREE.Group();
  const turf = mat('#2fae5f', 0.9);
  const rail = mat('#ff2fa0', 0.5);
  const lanes: [number, number, number, number][] = [[-4, -2, 7, 1.6], [3, 0, 1.8, 6], [-2, 3, 8, 1.6]];
  for (const [x, z, w, d] of lanes) {
    g.add(box(w, 0.12, d, turf, x, 0.06, z));
    g.add(box(w, 0.25, 0.1, rail, x, 0.15, z - d / 2));
    g.add(box(w, 0.25, 0.1, rail, x, 0.15, z + d / 2));
  }
  // windmill
  const mill = new THREE.Group();
  mill.add(box(1.2, 2.2, 1.2, mat('#f4f1ea', 0.6), 0, 1.1, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.0, 4), mat('#e0453a', 0.6));
  roof.position.y = 2.7;
  roof.rotation.y = Math.PI / 4;
  mill.add(roof);
  const blades = new THREE.Group();
  blades.position.set(0, 1.9, 0.65);
  for (let i = 0; i < 4; i++) {
    const b = box(0.25, 1.4, 0.05, mat('#ffd23f', 0.6), 0, 0.7, 0);
    const p = new THREE.Group();
    p.rotation.z = (i * Math.PI) / 2;
    p.add(b);
    blades.add(p);
  }
  blades.name = 'blades';
  mill.add(blades);
  mill.position.set(-5.5, 0, 3);
  g.add(mill);
  // flamingo statue
  const fl = new THREE.Group();
  const pink = mat('#ff6fb5', 0.5);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), pink);
  body.scale.set(1.3, 0.8, 0.8);
  body.position.y = 1.2;
  fl.add(body, cyl(0.03, 0.03, 1.0, pink, 0, 0.5, 0), cyl(0.04, 0.05, 0.7, pink, 0.35, 1.6, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), pink);
  head.position.set(0.4, 1.95, 0);
  fl.add(head);
  fl.position.set(3, 0, -3.5);
  g.add(fl);
  const sign = neonSign('Neon Putt', '#3dffb0', 4, 1);
  sign.position.set(0, 3.2, -4);
  g.add(sign, box(4.2, 0.15, 0.15, mat('#ffffff'), 0, 2.6, -4), box(0.15, 2.6, 0.15, mat('#ffffff'), -2, 1.3, -4), box(0.15, 2.6, 0.15, mat('#ffffff'), 2, 1.3, -4));
  return g;
}

export function poolTable(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.7, 0.15, 1.45, mat('#4a2c17', 0.6), 0, 0.8, 0));
  g.add(box(2.54, 0.02, 1.27, mat('#0f6b4f', 0.9), 0, 0.885, 0));
  for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) g.add(box(0.15, 0.75, 0.15, mat('#4a2c17', 0.6), x, 0.38, z));
  const cols = ['#ffd23f', '#2a6cc4', '#e0453a', '#7b2cff', '#ff8a3d', '#2e9e5b', '#111111'];
  cols.forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), mat(c, 0.2));
    b.position.set(0.5 + (i % 3) * 0.06, 0.92, -0.1 + Math.floor(i / 3) * 0.06);
    g.add(b);
  });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, 0.3, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#2e9e5b', emissive: '#ffd27a', emissiveIntensity: 0.4, side: THREE.DoubleSide }));
  lamp.position.y = 2.3;
  g.add(lamp);
  // canopy
  g.add(box(4, 0.1, 3, mat('#ff2fa0', 0.6), 0, 2.9, 0));
  for (const [x, z] of [[-1.9, -1.4], [1.9, -1.4], [-1.9, 1.4], [1.9, 1.4]]) g.add(box(0.1, 2.9, 0.1, mat('#f4f1ea'), x, 1.45, z));
  return g;
}

export function lounger(color: string): THREE.Group {
  const g = new THREE.Group();
  const frame = mat('#f4f4f4', 0.5);
  g.add(box(0.7, 0.08, 1.4, frame, 0, 0.32, 0.3));
  const back = box(0.7, 0.08, 0.8, frame, 0, 0.55, -0.62);
  back.rotation.x = -0.75;
  g.add(back);
  g.add(box(0.66, 0.05, 1.35, mat(color, 0.8), 0, 0.38, 0.3));
  for (const [x, z] of [[-0.3, 0.9], [0.3, 0.9], [-0.3, -0.3], [0.3, -0.3]]) g.add(box(0.05, 0.3, 0.05, frame, x, 0.15, z));
  return g;
}

export function fishStall(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3, 1, 1.2, mat('#2a6cc4', 0.5), 0, 0.5, 0));
  g.add(box(3, 0.1, 1.2, mat('#dfe7f0', 0.2, 0.6), 0, 1.05, 0));
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(['#e0453a', '#9aa3ad', '#3dffb0', '#d9c27a', '#4aa4e0'][i], 0.4));
    f.scale.set(2, 0.6, 0.8);
    f.position.set(-1.1 + i * 0.55, 1.15, 0);
    g.add(f);
  }
  for (const x of [-1.4, 1.4]) g.add(box(0.1, 2.6, 0.1, mat('#f4f1ea'), x, 1.3, -0.5));
  const aw = box(3.4, 0.1, 1.6, mat('#ffffff', 0.6), 0, 2.6, 0.1);
  aw.rotation.x = 0.2;
  g.add(aw);
  const s = neonSign('Pier Fish Market', '#19e6ff', 3.4, 0.8);
  s.position.set(0, 3.2, 0);
  g.add(s);
  return g;
}

export function fishingRod(): { rod: THREE.Group; tip: THREE.Object3D } {
  const rod = new THREE.Group();
  const shaft = cyl(0.008, 0.016, 2.2, mat('#222222', 0.4), 0, 1.1, 0, 6);
  rod.add(shaft);
  const reel = cyl(0.04, 0.04, 0.05, mat('#cfcfcf', 0.3, 0.8), 0.03, 0.3, 0, 10);
  reel.rotation.z = Math.PI / 2;
  rod.add(reel);
  const tip = new THREE.Object3D();
  tip.position.y = 2.2;
  rod.add(tip);
  return { rod, tip };
}

// ---------------------------------------------------------------- club afterglow interior contents

export interface ClubParts {
  tiles: THREE.InstancedMesh;
  lasers: THREE.Mesh[];
  ball: THREE.Mesh;
}

export function clubInterior(g: THREE.Group, w: number, d: number, h: number): ClubParts {
  // dance floor tiles (instanced, colored per frame)
  const n = 8, tile = 1.2;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(tile * 0.96, 0.05, tile * 0.96), new THREE.MeshBasicMaterial({ toneMapped: false }), n * n);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    m.makeTranslation((a - n / 2 + 0.5) * tile, 0.03, (b - n / 2 + 0.5) * tile - 1);
    tiles.setMatrixAt(i, m);
    tiles.setColorAt(i, new THREE.Color('#ff2fa0'));
    i++;
  }
  g.add(tiles);
  // DJ booth
  g.add(box(4, 1.1, 1.2, mat('#151520', 0.4, 0.3), 0, 0.55, -d / 2 + 1.6));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 0.9), new THREE.MeshBasicMaterial({ color: '#7b2cff', toneMapped: false }));
  front.position.set(0, 0.55, -d / 2 + 2.21);
  g.add(front);
  for (const x of [-1.2, 1.2]) g.add(cyl(0.25, 0.25, 0.04, mat('#333', 0.3, 0.6), x, 1.13, -d / 2 + 1.6, 18));
  for (const x of [-3.2, 3.2]) g.add(box(1, 2.2, 0.9, mat('#0b0b10', 0.5), x, 1.1, -d / 2 + 1.2));
  const s = neonSign('AFTERGLOW', '#ff2fa0', 7, 1.8);
  s.position.set(0, h - 1.2, -d / 2 + 0.2);
  g.add(s);
  // bar along the right wall
  g.add(box(1, 1.1, 7, mat('#1a1022', 0.4), w / 2 - 1.2, 0.55, 2));
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 7.1), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#19e6ff', emissiveIntensity: 0.6 }));
  barTop.position.set(w / 2 - 1.2, 1.12, 2);
  g.add(barTop);
  for (let k = 0; k < 6; k++) {
    const bt = cyl(0.05, 0.05, 0.3, new THREE.MeshStandardMaterial({ color: ['#3dffb0', '#ff8a3d', '#c27cff'][k % 3], emissive: ['#3dffb0', '#ff8a3d', '#c27cff'][k % 3], emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }), w / 2 - 0.4, 1.6, -0.5 + k * 1.0, 8);
    g.add(bt);
  }
  g.add(box(0.2, 1.4, 7.5, mat('#0b0b10'), w / 2 - 0.2, 2.0, 2));
  // neon wall strips
  for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), new THREE.MeshBasicMaterial({ color: '#19e6ff', toneMapped: false }));
    strip.position.set(0, h - 0.3, z);
    if (z > 0) strip.rotation.y = Math.PI;
    g.add(strip);
  }
  // lasers (thin additive cones from the ceiling)
  const lasers: THREE.Mesh[] = [];
  const cols = ['#ff2fa0', '#19e6ff', '#3dffb0', '#ffd23f'];
  for (let k = 0; k < 6; k++) {
    const geo = new THREE.CylinderGeometry(0.02, 0.6, h * 1.4, 10, 1, true);
    geo.translate(0, -h * 0.7, 0);
    const l = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[k % 4], transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    l.position.set(-w / 2 + 2 + (k * (w - 4)) / 5, h - 0.1, -d / 2 + 3);
    g.add(l);
    lasers.push(l);
  }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.1, flatShading: true }));
  ball.position.set(0, h - 0.8, -1);
  g.add(ball);
  // booths
  for (const z of [3, 6.5]) {
    g.add(box(3, 0.5, 1, mat('#7b2cff', 0.8), -w / 2 + 2, 0.25, z));
    g.add(box(3, 1, 0.3, mat('#7b2cff', 0.8), -w / 2 + 2, 0.7, z - 0.5));
    g.add(cyl(0.5, 0.5, 0.05, mat('#111', 0.3), -w / 2 + 2, 0.75, z + 1, 16));
  }
  return { tiles, lasers, ball };
}
