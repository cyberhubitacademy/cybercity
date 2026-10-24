// Applies a Look to the player's rig: material recolors, generated shirt
// patterns (the rig has no UVs, so we add cylindrical ones), hair/bald, and
// procedural accessories (beard, hats, glasses, masks, tattoo patches)
// attached to measured head/arm bone frames.
import * as THREE from 'three';
import type { Rig } from '../../actors/CharacterModel';
import { hawaiianShirt } from '../../world/textures';
import type { Look, Pattern } from './catalog';
import { attachToFrame, ensureUVs, findBone, materialsNamed, measureBone, meshesWithMaterial, type BoneFrame } from '../life/rigtools';

const texCache = new Map<string, THREE.Texture>();

function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

export function patternTexture(p: Pattern, base: string, accent: string): THREE.Texture | null {
  if (p === 'plain') return null;
  if (p === 'hawaiian') {
    const t = hawaiianShirt(base, accent);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }
  return canvasTex(`${p}-${base}-${accent}`, 128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    if (p === 'stripes') {
      g.fillStyle = accent;
      for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 14);
    } else if (p === 'check') {
      g.globalAlpha = 0.55;
      g.fillStyle = accent;
      for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 14, 128); g.fillRect(0, i, 128, 14); }
      g.globalAlpha = 0.25;
      g.fillStyle = '#ffffff';
      for (let i = 20; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
    } else if (p === 'camo') {
      let s = 7;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const cols = [accent, '#6b5a3a', base, '#1d2412'];
      for (let i = 0; i < 46; i++) {
        g.fillStyle = cols[i % cols.length];
        g.beginPath();
        g.ellipse(rnd() * 128, rnd() * 128, 8 + rnd() * 16, 5 + rnd() * 10, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    } else if (p === 'neon') {
      g.strokeStyle = accent;
      g.lineWidth = 3;
      g.shadowColor = accent;
      g.shadowBlur = 6;
      for (let i = 0; i <= 128; i += 32) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
      }
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(64, 40, 16, Math.PI, 0); g.fill();
    }
  });
}

// ---------------------------------------------------------------- tattoos

