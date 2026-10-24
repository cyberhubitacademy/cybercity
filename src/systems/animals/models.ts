// Lazy-loaded CC0 Quaternius animal models (Poly Pizza) with skinned clones,
// clip lookup, and procedural fallbacks if loading fails.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type AnimalKind = 'dog' | 'cat';

const cache = new Map<AnimalKind, Promise<GLTF | null>>();

export function loadAnimal(kind: AnimalKind): Promise<GLTF | null> {
  let p = cache.get(kind);
  if (!p) {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    p = new GLTFLoader().loadAsync(`${base}models/life/${kind}.glb`).catch((err) => {
      console.warn(`[animals] ${kind} model failed, using fallback`, err);
      return null;
    });
    cache.set(kind, p);
  }
  return p;
}

/** A posable animal: root (position) > body (yaw) > model. */
export class Critter {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  /** Procedural fallback leg wiggle. */
  private legs: THREE.Object3D[] = [];
  private tail: THREE.Object3D | null = null;
  private t = Math.random() * 10;

  constructor(gltf: GLTF | null, kind: AnimalKind, tint?: string) {
    this.root.add(this.body);
    if (gltf) {
      const obj = cloneSkinned(gltf.scene);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      box.getSize(size);
      const want = kind === 'dog' ? 0.62 : 0.34; // shoulder-ish height in meters
      const s = want / (size.y || 1);
      obj.scale.multiplyScalar(s);
      obj.position.y -= box.min.y * s;
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.frustumCulled = false;
        if (tint) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          const mapped = mats.map((mt) => {
            const c = (mt as THREE.MeshStandardMaterial).clone();
            if (/main$/i.test(c.name) || c.name === 'Material') c.color.set(tint);
            return c;
          });
          m.material = Array.isArray(m.material) ? mapped : mapped[0];
        }
      });
      this.body.add(obj);
      this.mixer = new THREE.AnimationMixer(obj);
      for (const clip of gltf.animations) {
        const short = clip.name.split('|').pop() ?? clip.name;
        if (!this.actions.has(short)) this.actions.set(short, this.mixer.clipAction(clip));
      }
      this.play('Idle', 0);
      this.mixer.update(Math.random() * 3);
    } else {
      this.fallback(kind, tint);
    }
  }

  private fallback(kind: AnimalKind, tint?: string): void {
    const col = tint ?? (kind === 'dog' ? '#d9893d' : '#6b6b70');
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
    const k = kind === 'dog' ? 1 : 0.55;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14 * k, 0.4 * k, 4, 8), m);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.4 * k;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * k, 10, 8), m);
    head.position.set(0, 0.55 * k, 0.32 * k);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.08 * k, 0.07 * k, 0.12 * k), m);
    snout.position.set(0, 0.52 * k, 0.45 * k);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04 * k, 0.1 * k, 4), m);
      ear.position.set(sx * 0.07 * k, 0.68 * k, 0.3 * k);
      this.body.add(ear);
    }
    this.body.add(body, head, snout);
    for (const [x, z] of [[-0.08, 0.2], [0.08, 0.2], [-0.08, -0.2], [0.08, -0.2]]) {
      const leg = new THREE.Group();
      leg.position.set(x * k, 0.3 * k, z * k);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * k, 0.03 * k, 0.3 * k, 6), m);
      l.position.y = -0.15 * k;
      leg.add(l);
      this.body.add(leg);
      this.legs.push(leg);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.45 * k, -0.32 * k);
    const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * k, 0.03 * k, 0.25 * k, 6), m);
    tm.position.y = 0.12 * k;
    tail.add(tm);
    tail.rotation.x = -0.6;
    this.body.add(tail);
    this.tail = tail;
    this.body.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  }

  has(name: string): boolean { return this.actions.has(name); }

  play(name: string, fade = 0.25, timeScale = 1): void {
    const a = this.actions.get(name) ?? this.actions.get('Idle');
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === name) return;
    const prev = this.actions.get(this.current);
    a.reset().setEffectiveWeight(1).play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    this.current = name;
  }

  /** speed: m/s for gait selection. */
  update(dt: number, speed: number, special?: string): void {
    this.t += dt;
    if (this.mixer) {
      if (special) this.play(special);
      else if (speed > 2.6) this.play(this.has('Gallop') ? 'Gallop' : 'Run', 0.2, Math.min(1.4, speed / 4));
      else if (speed > 0.15) this.play('Walk', 0.2, Math.max(0.6, Math.min(1.6, speed / 1.2)));
      else this.play('Idle', 0.3);
      this.mixer.update(dt);
    } else {
      const sw = speed > 0.15 ? Math.sin(this.t * (6 + speed * 3)) * 0.5 : 0;
      this.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? sw : -sw) * (i < 2 ? 1 : -1); });
      if (this.tail) this.tail.rotation.z = Math.sin(this.t * (special ? 14 : 5)) * 0.5;
    }
  }
}
