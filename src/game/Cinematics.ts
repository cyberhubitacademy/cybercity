import * as THREE from 'three';
import type { CameraPreset } from '../scripting/cinematic';

// Scripted cinematic camera. While a shot plays it overrides the gameplay
// camera: call update(dt) every frame *after* the gameplay camera has moved.
// Shots ease in/out (cubic), add a touch of handheld drift and animate FOV
// for a sense of depth. Every shot resolves when it ends or is skipped.

export interface ShotTarget {
  x: number;
  z: number;
  /** NPC facing (radians, 0 = +z) for closeups. */
  facing?: number;
  /** Player position, used to frame establishing and shoulder shots. */
  player: { x: number; z: number };
  kind: 'place' | 'npc' | 'city';
}

export interface Shot {
  preset: CameraPreset | 'follow';
  target?: ShotTarget;
  durationMs: number;
  /** For 'follow': the object (vehicle root) to chase. */
  followObject?: THREE.Object3D;
}

interface Path {
  posA: THREE.Vector3;
  posB: THREE.Vector3;
  lookA: THREE.Vector3;
  lookB: THREE.Vector3;
  fovA: number;
  fovB: number;
  /** Orbit shots sweep an angle instead of lerping position. */
  orbit?: { center: THREE.Vector3; radius: number; height: number; a0: number; a1: number };
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class CinematicCamera {
  active = false;
  private shot: Shot | null = null;
  private path: Path | null = null;
  private elapsed = 0;
  private resolve: (() => void) | null = null;
  private baseFov: number;
  private seed = Math.random() * 100;
  /** Extra handheld amount (0..1); raised briefly by shake(). */
  private shakeAmt = 0;
  reducedMotion = false;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.baseFov = camera.fov;
  }

  /** Play a shot; resolves when it ends (or is skipped / replaced). */
  play(shot: Shot): Promise<void> {
    this.finish();
    this.baseFov = this.camera.fov;
    this.shot = shot;
    this.path = shot.preset === 'follow' ? null : this.buildPath(shot);
    this.elapsed = 0;
    this.active = true;
    return new Promise((res) => {
      this.resolve = res;
    });
  }

  /** Cinematic chase camera on a moving object. */
  follow(object: THREE.Object3D, durationMs: number): Promise<void> {
    return this.play({ preset: 'follow', durationMs, followObject: object });
  }

  /** End the current shot now (e.g. the player pressed skip). */
  skip(): void {
    this.finish();
  }

