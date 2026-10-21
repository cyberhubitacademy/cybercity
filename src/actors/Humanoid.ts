import * as THREE from 'three';
import { hawaiianShirt } from '../world/textures';

// Procedural stylized human: capsule limbs with hips/knees/shoulders/elbows,
// so walk, run, idle, jump and sit poses can be animated by rotating pivots.
// Height ~1.8m, feet at y=0.

export interface Outfit {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  shoes?: string;
  pattern?: 'hawaiian' | 'plain' | 'suit' | 'labcoat';
  accent?: string; // flower color for hawaiian prints / tie color for suits
  sunglasses?: boolean;
  hairStyle?: 'short' | 'long' | 'bun' | 'bald' | 'curly';
  build?: number; // 0.9..1.15 width scale
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.7, map?: THREE.Texture): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${map?.uuid ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : color, roughness: rough, map: map ?? null });
    matCache.set(key, m);
  }
  return m;
}

const geo = {
  limbUpper: new THREE.CapsuleGeometry(0.075, 0.28, 4, 10),
  limbLower: new THREE.CapsuleGeometry(0.065, 0.28, 4, 10),
  legUpper: new THREE.CapsuleGeometry(0.1, 0.34, 4, 10),
  legLower: new THREE.CapsuleGeometry(0.085, 0.36, 4, 10),
  torso: new THREE.CapsuleGeometry(0.2, 0.36, 6, 14),
  hips: new THREE.CapsuleGeometry(0.17, 0.12, 4, 12),
  head: new THREE.SphereGeometry(0.13, 20, 16),
  neck: new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10),
  hand: new THREE.SphereGeometry(0.055, 10, 8),
  shoe: new THREE.BoxGeometry(0.12, 0.08, 0.27),
  hairShort: new THREE.SphereGeometry(0.138, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairLong: new THREE.CapsuleGeometry(0.135, 0.18, 4, 12),
  bun: new THREE.SphereGeometry(0.07, 10, 8),
  glasses: new THREE.BoxGeometry(0.22, 0.05, 0.03),
  nose: new THREE.ConeGeometry(0.02, 0.05, 6),
};

export class Humanoid {
  readonly root = new THREE.Group();
  /** Rotates with the character's yaw. */
  readonly body = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private headPivot = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private phase = Math.random() * 10;
  private shirtMesh: THREE.Mesh[] = [];

