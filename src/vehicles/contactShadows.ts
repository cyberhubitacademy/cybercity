import * as THREE from 'three';
import type { Vehicle } from './Vehicle';

// Soft contact shadows: a blurred dark blob under every car body, all drawn by
// ONE InstancedMesh (one draw call for the whole city). Blobs lie flat on the
// ground under the car, follow its yaw and vanish while it is airborne or afloat.

/** Cars beyond this distance from the focus skip the real shadow pass. */
export const SHADOW_CAST_DIST = 90;
const BLOB_DIST = 140;

function blobTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.8, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene, private capacity = 96) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#000000', map: blobTexture(), transparent: true, opacity: 0.7, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.name = 'carContactShadows';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // instances spread over the whole city
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  /**
   * Place one blob per grounded vehicle near `center` and switch real shadow
   * casting off for far cars. Allocation-free; call once per frame.
   */
  update(vehicles: readonly Vehicle[], center: THREE.Vector3): void {
    let n = 0;
    const cast2 = SHADOW_CAST_DIST * SHADOW_CAST_DIST, blob2 = BLOB_DIST * BLOB_DIST;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const dx = v.position.x - center.x, dz = v.position.z - center.z;
      const d2 = dx * dx + dz * dz;
      v.setCastShadows(d2 < cast2);
      if (n >= this.capacity || d2 > blob2 || !v.root.visible || v.airborne || v.inWater) continue;
      const m = v.medium;
      if (m === 'water') continue;
      const d = v.def;
      _p.set(v.position.x, v.position.y + 0.03, v.position.z);
      _q.setFromAxisAngle(_up, v.yaw);
      _s.set(d.width * (d.twoWheel ? 1.6 : 1.22), 1, d.length * 1.12);
      this.mesh.setMatrixAt(n++, _m.compose(_p, _q, _s));
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
