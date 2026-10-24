import * as THREE from 'three';

// Pooled combat VFX: tracers (one LineSegments), muzzle flashes (sprites + one
// shared light), sparks/blood (one Points system), smoke (one Points system)
// and bullet-hole decals (one InstancedMesh ring buffer). Nothing is allocated
// per shot.

const MAX_TRACERS = 48;
const MAX_SPARKS = 220;
const MAX_SMOKE = 90;
const MAX_DECALS = 96;
const MAX_FLASH = 6;

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particle { life: number; max: number; vx: number; vy: number; vz: number }

export class Effects {
  private tracerGeo = new THREE.BufferGeometry();
  private tracerPos = new Float32Array(MAX_TRACERS * 6);
  private tracerLife = new Float32Array(MAX_TRACERS);
  private tracerNext = 0;
  private tracers: THREE.LineSegments;

  private flashes: THREE.Sprite[] = [];
  private flashLife: number[] = [];
  private flashNext = 0;
  private light = new THREE.PointLight('#ffcc66', 0, 9, 2);
  private lightLife = 0;

  private sparkGeo = new THREE.BufferGeometry();
  private sparkPos = new Float32Array(MAX_SPARKS * 3);
  private sparkCol = new Float32Array(MAX_SPARKS * 3);
  private sparks: Particle[] = [];
  private sparkNext = 0;

  private smokeGeo = new THREE.BufferGeometry();
  private smokePos = new Float32Array(MAX_SMOKE * 3);
  private smoke: Particle[] = [];
  private smokeNext = 0;

  private decals: THREE.InstancedMesh;
  private decalNext = 0;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  private zAxis = new THREE.Vector3(0, 0, 1);
  private explosion: THREE.Sprite;
  private explosionLife = 0;

  constructor(private scene: THREE.Scene) {
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);