  constructor(public outfit: Outfit) {
    const o = outfit;
    const build = o.build ?? 1;
    const skin = mat(o.skin, 0.55);
    const pants = mat(o.pants, 0.8);
    const shoes = mat(o.shoes ?? '#f4f4f4', 0.5);
    const shirt = this.shirtMaterial(o);

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.98;

    // hips + legs
    const hipMesh = new THREE.Mesh(geo.hips, pants);
    hipMesh.rotation.z = Math.PI / 2;
    hipMesh.scale.set(1, build, 0.8);
    this.hips.add(hipMesh);
    for (const [leg, knee, side] of [[this.legL, this.kneeL, 1], [this.legR, this.kneeR, -1]] as const) {
      leg.position.set(0.1 * side * build, -0.02, 0);
      this.hips.add(leg);
      const upper = new THREE.Mesh(geo.legUpper, pants);
      upper.position.y = -0.23;
      leg.add(upper);
      knee.position.y = -0.46;
      leg.add(knee);
      const lower = new THREE.Mesh(geo.legLower, pants);
      lower.position.y = -0.22;
      knee.add(lower);
      const shoe = new THREE.Mesh(geo.shoe, shoes);
      shoe.position.set(0, -0.47, 0.05);
      knee.add(shoe);
    }

    // torso
    this.chest.position.y = 0.08;
    this.hips.add(this.chest);
    const torso = new THREE.Mesh(geo.torso, shirt);
    torso.position.y = 0.3;
    torso.scale.set(1.05 * build, 1, 0.68);
    this.chest.add(torso);
    this.shirtMesh.push(torso);
    if (o.pattern === 'suit' || o.pattern === 'labcoat') {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), mat(o.pattern === 'suit' ? o.accent ?? '#ff2fa0' : '#9fe7ff', 0.5));
      tie.position.set(0, 0.36, 0.14);
      this.chest.add(tie);
    }
    const neck = new THREE.Mesh(geo.neck, skin);
    neck.position.y = 0.62;
    this.chest.add(neck);

    // head
    this.headPivot.position.y = 0.66;
    this.chest.add(this.headPivot);
    const head = new THREE.Mesh(geo.head, skin);
    head.position.y = 0.12;
    head.scale.set(0.95, 1.08, 1);
    this.headPivot.add(head);
    const nose = new THREE.Mesh(geo.nose, skin);
    nose.position.set(0, 0.11, 0.13);
    nose.rotation.x = Math.PI / 2;
    this.headPivot.add(nose);
    const hairMat = mat(o.hair, 0.85);
    const style = o.hairStyle ?? 'short';
    if (style !== 'bald') {
      const cap = new THREE.Mesh(geo.hairShort, hairMat);
      cap.position.y = 0.14;
      cap.rotation.x = -0.25;
      this.headPivot.add(cap);
      if (style === 'long') {
        const back = new THREE.Mesh(geo.hairLong, hairMat);
        back.position.set(0, 0.04, -0.05);
        back.scale.set(1, 1, 0.7);
        this.headPivot.add(back);
      } else if (style === 'bun') {
        const bun = new THREE.Mesh(geo.bun, hairMat);
        bun.position.set(0, 0.28, -0.07);
        this.headPivot.add(bun);
      } else if (style === 'curly') {
        cap.scale.setScalar(1.15);
      }
    }
    if (o.sunglasses) {
      const g = new THREE.Mesh(geo.glasses, mat('#111118', 0.15));
      g.position.set(0, 0.14, 0.12);
      this.headPivot.add(g);
    } else {
      const eyeMat = mat('#1a1a22', 0.3);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeMat);
        eye.position.set(0.045 * s, 0.14, 0.12);
        this.headPivot.add(eye);
      }
    }

    // arms
    for (const [arm, elbow, side] of [[this.armL, this.elbowL, 1], [this.armR, this.elbowR, -1]] as const) {
      arm.position.set(0.25 * side * build, 0.52, 0);
      arm.rotation.z = 0.08 * side;
      this.chest.add(arm);
      const upper = new THREE.Mesh(geo.limbUpper, shirt);
      upper.position.y = -0.17;
      upper.scale.setScalar(1.15);
      arm.add(upper);
      this.shirtMesh.push(upper);
      elbow.position.y = -0.34;
      arm.add(elbow);
      const fore = new THREE.Mesh(geo.limbLower, o.pattern === 'suit' || o.pattern === 'labcoat' ? shirt : skin);
      fore.position.y = -0.17;
      elbow.add(fore);
      const hand = new THREE.Mesh(geo.hand, skin);
      hand.position.y = -0.36;
      elbow.add(hand);
    }

    this.root.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = false;
      }
    });
  }

  private shirtMaterial(o: Outfit): THREE.MeshStandardMaterial {
    if (o.pattern === 'hawaiian') return mat(o.shirt, 0.75, hawaiianShirt(o.shirt, o.accent ?? '#ff3d9a'));
    if (o.pattern === 'labcoat') return mat('#f5f7fa', 0.6);
    return mat(o.shirt, o.pattern === 'suit' ? 0.45 : 0.75);
  }

  /** Swap the shirt (cosmetic shop). */
  setShirt(color: string, accent: string): void {
    this.outfit = { ...this.outfit, shirt: color, accent };
    const m = this.shirtMaterial(this.outfit);
    for (const mesh of this.shirtMesh) mesh.material = m;
  }

  /**
   * Pose the rig. speed in m/s (0 idle, ~1.6 walk, ~6 run), airborne for jumps.
   * `seated` poses the character for driving.
   */
  animate(dt: number, speed: number, airborne = false, seated = false): void {
    const s = Math.min(speed, 8);
    const cadence = s < 0.1 ? 0 : 2.2 + s * 0.95;
    this.phase += dt * cadence;
    const p = this.phase;
    this.armL.rotation.z = 0.08;
    this.armR.rotation.z = -0.08;

    if (seated) {
      this.legL.rotation.x = this.legR.rotation.x = -1.45;
      this.kneeL.rotation.x = this.kneeR.rotation.x = 1.45;
      this.armL.rotation.x = this.armR.rotation.x = -1.0;
      this.elbowL.rotation.x = this.elbowR.rotation.x = -0.5;
      this.hips.position.y = 0.55;
      this.chest.rotation.x = -0.05;
      return;
    }
    this.hips.position.y = 0.98;

    if (airborne) {
      this.legL.rotation.x = -0.6; this.kneeL.rotation.x = 0.9;
      this.legR.rotation.x = 0.25; this.kneeR.rotation.x = 0.4;
      this.armL.rotation.x = 0.6; this.armR.rotation.x = -0.8;
      this.elbowL.rotation.x = this.elbowR.rotation.x = -0.5;
      return;
    }

    const run = Math.min(1, Math.max(0, (s - 2) / 3));
    const amp = s < 0.1 ? 0 : 0.45 + run * 0.45;
    const swing = Math.sin(p) * amp;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    // knees bend on the back-swing
    this.kneeL.rotation.x = Math.max(0, -Math.cos(p)) * (0.5 + run * 0.9) + 0.05;
    this.kneeR.rotation.x = Math.max(0, Math.cos(p)) * (0.5 + run * 0.9) + 0.05;
    this.armL.rotation.x = -swing * (0.8 + run * 0.3);
    this.armR.rotation.x = swing * (0.8 + run * 0.3);
    this.elbowL.rotation.x = this.elbowR.rotation.x = -(0.25 + run * 0.9);
    // body bob + lean
    const bob = s < 0.1 ? Math.sin(performance.now() * 0.002) * 0.008 : Math.abs(Math.sin(p)) * (0.03 + run * 0.05);
    this.hips.position.y = 0.98 + bob;
    this.chest.rotation.x = run * 0.18;
    this.chest.rotation.y = Math.sin(p) * 0.08 * amp;
    this.headPivot.rotation.y = s < 0.1 ? Math.sin(performance.now() * 0.0007 + this.phase) * 0.25 : 0;
  }

  /** Short wave gesture for greetings. */
  wave(t: number): void {
    this.armR.rotation.x = -2.6;
    this.armR.rotation.z = -0.3 + Math.sin(t * 10) * 0.25;
    this.elbowR.rotation.x = -0.4;
  }
}