export function drawTattoo(g: CanvasRenderingContext2D, design: string, w: number, h: number): void {
  const ink = '#1b1f3a';
  g.clearRect(0, 0, w, h);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(3, w / 40);
  g.strokeStyle = ink;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.32;
  const fill = (c: string, a = 0.85) => { g.globalAlpha = a; g.fillStyle = c; g.fill(); g.globalAlpha = 1; g.stroke(); };
  switch (design) {
    case 'rose': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.45, cy - r * 0.3 + Math.sin(a) * r * 0.45, r * 0.5, r * 0.35, a, 0, Math.PI * 2); fill('#ff2fa0');
      }
      g.beginPath(); g.arc(cx, cy - r * 0.3, r * 0.3, 0, Math.PI * 2); fill('#c2185b');
      g.beginPath(); g.moveTo(cx, cy + r * 0.2); g.quadraticCurveTo(cx + r * 0.3, cy + r, cx, cy + r * 1.4); g.stroke();
      g.beginPath(); g.ellipse(cx + r * 0.35, cy + r * 0.7, r * 0.3, r * 0.14, -0.6, 0, Math.PI * 2); fill('#2e9e5b');
      break;
    }
    case 'anchor': {
      g.beginPath(); g.arc(cx, cy - r, r * 0.22, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx, cy - r * 0.78); g.lineTo(cx, cy + r); g.stroke();
      g.beginPath(); g.moveTo(cx - r * 0.5, cy - r * 0.4); g.lineTo(cx + r * 0.5, cy - r * 0.4); g.stroke();
      g.beginPath(); g.arc(cx, cy + r * 0.2, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      break;
    }
    case 'palm': {
      g.beginPath(); g.arc(cx, cy + r * 0.2, r * 0.9, Math.PI, 0); fill('#ff8a3d', 0.7);
      g.beginPath(); g.moveTo(cx - r * 0.1, cy + r * 1.1); g.quadraticCurveTo(cx + r * 0.2, cy, cx + r * 0.05, cy - r * 0.6); g.lineWidth *= 1.6; g.stroke(); g.lineWidth /= 1.6;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI;
        g.beginPath(); g.moveTo(cx + r * 0.05, cy - r * 0.6); g.quadraticCurveTo(cx + Math.cos(a) * r * 0.6, cy - r * 0.9, cx + Math.cos(a) * r, cy - r * 0.5 + Math.abs(Math.sin(a)) * r * 0.1); g.stroke();
      }
      break;
    }
    case 'skull': {
      g.beginPath(); g.arc(cx, cy - r * 0.2, r * 0.8, 0, Math.PI * 2); fill('#f4f1ea');
      g.beginPath(); g.rect(cx - r * 0.45, cy + r * 0.4, r * 0.9, r * 0.5); fill('#f4f1ea');
      for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * 0.32, cy - r * 0.25, r * 0.22, 0, Math.PI * 2); fill('#19e6ff'); }
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - r * 0.1, cy + r * 0.2); g.lineTo(cx + r * 0.1, cy + r * 0.2); g.closePath(); fill(ink);
      break;
    }
    case 'koi': {
      g.beginPath(); g.ellipse(cx, cy, r * 0.45, r * 1.1, 0.3, 0, Math.PI * 2); fill('#ff8a3d');
      g.beginPath(); g.moveTo(cx - r * 0.3, cy + r * 1); g.lineTo(cx - r * 0.7, cy + r * 1.5); g.lineTo(cx + r * 0.1, cy + r * 1.3); g.closePath(); fill('#ff8a3d');
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx + r * 0.1 - i * r * 0.05, cy - r * 0.4 + i * r * 0.4, r * 0.12, 0, Math.PI * 2); fill('#ffffff'); }
      break;
    }
    case 'binary': {
      g.fillStyle = '#19e6ff';
      g.font = `bold ${Math.round(h / 6)}px monospace`;
      g.textAlign = 'center';
      g.fillText('01001110', cx, cy - h * 0.1);
      g.fillText('01000010', cx, cy + h * 0.12);
      g.fillRect(w * 0.05, cy - h * 0.32, w * 0.9, h * 0.04);
      g.fillRect(w * 0.05, cy + h * 0.24, w * 0.9, h * 0.04);
      break;
    }
    case 'heart': {
      g.beginPath();
      g.moveTo(cx, cy + r);
      g.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.5, cy - r * 1.3, cx, cy - r * 0.4);
      g.bezierCurveTo(cx + r * 0.5, cy - r * 1.3, cx + r * 1.6, cy - r * 0.2, cx, cy + r);
      fill('#e0453a');
      g.fillStyle = '#ffffff';
      g.globalAlpha = 1;
      g.fillRect(cx - r * 1.2, cy - r * 0.2, r * 2.4, r * 0.5);
      g.strokeRect(cx - r * 1.2, cy - r * 0.2, r * 2.4, r * 0.5);
      g.fillStyle = ink;
      g.font = `bold ${Math.round(r * 0.42)}px Georgia`;
      g.textAlign = 'center';
      g.fillText('MOM', cx, cy + r * 0.2);
      break;
    }
    case 'bolt': {
      g.beginPath(); g.moveTo(cx + r * 0.2, cy - r * 1.2); g.lineTo(cx - r * 0.5, cy + r * 0.1); g.lineTo(cx, cy + r * 0.1); g.lineTo(cx - r * 0.3, cy + r * 1.2); g.lineTo(cx + r * 0.6, cy - r * 0.2); g.lineTo(cx + r * 0.05, cy - r * 0.2); g.closePath(); fill('#ffd23f');
      break;
    }
    case 'flamingo': {
      g.beginPath(); g.ellipse(cx, cy + r * 0.2, r * 0.6, r * 0.4, -0.3, 0, Math.PI * 2); fill('#ff6fb5');
      g.beginPath(); g.moveTo(cx + r * 0.3, cy); g.quadraticCurveTo(cx + r * 0.6, cy - r * 0.8, cx + r * 0.2, cy - r); g.lineWidth *= 1.5; g.strokeStyle = '#ff6fb5'; g.stroke(); g.strokeStyle = ink; g.lineWidth /= 1.5;
      g.beginPath(); g.arc(cx + r * 0.2, cy - r, r * 0.15, 0, Math.PI * 2); fill('#ff6fb5');
      g.beginPath(); g.moveTo(cx, cy + r * 0.6); g.lineTo(cx, cy + r * 1.4); g.stroke();
      break;
    }
    default: { // tribal
      g.lineWidth = Math.max(5, w / 22);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(w * 0.05, cy + (i - 1) * r * 0.6);
        for (let x = 0; x <= 1; x += 0.1) g.lineTo(w * (0.05 + x * 0.9), cy + (i - 1) * r * 0.6 + Math.sin(x * Math.PI * 3 + i) * r * 0.25);
        g.stroke();
      }
    }
  }
}

