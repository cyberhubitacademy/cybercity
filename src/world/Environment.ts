import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { waterNormals } from './textures';

// Day/night cycle with a physically based (Preetham) sky, image-based lighting
// from that sky, a sun with soft shadows, and a reflective ocean.
// The sun sets over the ocean (east), because Neon Bay has the best sunsets.

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

interface Key {
  h: number;
  sun: string; sunI: number;
  hemiSky: string; hemiGround: string; hemiI: number;
  fog: string; fogFar: number;
  skyTop: string; skyHorizon: string; cloud: string;
  exposure: number;
  night: number;
}

// Keyframes over a 24h day. Colors chosen for a saturated, "Leonida sunset" grade.
const KEYS: Key[] = [
  { h: 0, sun: '#6f7cff', sunI: 0.35, hemiSky: '#3a2a8a', hemiGround: '#1a0f33', hemiI: 0.55, fog: '#2a1450', fogFar: 520, skyTop: '#05031a', skyHorizon: '#3a1260', cloud: '#2a1d4a', exposure: 0.95, night: 1 },
  { h: 5, sun: '#8b7bff', sunI: 0.4, hemiSky: '#4a3399', hemiGround: '#20123d', hemiI: 0.6, fog: '#3d1f66', fogFar: 520, skyTop: '#0b0a2e', skyHorizon: '#5a2a7a', cloud: '#3a2a5a', exposure: 0.95, night: 0.9 },
  { h: 6.5, sun: '#ff9a6b', sunI: 1.6, hemiSky: '#ffb3c7', hemiGround: '#6b4a5e', hemiI: 0.8, fog: '#ffb1a0', fogFar: 650, skyTop: '#3c6fd8', skyHorizon: '#ffb08a', cloud: '#ffc2a8', exposure: 0.9, night: 0.25 },
  { h: 8.5, sun: '#fff1d6', sunI: 3.0, hemiSky: '#bfe6ff', hemiGround: '#b59a7a', hemiI: 1.0, fog: '#a8dcff', fogFar: 900, skyTop: '#0f6fe0', skyHorizon: '#9fe2ff', cloud: '#ffffff', exposure: 0.85, night: 0 },
  { h: 13, sun: '#ffffff', sunI: 3.3, hemiSky: '#c6ecff', hemiGround: '#c2a888', hemiI: 1.0, fog: '#a8e0ff', fogFar: 950, skyTop: '#0a63d8', skyHorizon: '#a6e8ff', cloud: '#ffffff', exposure: 0.85, night: 0 },
  { h: 16.5, sun: '#ffd9a0', sunI: 3.0, hemiSky: '#ffd0b0', hemiGround: '#b38a70', hemiI: 0.95, fog: '#ffc9b0', fogFar: 850, skyTop: '#2a5fd0', skyHorizon: '#ffd2a8', cloud: '#fff0dc', exposure: 0.85, night: 0 },
  { h: 18.3, sun: '#ff7a45', sunI: 2.2, hemiSky: '#ff8fb8', hemiGround: '#7a3d6b', hemiI: 0.9, fog: '#ff8f8a', fogFar: 700, skyTop: '#4b2fa8', skyHorizon: '#ff7a5c', cloud: '#ff9ab0', exposure: 0.9, night: 0.2 },
  { h: 19.5, sun: '#ff3d8a', sunI: 0.9, hemiSky: '#a640c8', hemiGround: '#40205e', hemiI: 0.75, fog: '#8a3a9e', fogFar: 600, skyTop: '#1d0f5a', skyHorizon: '#e0408a', cloud: '#a04a9a', exposure: 0.95, night: 0.65 },
  { h: 21, sun: '#6f7cff', sunI: 0.4, hemiSky: '#3a2a8a', hemiGround: '#1a0f33', hemiI: 0.6, fog: '#2a1450', fogFar: 520, skyTop: '#06041e', skyHorizon: '#3a1260', cloud: '#2a1d4a', exposure: 0.95, night: 1 },
  { h: 24, sun: '#6f7cff', sunI: 0.35, hemiSky: '#3a2a8a', hemiGround: '#1a0f33', hemiI: 0.55, fog: '#2a1450', fogFar: 520, skyTop: '#05031a', skyHorizon: '#3a1260', cloud: '#2a1d4a', exposure: 0.95, night: 1 },
];

