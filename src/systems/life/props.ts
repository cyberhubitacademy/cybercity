// Procedural props for the life system: food trucks/stands, vending machines,
// the safehouse interior furniture, door frames for street entrances.
import * as THREE from 'three';
import { box, cyl, mat, neonSign, textTexture } from './world';

export function tacoTruck(name: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const body = mat(color, 0.5, 0.2);
  g.add(box(2.3, 2.2, 5.2, body, 0, 1.55, 0));
  g.add(box(2.3, 1.4, 1.6, body, 0, 1.15, 3.3));
  g.add(box(2.2, 0.7, 0.05, mat('#9fd8ff', 0.1, 0.5), 0, 1.6, 4.11));
  // serving hatch on the +x side
  g.add(box(0.05, 0.9, 2.6, mat('#1a1a1a', 0.4), 1.16, 1.9, -0.3));
  const awning = box(0.9, 0.06, 2.9, mat('#ffd23f', 0.6), 1.55, 2.55, -0.3);
  awning.rotation.z = -0.25;
  g.add(awning);
  g.add(box(0.4, 0.08, 2.6, mat('#e8e8e8', 0.4), 1.35, 1.42, -0.3));
  for (const [z, x] of [[-1.6, -1.16], [1.6, -1.16], [-1.6, 1.16], [1.6, 1.16]] as const) {
    const w = cyl(0.42, 0.42, 0.3, mat('#151515', 0.8), x, 0.42, z, 14);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  const sign = neonSign(name, '#ffd23f', 3.4, 0.85);
  sign.position.set(1.18, 3.1, -0.3);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  // menu board
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ map: textTexture('MENU  $', '#ffffff', { bg: '#1a1a1a', font: '700 60px Oswald, sans-serif', w: 256, h: 160 }) }));
  menu.position.set(1.19, 2.0, 1.4);
  menu.rotation.y = Math.PI / 2;
  g.add(menu);
  return g;
}

export function burgerStand(name: string, color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3.4, 1.1, 2.2, mat('#f4f1ea', 0.5), 0, 0.55, 0));
  g.add(box(3.6, 0.1, 2.4, mat('#cfcfcf', 0.4), 0, 1.12, 0));
  for (const x of [-1.6, 1.6]) g.add(box(0.12, 1.6, 0.12, mat('#cfcfcf', 0.4), x, 1.95, -0.9));
  const roof = box(4.2, 0.2, 3.0, mat(color, 0.6), 0, 2.8, -0.2);
  roof.rotation.x = 0.12;
  g.add(roof);
  for (let i = 0; i < 7; i++) g.add(box(0.6, 0.35, 0.06, mat(i % 2 ? '#ffffff' : color, 0.6), -1.8 + i * 0.6, 2.55, 1.2));
  const sign = neonSign(name, color, 3.6, 0.8);
  sign.position.set(0, 3.4, 0.3);
  g.add(sign);
  // stools
  for (const x of [-1, 0, 1]) {
    g.add(cyl(0.2, 0.2, 0.06, mat('#d7263d', 0.6), x, 0.75, 1.6, 12));
    g.add(cyl(0.04, 0.04, 0.75, mat('#cfcfcf', 0.4), x, 0.37, 1.6, 6));
  }
  return g;
}

export function vendingMachine(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.95, 1.9, 0.75, mat('#20202a', 0.4, 0.3), 0, 0.95, 0));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.2), new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: 1.4 }));
  front.position.set(-0.1, 1.15, 0.38);
  g.add(front);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const can = cyl(0.04, 0.04, 0.12, mat(['#e0453a', '#19e6ff', '#ffd23f', '#3dffb0'][(r + c) % 4], 0.4), -0.32 + c * 0.15, 0.7 + r * 0.28, 0.4, 8);
    g.add(can);
  }
  g.add(box(0.18, 0.5, 0.04, mat('#cfcfcf', 0.3, 0.6), 0.35, 1.2, 0.38));
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: textTexture('ICE COLD', color, { font: '700 70px Oswald, sans-serif' }), transparent: true, toneMapped: false }));
  top.position.set(0, 1.78, 0.38);
  g.add(top);
  return g;
}

export function coconutStand(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.2, 1.0, 1.0, mat('#a0703f', 0.9), 0, 0.5, 0));
  for (const x of [-1, 1]) g.add(box(0.1, 2.4, 0.1, mat('#a0703f', 0.9), x, 1.2, -0.4));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 4), mat('#d9b56a', 1));
  roof.position.set(0, 2.8, -0.1);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.7;
  g.add(roof);
  for (let i = 0; i < 6; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat('#4a3a1f', 0.9)).translateX(-0.7 + i * 0.28).translateY(1.12).translateZ(0.1));
  const sign = neonSign('Coco Cabana', color, 2.6, 0.7);
  sign.position.set(0, 2.15, 0.5);
  g.add(sign);
  return g;
}

