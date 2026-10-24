import * as THREE from 'three';
import type { WeatherKind } from '../scripting/cinematic';

// Rain and storms. Rain is one InstancedMesh of thin streaks in a box that
// follows the camera (cheap on any GPU; count scales with quality). The
// integrator applies `wetness` (road shine) and `gloom` (darker sky/fog) and
// adds `flash` to the scene lighting for lightning.

export type WeatherQuality = 'low' | 'medium' | 'high' | 'ultra';

const COUNTS: Record<WeatherQuality, number> = { low: 900, medium: 2000, high: 3500, ultra: 5000 };
const BOX = 46; // half-size of the rain volume around the camera (m)
const HEIGHT = 34;

export class Weather {
  kind: WeatherKind = 'clear';
  /** 0..1 — how wet surfaces look (lower road roughness, stronger reflections). */
  wetness = 0;
  /** 0..1 — how overcast it is (darken exposure, pull fog in). */
  gloom = 0;
  /** 0..1 — lightning flash brightness this frame (add to hemisphere light). */
  flash = 0;
  /** Called when thunder should sound (integrator: audio.sfx('crash') or similar). */
  onThunder?: (strength: number) => void;

  private rain: THREE.InstancedMesh;
  private offsets: Float32Array;
  private speeds: Float32Array;
  private count: number;
  private intensity = 0; // smoothed 0..1 rain amount
  private nextBolt = 6;
  private pendingThunder: { at: number; strength: number } | null = null;
  private t = 0;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, private camera: THREE.Camera, quality: WeatherQuality = 'medium') {
    this.count = COUNTS[quality];
    const geo = new THREE.PlaneGeometry(0.025, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.rain = new THREE.InstancedMesh(geo, mat, this.count);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.offsets = new Float32Array(this.count * 3);
    this.speeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.offsets[i * 3] = (Math.random() * 2 - 1) * BOX;
      this.offsets[i * 3 + 1] = Math.random() * HEIGHT;
      this.offsets[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
      this.speeds[i] = 22 + Math.random() * 10;
    }
    scene.add(this.rain);
  }

  set(kind: WeatherKind): void {
    this.kind = kind;
    this.nextBolt = 3 + Math.random() * 5;
  }

  update(dt: number): void {
    this.t += dt;
    const target = this.kind === 'clear' ? 0 : this.kind === 'rain' ? 0.7 : 1;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.4);
    this.gloom = this.intensity * (this.kind === 'storm' ? 0.75 : 0.5);
    // Surfaces get wet faster than they dry.
    const wetTarget = this.intensity > 0.2 ? 1 : 0;
    this.wetness += (wetTarget - this.wetness) * Math.min(1, dt * (wetTarget > this.wetness ? 0.25 : 0.05));

    const visible = this.intensity > 0.02;
    this.rain.visible = visible;
    if (visible) {
      (this.rain.material as THREE.MeshBasicMaterial).opacity = 0.35 * this.intensity;
      const cam = this.camera.position;
      const active = Math.floor(this.count * this.intensity);
      this.rain.count = active;
      const wind = this.kind === 'storm' ? 0.35 : 0.12;
      for (let i = 0; i < active; i++) {
        let y = this.offsets[i * 3 + 1] - this.speeds[i] * dt;
        if (y < 0) y += HEIGHT;
        this.offsets[i * 3 + 1] = y;
        // wrap the drop's x/z relative to the camera so the volume follows it
        const ox = this.offsets[i * 3], oz = this.offsets[i * 3 + 2];
        const x = cam.x + ((((ox - cam.x) % (BOX * 2)) + BOX * 3) % (BOX * 2)) - BOX;
        const z = cam.z + ((((oz - cam.z) % (BOX * 2)) + BOX * 3) % (BOX * 2)) - BOX;
        this.dummy.position.set(x, cam.y - HEIGHT / 2 + y, z);
        this.dummy.rotation.set(wind, Math.atan2(cam.x - x, cam.z - z), 0);
        this.dummy.updateMatrix();
        this.rain.setMatrixAt(i, this.dummy.matrix);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }

    // Lightning: a quick double flash, thunder a moment later.
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.kind === 'storm' && this.intensity > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        setTimeout(() => { this.flash = Math.max(this.flash, 0.7); }, 120);
        const strength = 0.5 + Math.random() * 0.5;
        this.pendingThunder = { at: this.t + 0.4 + Math.random() * 1.6, strength };
        this.nextBolt = 6 + Math.random() * 10;
      }
    }
    if (this.pendingThunder && this.t >= this.pendingThunder.at) {
      this.onThunder?.(this.pendingThunder.strength);
      this.pendingThunder = null;
    }
  }

  dispose(): void {
    this.rain.removeFromParent();
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
  }
}