  shake(amount: number): void {
    if (!this.reducedMotion) this.shakeAmt = Math.min(1, this.shakeAmt + amount);
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;
    this.shot = null;
    this.path = null;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  private buildPath(shot: Shot): Path {
    const t = shot.target ?? { x: 60, z: -60, player: { x: 0, z: 0 }, kind: 'city' as const };
    const T = v3(t.x, 0, t.z);
    // Direction from the target toward the player keeps the camera on "our" side.
    const toPlayer = v3(t.player.x - t.x, 0, t.player.z - t.z);
    if (toPlayer.lengthSq() < 1) toPlayer.set(1, 0, 0.4);
    toPlayer.normalize();
    const side = v3(-toPlayer.z, 0, toPlayer.x);
    switch (shot.preset) {
      case 'establish':
        return {
          posA: T.clone().addScaledVector(toPlayer, 85).addScaledVector(side, 20).setY(52),
          posB: T.clone().addScaledVector(toPlayer, 52).addScaledVector(side, 12).setY(30),
          lookA: T.clone().setY(8), lookB: T.clone().setY(5),
          fovA: 50, fovB: 42,
        };
      case 'orbit': {
        const a0 = Math.atan2(toPlayer.x, toPlayer.z);
        return {
          posA: T, posB: T, lookA: T.clone().setY(3), lookB: T.clone().setY(3), fovA: 52, fovB: 48,
          orbit: { center: T, radius: 22, height: 9, a0, a1: a0 + Math.PI * 0.6 },
        };
      }
      case 'closeup': {
        const f = t.facing ?? 0;
        const fwd = v3(Math.sin(f), 0, Math.cos(f));
        const right = v3(fwd.z, 0, -fwd.x);
        const head = T.clone().setY(1.62);
        return {
          posA: head.clone().addScaledVector(fwd, 1.9).addScaledVector(right, 0.45).setY(1.68),
          posB: head.clone().addScaledVector(fwd, 1.45).addScaledVector(right, 0.35).setY(1.66),
          lookA: head, lookB: head.clone().setY(1.6),
          fovA: 36, fovB: 32,
        };
      }
      case 'over_shoulder': {
        const P = v3(t.player.x, 0, t.player.z);
        const toNpc = T.clone().sub(P).setY(0);
        if (toNpc.lengthSq() < 0.01) toNpc.set(0, 0, 1);
        toNpc.normalize();
        const right = v3(toNpc.z, 0, -toNpc.x);
        const head = T.clone().setY(1.6);
        return {
          posA: P.clone().addScaledVector(toNpc, -1.3).addScaledVector(right, 0.7).setY(1.85),
          posB: P.clone().addScaledVector(toNpc, -0.9).addScaledVector(right, 0.6).setY(1.8),
          lookA: head, lookB: head,
          fovA: 44, fovB: 40,
        };
      }
      case 'flyover':
        return {
          posA: T.clone().addScaledVector(toPlayer, -130).addScaledVector(side, 30).setY(70),
          posB: T.clone().addScaledVector(toPlayer, 70).addScaledVector(side, -20).setY(38),
          lookA: T.clone().setY(10), lookB: T.clone().addScaledVector(toPlayer, -20).setY(4),
          fovA: 58, fovB: 50,
        };
      case 'skyline':
      default:
        // From the beach, panning across the downtown towers at golden hour.
        return {
          posA: v3(245, 16, 90), posB: v3(245, 22, -70),
          lookA: v3(80, 40, -40), lookB: v3(40, 55, -130),
          fovA: 48, fovB: 44,
        };
    }
  }

  /** Returns true while a cinematic shot owns the camera. */
  update(dt: number): boolean {
    if (!this.active || !this.shot) return false;
    this.elapsed += dt * 1000;
    const dur = Math.max(1, this.shot.durationMs);
    const raw = Math.min(1, this.elapsed / dur);
    const k = easeInOutCubic(raw);
    const time = this.elapsed / 1000 + this.seed;
    const cam = this.camera;

    if (this.shot.preset === 'follow' && this.shot.followObject) {
      const o = this.shot.followObject;
      const yaw = o.rotation.y;
      const fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = v3(fwd.z, 0, -fwd.x);
      // Low, slightly offset chase cam that swings from side to rear over the shot.
      const swing = 1 - k;
      const want = o.position.clone().addScaledVector(fwd, -7.5 + swing * 3).addScaledVector(right, 2.5 + swing * 4).setY(o.position.y + 1.6);
      cam.position.lerp(want, Math.min(1, dt * 6));
      cam.lookAt(o.position.clone().addScaledVector(fwd, 8).setY(o.position.y + 1));
      cam.fov = 64 + Math.sin(time * 1.3) * 1.5;
    } else if (this.path) {
      const p = this.path;
      if (p.orbit) {
        const a = p.orbit.a0 + (p.orbit.a1 - p.orbit.a0) * k;
        cam.position.set(p.orbit.center.x + Math.sin(a) * p.orbit.radius, p.orbit.height, p.orbit.center.z + Math.cos(a) * p.orbit.radius);
      } else {
        cam.position.lerpVectors(p.posA, p.posB, k);
      }
      const look = p.lookA.clone().lerp(p.lookB, k);
      // Handheld drift: two slow sines per axis, tiny amplitude.
      const hand = this.reducedMotion ? 0 : 0.06 + this.shakeAmt * 0.5;
      cam.position.x += Math.sin(time * 0.9) * hand + Math.sin(time * 2.3) * hand * 0.4;
      cam.position.y += Math.sin(time * 1.1 + 1.7) * hand * 0.6;
      cam.lookAt(look);
      cam.fov = p.fovA + (p.fovB - p.fovA) * k;
    }
    if (this.shakeAmt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2);
    }
    cam.updateProjectionMatrix();
    if (raw >= 1) this.finish();
    return true;
  }
}

/** Helper: frame a place/NPC for a shot from raw coordinates. */
export function shotTargetAt(x: number, z: number, player: { x: number; z: number }, facing?: number): ShotTarget {
  return { x, z, facing, player, kind: facing === undefined ? 'place' : 'npc' };
}
