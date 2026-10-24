import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

// Player camera.
// - On foot, third person: orbit with mouse, wheel zoom, pulled in by walls.
// - In a vehicle, third person: rigidly attached at one fixed distance behind
//   the car. No lag, no zoom, no pull-in, no FOV change (player preference).
// - First person (toggle with V): eye level on foot; windshield view in vehicles.

/** Fixed chase-camera distance behind the car in meters. */
export const DRIVE_CAMERA_DISTANCE = 6;
/** Height of the chase camera above the car's base. */
const DRIVE_CAMERA_HEIGHT = 2.3;
const EYE_HEIGHT = 1.62;

export interface FollowInfo {
  yaw: number;
  speed: number;
  /** Vehicle length/height, used to place the first-person windshield camera. */
  length?: number;
  height?: number;
}

export class CameraRig {
  yaw = Math.PI;
  pitch = 0.22;
  distance = 6.5;
  firstPerson = false;
  private targetDistance = 6.5;
  private smoothedTarget = new THREE.Vector3();
  private shake = 0;
  /** Free-look offset while driving; returns to 0 so the camera stays behind the car. */
  private lookYaw = 0;
  private lookPitch = 0;
  private idleMouse = 0;
  private carY = 0;
  sensitivity = 1;
  invertY = false;
  reducedMotion = false;

  constructor(readonly camera: THREE.PerspectiveCamera, private collision: CollisionWorld) {}

  addShake(amount: number): void {
    if (!this.reducedMotion) this.shake = Math.min(1, this.shake + amount);
  }

  snapTo(target: THREE.Vector3, yaw?: number): void {
    this.smoothedTarget.copy(target);
    this.carY = target.y;
    if (yaw !== undefined) this.yaw = yaw;
  }

  toggleFirstPerson(): boolean {
    this.firstPerson = !this.firstPerson;
    return this.firstPerson;
  }

  update(dt: number, target: THREE.Vector3, mouseDX: number, mouseDY: number, wheel: number, follow: FollowInfo | null): void {
    const k = 0.0024 * this.sensitivity;
    const dy = mouseDY * k * (this.invertY ? -1 : 1);
    if (Math.abs(mouseDX) + Math.abs(mouseDY) > 0.5) this.idleMouse = 0;
    else this.idleMouse += dt;

    if (follow) this.updateVehicle(dt, target, mouseDX * k, dy, follow);
    else this.updateOnFoot(dt, target, mouseDX * k, dy, wheel);

    if (follow) this.shake = 0; // the driving camera never shakes: it stays locked to the car
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    const fov = this.firstPerson ? 70 : 60;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateOnFoot(dt: number, target: THREE.Vector3, dx: number, dy: number, wheel: number): void {
    this.yaw -= dx;
    this.pitch += dy;
    this.smoothedTarget.lerp(target, 1 - Math.exp(-dt * 14));
    const t = this.smoothedTarget;
    if (this.firstPerson) {
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
      // Looking along -dir(yaw), eyes slightly ahead of the head so the body isn't visible.
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      this.camera.position.set(target.x + fx * 0.18, target.y + EYE_HEIGHT, target.z + fz * 0.18);
      this.lookAlong(fx, fz, -this.pitch);
      return;
    }
    this.pitch = Math.max(-0.35, Math.min(1.2, this.pitch));
    this.targetDistance = Math.max(2.5, Math.min(12, this.targetDistance + wheel * 0.8));
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 6);
    const lookY = t.y + 1.55;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // Pull the camera in when a building is between it and the player (on foot only).
    const hit = this.collision.raycast(t.x, lookY, t.z, dir.x, dir.y, dir.z, this.distance);
    const dist = Math.max(1.2, hit - 0.4);
    this.camera.position.set(t.x + dir.x * dist, Math.max(0.4, lookY + dir.y * dist), t.z + dir.z * dist);
    this.camera.lookAt(t.x, lookY, t.z);
  }

  private updateVehicle(dt: number, target: THREE.Vector3, dx: number, dy: number, f: FollowInfo): void {
    // Free look with the mouse, snapping straight back behind the car when released.
    this.lookYaw = Math.max(-2.6, Math.min(2.6, this.lookYaw - dx));
    this.lookPitch = Math.max(-0.4, Math.min(0.6, this.lookPitch + dy));
    if (this.idleMouse > 0.35) {
      const back = Math.min(1, dt * 8);
      this.lookYaw -= this.lookYaw * back;
      this.lookPitch -= this.lookPitch * back;
    }
    // Only height is eased (so curbs don't jolt); x/z/yaw are locked to the car.
    this.carY += (target.y - this.carY) * Math.min(1, dt * 12);
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw); // car forward
    const yaw = f.yaw + this.lookYaw;
    const lx = Math.sin(yaw), lz = Math.cos(yaw);
    this.smoothedTarget.copy(target);
    this.yaw = f.yaw + Math.PI; // keep the on-foot camera behind the car on exit

    if (this.firstPerson) {
      // Windshield / hood view: just above the dashboard, toward the front.
      const h = f.height ?? 1.4;
      const ahead = (f.length ?? 4.4) * 0.12;
      this.camera.position.set(target.x + fx * ahead, this.carY + h * 0.92, target.z + fz * ahead);
      this.lookAlong(lx, lz, -0.04 - this.lookPitch);
      return;
    }
    const d = DRIVE_CAMERA_DISTANCE;
    this.camera.position.set(target.x - lx * d, this.carY + DRIVE_CAMERA_HEIGHT + this.lookPitch * 3, target.z - lz * d);
    this.camera.lookAt(target.x + lx * 2, this.carY + 1.2, target.z + lz * 2);
  }

  /** Point the camera along a horizontal direction with a pitch (radians, + = up). */
  private lookAlong(fx: number, fz: number, pitch: number): void {
    const p = this.camera.position;
    const c = Math.cos(pitch);
    this.camera.lookAt(p.x + fx * c * 10, p.y + Math.sin(pitch) * 10, p.z + fz * c * 10);
  }
}