function tattooTexture(design: string): THREE.Texture {
  return canvasTex(`tat-${design}`, 128, 128, (g) => drawTattoo(g, design, 128, 128));
}

// ---------------------------------------------------------------- accessories

const M = (color: string, rough = 0.6, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

interface HeadSize { hx: number; hy: number; hz: number }

function capped(r: number, from: number, to: number, color: string, mat?: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, from, to - from), mat ?? M(color));
}

export function buildHat(id: string, s: HeadSize, hairColor: string): THREE.Object3D {
  const g = new THREE.Group();
  const r = Math.max(s.hx, s.hz) * 1.12;
  const top = s.hy * 0.25;
  const add = (o: THREE.Object3D, y = 0, z = 0) => { o.position.y += y; o.position.z += z; g.add(o); return o; };
  void hairColor;
  if (id.startsWith('cap')) {
    const c = id === 'cap-red' ? '#d7263d' : '#1c1c1c';
    add(capped(r, 0, Math.PI * 0.5, c), top);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, r * 0.06, 20, 1, false, -Math.PI / 2, Math.PI), M(c));
    brim.scale.z = 1.2;
    add(brim, top + r * 0.02, r * 0.35);
    add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), M('#ffffff')), top + r * 0.98);
  } else if (id === 'beanie') {
    add(capped(r * 1.04, 0, Math.PI * 0.58, '#7d7f86', M('#7d7f86', 0.95)), top - s.hy * 0.08);
    add(new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.12, 8, 24).rotateX(Math.PI / 2), M('#6a6c72', 0.95)), top - s.hy * 0.05);
  } else if (id === 'bucket') {
    add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 1.02, s.hy * 0.7, 20), M('#e8dcc0', 0.9)), top + s.hy * 0.2);
    add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.5, s.hy * 0.25, 20, 1, true), M('#e8dcc0', 0.9, 0, { side: THREE.DoubleSide })), top - s.hy * 0.12);
  } else {
    // fedora / straw
    const c = id === 'straw' ? '#e3c98d' : '#1d1d22';
    add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.95, s.hy * 0.8, 20), M(c, 0.8)), top + s.hy * 0.3);
    add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.7, r * 1.7, s.hy * 0.05, 24), M(c, 0.8)), top - s.hy * 0.08);
    add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, s.hy * 0.16, 20), M(id === 'straw' ? '#ff2fa0' : '#7b2cff')), top + s.hy * 0.02);
  }
  return g;
}

