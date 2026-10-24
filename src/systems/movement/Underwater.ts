import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { sand } from '../../world/textures';
import { HARBOR_Z, mulberry32, SHORE_X } from '../../world/layout';
import type { Quality } from '../../world/Environment';
import { WATER_Y, terrainHeight } from './physics';
import { FISH_COUNTS, stepSchool, type FishAgent, type School } from './fish';

// The world under the waves: sea floor with caustics, rocks, coral and kelp,
// a sunken wreck, schools of fish (instanced, boids-lite), dolphins and manta
// rays (CC0 Quaternius, procedural fallback), bubbles, marine snow, splashes,
// and the underwater look (fog, dome, surface seen from below).

export interface Collectible {
  id: string;
  x: number; y: number; z: number;
  mesh: THREE.Group;
  found: boolean;
}

/** "Lost hard drives" hidden on the sea floor. */
export const DRIVE_SPOTS: { id: string; x: number; z: number }[] = [
  { id: 'hdd-1', x: 262, z: -60 },
  { id: 'hdd-2', x: 288, z: -128 }, // under the pier platform
  { id: 'hdd-3', x: 306, z: 44 }, // the wreck
  { id: 'hdd-4', x: 318, z: 120 },
  { id: 'hdd-5', x: 280, z: 196 },
  { id: 'hdd-6', x: 236, z: 246 },
  { id: 'hdd-7', x: 110, z: 248 },
  { id: 'hdd-8', x: -60, z: 236 },
  { id: 'hdd-9', x: 322, z: -210 },
  { id: 'hdd-10', x: 300, z: -10 },
];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpS = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const cA = new THREE.Color();
const cB = new THREE.Color();