const cA = new THREE.Color(), cB = new THREE.Color();
function lerpColor(a: string, b: string, t: number, out: THREE.Color): THREE.Color {
  cA.set(a); cB.set(b);
  return out.copy(cA).lerp(cB, t);
}

/** Art-directed sky dome: gradient + sun glow + drifting fbm clouds. */
function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#0a63d8') },
      horizon: { value: new THREE.Color('#a6e8ff') },
      cloudColor: { value: new THREE.Color('#ffffff') },
      sunColor: { value: new THREE.Color('#ffffff') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      time: { value: 0 },
      sunStrength: { value: 1 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 cloudColor; uniform vec3 sunColor; uniform vec3 sunDir; uniform float time; uniform float sunStrength;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        if (d.y < 0.0) col = horizon * 0.9;
        vec3 sd = normalize(sunDir);
        float s = max(dot(d, sd), 0.0);
        col += sunColor * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6) * sunStrength;
        col += sunColor * smoothstep(0.9993, 0.9997, s) * 3.0 * sunStrength;
        if (d.y > 0.01) {
          vec2 uv = d.xz / (d.y + 0.08) * 0.9 + vec2(time * 0.004, time * 0.0015);
          float n = fbm(uv * 1.3);
          float c = smoothstep(0.52, 0.78, n) * smoothstep(0.0, 0.18, d.y);
          float shade = fbm(uv * 1.3 + sd.xz * 0.06);
          vec3 cc = mix(cloudColor, cloudColor * 0.72 + sunColor * 0.08, smoothstep(0.5, 0.8, shade));
          cc += sunColor * pow(s, 8.0) * 0.5 * sunStrength;
          col = mix(col, cc, c * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: THREE.Mesh;
  private skyMat = makeSkyMaterial();
  private nightDome: THREE.Mesh;
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  readonly water: Water | THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky: THREE.Mesh;
  private envSkyMat = makeSkyMaterial();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private lastEnvSun = new THREE.Vector3(0, -1, 0);
  private lastEnvHour = -10;
  readonly sunDir = new THREE.Vector3();
  night = 0;
  exposure = 0.65;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, quality: Quality) {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), this.skyMat);
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envSkyMat);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    // Night dome (gradient) + stars + moon, faded in by `night`.
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: { opacity: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float opacity; varying vec3 vP;
        void main(){ float h = clamp(vP.y, -0.2, 1.0);
          vec3 top = vec3(0.04,0.02,0.14); vec3 mid = vec3(0.20,0.06,0.36); vec3 hor = vec3(0.55,0.12,0.45);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h)); c = mix(c, top, smoothstep(0.25, 0.9, h));
          gl_FragColor = vec4(c, opacity); }`,
    });
    this.nightDome = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), domeMat);
    this.nightDome.renderOrder = -1;
    scene.add(this.nightDome);

    const starPos: number[] = [];
    for (let i = 0; i < 1600; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;
      v.normalize().multiplyScalar(7000);
      starPos.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff4e0', transparent: true, opacity: 0, fog: false, toneMapped: false }));
    scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight('#c6ecff', '#c2a888', 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'ultra' ? 4096 : quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const cam = this.sun.shadow.camera;
    const ext = quality === 'ultra' ? 110 : 85;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 1; cam.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog('#c9ecff', 150, 800);

    // Ocean
    const waterGeo = new THREE.PlaneGeometry(4000, 4000);
    if (quality === 'low') {
      const m = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: '#13a6c4', roughness: 0.08, metalness: 0.3, normalMap: waterNormals(), normalScale: new THREE.Vector2(0.4, 0.4) }));
      m.rotation.x = -Math.PI / 2;
      this.water = m;
    } else {
      const normals = waterNormals();
      const w = new Water(waterGeo, {
        textureWidth: quality === 'medium' ? 512 : 1024,
        textureHeight: quality === 'medium' ? 512 : 1024,
        waterNormals: normals,
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x0a7f9e,
        distortionScale: 2.6,
        fog: true,
        alpha: 1,
      });
      w.rotation.x = -Math.PI / 2;
      (w.material as THREE.ShaderMaterial).uniforms.size.value = 3.0;
      this.water = w;
    }
    this.water.position.y = -0.35;
    scene.add(this.water);
  }

  /** Interpolate the keyframes for hour h. */
  private sample(h: number): { a: Key; b: Key; t: number } {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (h >= KEYS[i].h && h <= KEYS[i + 1].h) {
        const t = (h - KEYS[i].h) / (KEYS[i + 1].h - KEYS[i].h);
        return { a: KEYS[i], b: KEYS[i + 1], t: t * t * (3 - 2 * t) };
      }
    }
    return { a: KEYS[0], b: KEYS[1], t: 0 };
  }

  update(hour: number, focus: THREE.Vector3, time: number): void {
    const { a, b, t } = this.sample(hour);
    const L = (x: number, y: number) => x + (y - x) * t;

    // Sun path: rises in the west over the hills, sets over the ocean in the east-southeast.
    const dayT = (hour - 6) / 13; // 0 at 6:00, 1 at 19:00
    const elev = Math.sin(Math.max(-0.15, Math.min(1.15, dayT)) * Math.PI) * 62 * (Math.PI / 180);
    const az = Math.PI + dayT * Math.PI * 0.95; // west -> east
    this.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev) * 0.45 + 0.25).normalize();
    if (hour < 5.5 || hour > 19.8) this.sunDir.set(-0.3, 0.6, 0.4).normalize(); // moonlight from above

    const u = this.skyMat.uniforms;
    u.sunDir.value.copy(this.sunDir);
    lerpColor(a.skyTop, b.skyTop, t, u.top.value);
    lerpColor(a.skyHorizon, b.skyHorizon, t, u.horizon.value);
    lerpColor(a.cloud, b.cloud, t, u.cloudColor.value);
    u.time.value = time;

    this.night = L(a.night, b.night);
    (this.nightDome.material as THREE.ShaderMaterial).uniforms.opacity.value = Math.min(1, this.night * 1.05);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, this.night - 0.3) * 1.3;
    const moonMat = this.moon.material as THREE.MeshBasicMaterial;
    moonMat.opacity = Math.max(0, this.night - 0.4) * 1.6;
    this.moon.position.set(focus.x - 2600, 2200, focus.z + 1800);

    lerpColor(a.sun, b.sun, t, this.sun.color);
    this.sun.intensity = L(a.sunI, b.sunI);
    u.sunColor.value.copy(this.sun.color);
    u.sunStrength.value = Math.max(0, 1 - this.night * 1.2);
    lerpColor(a.hemiSky, b.hemiSky, t, this.hemi.color);
    lerpColor(a.hemiGround, b.hemiGround, t, this.hemi.groundColor);
    this.hemi.intensity = L(a.hemiI, b.hemiI);

    const fog = this.scene.fog as THREE.Fog;
    lerpColor(a.fog, b.fog, t, fog.color);
    fog.far = L(a.fogFar, b.fogFar);
    fog.near = fog.far * 0.18;
    this.exposure = L(a.exposure, b.exposure);

    // Shadow camera follows the focus point, snapped to texels to avoid shimmering.
    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 250, Math.max(40, this.sunDir.y * 250), fz + this.sunDir.z * 250);

    if (this.water instanceof Water) {
      const wu = (this.water.material as THREE.ShaderMaterial).uniforms;
      wu.time.value = time * 0.6;
      wu.sunDirection.value.copy(this.sunDir);
      wu.sunColor.value.copy(this.sun.color).multiplyScalar(Math.min(1, this.sun.intensity / 2));
      wu.waterColor.value.set(this.night > 0.5 ? '#06283f' : '#0a8fa8');
    }

    // Re-bake the reflection environment when the sun has moved noticeably.
    if (this.sunDir.angleTo(this.lastEnvSun) > 0.03 || Math.abs(hour - this.lastEnvHour) > 0.25 || !this.envTarget) {
      this.lastEnvHour = hour;
      this.lastEnvSun.copy(this.sunDir);
      const eu = this.envSkyMat.uniforms;
      for (const k of ['top', 'horizon', 'cloudColor', 'sunColor'] as const) eu[k].value.copy(u[k].value);
      eu.sunDir.value.copy(this.sunDir);
      eu.sunStrength.value = u.sunStrength.value * 0.3;
      const prev = this.envTarget;
      this.envTarget = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envTarget.texture;
      this.scene.environmentIntensity = 0.35 + (1 - this.night) * 0.45;
      prev?.dispose();
    }
  }

  setShadows(on: boolean): void {
    this.sun.castShadow = on;
  }

  dispose(): void {
    this.envTarget?.dispose();
    this.pmrem.dispose();
  }
}