export function buildGlasses(id: string, s: HeadSize): THREE.Object3D {
  const g = new THREE.Group();
  const frame = M(id === 'aviators' ? '#d4af37' : id === 'neon-shades' ? '#ff2fa0' : '#151515', 0.3, id === 'aviators' ? 0.8 : 0);
  const lensMat = id === 'mirror'
    ? M('#c9d6e3', 0.05, 1)
    : id === 'nerd' ? M('#9fd8ff', 0.05, 0, { transparent: true, opacity: 0.25 })
    : M(id === 'neon-shades' ? '#1a0b2e' : '#2b2216', 0.1, 0.4, { transparent: true, opacity: 0.85 });
  const lr = s.hx * 0.3;
  const y = s.hy * 0.12, z = s.hz * 0.98;
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(lr, 16), lensMat);
    lens.scale.y = id === 'aviators' ? 0.85 : 0.7;
    lens.position.set(side * s.hx * 0.38, y, z);
    g.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(lr, lr * (id === 'nerd' ? 0.18 : 0.08), 6, 18), frame);
    rim.scale.y = lens.scale.y;
    rim.position.copy(lens.position);
    g.add(rim);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(lr * 0.12, lr * 0.12, s.hz * 1.1), frame);
    arm.position.set(side * s.hx * 0.98, y, z - s.hz * 0.55);
    g.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(s.hx * 0.2, lr * 0.12, lr * 0.12), frame);
  bridge.position.set(0, y + lr * 0.2, z);
  g.add(bridge);
  return g;
}

export function buildMask(id: string, s: HeadSize, skin: string): THREE.Object3D {
  const g = new THREE.Group();
  const head = (c: string, k = 1.08, rough = 0.9) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), M(c, rough));
    m.scale.set(s.hx * k, s.hy * 1.04, s.hz * k);
    g.add(m);
    return m;
  };
  const eyes = (c: string, ring?: string) => {
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(s.hx * 0.17, 12), M(c, 0.6));
      e.position.set(side * s.hx * 0.36, s.hy * 0.12, s.hz * 1.09);
      g.add(e);
      if (ring) {
        const rg = new THREE.Mesh(new THREE.TorusGeometry(s.hx * 0.2, s.hx * 0.04, 6, 14), M(ring, 0.5));
        rg.position.copy(e.position);
        g.add(rg);
      }
    }
  };
  if (id === 'ski') { head('#1b1b1f'); eyes(skin); }
  else if (id === 'luchador') { head('#d7263d', 1.08, 0.4); eyes('#111111', '#ffd23f'); }
  else if (id === 'hockey') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14, -Math.PI / 2, Math.PI, 0.1, Math.PI * 0.85), M('#f4f1ea', 0.5));
    m.scale.set(s.hx * 1.06, s.hy * 1.05, s.hz * 1.12);
    g.add(m);
    eyes('#151515');
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(s.hx * 0.05, 8), M('#111111'));
      d.position.set((i % 3 - 1) * s.hx * 0.2, -s.hy * 0.35 - Math.floor(i / 3) * s.hy * 0.15, s.hz * 1.1);
      g.add(d);
    }
  } else if (id === 'flamingo') {
    const m = head('#ff6fb5', 1.25, 0.8);
    m.scale.y = s.hy * 1.25;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(s.hx * 0.3, s.hz * 1.6, 12), M('#222222'));
    beak.rotation.x = Math.PI / 2 + 0.5;
    beak.position.set(0, -s.hy * 0.2, s.hz * 1.6);
    g.add(beak);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(s.hx * 0.32, s.hz * 0.5, 12), M('#f4f1ea'));
    tip.rotation.x = Math.PI / 2 + 0.5;
    tip.position.set(0, -s.hy * 0.05, s.hz * 1.25);
    g.add(tip);
    eyes('#111111', '#ffffff');
  } else {
    // bandana over the lower face
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, -Math.PI * 0.62, Math.PI * 1.24, Math.PI * 0.52, Math.PI * 0.4), M('#c62828', 0.95, 0, { side: THREE.DoubleSide }));
    m.scale.set(s.hx * 1.1, s.hy * 1.08, s.hz * 1.14);
    g.add(m);
  }
  return g;
}

