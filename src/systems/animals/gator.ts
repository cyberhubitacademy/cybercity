// Procedural low-poly alligator (no CC0 gator model was available): segmented
// body + swaying tail, hinged jaw, legs. Swims patrol loops in the harbor
// water or basks on the shore; lunges and bites when Rico gets too close.
import * as THREE from 'three';

const skin = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3e4a2a'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 64; x += 8) { g.fillStyle = '#2f3a1f'; g.fillRect(x, y, 6, 6); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const M = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.75, color: '#ffffff' });
const BELLY = new THREE.MeshStandardMaterial({ color: '#c9c08a', roughness: 0.8 });
const EYE = new THREE.MeshStandardMaterial({ color: '#d9c23a', emissive: '#6b5a00', emissiveIntensity: 0.4 });
const TEETH = new THREE.MeshStandardMaterial({ color: '#f4f1ea' });

export class Gator {
  readonly root = new THREE.Group();
  private tail: THREE.Group[] = [];
  private jaw: THREE.Group;
  private legs: THREE.Group[] = [];
  yaw = 0;
  t = Math.random() * 10;
  snap = 0;
  lunge = 0;
  cooldown = 0;

  constructor(readonly basking: boolean, readonly path: THREE.Vector3[]) {
    const body = new THREE.Group();
    this.root.add(body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.3, 4, 10), M);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1.1, 1, 0.55);
    torso.position.y = 0.25;
    body.add(torso);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.4), BELLY);
    belly.position.y = 0.1;
    body.add(belly);
    // ridges
    for (let i = 0; i < 7; i++) {
      const r = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), M);
      r.position.set(0, 0.45, -0.6 + i * 0.2);
      body.add(r);
    }
    // head + jaws
    const head = new THREE.Group();
    head.position.set(0, 0.28, 0.95);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.75), M);
    skull.position.z = 0.32;
    head.add(skull);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), EYE);
      e.position.set(sx * 0.13, 0.11, 0.08);
      head.add(e);
      for (let k = 0; k < 5; k++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 4), TEETH);
        tooth.rotation.x = Math.PI;
        tooth.position.set(sx * 0.17, -0.1, 0.25 + k * 0.1);
        head.add(tooth);
      }
    }
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.08, 0);
    const jm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.72), BELLY);
    jm.position.z = 0.33;
    jaw.add(jm);
    head.add(jaw);
    this.jaw = jaw;
    body.add(head);
    // tail chain
    let parent: THREE.Object3D = body;
    let z = -0.85;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0.25 : 0, z);
      const w = 0.28 * (1 - i * 0.17);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * 1.4, w * 0.8, 0.42), M);
      m.position.z = -0.2;
      seg.add(m);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
      z = -0.4;
    }
    for (const [x, zz] of [[-0.35, 0.5], [0.35, 0.5], [-0.35, -0.5], [0.35, -0.5]] as const) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.18, zz);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.3), M);
      lm.position.set(x > 0 ? 0.08 : -0.08, -0.08, 0.05);
      leg.add(lm);
      body.add(leg);
      this.legs.push(leg);
    }
    this.root.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    if (path[0]) this.root.position.copy(path[0]);
  }

  private wp = 0;

  update(dt: number): void {
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const swim = !this.basking;
    if (swim && this.path.length > 1 && this.lunge <= 0) {
      const target = this.path[this.wp];
      const p = this.root.position;
      const dx = target.x - p.x, dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) this.wp = (this.wp + 1) % this.path.length;
      const want = Math.atan2(dx, dz);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 0.8);
      p.x += Math.sin(this.yaw) * dt * 1.1;
      p.z += Math.cos(this.yaw) * dt * 1.1;
      p.y = -0.48 + Math.sin(this.t * 1.3) * 0.03; // only back + eyes above the surface
    }
    if (this.lunge > 0) {
      this.lunge -= dt;
      this.root.position.x += Math.sin(this.yaw) * dt * 6;
      this.root.position.z += Math.cos(this.yaw) * dt * 6;
    }
    this.root.rotation.y = this.yaw;
    const sway = swim ? 0.35 : 0.08;
    this.tail.forEach((s, i) => { s.rotation.y = Math.sin(this.t * (swim ? 2.4 : 0.7) - i * 0.7) * sway * (0.6 + i * 0.15); });
    this.legs.forEach((l, i) => { l.rotation.y = swim ? Math.sin(this.t * 2 + i) * 0.4 : 0; });
    // idle jaw gape while basking; snap when biting
    if (this.snap > 0) {
      this.snap -= dt;
      this.jaw.rotation.x = Math.max(0, Math.sin((1 - this.snap / 0.5) * Math.PI)) * 0.8;
    } else this.jaw.rotation.x = this.basking ? 0.25 + Math.sin(this.t * 0.3) * 0.15 : 0.05;
  }

  bite(towardX: number, towardZ: number): void {
    this.yaw = Math.atan2(towardX - this.root.position.x, towardZ - this.root.position.z);
    this.snap = 0.5;
    this.lunge = 0.25;
    this.cooldown = 2.5;
  }
}
