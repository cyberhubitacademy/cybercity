import * as THREE from 'three';
import { BEACH_X, HARBOR_Z, ROADS_X, ROADS_Z, ROAD_WIDTH, SHORE_X, buildBlocks, mulberry32 } from './layout';
import { CityBuilder } from './City';
import { glowSprite } from './textures';
import { pbr } from './City';
import type { Quality } from './Environment';
import { buildStreetDetail } from './StreetDetail';

// Instanced street furniture and the beach/pier. Everything repeated many times
// is an InstancedMesh so the city stays at a few hundred draw calls.

const rnd = mulberry32(777);

/** Curved palm trunk + drooping frond crown, built once and instanced. */
function palmGeometries(): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry; coconuts: THREE.BufferGeometry } {
  const H = 9, bend = 1.4;
  const trunk = new THREE.CylinderGeometry(0.2, 0.34, H, 8, 12);
  trunk.translate(0, H / 2, 0);
  const p = trunk.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / H;
    p.setX(i, p.getX(i) + t * t * bend);
    // ring bands
    const ring = Math.sin(y * 9) > 0.6 ? 0.78 : 1;
    colors.push(0.62 * ring, 0.48 * ring, 0.33 * ring);
  }
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  trunk.computeVertexNormals();

  const verts: number[] = [];
  const cols: number[] = [];
  const idx: number[] = [];
  const top = new THREE.Vector3(bend, H, 0);
  const fronds = 11;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const len = 4.2 + (f % 3) * 0.5;
    const lift = f % 2 === 0 ? 0.9 : 0.4;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const segs = 8;
    const base = verts.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const center = top.clone().addScaledVector(dir, t * len);
      center.y += Math.sin(t * Math.PI * 0.7) * lift - t * t * 2.6;
      const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.75 + 0.05;
      const fold = 0.18 * w;
      for (const sgn of [-1, 0, 1]) {
        const v = center.clone().addScaledVector(side, sgn * w);
        v.y += sgn === 0 ? fold : 0;
        verts.push(v.x, v.y, v.z);
        const g = 0.45 + t * 0.25 + (sgn === 0 ? 0.05 : 0);
        cols.push(0.16 + t * 0.12, g, 0.18);
      }
    }
    for (let s = 0; s < segs; s++) {
      const r0 = base + s * 3, r1 = base + (s + 1) * 3;
      idx.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1, r0 + 1, r1 + 1, r0 + 2, r0 + 2, r1 + 1, r1 + 2);
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  crown.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  crown.setIndex(idx);
  crown.computeVertexNormals();

  const coconuts = new THREE.SphereGeometry(0.22, 8, 6);
  coconuts.translate(bend + 0.25, H - 0.35, 0.1);
  return { trunk, crown, coconuts };
}

export class Props {
  readonly lampHeads: THREE.Vector3[] = [];
  private lampGlow?: THREE.Points;
  private flags: THREE.Object3D[] = [];
  private crowns?: THREE.InstancedMesh;
  private palmMatrices: THREE.Matrix4[] = [];

  constructor(private city: CityBuilder, private quality: Quality = 'high') {}

  build(): void {
    this.roadMarkings();
    this.palms();
    this.streetLights();
    this.beach();
    this.pier();
    this.foliage();
    buildStreetDetail(this.city, this.quality);
  }

