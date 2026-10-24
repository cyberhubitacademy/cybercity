import * as THREE from 'three';

// Pooled vehicle effects: instanced tire skid marks that fade out, and GPU
// point particles (dust, water spray, exhaust, damage smoke, nitro flames,
// sparks). Fixed capacities chosen by quality; zero allocations per frame.

export type FxQuality = 'low' | 'medium' | 'high' | 'ultra';

export const FX_CAPS: Record<FxQuality, { skids: number; particles: number; glow: number }> = {
  low: { skids: 120, particles: 220, glow: 80 },
  medium: { skids: 280, particles: 500, glow: 160 },
  high: { skids: 520, particles: 900, glow: 260 },
  ultra: { skids: 900, particles: 1400, glow: 400 },
};

const SKID_LIFE = 14;

export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private born: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(readonly cap: number) {
    const g = new THREE.PlaneGeometry(0.26, 1).rotateX(-Math.PI / 2);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(-1e6), 1);
    g.setAttribute('aBorn', this.born);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLife: { value: SKID_LIFE } },
      vertexShader: `attribute float aBorn; uniform float uTime; uniform float uLife; varying float vA;
        void main(){ float age = uTime - aBorn; vA = clamp(1.0 - age / uLife, 0.0, 1.0) * 0.62;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vA; void main(){ if (vA <= 0.0) discard; gl_FragColor = vec4(0.04, 0.04, 0.05, vA); }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** A mark segment from (x0,z0) to (x1,z1) at height y. */
  add(x0: number, z0: number, x1: number, z1: number, y: number, time: number): void {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 4) return;
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
    this.p.set((x0 + x1) / 2, y + 0.025, (z0 + z1) / 2);
    this.s.set(1, 1, len + 0.05);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.born.array as Float32Array)[i] = time;
    this.born.needsUpdate = true;
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }
}

/** Point particles with per-particle color/alpha/size, simple motion and growth. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private alpha0: Float32Array;
  private drag: Float32Array;
  private lift: Float32Array;
  private next = 0;
  private alive = 0;
  private geo: THREE.BufferGeometry;

  constructor(readonly cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap).fill(1);
    this.grow = new Float32Array(cap);
    this.alpha0 = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.lift = new Float32Array(cap);
    this.pos.fill(0);
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -1000;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(0.5, -mv.z), 0.0, 256.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
          float a = vC.a * smoothstep(0.5, 0.12, r); if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setViewportHeight(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9;
  }

  emit(
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
    life: number, size: number, r: number, g: number, b: number, a: number,
    grow = 0, drag = 1, lift = 0,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.alpha0[i] = a;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.lift[i] = lift;
    this.alive = this.cap;
  }

  update(dt: number): void {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        this.pos[i * 3 + 1] = -1000;
        continue;
      }
      any++;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.lift[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 1.6);
    }
    this.alive = any;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}