    const flashTex = glowTexture('rgba(255,255,230,1)', 'rgba(255,170,40,0.85)');
    const flashMat = new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < MAX_FLASH; i++) {
      const s = new THREE.Sprite(flashMat);
      s.visible = false;
      s.scale.setScalar(0.5);
      scene.add(s);
      this.flashes.push(s);
      this.flashLife.push(0);
    }
    scene.add(this.light);

    for (let i = 0; i < MAX_SPARKS; i++) { this.sparks.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0 }); this.sparkPos[i * 3 + 1] = -999; }
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const sparkPts = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparkPts.frustumCulled = false;
    scene.add(sparkPts);

    for (let i = 0; i < MAX_SMOKE; i++) { this.smoke.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0 }); this.smokePos[i * 3 + 1] = -999; }
    this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3).setUsage(THREE.DynamicDrawUsage));
    const smokePts = new THREE.Points(this.smokeGeo, new THREE.PointsMaterial({ size: 1.1, map: glowTexture('rgba(90,90,96,0.75)', 'rgba(70,70,76,0.4)'), transparent: true, depthWrite: false, opacity: 0.7 }));
    smokePts.frustumCulled = false;
    scene.add(smokePts);

    const decalMat = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(10,10,10,1)', 'rgba(25,22,20,0.8)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.14), decalMat, MAX_DECALS);
    this.decals.frustumCulled = false;
    this.tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DECALS; i++) this.decals.setMatrixAt(i, this.tmpM);
    scene.add(this.decals);

    this.explosion = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,220,1)', 'rgba(255,120,30,0.9)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.explosion.visible = false;
    scene.add(this.explosion);
  }

  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const i = this.tracerNext;
    this.tracerNext = (i + 1) % MAX_TRACERS;
    const o = i * 6;
    // short streak toward the end point reads better than a full line
    const p = this.tracerPos;
    p[o] = ax + (bx - ax) * 0.08; p[o + 1] = ay + (by - ay) * 0.08; p[o + 2] = az + (bz - az) * 0.08;
    p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    this.tracerLife[i] = 0.07;
  }

  muzzle(x: number, y: number, z: number, size = 0.45): void {
    const i = this.flashNext;
    this.flashNext = (i + 1) % MAX_FLASH;
    const s = this.flashes[i];
    s.position.set(x, y, z);
    s.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    s.material.rotation = Math.random() * Math.PI;
    s.visible = true;
    this.flashLife[i] = 0.05;
    this.light.position.set(x, y, z);
    this.light.intensity = 6;
    this.lightLife = 0.06;
  }

  burst(x: number, y: number, z: number, n: number, kind: 'spark' | 'blood' | 'dust' | 'fire'): void {
    const [r, g, b] = kind === 'spark' ? [1, 0.75, 0.3] : kind === 'blood' ? [0.55, 0.02, 0.02] : kind === 'fire' ? [1, 0.45, 0.1] : [0.55, 0.5, 0.45];
    const speed = kind === 'blood' ? 1.6 : kind === 'fire' ? 6 : 3.5;
    for (let k = 0; k < n; k++) {
      const i = this.sparkNext;
      this.sparkNext = (i + 1) % MAX_SPARKS;
      const p = this.sparks[i];
      p.max = p.life = (kind === 'fire' ? 0.7 : 0.35) * (0.6 + Math.random() * 0.8);
      p.vx = (Math.random() - 0.5) * speed;
      p.vy = Math.random() * speed * 0.8;
      p.vz = (Math.random() - 0.5) * speed;
      this.sparkPos[i * 3] = x; this.sparkPos[i * 3 + 1] = y; this.sparkPos[i * 3 + 2] = z;
      this.sparkCol[i * 3] = r; this.sparkCol[i * 3 + 1] = g; this.sparkCol[i * 3 + 2] = b;
    }
  }

  puff(x: number, y: number, z: number, n = 1): void {
    for (let k = 0; k < n; k++) {
      const i = this.smokeNext;
      this.smokeNext = (i + 1) % MAX_SMOKE;
      const p = this.smoke[i];
      p.max = p.life = 1.6 + Math.random();
      p.vx = (Math.random() - 0.5) * 0.6;
      p.vy = 0.9 + Math.random() * 0.6;
      p.vz = (Math.random() - 0.5) * 0.6;
      this.smokePos[i * 3] = x + (Math.random() - 0.5) * 0.4; this.smokePos[i * 3 + 1] = y; this.smokePos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
    }
  }

  /** Bullet hole facing back along the shot direction. */
  decal(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    const i = this.decalNext;
    this.decalNext = (i + 1) % MAX_DECALS;
    this.tmpP.set(-dx, -dy, -dz).normalize();
    this.tmpQ.setFromUnitVectors(this.zAxis, this.tmpP);
    this.tmpS.setScalar(0.7 + Math.random() * 0.6);
    this.tmpM.compose(this.tmpP.set(x - dx * 0.02, y - dy * 0.02, z - dz * 0.02), this.tmpQ, this.tmpS);
    this.decals.setMatrixAt(i, this.tmpM);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  explode(x: number, y: number, z: number): void {
    this.explosion.position.set(x, y + 1, z);
    this.explosion.visible = true;
    this.explosionLife = 0.6;
    this.burst(x, y + 0.8, z, 60, 'fire');
    this.puff(x, y + 1, z, 14);
    this.light.position.set(x, y + 2, z);
    this.light.intensity = 30;
    this.light.distance = 30;
    this.lightLife = 0.35;
  }

  update(dt: number): void {
    let tracersDirty = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] -= dt;
      tracersDirty = true;
      if (this.tracerLife[i] <= 0) {
        const o = i * 6;
        this.tracerPos[o + 3] = this.tracerPos[o]; this.tracerPos[o + 4] = this.tracerPos[o + 1]; this.tracerPos[o + 5] = this.tracerPos[o + 2];
      }
    }
    if (tracersDirty) (this.tracerGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < MAX_FLASH; i++) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= dt;
      if (this.flashLife[i] <= 0) this.flashes[i].visible = false;
    }
    if (this.lightLife > 0) {
      this.lightLife -= dt;
      if (this.lightLife <= 0) { this.light.intensity = 0; this.light.distance = 9; }
    }
    let sparkDirty = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const p = this.sparks[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= 9.8 * dt;
      const o = i * 3;
      this.sparkPos[o] += p.vx * dt;
      this.sparkPos[o + 1] = Math.max(0.02, this.sparkPos[o + 1] + p.vy * dt);
      this.sparkPos[o + 2] += p.vz * dt;
      if (p.life <= 0) this.sparkPos[o + 1] = -999;
      sparkDirty = true;
    }
    if (sparkDirty) {
      (this.sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.sparkGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    let smokeDirty = false;
    for (let i = 0; i < MAX_SMOKE; i++) {
      const p = this.smoke[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      const o = i * 3;
      this.smokePos[o] += p.vx * dt;
      this.smokePos[o + 1] += p.vy * dt;
      this.smokePos[o + 2] += p.vz * dt;
      if (p.life <= 0) this.smokePos[o + 1] = -999;
      smokeDirty = true;
    }
    if (smokeDirty) (this.smokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (this.explosionLife > 0) {
      this.explosionLife -= dt;
      const k = 1 - this.explosionLife / 0.6;
      this.explosion.scale.setScalar(2 + k * 7);
      this.explosion.material.opacity = Math.max(0, 1 - k);
      if (this.explosionLife <= 0) this.explosion.visible = false;
    }
  }

  dispose(): void {
    this.scene.remove(this.tracers, this.decals, this.light, this.explosion, ...this.flashes);
  }
}