/** Shared caustics: inject an animated light pattern into a standard material (sea floor, rocks, wreck). */
function addCaustics(mat: THREE.MeshStandardMaterial, uTime: { value: number }, uStrength: { value: number }): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uCaustic = uStrength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vCWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vCWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCWPos; uniform float uTime; uniform float uCaustic;
        float cLines(vec2 p, float t) {
          vec2 q = p;
          q += vec2(sin(q.y * 0.9 + t * 0.7), cos(q.x * 0.8 - t * 0.6)) * 0.9;
          q += vec2(sin(q.y * 1.7 - t * 1.1), cos(q.x * 1.5 + t * 0.9)) * 0.45;
          float a = 1.0 - abs(sin(q.x * 1.3));
          float b = 1.0 - abs(sin(q.y * 1.3));
          return pow(a, 7.0) + pow(b, 7.0);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float cDepth = smoothstep(-0.1, -1.6, vCWPos.y) * (1.0 - smoothstep(-6.0, -22.0, vCWPos.y) * 0.6);
        totalEmissiveRadiance += vec3(0.55, 0.9, 1.0) * cLines(vCWPos.xz * 0.85, uTime * 1.3) * uCaustic * cDepth * 0.3 * max(0.0, vNormal.y * 0.5 + 0.5);`);
  };
}

function softDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bubbleTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 5;
    g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(23, 22, 6, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rippleTex(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#5fd3e0';
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(77);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 26;
      g.strokeStyle = `rgba(230,255,255,${0.03 + rnd() * 0.08})`;
      g.lineWidth = 1 + rnd() * 2.5;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2); g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Pool {
  points: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  next: number;
  n: number;
}

function makePool(n: number, mat: THREE.PointsMaterial): Pool {
  const pos = new Float32Array(n * 3).fill(0);
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -9999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, pos, vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0, n };
}

interface Creature {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  kind: 'dolphin' | 'manta';
  cx: number; cz: number; r: number; speed: number; phase: number; depth: number;
}

export class Underwater {
  readonly group = new THREE.Group();
  /** True while the camera is below the surface. */
  underwater = false;
  readonly drives: Collectible[] = [];
  private uTime = { value: 0 };
  private uCaustic = { value: 0.5 };
  private uSway = { value: 0 };
  private dome: THREE.Mesh;
  private domeMat = new THREE.MeshBasicMaterial({ color: '#0b5f73', side: THREE.BackSide, fog: false, depthWrite: false });
  private ceiling: THREE.Mesh;
  private ceilingMat: THREE.MeshBasicMaterial;
  private bubbles: Pool;
  private splashes: Pool;
  private snow: THREE.Points;
  private snowPos: Float32Array;
  private rings: { mesh: THREE.Mesh; t: number }[] = [];
  private schools: School[] = [];
  private fishMeshes: THREE.InstancedMesh[] = [];
  private creatures: Creature[] = [];
  private fishMats: THREE.Material[] = [];
  private bubbleT = 0;
  private quality: Quality;

  constructor(private scene: THREE.Scene, quality: Quality) {
    this.quality = quality;
    this.group.name = 'movement-underwater';
    scene.add(this.group);
    const big = quality === 'high' || quality === 'ultra';

    this.buildSeabed();
    this.buildReef(big ? (quality === 'ultra' ? 1.6 : 1.2) : quality === 'medium' ? 0.8 : 0.45);
    this.buildWreck();
    this.buildDrives();

    // Underwater "sky": fog-colored dome that hides the sky and horizon.
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), this.domeMat);
    this.dome.renderOrder = -1;
    this.dome.visible = false;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // The surface seen from below.
    const rt = rippleTex();
    rt.repeat.set(30, 30);
    this.ceilingMat = new THREE.MeshBasicMaterial({ color: '#9ff3ff', map: rt, transparent: true, opacity: 0.92, side: THREE.FrontSide, depthWrite: false });
    const cg = new THREE.PlaneGeometry(400, 400);
    cg.rotateX(Math.PI / 2); // normal pointing down
    this.ceiling = new THREE.Mesh(cg, this.ceilingMat);
    this.ceiling.position.y = WATER_Y - 0.02;
    this.ceiling.visible = false;
    this.group.add(this.ceiling);

    // Particles.
    const bubbleMat = new THREE.PointsMaterial({ size: 0.11, map: bubbleTex(), transparent: true, depthWrite: false, color: '#dffcff', sizeAttenuation: true });
    this.bubbles = makePool(140, bubbleMat);
    this.group.add(this.bubbles.points);
    const splashMat = new THREE.PointsMaterial({ size: 0.22, map: softDot(), transparent: true, depthWrite: false, color: '#ffffff', sizeAttenuation: true });
    this.splashes = makePool(big ? 260 : 140, splashMat);
    this.group.add(this.splashes.points);
    const ns = big ? 500 : 260;
    this.snowPos = new Float32Array(ns * 3);
    const rnd = mulberry32(5);
    for (let i = 0; i < ns; i++) {
      this.snowPos[i * 3] = (rnd() - 0.5) * 24;
      this.snowPos[i * 3 + 1] = (rnd() - 0.5) * 24;
      this.snowPos[i * 3 + 2] = (rnd() - 0.5) * 24;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.05, map: softDot(), transparent: true, opacity: 0.55, depthWrite: false, color: '#cdeee8' }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.group.add(this.snow);

    const ringGeo = new THREE.RingGeometry(0.6, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      this.group.add(m);
      this.rings.push({ mesh: m, t: 99 });
    }

    this.buildFish();
    void this.loadModels();
  }

  // ------------------------------------------------------------------ build

  private causticMat(color: string, rough = 0.95, map?: THREE.Texture): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, map: map ?? null });
    addCaustics(m, this.uTime, this.uCaustic);
    return m;
  }

  private buildSeabed(): void {
    const tex = sand().clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = this.causticMat('#9c9c9c', 0.97, tex);
    mat.vertexColors = true;
    const sandCol = new THREE.Color('#cdb98f'), deepCol = new THREE.Color('#52786c');
    const grid = (x0: number, x1: number, z0: number, z1: number, step: number): void => {
      const sx = Math.round((x1 - x0) / step), sz = Math.round((z1 - z0) / step);
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
        let y = terrainHeight(x, z);
        // Stay under the beach sand mesh where it exists, and hide under land.
        if (x >= 172 && x <= 278 && z <= 252) y -= 0.3;
        if (y >= -0.05 && x < 172) y = -3;
        pos.setY(i, y);
        uv.setXY(i, x / 9, z / 9);
        const k = THREE.MathUtils.clamp((-y - 1) / 12, 0, 1);
        cA.copy(sandCol).lerp(deepCol, k);
        col[i * 3] = cA.r; col[i * 3 + 1] = cA.g; col[i * 3 + 2] = cA.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(cx, 0, cz);
      m.receiveShadow = true;
      this.group.add(m);
    };
    grid(170, 650, -430, 430, 6);
    grid(-310, 170, 205, 345, 6);
  }

  /** Scatter helper: random spot in open water (beyond the shallows), deterministic. */
  private spot(rnd: () => number, near?: { x: number; z: number; r: number }): { x: number; z: number; y: number } | null {
    for (let tries = 0; tries < 12; tries++) {
      let x: number, z: number;
      if (near) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * near.r;
        x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r;
      } else if (rnd() < 0.8) {
        x = 250 + rnd() * 90; z = -260 + rnd() * 540;
      } else {
        x = -260 + rnd() * 500; z = 222 + rnd() * 70;
      }
      const y = terrainHeight(x, z);
      if (y > WATER_Y - 2.5) continue;
      if (x > 268 && x < 310 && z > -152 && z < -98) continue; // pier pilings area keeps clear
      return { x, z, y };
    }
    return null;
  }

  private buildReef(density: number): void {
    const rnd = mulberry32(4242);
    // Rocks
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, this.causticMat('#7d7468', 0.95), Math.round(140 * density));
    let n = 0;
    for (let i = 0; i < rocks.count; i++) {
      const s = this.spot(rnd);
      if (!s) continue;
      const sc = 0.4 + rnd() * rnd() * 2.6;
      tmpE.set(rnd() * 3, rnd() * 6, rnd() * 3);
      tmpQ.setFromEuler(tmpE);
      tmpS.set(sc * (0.8 + rnd() * 0.8), sc * (0.4 + rnd() * 0.5), sc * (0.8 + rnd() * 0.7));
      tmpV.set(s.x, s.y + tmpS.y * 0.3, s.z);
      rocks.setMatrixAt(n++, tmpM.compose(tmpV, tmpQ, tmpS));
    }
    rocks.count = n;
    rocks.receiveShadow = true;
    this.group.add(rocks);

    // Coral: brain domes + fan cones in reef patches, colored per instance.
    const reefs = [
      { x: 300, z: -20, r: 26 }, { x: 330, z: 90, r: 22 }, { x: 270, z: 170, r: 20 },
      { x: 318, z: -200, r: 24 }, { x: 300, z: 44, r: 18 }, { x: 40, z: 250, r: 22 },
    ];
    const coralCols = ['#ff5f8f', '#ff9a52', '#c06bff', '#ffd23f', '#3dffb0', '#ff3d6e', '#7ad8ff'];
    const domeGeo = new THREE.IcosahedronGeometry(0.6, 1);
    domeGeo.scale(1, 0.62, 1);
    const fanGeo = new THREE.ConeGeometry(0.35, 1.6, 6, 1, true);
    fanGeo.translate(0, 0.8, 0);
    const coralMat = this.causticMat('#c8c8c8', 0.75);
    const domes = new THREE.InstancedMesh(domeGeo, coralMat, Math.round(160 * density));
    const fans = new THREE.InstancedMesh(fanGeo, coralMat, Math.round(140 * density));
    let nd = 0, nf = 0;
    for (const target of [domes, fans]) {
      const isFan = target === fans;
      for (let i = 0; i < target.count; i++) {
        const s = this.spot(rnd, reefs[Math.floor(rnd() * reefs.length)]);
        if (!s) continue;
        const sc = 0.5 + rnd() * 1.1;
        tmpE.set(isFan ? (rnd() - 0.5) * 0.5 : 0, rnd() * 6, isFan ? (rnd() - 0.5) * 0.5 : 0);
        tmpQ.setFromEuler(tmpE);
        tmpS.setScalar(sc);
        tmpV.set(s.x, s.y - 0.05, s.z);
        const idx = isFan ? nf++ : nd++;
        target.setMatrixAt(idx, tmpM.compose(tmpV, tmpQ, tmpS));
        target.setColorAt(idx, cA.set(coralCols[Math.floor(rnd() * coralCols.length)]));
      }
    }
    domes.count = nd;
    fans.count = nf;
    this.group.add(domes, fans);

    // Kelp: tall swaying ribbons.
    const kelpGeo = new THREE.PlaneGeometry(0.35, 4, 1, 6);
    kelpGeo.translate(0, 2, 0);
    const kelpMat = new THREE.MeshStandardMaterial({ color: '#6fbf4a', emissive: '#1f4a16', roughness: 0.8, side: THREE.DoubleSide });
    const uSway = this.uSway;
    kelpMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = uSway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uSway;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 kp = vec3(instanceMatrix[3]);
          float h = position.y / 4.0;
          transformed.x += sin(uSway * 1.3 + kp.x * 0.7 + position.y * 0.8) * 0.35 * h * h;
          transformed.z += cos(uSway * 1.1 + kp.z * 0.6 + position.y * 0.6) * 0.25 * h * h;`);
    };
    const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, Math.round(220 * density));
    let nk = 0;
    for (let i = 0; i < kelp.count; i++) {
      const s = this.spot(rnd, rnd() < 0.7 ? reefs[Math.floor(rnd() * reefs.length)] : undefined);
      if (!s || s.y > -3.5) continue;
      tmpE.set(0, rnd() * 6, 0);
      tmpQ.setFromEuler(tmpE);
      const tall = Math.min(1.8, (WATER_Y - 1 - s.y) / 4) * (0.5 + rnd() * 0.6);
      tmpS.set(1, tall, 1);
      tmpV.set(s.x, s.y, s.z);
      kelp.setMatrixAt(nk, tmpM.compose(tmpV, tmpQ, tmpS));
      kelp.setColorAt(nk++, cA.set(rnd() < 0.5 ? '#4f9a3a' : '#7a8f2e'));
    }
    kelp.count = nk;
    this.group.add(kelp);
  }

  private buildWreck(): void {
    const x = 306, z = 40;
    const y = terrainHeight(x, z);
    const wood = this.causticMat('#5a4636', 0.9);
    const rust = this.causticMat('#7a4a32', 0.8);
    const g = new THREE.Group();
    g.position.set(x, y + 0.6, z);
    g.rotation.set(0.12, 0.6, 0.28);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0): void => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(px, py, pz);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    add(new THREE.BoxGeometry(4.2, 0.3, 13), wood, 0, 0, 0); // keel/deck
    add(new THREE.BoxGeometry(0.25, 1.8, 13), wood, 2.05, 0.9, 0, 0, 0, -0.18);
    add(new THREE.BoxGeometry(0.25, 1.8, 11), wood, -2.05, 0.9, -1, 0, 0, 0.18);
    add(new THREE.BoxGeometry(3.6, 1.8, 0.25), wood, 0, 0.9, -6.4);
    add(new THREE.BoxGeometry(2.4, 1.6, 3), rust, 0, 1.0, -2.5); // cabin
    add(new THREE.CylinderGeometry(0.16, 0.2, 6, 8), wood, 0, 3.5, 1.5, 0.35, 0, 0.2); // broken mast
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 10), rust, 1.1, 0.5, 3.5, Math.PI / 2, 0, 0); // barrel
    this.group.add(g);
  }

  private buildDrives(): void {
    const caseGeo = new THREE.BoxGeometry(0.34, 0.08, 0.24);
    const ledGeo = new THREE.BoxGeometry(0.22, 0.02, 0.02);
    const caseMat = new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: 0.4, metalness: 0.7 });
    const ledMat = new THREE.MeshBasicMaterial({ color: '#19e6ff', toneMapped: false });
    const glowMat = new THREE.SpriteMaterial({ map: softDot(), color: '#19e6ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const d of DRIVE_SPOTS) {
      const y = terrainHeight(d.x, d.z) + 0.12;
      const g = new THREE.Group();
      g.position.set(d.x, y, d.z);
      const c = new THREE.Mesh(caseGeo, caseMat);
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, 0.045, 0.1);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(1.6);
      g.add(c, led, glow);
      this.group.add(g);
      this.drives.push({ id: d.id, x: d.x, y, z: d.z, mesh: g, found: false });
    }
  }

  setFound(ids: readonly string[]): void {
    for (const d of this.drives) {
      d.found = ids.includes(d.id);
      d.mesh.visible = !d.found;
    }
  }

  private buildFish(): void {
    const total = FISH_COUNTS[this.quality];
    const perSchool = this.quality === 'low' ? 12 : this.quality === 'medium' ? 16 : 20;
    const nSchools = Math.max(2, Math.round(total / perSchool));
    const homes = [
      { x: 290, z: -40 }, { x: 320, z: 80 }, { x: 270, z: 160 }, { x: 300, z: 30 }, { x: 315, z: -190 },
      { x: 60, z: 255 }, { x: 290, z: -100 }, { x: 255, z: 230 }, { x: -80, z: 245 }, { x: 330, z: 0 },
    ];
    const rnd = mulberry32(99);
    for (let s = 0; s < nSchools; s++) {
      const h = homes[s % homes.length];
      const fish: FishAgent[] = [];
      for (let i = 0; i < perSchool; i++) {
        fish.push({
          x: h.x + (rnd() - 0.5) * 4, y: -4, z: h.z + (rnd() - 0.5) * 4,
          vx: 0, vy: 0, vz: 1,
          ox: (rnd() - 0.5) * 5, oy: (rnd() - 0.5) * 1.6, oz: (rnd() - 0.5) * 5,
          scale: 0.22 + rnd() * 0.16,
        });
      }
      this.schools.push({
        hx: h.x, hz: h.z, cx: h.x, cy: -4, cz: h.z, phase: rnd() * 10, radius: 10 + rnd() * 14, speed: 0.08 + rnd() * 0.06,
        model: s % 3, fish, floor: (x, z) => terrainHeight(x, z),
      });
    }
    // Procedural fallback fish (replaced by the CC0 models once loaded).
    const body = new THREE.SphereGeometry(0.5, 10, 6);
    body.scale(0.35, 0.55, 1);
    const tail = new THREE.ConeGeometry(0.3, 0.45, 4);
    tail.rotateX(-Math.PI / 2);
    tail.scale(0.25, 1, 1);
    tail.translate(0, 0, -0.62);
    const geo = mergeSimple([body, tail]);
    const cols = ['#ffb347', '#7ad8ff', '#ff6b9a'];
    for (let m = 0; m < 3; m++) {
      const mat = this.fishMaterial(new THREE.MeshStandardMaterial({ color: cols[m], roughness: 0.4, metalness: 0.2 }));
      this.makeFishMesh(m, geo, mat);
    }
  }

  private fishMaterial(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    const uTime = this.uTime;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3]);
          float tailK = smoothstep(0.15, -0.55, position.z);
          transformed.x += sin(uTime * 11.0 + ip.x * 1.7 + ip.z * 1.3 - position.z * 5.0) * 0.12 * tailK;`);
    };
    this.fishMats.push(m);
    return m;
  }

  private makeFishMesh(model: number, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): void {
    const count = this.schools.filter((s) => s.model === model).reduce((a, s) => a + s.fish.length, 0);
    const old = this.fishMeshes[model];
    if (old) { this.group.remove(old); old.dispose(); }
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.fishMeshes[model] = mesh;
    this.group.add(mesh);
  }

  private async loadModels(): Promise<void> {
    const loader = new GLTFLoader();
    const base = `${import.meta.env.BASE_URL}models/movement/`;
    const fishFiles = ['fish.glb', 'fish2.glb', 'fish3.glb'];
    await Promise.all(fishFiles.map(async (f, i) => {
      try {
        const gltf = await loader.loadAsync(base + f);
        const baked = bakeStatic(gltf.scene);
        if (!baked) return;
        const mats = baked.materials.map((m) => this.fishMaterial(m));
        this.makeFishMesh(i, baked.geometry, mats.length === 1 ? mats[0] : mats);
      } catch (err) {
        console.warn('[movement] fish model failed, using procedural', f, err);
      }
    }));
    const spawn = async (file: string, kind: Creature['kind'], length: number, specs: { cx: number; cz: number; r: number; speed: number; depth: number }[]): Promise<void> => {
      let src: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null = null;
      try { src = await loader.loadAsync(base + file); } catch (err) { console.warn('[movement] creature failed', file, err); }
      specs.forEach((sp, i) => {
        let root: THREE.Object3D;
        let mixer: THREE.AnimationMixer | null = null;
        if (src) {
          const obj = cloneSkinned(src.scene);
          normalizeLength(obj, length);
          obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.frustumCulled = false; (o as THREE.Mesh).castShadow = false; } });
          root = new THREE.Group();
          root.add(obj);
          if (src.animations[0]) {
            mixer = new THREE.AnimationMixer(obj);
            const a = mixer.clipAction(src.animations[0]);
            a.play();
            a.time = i * 0.37;
          }
        } else {
          root = proceduralCreature(kind, length);
        }
        this.group.add(root);
        this.creatures.push({ root, mixer, kind, ...sp, phase: i * 1.7 });
      });
    };
    await spawn('dolphin.glb', 'dolphin', 2.3, [
      { cx: 300, cz: -60, r: 32, speed: 0.16, depth: 2.2 }, { cx: 300, cz: -60, r: 36, speed: 0.16, depth: 2.6 },
      { cx: 300, cz: -60, r: 29, speed: 0.16, depth: 1.8 }, { cx: 310, cz: 140, r: 30, speed: 0.14, depth: 2.4 },
    ]);
    await spawn('manta.glb', 'manta', 2.6, [
      { cx: 305, cz: 60, r: 22, speed: 0.05, depth: 0 }, { cx: 285, cz: 175, r: 18, speed: 0.06, depth: 0 },
      { cx: 70, cz: 250, r: 20, speed: 0.05, depth: 0 },
    ]);
  }

  // ------------------------------------------------------------------ effects

  emitBubbles(x: number, y: number, z: number, n: number, spread = 0.15): void {
    const p = this.bubbles;
    for (let k = 0; k < n; k++) {
      const i = p.next;
      p.next = (p.next + 1) % p.n;
      p.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      p.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      p.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      p.vel[i * 3] = (Math.random() - 0.5) * 0.2;
      p.vel[i * 3 + 1] = 0.6 + Math.random() * 0.8;
      p.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      p.life[i] = 6;
    }
  }

  splash(x: number, z: number, strength: number): void {
    const p = this.splashes;
    const n = Math.round(8 + strength * 60);
    for (let k = 0; k < n; k++) {
      const i = p.next;
      p.next = (p.next + 1) % p.n;
      const a = Math.random() * Math.PI * 2, r = Math.random() * (0.3 + strength * 0.8);
      p.pos[i * 3] = x + Math.cos(a) * r;
      p.pos[i * 3 + 1] = WATER_Y + 0.05;
      p.pos[i * 3 + 2] = z + Math.sin(a) * r;
      const out = 0.5 + Math.random() * 2.5 * strength;
      p.vel[i * 3] = Math.cos(a) * out;
      p.vel[i * 3 + 1] = 1.5 + Math.random() * (2 + strength * 7);
      p.vel[i * 3 + 2] = Math.sin(a) * out;
      p.life[i] = 2;
    }
    if (strength < 0.15) return;
    const ring = this.rings.reduce((best, r) => (r.t > best.t ? r : best), this.rings[0]);
    ring.t = 0;
    ring.mesh.position.set(x, WATER_Y + 0.03, z);
    ring.mesh.userData.size = 0.6 + strength * 2.4;
    ring.mesh.visible = true;
    if (strength > 0.3) this.emitBubbles(x, WATER_Y - 1, z, Math.round(strength * 30), 1.2);
  }

  private stepPool(p: Pool, dt: number, gravity: number, killAboveWater: boolean): void {
    for (let i = 0; i < p.n; i++) {
      if (p.life[i] <= 0) continue;
      p.life[i] -= dt;
      const j = i * 3;
      p.vel[j + 1] -= gravity * dt;
      p.pos[j] += p.vel[j] * dt + (killAboveWater ? Math.sin(p.life[i] * 7 + i) * 0.003 : 0);
      p.pos[j + 1] += p.vel[j + 1] * dt;
      p.pos[j + 2] += p.vel[j + 2] * dt;
      const dead = p.life[i] <= 0 || (killAboveWater ? p.pos[j + 1] > WATER_Y - 0.05 : p.pos[j + 1] < WATER_Y - 0.1 && p.vel[j + 1] < 0);
      if (dead) { p.life[i] = 0; p.pos[j + 1] = -9999; }
    }
    (p.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, time: number, camera: THREE.Camera, env: { night: number; exposure: number; sun: THREE.DirectionalLight }, fog: THREE.Fog | null, swimmerNear: boolean, diver: THREE.Vector3 | null, scuba: boolean): void {
    this.uTime.value = time;
    this.uSway.value = time;
    const day = 1 - env.night;
    this.uCaustic.value = 0.12 + day * Math.min(1, env.sun.intensity / 2.5) * 0.65;
    const cam = camera.position;
    this.underwater = cam.y < WATER_Y;
    // The seabed, reef and fish sit under opaque water: only draw them near the coast or when diving.
    const nearSea = cam.x > SHORE_X - 45 || cam.z > HARBOR_Z - 45;
    this.group.visible = this.underwater || swimmerNear || (nearSea && cam.y < 40);

    if (this.underwater && fog) {
      const depth = WATER_Y - cam.y;
      const k = THREE.MathUtils.clamp(depth / 14, 0, 1);
      cA.set('#1a8c9c').lerp(cB.set('#06303d'), k).multiplyScalar(0.3 + 0.7 * day + 0.05);
      fog.color.copy(cA);
      fog.near = 0.5;
      fog.far = (scuba ? 58 : 46) - k * 16 - env.night * 12;
      env.exposure *= 0.82 - k * 0.12;
      this.domeMat.color.copy(cA);
      this.dome.position.copy(cam);
      this.ceilingMat.color.set('#bff8ff').multiplyScalar(0.35 + 0.65 * day);
      this.ceiling.position.set(Math.round(cam.x / 10) * 10, WATER_Y - 0.02, Math.round(cam.z / 10) * 10);
      const map = this.ceilingMat.map;
      if (map) { map.offset.x = time * 0.01; map.offset.y = time * 0.007; }
    }
    this.dome.visible = this.underwater;
    this.ceiling.visible = this.underwater;
    this.snow.visible = this.underwater;

    if (this.underwater) {
      // Marine snow: world-fixed specks that wrap around the camera.
      const sp = this.snowPos;
      for (let i = 0; i < sp.length; i += 3) {
        sp[i + 1] -= dt * 0.05;
        if (sp[i] - cam.x > 12) sp[i] -= 24; else if (sp[i] - cam.x < -12) sp[i] += 24;
        if (sp[i + 1] - cam.y > 12) sp[i + 1] -= 24; else if (sp[i + 1] - cam.y < -12) sp[i + 1] += 24;
        if (sp[i + 2] - cam.z > 12) sp[i + 2] -= 24; else if (sp[i + 2] - cam.z < -12) sp[i + 2] += 24;
      }
      (this.snow.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // Diver bubbles.
    if (diver) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) {
        this.bubbleT = scuba ? 1.3 + Math.random() * 0.4 : 1.6 + Math.random() * 2;
        this.emitBubbles(diver.x, diver.y, diver.z, scuba ? 14 : 4 + Math.floor(Math.random() * 4));
      }
    }
    this.stepPool(this.bubbles, dt, -0.4, true);
    this.stepPool(this.splashes, dt, 14, false);
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const size = (r.mesh.userData.size as number) ?? 1;
      r.mesh.scale.setScalar(size * (0.4 + r.t * 1.6));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 - r.t * 0.4);
      if (r.t > 1.2) r.mesh.visible = false;
    }

    // Drives glow + bob.
    for (const d of this.drives) {
      if (d.found) continue;
      d.mesh.rotation.y = time * 0.8;
      d.mesh.position.y = d.y + Math.sin(time * 1.5 + d.x) * 0.05;
    }

    // Fish (only visible underwater; the surface hides them from above).
    const showFish = this.underwater;
    for (const m of this.fishMeshes) if (m) m.visible = showFish;
    if (showFish) {
      const counters = [0, 0, 0];
      for (const s of this.schools) {
        const near = Math.hypot(s.hx - cam.x, s.hz - cam.z) < 110;
        if (near) stepSchool(s, dt, time, diver);
        const mesh = this.fishMeshes[s.model];
        if (!mesh) continue;
        for (const f of s.fish) {
          const i = counters[s.model]++;
          if (i >= mesh.count) continue;
          const v = Math.hypot(f.vx, f.vy, f.vz) || 1;
          tmpE.set(Math.asin(THREE.MathUtils.clamp(-f.vy / v, -1, 1)), Math.atan2(f.vx, f.vz), 0);
          tmpQ.setFromEuler(tmpE);
          tmpS.setScalar(f.scale);
          tmpV.set(f.x, f.y, f.z);
          mesh.setMatrixAt(i, tmpM.compose(tmpV, tmpQ, tmpS));
        }
      }
      for (const m of this.fishMeshes) if (m) m.instanceMatrix.needsUpdate = true;
    }

    // Dolphins and rays.
    for (const c of this.creatures) {
      const dx = c.cx - cam.x, dz = c.cz - cam.z;
      const near = dx * dx + dz * dz < 260 * 260;
      c.root.visible = near && (c.kind === 'dolphin' || this.underwater || swimmerNear);
      if (!near) continue;
      const a = time * c.speed + c.phase;
      const x = c.cx + Math.cos(a) * c.r, z = c.cz + Math.sin(a) * c.r;
      const floor = terrainHeight(x, z);
      let y: number;
      if (c.kind === 'dolphin') {
        // Cruise below the surface with periodic leaps.
        const leap = Math.max(0, Math.sin(a * 6 + c.phase * 2));
        y = Math.max(floor + 1, WATER_Y - c.depth + Math.pow(leap, 3) * (c.depth + 1.6));
        const vyN = Math.cos(a * 6 + c.phase * 2) * (leap > 0 ? 1 : 0);
        c.root.rotation.set(-vyN * 0.6, -a, 0, 'YXZ');
      } else {
        y = floor + 1.2 + Math.sin(a * 3) * 0.4;
        c.root.rotation.set(0, -a, Math.sin(a * 2) * 0.15, 'YXZ');
      }
      c.root.position.set(x, y, z);
      if (c.mixer && dx * dx + dz * dz < 140 * 140) c.mixer.update(dt);
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}

/** Bake a (possibly skinned) model into one static geometry in model space, normalized to 1 m long along +z. */
function bakeStatic(scene: THREE.Object3D): { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] } | null {
  scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) return null;
  const m = mesh as THREE.Mesh;
  const geo = m.geometry.clone();
  geo.deleteAttribute('skinIndex');
  geo.deleteAttribute('skinWeight');
  geo.applyMatrix4(m.matrixWorld);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  if (!b) return null;
  const size = b.getSize(new THREE.Vector3());
  // Longest horizontal axis becomes +z.
  if (size.x > size.z) geo.rotateY(Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return null;
  const c = bb.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  const len = bb.max.z - bb.min.z || 1;
  geo.scale(1 / len, 1 / len, 1 / len);
  const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
    const src = x as THREE.MeshStandardMaterial;
    return new THREE.MeshStandardMaterial({ color: src.color ?? new THREE.Color('#ffffff'), map: src.map ?? null, roughness: 0.45, metalness: 0.15 });
  });
  return { geometry: geo, materials: mats };
}

function normalizeLength(obj: THREE.Object3D, length: number): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = length / (Math.max(size.x, size.z) || 1);
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.sub(c);
}

function proceduralCreature(kind: 'dolphin' | 'manta', length: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: kind === 'dolphin' ? '#7d93a8' : '#3b4656', roughness: 0.5 });
  if (kind === 'dolphin') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mat);
    body.scale.set(0.45, 0.5, length);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), mat);
    fin.position.set(0, 0.3, 0);
    g.add(body, fin);
  } else {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 6), mat);
    wing.scale.set(length, 0.12, length * 0.6);
    g.add(wing);
  }
  return g;
}

/** Merge non-indexed copies of simple geometries (position + normal only). */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set((p.attributes.position as THREE.BufferAttribute).array as Float32Array, o * 3);
    nor.set((p.attributes.normal as THREE.BufferAttribute).array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