export function buildBeard(kind: string, s: HeadSize, color: string): THREE.Object3D | null {
  if (kind === 'none') return null;
  const g = new THREE.Group();
  const mat = M(color, 0.95, 0, kind === 'stubble' ? { transparent: true, opacity: 0.45, depthWrite: false } : {});
  if (kind === 'full' || kind === 'stubble') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, -Math.PI * 0.55, Math.PI * 1.1, Math.PI * 0.58, Math.PI * 0.4), mat);
    const k = kind === 'full' ? 1.08 : 1.02;
    m.scale.set(s.hx * k, s.hy * (kind === 'full' ? 1.12 : 1.02), s.hz * k);
    g.add(m);
  }
  if (kind === 'goatee' || kind === 'full') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
    m.scale.set(s.hx * 0.28, s.hy * 0.24, s.hz * 0.22);
    m.position.set(0, -s.hy * 0.8, s.hz * 0.78);
    g.add(m);
  }
  if (kind === 'mustache' || kind === 'goatee' || kind === 'full') {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(s.hy * 0.06, s.hx * 0.45, 4, 8), mat);
    m.rotation.z = Math.PI / 2;
    m.position.set(0, -s.hy * 0.32, s.hz * 0.98);
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------- applier

export class Appearance {
  private head: BoneFrame | null = null;
  private headSize: HeadSize = { hx: 0.09, hy: 0.12, hz: 0.1 };
  private slots = new Map<string, THREE.Group>();
  private tatGroups = new Map<string, THREE.Group>();
  private skin = '#c98b5e';
  private appliedMap: THREE.Texture | null = null;
  private measured = false;

  constructor(readonly rig: Rig) {}

  private measure(): void {
    if (this.measured) return;
    this.measured = true;
    const sx = this.rig.root.scale.x, sz = this.rig.root.scale.z;
    this.rig.root.scale.set(1, 1, 1);
    try {
      this.head = measureBone(this.rig, 'Head', { minWeight: 0.6, meshes: ['skin'] });
      if (this.head) {
        const u = this.head.unitsPerMeter;
        this.headSize = { hx: this.head.half.x / u, hy: this.head.half.y / u, hz: this.head.half.z / u };
      }
      const skinMat = materialsNamed(this.rig.root, ['skin'])[0];
      if (skinMat) this.skin = `#${skinMat.color.getHexString()}`;
    } catch (err) {
      console.warn('[shops] head measure failed', err);
    }
    this.rig.root.scale.set(sx, 1, sz);
  }

  /** Is the shirt still ours? (Game may reset the shirt texture on profile refresh.) */
  drifted(look: Look): boolean {
    const mats = materialsNamed(this.rig.root, ['shirt', 'dress', 'lightjacket']);
    const m = mats[0];
    if (!m) return false;
    const want = look.pattern === 'plain' ? null : this.appliedMap;
    return m.map !== want || (look.pattern === 'plain' && `#${m.color.getHexString()}` !== look.shirt.toLowerCase());
  }

