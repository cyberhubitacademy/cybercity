// Instanced bird flocks (seagulls on the beach, pigeons downtown) and beach
// crabs. Birds peck on the ground, hop, and burst into flight when Rico runs
// or a car speeds by; they circle and land back near home.
import * as THREE from 'three';
import { shouldFlee } from './wildlife';

interface Bird {
  x: number; y: number; z: number;
  yaw: number;
  vx: number; vy: number; vz: number;
  state: 0 | 1 | 2; // 0 ground, 1 flying away, 2 returning
  t: number;
  flap: number;
  home: THREE.Vector3;
  peck: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _w = new THREE.Matrix4();
const _tl = new THREE.Matrix4().makeTranslation(-0.04, 0.03, 0);
const _tr = new THREE.Matrix4().makeTranslation(0.04, 0.03, 0);

export class Flock {
  readonly group = new THREE.Group();
  private birds: Bird[] = [];
  private body: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  readonly center = new THREE.Vector3();

  constructor(readonly species: 'seagull' | 'pigeon', homes: THREE.Vector3[], perHome: number) {
    const gull = species === 'seagull';
    const k = gull ? 1 : 0.8;
    const bodyGeo = new THREE.SphereGeometry(0.12 * k, 8, 6);
    bodyGeo.scale(0.9, 0.8, 1.8);
    const headGeo = new THREE.SphereGeometry(0.07 * k, 8, 6);
    headGeo.translate(0, 0.08 * k, 0.2 * k);
    const beak = new THREE.ConeGeometry(0.02 * k, 0.07 * k, 5);
    beak.rotateX(Math.PI / 2);
    beak.translate(0, 0.07 * k, 0.29 * k);
    const wing = new THREE.BoxGeometry(0.34 * k, 0.015, 0.16 * k);
    const wl = wing.clone(); wl.translate(-0.17 * k, 0, 0);
    const wr = wing.clone(); wr.translate(0.17 * k, 0, 0);
    const n = homes.length * perHome;
    const bodyMat = new THREE.MeshStandardMaterial({ color: gull ? '#f4f4f4' : '#7c8796', roughness: 0.9 });
    const wingMat = new THREE.MeshStandardMaterial({ color: gull ? '#b9c0c8' : '#5f6b7a', roughness: 0.9 });
    const headMat = new THREE.MeshStandardMaterial({ color: gull ? '#ffffff' : '#4c6a6a', roughness: 0.8 });
    this.body = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    this.head = new THREE.InstancedMesh(mergeHead(headGeo, beak), headMat, n);
    this.wingL = new THREE.InstancedMesh(wl, wingMat, n);
    this.wingR = new THREE.InstancedMesh(wr, wingMat, n);
    for (const m of [this.body, this.head, this.wingL, this.wingR]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    for (const h of homes) {
      this.center.add(h);
      for (let i = 0; i < perHome; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 4;
        this.birds.push({ x: h.x + Math.cos(a) * r, y: h.y, z: h.z + Math.sin(a) * r, yaw: Math.random() * 6.28, vx: 0, vy: 0, vz: 0, state: 0, t: Math.random() * 5, flap: Math.random() * 6, home: h.clone(), peck: Math.random() });
      }
    }
    this.center.divideScalar(Math.max(1, homes.length));
  }

  /** Positions of grounded/flying birds near p (for photo detection). */
  anyNear(p: THREE.Vector3, r: number, out: THREE.Vector3[]): void {
    for (const b of this.birds) if (Math.abs(b.x - p.x) < r && Math.abs(b.z - p.z) < r) out.push(new THREE.Vector3(b.x, b.y + 0.15, b.z));
  }

  update(dt: number, threats: { pos: THREE.Vector3; speed: number }[], time: number): void {
    const gull = this.species === 'seagull';
    for (const b of this.birds) {
      b.t += dt;
      if (b.state === 0) {
        // hop / peck
        b.peck += dt;
        if (b.peck > 1.5 + Math.random() * 2) {
          b.peck = 0;
          if (Math.random() < 0.4) b.yaw += (Math.random() - 0.5) * 2;
          const hop = Math.random() * 0.4;
          b.x += Math.sin(b.yaw) * hop; b.z += Math.cos(b.yaw) * hop;
          // stay near home
          const dx = b.home.x - b.x, dz = b.home.z - b.z;
          if (dx * dx + dz * dz > 30) b.yaw = Math.atan2(dx, dz);
        }
        for (const t of threats) {
          const d = Math.hypot(t.pos.x - b.x, t.pos.z - b.z);
          if (Math.abs(t.pos.y - b.y) < 4 && shouldFlee(d, t.speed, gull ? 1 : 0.8)) {
            b.state = 1; b.t = 0;
            const ax = b.x - t.pos.x, az = b.z - t.pos.z, al = Math.hypot(ax, az) || 1;
            const sp = 5 + Math.random() * 3;
            b.vx = (ax / al) * sp + (Math.random() - 0.5) * 2;
            b.vz = (az / al) * sp + (Math.random() - 0.5) * 2;
            b.vy = 3 + Math.random() * 2;
            break;
          }
        }
      } else if (b.state === 1) {
        b.vy = Math.max(0.2, b.vy - dt * 1.5);
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.yaw = Math.atan2(b.vx, b.vz);
        if (b.t > 5 + Math.random() * 3) { b.state = 2; b.t = 0; }
      } else {
        // circle back and land at home
        const tx = b.home.x + Math.cos(time * 0.4 + b.flap) * 2.5, tz = b.home.z + Math.sin(time * 0.4 + b.flap) * 2.5;
        const dx = tx - b.x, dz = tz - b.z, dy = b.home.y - b.y;
        const dd = Math.hypot(dx, dz);
        const sp = Math.min(6, 1.5 + dd * 0.4);
        b.vx += ((dx / (dd || 1)) * sp - b.vx) * Math.min(1, dt * 1.5);
        b.vz += ((dz / (dd || 1)) * sp - b.vz) * Math.min(1, dt * 1.5);
        b.vy = dd < 6 ? dy * 0.8 : Math.max(-0.5, Math.min(1, (8 - b.y) * 0.3));
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.yaw = Math.atan2(b.vx, b.vz);
        if (dd < 0.8 && Math.abs(dy) < 0.3) { b.state = 0; b.y = b.home.y; b.vx = b.vz = b.vy = 0; }
      }
    }
    // write matrices
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const flying = b.state !== 0;
      b.flap += dt * (flying ? 16 : 0);
      const pitch = b.state === 0 ? (b.peck < 0.3 ? 0.5 : 0) : -0.1;
      _e.set(pitch, b.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(b.x, b.y + 0.1, b.z);
      _m.compose(_p, _q, _s);
      this.body.setMatrixAt(i, _m);
      this.head.setMatrixAt(i, _m);
      const wa = flying ? Math.sin(b.flap) * 0.9 : 0.1;
      _w.makeRotationZ(-wa).premultiply(_m);
      _w.multiply(_tl);
      this.wingL.setMatrixAt(i, _w);
      _w.makeRotationZ(wa).premultiply(_m);
      _w.multiply(_tr);
      this.wingR.setMatrixAt(i, _w);
    }
    for (const m of [this.body, this.head, this.wingL, this.wingR]) m.instanceMatrix.needsUpdate = true;
  }
}

function mergeHead(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  // tiny manual merge (no BufferGeometryUtils dependency)
  const ga = a.toNonIndexed(), gb = b.toNonIndexed();
  const pos = new Float32Array(ga.attributes.position.array.length + gb.attributes.position.array.length);
  pos.set(ga.attributes.position.array as Float32Array, 0);
  pos.set(gb.attributes.position.array as Float32Array, ga.attributes.position.array.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- crabs

interface Crab { x: number; z: number; yaw: number; t: number; dir: number; hidden: number; homeX: number; homeZ: number }

export class Crabs {
  readonly group = new THREE.Group();
  private crabs: Crab[] = [];
  private mesh: THREE.InstancedMesh;
  private claws: THREE.InstancedMesh;

  constructor(n: number, xRange: [number, number], zRange: [number, number], avoidZ: [number, number]) {
    const body = new THREE.SphereGeometry(0.09, 8, 6);
    body.scale(1.4, 0.5, 1);
    const legs = new THREE.BoxGeometry(0.32, 0.015, 0.12);
    const geo = mergeHead(body, legs);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#e8b58a', roughness: 0.6 }), n);
    const claw = new THREE.SphereGeometry(0.035, 6, 5);
    const c1 = claw.clone(); c1.translate(-0.1, 0.03, 0.1);
    const c2 = claw.clone(); c2.translate(0.1, 0.03, 0.1);
    this.claws = new THREE.InstancedMesh(mergeHead(c1, c2), new THREE.MeshStandardMaterial({ color: '#d9822b', roughness: 0.5 }), n);
    for (const m of [this.mesh, this.claws]) { m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    for (let i = 0; i < n; i++) {
      let z = zRange[0] + Math.random() * (zRange[1] - zRange[0]);
      if (z > avoidZ[0] && z < avoidZ[1]) z = avoidZ[1] + 4 + Math.random() * 20;
      const x = xRange[0] + Math.random() * (xRange[1] - xRange[0]);
      this.crabs.push({ x, z, yaw: Math.random() * 6.28, t: Math.random() * 3, dir: 1, hidden: 0, homeX: x, homeZ: z });
    }
  }

  anyNear(p: THREE.Vector3, r: number, out: THREE.Vector3[]): void {
    for (const c of this.crabs) if (c.hidden < 0.5 && Math.abs(c.x - p.x) < r && Math.abs(c.z - p.z) < r) out.push(new THREE.Vector3(c.x, 0.1, c.z));
  }

  update(dt: number, threat: THREE.Vector3, threatSpeed: number): void {
    for (let i = 0; i < this.crabs.length; i++) {
      const c = this.crabs[i];
      c.t += dt;
      const d = Math.hypot(threat.x - c.x, threat.z - c.z);
      if (d < 3 || (d < 7 && threatSpeed > 4)) {
        c.hidden = Math.min(1, c.hidden + dt * 3); // burrow
        const ax = c.x - threat.x, az = c.z - threat.z, al = Math.hypot(ax, az) || 1;
        c.x += (ax / al) * dt * 3; c.z += (az / al) * dt * 3;
      } else {
        c.hidden = Math.max(0, c.hidden - dt * 0.4);
        if (c.t > 1 + Math.random() * 2) { c.t = 0; c.dir = Math.random() < 0.5 ? -1 : 1; }
        // scuttle sideways
        c.x += Math.cos(c.yaw) * c.dir * dt * 0.8;
        c.z -= Math.sin(c.yaw) * c.dir * dt * 0.8;
        if (Math.hypot(c.x - c.homeX, c.z - c.homeZ) > 4) c.yaw = Math.atan2(c.homeZ - c.z, c.x - c.homeX);
      }
      _e.set(0, c.yaw, Math.sin(c.t * 20) * 0.08);
      _q.setFromEuler(_e);
      _p.set(c.x, 0.05 - c.hidden * 0.2, c.z);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.claws.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.claws.instanceMatrix.needsUpdate = true;
  }
}