  /** Dense tropical shrubs and flowering bougainvillea along sidewalks and lawns. */
  private foliage(): void {
    const leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
    const bush = new THREE.IcosahedronGeometry(1, 1);
    // jitter vertices so every bush reads organic, colour from dark core to bright tips
    const pos = bush.attributes.position as THREE.BufferAttribute;
    const cols: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const j = 0.75 + rnd() * 0.45;
      pos.setXYZ(i, pos.getX(i) * j, Math.max(-0.2, pos.getY(i)) * j * 0.8, pos.getZ(i) * j);
      const t = (pos.getY(i) + 0.3) / 1.3;
      cols.push(0.12 + t * 0.15, 0.38 + t * 0.32, 0.14 + t * 0.08);
    }
    bush.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    bush.computeVertexNormals();
    const flower = new THREE.IcosahedronGeometry(0.75, 0);
    const flowerMat = new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true });
    const spotsB: THREE.Matrix4[] = [];
    const spotsF: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const flowerCols = ['#ff2f8f', '#ff5fb0', '#ff8a3d', '#ffd23f', '#c04dff', '#ff4d6d'];
    const add = (x: number, z: number, s: number) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.15, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6.3, 0)), new THREE.Vector3(s, s * (0.8 + rnd() * 0.5), s));
      spotsB.push(m);
      if (rnd() < 0.45) {
        const fm = new THREE.Matrix4().compose(new THREE.Vector3(x + (rnd() - 0.5) * 0.6, 0.15 + s * 0.75, z + (rnd() - 0.5) * 0.6), new THREE.Quaternion(), new THREE.Vector3(s * 0.7, s * 0.45, s * 0.7));
        spotsF.push({ m: fm, c: new THREE.Color(flowerCols[Math.floor(rnd() * flowerCols.length)]) });
      }
    };
    for (const b of buildBlocks()) {
      // hedge line along the inner edge of each sidewalk
      for (let x = b.x0 + 6; x < b.x1 - 6; x += 3.2 + rnd() * 2.5) {
        if (rnd() < 0.55) add(x, b.z0 + 4.2, 0.55 + rnd() * 0.45);
        if (rnd() < 0.55) add(x, b.z1 - 4.2, 0.55 + rnd() * 0.45);
      }
      for (let z = b.z0 + 6; z < b.z1 - 6; z += 3.4 + rnd() * 2.5) {
        if (rnd() < 0.45) add(b.x0 + 4.2, z, 0.5 + rnd() * 0.4);
        if (rnd() < 0.45) add(b.x1 - 4.2, z, 0.5 + rnd() * 0.4);
      }
    }
    // beach dune grass clumps
    for (let i = 0; i < 160; i++) add(BEACH_X + 3 + rnd() * 14, -250 + rnd() * 440, 0.35 + rnd() * 0.35);
    // keep landmark entrances clear
    const clear = (m: THREE.Matrix4) => {
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      return !(p.x > 100 && p.x < 160 && p.z > -66 && p.z < -14) && !(p.x > 112 && p.x < 160 && p.z > 30 && p.z < 66) && Math.hypot(p.x + 38, p.z + 38) > 30;
    };
    const bushes = spotsB.filter(clear);
    const flowers = spotsF.filter((f) => clear(f.m));
    const bi = new THREE.InstancedMesh(bush, leaf, bushes.length);
    bushes.forEach((m, i) => bi.setMatrixAt(i, m));
    const fi = new THREE.InstancedMesh(flower, flowerMat, flowers.length);
    flowers.forEach((f, i) => { fi.setMatrixAt(i, f.m); fi.setColorAt(i, f.c); });
    for (const inst of [bi, fi]) { inst.castShadow = true; inst.receiveShadow = true; this.city.group.add(inst); }
  }

  private roadMarkings(): void {
    const dash = new THREE.PlaneGeometry(0.28, 3.2);
    dash.rotateX(-Math.PI / 2);
    const yellow = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6, emissive: '#ffb000', emissiveIntensity: 0.05 });
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    const mats: THREE.Matrix4[] = [];
    const cross: THREE.Matrix4[] = [];
    const half = ROAD_WIDTH / 2;
    const near = (v: number, list: readonly number[]) => list.some((c) => Math.abs(v - c) < half + 3);
    for (const x of ROADS_X) {
      for (let z = ROADS_Z[0]; z <= ROADS_Z[ROADS_Z.length - 1]; z += 7) {
        if (near(z, ROADS_Z)) continue;
        mats.push(new THREE.Matrix4().makeTranslation(x, 0.02, z));
      }
    }
    for (const z of ROADS_Z) {
      for (let x = ROADS_X[0]; x <= ROADS_X[ROADS_X.length - 1]; x += 7) {
        if (near(x, ROADS_X)) continue;
        mats.push(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, 0.02, z));
      }
    }
    // zebra crossings on every side of every intersection
    const stripe = new THREE.PlaneGeometry(0.7, 4.2);
    stripe.rotateX(-Math.PI / 2);
    for (const x of ROADS_X) {
      for (const z of ROADS_Z) {
        for (let k = -half + 1; k <= half - 1; k += 1.4) {
          for (const s of [-1, 1]) {
            cross.push(new THREE.Matrix4().makeTranslation(x + k, 0.021, z + s * (half + 2.4)));
            cross.push(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x + s * (half + 2.4), 0.021, z + k));
          }
        }
      }
    }
    const a = new THREE.InstancedMesh(dash, yellow, mats.length);
    mats.forEach((m, i) => a.setMatrixAt(i, m));
    a.receiveShadow = true;
    const b = new THREE.InstancedMesh(stripe, white, cross.length);
    cross.forEach((m, i) => b.setMatrixAt(i, m));
    b.receiveShadow = true;
    this.city.group.add(a, b);
  }

  private palms(): void {
    const spots: [number, number][] = [];
    // Ocean Drive: both sides + the beach promenade
    for (let z = ROADS_Z[0]; z < ROADS_Z[ROADS_Z.length - 1] + 30; z += 13) {
      if (ROADS_Z.some((rz) => Math.abs(z - rz) < 10)) continue;
      spots.push([ROADS_X[5] - ROAD_WIDTH / 2 - 2, z]);
      spots.push([ROADS_X[5] + ROAD_WIDTH / 2 + 2.5, z + 6]);
    }
    // scattered on the beach
    for (let i = 0; i < 46; i++) {
      const x = BEACH_X + 8 + rnd() * (SHORE_X - BEACH_X - 22);
      const z = -250 + rnd() * 440;
      if (Math.abs(z + 120) < 14) continue; // keep pier entrance clear
      spots.push([x, z]);
    }
    // along other avenues and inside residential blocks
    for (const b of buildBlocks()) {
      if (b.district === 'downtown' || b.district === 'harbor' || b.district === 'industrial') {
        for (let x = b.x0 + 6; x < b.x1 - 4; x += 24) spots.push([x, b.z1 - 1.8]);
        continue;
      }
      for (let x = b.x0 + 5; x < b.x1 - 3; x += 16) {
        spots.push([x, b.z0 + 1.8]);
        spots.push([x + 8, b.z1 - 1.8]);
      }
    }
    // keep the HQ lobby, café terrace and market ring clear
    const clear = (x: number, z: number) =>
      !(x > 100 && x < 160 && z > -66 && z < -14) && !(x > 112 && x < 160 && z > 30 && z < 66) && Math.hypot(x + 38, z + 38) > 28;
    const keep = spots.filter(([x, z]) => clear(x, z));

    const { trunk, crown, coconuts } = palmGeometries();
    const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    const nutMat = new THREE.MeshStandardMaterial({ color: '#5a3b1e', roughness: 0.8 });
    const n = keep.length;
    const t = new THREE.InstancedMesh(trunk, trunkMat, n);
    const c = new THREE.InstancedMesh(crown, crownMat, n);
    const k = new THREE.InstancedMesh(coconuts, nutMat, n);
    // separate stream so the variety below doesn't shift the rest of the props' layout
    const vary = mulberry32(4242);
    const lift = new THREE.Matrix4();
    keep.forEach(([x, z], i) => {
      const s = 0.8 + rnd() * 0.55;
      const yaw = rnd() * Math.PI * 2;
      // 0.7x-1.5x height (on top of the original jitter) plus a gentle lean
      const hs = (0.9 + rnd() * 0.35) * (0.7 + vary() * 0.8);
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler((vary() - 0.5) * 0.16, yaw, (vary() - 0.5) * 0.16, 'YXZ'));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), rot, new THREE.Vector3(s, s * hs, s));
      // crown and coconuts keep their shape: uniform scale, lifted to the stretched trunk top
      const cm = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), rot, new THREE.Vector3(s, s, s));
      cm.multiply(lift.makeTranslation(0, 9 * (hs - 1), 0));
      t.setMatrixAt(i, m);
      c.setMatrixAt(i, cm);
      k.setMatrixAt(i, cm);
      this.palmMatrices.push(cm);
      this.city.collision.add({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, y0: 0, y1: 6 });
    });
    for (const m of [t, c, k]) { m.castShadow = true; m.receiveShadow = true; }
    this.crowns = c;
    this.city.group.add(t, c, k);
  }

  private streetLights(): void {
    const pole = new THREE.CylinderGeometry(0.1, 0.14, 7.5, 8);
    pole.translate(0, 3.75, 0);
    const arm = new THREE.BoxGeometry(2.2, 0.14, 0.14);
    arm.translate(1.0, 7.4, 0);
    const head = new THREE.BoxGeometry(0.9, 0.18, 0.4);
    head.translate(2.0, 7.3, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#d7dbe6', roughness: 0.4, metalness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffcf7a', emissiveIntensity: 0.2 });
    this.city.nightLit.push({ material: headMat, day: 0.2, night: 6, kind: 'emissive' });
    const mats: THREE.Matrix4[] = [];
    const half = ROAD_WIDTH / 2 + 0.8;
    const add = (x: number, z: number, yaw: number) => {
      const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
      mats.push(m);
      this.city.collision.addRect(x - 0.16, z - 0.16, x + 0.16, z + 0.16, 7.5);
      const hp = new THREE.Vector3(2.0, 7.2, 0).applyMatrix4(m);
      this.lampHeads.push(hp);
    };
    for (const x of ROADS_X) {
      for (let z = ROADS_Z[0] + 18; z < ROADS_Z[ROADS_Z.length - 1]; z += 34) {
        if (ROADS_Z.some((rz) => Math.abs(z - rz) < 11)) continue;
        add(x - half, z, 0);
        add(x + half, z + 17, Math.PI);
      }
    }
    for (const z of ROADS_Z) {
      for (let x = ROADS_X[0] + 18; x < ROADS_X[ROADS_X.length - 1]; x += 34) {
        if (ROADS_X.some((rx) => Math.abs(x - rx) < 11)) continue;
        add(x, z - half, -Math.PI / 2);
        add(x + 17, z + half, Math.PI / 2);
      }
    }
    for (const [geo, mat] of [[pole, poleMat], [arm, poleMat], [head, headMat]] as const) {
      const inst = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.castShadow = geo !== head;
      this.city.group.add(inst);
    }
    // glow sprites (cheap fake lights, fade in at night)
    const g = new THREE.BufferGeometry().setFromPoints(this.lampHeads);
    const pm = new THREE.PointsMaterial({ map: glowSprite(), color: '#ffcf8a', size: 7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.lampGlow = new THREE.Points(g, pm);
    this.city.group.add(this.lampGlow);
  }

  private beach(): void {
    const g = this.city.group;
    // umbrellas + loungers
    const umbCols = ['#ff2fa0', '#19c3d6', '#ffd23f', '#ff8a3d', '#7b2cff', '#3dffb0'];
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6);
    pole.translate(0, 1.3, 0);
    const canopy = new THREE.ConeGeometry(1.8, 0.7, 10, 1, true);
    canopy.translate(0, 2.6, 0);
    const lounger = new THREE.BoxGeometry(0.8, 0.25, 2);
    lounger.translate(1.4, 0.35, 0);
    const towel = new THREE.PlaneGeometry(0.9, 1.9);
    towel.rotateX(-Math.PI / 2);
    towel.translate(-1.4, 0.12, 0.3);
    const count = 40;
    const poleI = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: '#ffffff' }), count);
    const canI = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), count);
    const louI = new THREE.InstancedMesh(lounger, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), count);
    const towI = new THREE.InstancedMesh(towel, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), count);
    for (let i = 0; i < count; i++) {
      const x = SHORE_X - 30 + rnd() * 18;
      const z = -240 + (i / count) * 430 + rnd() * 6;
      const m = new THREE.Matrix4().makeRotationY(rnd() * Math.PI * 2).setPosition(x, 0.1, z);
      for (const inst of [poleI, canI, louI, towI]) inst.setMatrixAt(i, m);
      canI.setColorAt(i, new THREE.Color(umbCols[i % umbCols.length]));
      towI.setColorAt(i, new THREE.Color(umbCols[(i + 2) % umbCols.length]));
    }
    for (const inst of [poleI, canI, louI, towI]) { inst.castShadow = true; inst.receiveShadow = true; g.add(inst); }

    // lifeguard towers (pastel huts on stilts)
    const towerCols = ['#ff9fc8', '#9ff0e0', '#ffd6a5', '#c8b6ff'];
    [-200, -40, 60, 160].forEach((z, i) => {
      const x = SHORE_X - 22;
      const hut = this.city.plainMat(towerCols[i], 0.6);
      const legs = this.city.plainMat('#ffffff', 0.5);
      for (const dx of [-1.3, 1.3]) for (const dz of [-1.3, 1.3]) this.city.mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), legs, x + dx, 1.3, z + dz);
      this.city.mesh(new THREE.BoxGeometry(3.2, 0.2, 3.2), legs, x, 2.7, z);
      this.city.mesh(new THREE.BoxGeometry(2.6, 2, 2.6), hut, x, 3.8, z);
      const roof = this.city.mesh(new THREE.ConeGeometry(2.4, 1, 4), this.city.plainMat('#ff4d6d', 0.6), x, 5.3, z);
      roof.rotation.y = Math.PI / 4;
      this.city.collision.addRect(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 5.8);
      // waving flag
      const flag = this.city.mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: '#ffd23f', side: THREE.DoubleSide }), x + 0.6, 6.6, z, true, false);
      this.city.mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), legs, x, 6.3, z);
      this.flags.push(flag);
    });

    // volleyball net
    const nx = SHORE_X - 45, nz = 110;
    const postM = this.city.plainMat('#ffffff', 0.5);
    this.city.mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), postM, nx, 1.3, nz - 5);
    this.city.mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), postM, nx, 1.3, nz + 5);
    const net = this.city.mesh(new THREE.PlaneGeometry(10, 0.9), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide }), nx, 2.1, nz, false, false);
    net.rotation.y = Math.PI / 2;
    // beach bar with neon
    const bx = BEACH_X + 14, bz = 120;
    this.city.building(bx - 4, bz - 6, bx + 4, bz + 6, 3.2, 'deco', '#ffd6a5', 2);
    this.city.band(bx - 5, bz - 7, bx + 5, bz + 7, 3.2, 0.5, '#2fb5a8');
    this.city.neon('TIKI BYTES', '#3dffb0', bx + 4.3, 4.6, bz, 1.6, Math.PI / 2, false, true);
    // harbor boardwalk south of the beach
    this.city.band(BEACH_X, HARBOR_Z - 4, SHORE_X, HARBOR_Z, 0, 0.3, '#b98b5e');
  }

  private pier(): void {
    const g = this.city.group;
    const x0 = SHORE_X - 12, x1 = 302, z0 = -126, z1 = -114;
    const deckH = 0.45;
    const wood = pbr('deck', 1, 1, '#e8d2b8') ?? new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.85 });
    const deck = this.city.mesh(this.city.tiledBox(x1 - x0, 0.3, z1 - z0, 4, 4), wood, (x0 + x1) / 2, deckH - 0.15, (z0 + z1) / 2, true, true);
    deck.receiveShadow = true;
    this.city.collision.add({ x0, x1, z0, z1, y0: -2, y1: deckH });
    // wide platform at the end
    const px0 = 272, px1 = 306, pz0 = -150, pz1 = -100;
    this.city.mesh(this.city.tiledBox(px1 - px0, 0.3, pz1 - pz0, 4, 4), wood, (px0 + px1) / 2, deckH - 0.15, (pz0 + pz1) / 2, true, true);
    this.city.collision.add({ x0: px0, x1: px1, z0: pz0, z1: pz1, y0: -2, y1: deckH });
    // pilings
    const pile = new THREE.CylinderGeometry(0.25, 0.25, 4, 6);
    const piles: THREE.Matrix4[] = [];
    for (let x = x0 + 2; x < x1; x += 6) for (const z of [z0 + 0.5, z1 - 0.5]) piles.push(new THREE.Matrix4().makeTranslation(x, -1.6, z));
    const pi = new THREE.InstancedMesh(pile, wood, piles.length);
    piles.forEach((m, i) => pi.setMatrixAt(i, m));
    g.add(pi);
    // railings (colliders keep players on the pier)
    const rail = this.city.plainMat('#ffffff', 0.4);
    const railY = deckH + 0.5;
    const addRail = (ax: number, az: number, bx: number, bz: number) => {
      this.city.mesh(new THREE.BoxGeometry(Math.max(0.1, bx - ax), 0.1, Math.max(0.1, bz - az)), rail, (ax + bx) / 2, railY + 0.5, (az + bz) / 2, false, false);
      this.city.collision.add({ x0: ax - 0.05, x1: bx + 0.05, z0: az - 0.05, z1: bz + 0.05, y0: deckH, y1: deckH + 1.2 });
    };
    addRail(SHORE_X, z0, px0, z0);
    addRail(SHORE_X, z1, px0, z1);
    addRail(px0, pz0, px1, pz0);
    addRail(px0, pz1, px1, pz1);
    addRail(px1, pz0, px1, pz1);
    addRail(px0, pz0, px0, z0);
    addRail(px0, z1, px0, pz1);
    // pier string lights
    for (let x = SHORE_X; x < px0; x += 8) {
      for (const z of [z0, z1]) {
        const bulb = this.city.mesh(new THREE.SphereGeometry(0.15, 6, 6), this.city.plainMat('#ffd27a', 0.3, 0, '#ffb347', 5), x, deckH + 1.6, z, false, false);
        bulb.castShadow = false;
      }
    }
    this.city.neon('STARLIGHT PIER', '#ff2fa0', SHORE_X - 6.4, 6, (z0 + z1) / 2, 2.2, -Math.PI / 2);
    const archM = this.city.plainMat('#ffffff', 0.4);
    this.city.mesh(new THREE.BoxGeometry(0.5, 5, 0.5), archM, SHORE_X - 6, 2.5, z0);
    this.city.mesh(new THREE.BoxGeometry(0.5, 5, 0.5), archM, SHORE_X - 6, 2.5, z1);
    this.city.mesh(new THREE.BoxGeometry(0.5, 0.5, z1 - z0 + 0.5), archM, SHORE_X - 6, 4.8, (z0 + z1) / 2);
    this.ferrisWheel(292, -128);
  }

  private ferrisWheel(x: number, z: number): void {
    const R = 16;
    const hub = new THREE.Vector3(x, R + 3.5, z);
    const frame = this.city.plainMat('#ffffff', 0.35, 0.6);
    // A-frame supports
    for (const dz of [-2.2, 2.2]) {
      for (const dx of [-6, 6]) {
        const len = Math.hypot(dx, R + 3.5);
        const leg = this.city.mesh(new THREE.CylinderGeometry(0.25, 0.3, len, 8), frame, x + dx / 2, (R + 3.5) / 2, z + dz);
        leg.rotation.z = Math.atan2(dx, R + 3.5);
      }
    }
    this.city.collision.addRect(x - 7, z - 3, x + 7, z + 3, 3);
    const wheel = new THREE.Group();
    wheel.position.copy(hub);
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff2fa0', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.5 });
    this.city.nightLit.push({ material: rimMat, day: 0.5, night: 3.5, kind: 'emissive' });
    const rimMat2 = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#19e6ff', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.5 });
    this.city.nightLit.push({ material: rimMat2, day: 0.5, night: 3.5, kind: 'emissive' });
    for (const [dz, m] of [[-1.6, rimMat], [1.6, rimMat2]] as const) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 8, 64), m);
      rim.position.z = dz;
      wheel.add(rim);
    }
    const spokes = 16;
    const gondolaCols = ['#ff2fa0', '#19e6ff', '#ffd23f', '#7b2cff', '#3dffb0', '#ff8a3d'];
    const gondolas: THREE.Mesh[] = [];
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, R, 0.12), frame);
      spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.4), this.city.plainMat(gondolaCols[i % gondolaCols.length], 0.4, 0.2));
      gd.position.set(Math.cos(a) * R, Math.sin(a) * R - 1, 0);
      gd.castShadow = true;
      wheel.add(gd);
      gondolas.push(gd);
    }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 16).rotateX(Math.PI / 2), frame));
    this.city.group.add(wheel);
    this.city.animated.push((t) => {
      wheel.rotation.z = t * 0.06;
      // keep gondolas hanging upright
      for (const gd of gondolas) gd.rotation.z = -wheel.rotation.z;
    });
  }

  /** night: 0 (day) .. 1 (night). */
  update(t: number, night: number): void {
    if (this.lampGlow) (this.lampGlow.material as THREE.PointsMaterial).opacity = night * 0.85;
    for (const f of this.flags) f.rotation.y = Math.sin(t * 3 + f.position.z) * 0.4;
    // gentle palm sway via the crown instance matrices (only a subset per frame for cost)
    if (this.crowns && this.palmMatrices.length) {
      const m = new THREE.Matrix4();
      const sway = new THREE.Matrix4();
      const n = this.palmMatrices.length;
      const start = Math.floor((t * 60) % 4);
      for (let i = start; i < n; i += 4) {
        sway.makeRotationZ(Math.sin(t * 1.3 + i) * 0.025);
        m.multiplyMatrices(this.palmMatrices[i], sway);
        this.crowns.setMatrixAt(i, m);
      }
      this.crowns.instanceMatrix.needsUpdate = true;
    }
  }
}
