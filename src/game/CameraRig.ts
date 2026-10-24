import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

// Third-person orbit camera with collision against buildings, smoothing,
// auto-follow behind vehicles and a little shake on impacts.

/** Fixed chase-camera distance behind the car in meters (no zooming while driving). */
export const DRIVE_CAMERA_DISTANCE = 6;
const DRIVE_CAMERA_PITCH = 0.2;

export class CameraRig {
  yaw = Math.PI;
  pitch = 0.22;
  distance = 6.5;
  private targetDistance = 6.5;
  private smoothedTarget = new THREE.Vector3();
  private shake = 0;
  private idleMouse = 0;
  sensitivity = 1;
  invertY = false;
  reducedMotion = false;

  constructor(readonly camera: THREE.PerspectiveCamera, private collision: CollisionWorld) {}

  addShake(amount: number): void {
    if (!this.reducedMotion) this.shake = Math.min(1, this.shake + amount);
  }

  snapTo(target: THREE.Vector3, yaw?: number): void {
    this.smoothedTarget.copy(target);
    if (yaw !== undefined) this.yaw = yaw;
  }

  update(
    dt: number,
    target: THREE.Vector3,
    mouseDX: number,
    mouseDY: number,
    wheel: number,
    follow: { yaw: number; speed: number } | null,
  ): void {
    const k = 0.0024 * this.sensitivity;
    this.yaw -= mouseDX * k;
    this.pitch += mouseDY * k * (this.invertY ? -1 : 1);
    this.pitch = Math.max(-0.35, Math.min(1.2, this.pitch));
    if (!follow) this.targetDistance = Math.max(2.5, Math.min(12, this.targetDistance + wheel * 0.8));

    if (Math.abs(mouseDX) + Math.abs(mouseDY) > 0.5) this.idleMouse = 0;
    else this.idleMouse += dt;

    // Vehicles: a locked chase camera at one fixed distance behind the car.
    // No zoom in/out, no speed-based pull-back, no FOV change (player preference).
    if (follow) {
      const desired = follow.yaw + Math.PI;
      if (this.idleMouse > 0.4) {
        let d = desired - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 6);
        this.pitch += (DRIVE_CAMERA_PITCH - this.pitch) * Math.min(1, dt * 4);
      }
      this.distance = DRIVE_CAMERA_DISTANCE;
    } else {
      this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 6);
    }

    this.smoothedTarget.lerp(target, 1 - Math.exp(-dt * (follow ? 10 : 14)));
    const t = this.smoothedTarget;
    const lookY = t.y + (follow ? 1.6 : 1.55);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // Pull the camera in when a building is between it and the player.
    const hit = this.collision.raycast(t.x, lookY, t.z, dir.x, dir.y, dir.z, this.distance);
    const dist = Math.max(1.2, hit - 0.4);
    const pos = new THREE.Vector3(t.x, lookY, t.z).addScaledVector(dir, dist);
    pos.y = Math.max(0.4, pos.y);
    this.camera.position.copy(pos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(t.x, lookY, t.z);
    const fov = 60;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }
}