/** Glowing door frame + awning for a street entrance (faces +z). */
export function doorFrame(name: string, color: string, width = 2.2): THREE.Group {
  const g = new THREE.Group();
  const frame = mat('#f4f1ea', 0.5);
  g.add(box(0.15, 2.6, 0.25, frame, -width / 2, 1.3, 0));
  g.add(box(0.15, 2.6, 0.25, frame, width / 2, 1.3, 0));
  g.add(box(width + 0.3, 0.2, 0.25, frame, 0, 2.65, 0));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.1, 2.5), new THREE.MeshStandardMaterial({ color: '#2a2030', emissive: color, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.4 }));
  door.position.set(0, 1.25, 0.02);
  g.add(door);
  const aw = box(width + 1.2, 0.12, 1.4, mat(color, 0.6), 0, 3.0, 0.6);
  aw.rotation.x = -0.22;
  g.add(aw);
  const sign = neonSign(name, color, Math.max(3.2, name.length * 0.42), 1.0);
  sign.position.set(0, 3.9, 0.15);
  g.add(sign);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.3, 0.06), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  strip.position.set(0, 2.78, 0.14);
  g.add(strip);
  return g;
}

// ---------------------------------------------------------------- safehouse furniture (room coords)

export function bed(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.0, 0.4, 2.3, mat('#4a3328', 0.7), 0, 0.2, 0));
  g.add(box(1.9, 0.25, 2.2, mat('#f4f1ea', 0.9), 0, 0.52, 0.02));
  g.add(box(1.92, 0.12, 1.4, mat('#19c3d6', 0.9), 0, 0.68, 0.4));
  for (const x of [-0.45, 0.45]) g.add(box(0.7, 0.16, 0.4, mat('#ffffff', 0.9), x, 0.72, -0.85));
  g.add(box(2.1, 1.1, 0.12, mat('#4a3328', 0.7), 0, 0.6, -1.15));
  return g;
}

export function wardrobe(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.8, 2.3, 0.7, mat('#e8dcc8', 0.6), 0, 1.15, 0));
  g.add(box(0.02, 2.1, 0.02, mat('#7a6a55', 0.6), 0, 1.15, 0.36));
  for (const x of [-0.12, 0.12]) g.add(box(0.04, 0.3, 0.04, mat('#d4af37', 0.3, 0.8), x, 1.2, 0.37));
  return g;
}

export function fridge(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.85, 1.9, 0.75, mat('#9ff0e0', 0.35, 0.1), 0, 0.95, 0));
  g.add(box(0.83, 0.02, 0.02, mat('#557', 0.4), 0, 1.25, 0.38));
  g.add(box(0.04, 0.4, 0.05, mat('#cfcfcf', 0.3, 0.7), 0.33, 1.55, 0.39));
  g.add(box(0.04, 0.3, 0.05, mat('#cfcfcf', 0.3, 0.7), 0.33, 0.95, 0.39));
  return g;
}

export function counter(len: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(len, 0.9, 0.65, mat('#f4f1ea', 0.6), 0, 0.45, 0));
  g.add(box(len + 0.05, 0.06, 0.7, mat('#ff7f6b', 0.3), 0, 0.93, 0));
  return g;
}

export function couch(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.4, 0.45, 0.9, mat(color, 0.9), 0, 0.3, 0));
  g.add(box(2.4, 0.6, 0.25, mat(color, 0.9), 0, 0.75, -0.35));
  for (const x of [-1.2, 1.2]) g.add(box(0.2, 0.6, 0.9, mat(color, 0.9), x, 0.5, 0));
  return g;
}

export function tvUnit(): { group: THREE.Group; screen: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(box(2.0, 0.5, 0.5, mat('#2a2030', 0.6), 0, 0.25, 0));
  g.add(box(1.5, 0.95, 0.12, mat('#151515', 0.4), 0, 1.15, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.82), new THREE.MeshBasicMaterial({ color: '#05050a', toneMapped: false }));
  screen.position.set(0, 1.15, 0.065);
  g.add(screen);
  return { group: g, screen };
}

export function safeBox(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.8, 0.9, 0.7, mat('#3a3f47', 0.3, 0.8), 0, 0.45, 0));
  const dial = cyl(0.09, 0.09, 0.05, mat('#d4af37', 0.3, 0.8), 0.15, 0.55, 0.36, 16);
  dial.rotation.x = Math.PI / 2;
  g.add(dial);
  g.add(box(0.05, 0.25, 0.05, mat('#cfcfcf', 0.3, 0.8), -0.2, 0.5, 0.37));
  return g;
}

export function mirror(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.9, 1.9, 0.06, mat('#d4af37', 0.3, 0.8), 0, 1.3, 0));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.78), new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.02, metalness: 1 }));
  glass.position.set(0, 1.3, 0.035);
  g.add(glass);
  return g;
}

export function fakeWindow(w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const x = c.getContext('2d')!;
  const gr = x.createLinearGradient(0, 0, 0, 160);
  gr.addColorStop(0, '#2b1055'); gr.addColorStop(0.55, '#ff6f91'); gr.addColorStop(1, '#ffc371');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 160);
  x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(128, 112, 26, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1b1035';
  for (let i = 0; i < 9; i++) { const bw = 14 + (i * 37) % 22, bh = 30 + (i * 53) % 60; x.fillRect(i * 30, 160 - bh, bw, bh); }
  x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(126, 0, 4, 160); x.fillRect(0, 78, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  return m;
}

export function rug(w: number, d: number, color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, 1));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  m.receiveShadow = true;
  return m;
}

export function plant(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.16, 0.4, mat('#ff7f6b', 0.7), 0, 0.2, 0, 12));
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.9, 6), mat('#2e9e5b', 0.8));
    leaf.position.set(Math.cos(i) * 0.1, 0.75, Math.sin(i) * 0.1);
    leaf.rotation.set(Math.sin(i * 2) * 0.4, 0, Math.cos(i * 2) * 0.4);
    g.add(leaf);
  }
  return g;
}