  apply(look: Look): void {
    this.measure();
    const root = this.rig.root;
    // shirt
    const shirtMeshes = [...meshesWithMaterial(root, 'shirt'), ...meshesWithMaterial(root, 'lightjacket')];
    const tex = patternTexture(look.pattern, look.shirt, look.accent);
    for (const mesh of shirtMeshes) {
      if (tex) ensureUVs(mesh, 1);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.map = tex;
      mat.color.set(tex ? '#ffffff' : look.shirt);
      mat.needsUpdate = true;
    }
    this.appliedMap = tex;
    for (const m of materialsNamed(root, ['pants'])) m.color.set(look.pants);
    for (const m of materialsNamed(root, ['shoes', 'socks'])) m.color.set(look.shoes);
    for (const m of materialsNamed(root, ['hair', 'hairbase', 'eyebrows'])) m.color.set(look.hair);
    for (const mesh of meshesWithMaterial(root, 'hair')) mesh.visible = !look.bald && !(look.mask && look.mask !== 'bandana');
    // accessories
    this.setSlot('beard', look.mask && look.mask !== 'bandana' ? null : buildBeard(look.beard, this.headSize, look.hair));
    this.setSlot('hat', look.hat && !(look.mask === 'flamingo') ? buildHat(look.hat, this.headSize, look.hair) : null);
    this.setSlot('glasses', look.glasses && look.mask !== 'ski' && look.mask !== 'flamingo' && look.mask !== 'luchador' && look.mask !== 'hockey' ? buildGlasses(look.glasses, this.headSize) : null);
    this.setSlot('mask', look.mask ? buildMask(look.mask, this.headSize, this.skin) : null);
    this.applyTattoos(look.tattoos);
  }

  private setSlot(slot: string, obj: THREE.Object3D | null): void {
    const prev = this.slots.get(slot);
    if (prev) { prev.removeFromParent(); disposeTree(prev); this.slots.delete(slot); }
    if (!obj || !this.head) return;
    obj.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    this.slots.set(slot, attachToFrame(this.head, obj));
  }

  private applyTattoos(t: Record<string, string>): void {
    for (const [slot, g] of this.tatGroups) {
      if (!t[slot]) { g.removeFromParent(); this.tatGroups.delete(slot); }
    }
    const SLOT_BONES: Record<string, string> = { 'forearm-l': 'LowerArmL', 'forearm-r': 'LowerArmR', 'upper-l': 'UpperArmL', 'upper-r': 'UpperArmR', neck: 'Neck' };
    for (const [slot, design] of Object.entries(t)) {
      const prev = this.tatGroups.get(slot);
      if (prev && prev.userData.design === design) continue;
      prev?.removeFromParent();
      const bone = SLOT_BONES[slot];
      if (!bone) continue;
      const patch = this.tattooPatch(bone, slot, design);
      if (patch) { patch.userData.design = design; this.tatGroups.set(slot, patch); }
    }
  }

  /** A curved decal patch wrapped around a limb bone (bone length axis = local Y). */
  private tattooPatch(boneName: string, slot: string, design: string): THREE.Group | null {
    const sx = this.rig.root.scale.x, sz = this.rig.root.scale.z;
    this.rig.root.scale.set(1, 1, 1);
    const f = measureBone(this.rig, boneName, { minWeight: 0.55, meshes: ['skin'] });
    this.rig.root.scale.set(sx, 1, sz);
    if (!f) return null;
    // radius & length around the bone's local Y axis through the centroid
    const bone = findBone(this.rig.root, boneName);
    if (!bone) return null;
    const axis = new THREE.Vector3(0, 1, 0);
    // outward direction: neck -> character right; arms -> forward+up blend (the visible top of the arm)
    const side = slot.endsWith('-l') ? 1 : -1;
    const out = slot === 'neck'
      ? f.right.clone().multiplyScalar(-1)
      : f.forward.clone().multiplyScalar(0.8).addScaledVector(f.up, 0.6).addScaledVector(f.right, side * 0.3);
    out.addScaledVector(axis, -out.dot(axis)).normalize();
    const radius = Math.max(f.half.x, f.half.z, f.half.y) * 0.62;
    const len = slot === 'neck' ? radius * 1.2 : radius * 2.2;
    const theta = Math.atan2(out.x, out.z);
    const arc = slot === 'neck' ? 1.1 : 1.5;
    const geo = new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, len, 14, 1, true, theta - arc / 2, arc);
    const mat = new THREE.MeshStandardMaterial({ map: tattooTexture(design), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    const g = new THREE.Group();
    g.position.copy(f.center);
    g.add(mesh);
    bone.add(g);
    return g;
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) mt.dispose();
    }
  });
}
