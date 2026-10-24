import * as THREE from 'three';
import type { Player } from '../../actors/Player';
import type { Locomotion } from './Locomotion';

// Visible movement gear: a neon ram-air parachute canopy (procedural, opens
// and collapses), the parachute pack in freefall, and the scuba tank + mask.

const SPAN = 7.6, CHORD = 2.8, CELLS = 9;

function canopyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(SPAN, 0.45, CHORD, CELLS * 3, 1, 4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const palette = [new THREE.Color('#ff2fa0'), new THREE.Color('#19e6ff'), new THREE.Color('#ffd23f')];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const u = x / (SPAN / 2); // -1..1 across the span
    // Arc the wing downward at the tips and give it an airfoil (thicker at the front).
    const arc = -(u * u) * 1.15;
    const foil = (y > 0 ? 1 : 0.35) * (1 - Math.pow((z + CHORD * 0.15) / (CHORD * 0.62), 2)) * 0.25;
    pos.setXYZ(i, x * (1 - 0.06 * u * u), arc + y + foil, z);
    const cell = Math.min(CELLS - 1, Math.floor(((u + 1) / 2) * CELLS));
    const c = palette[cell % 3];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class Gear {
  private canopy = new THREE.Group();
  private wing: THREE.Mesh;
  private lines: THREE.LineSegments;
  private pack: THREE.Mesh;
  private tank = new THREE.Group();
  private open = 0;
  private collapse = -1;
  private wasChute = false;
  private lastYaw = 0;

  constructor(scene: THREE.Scene, private player: Player) {
    this.wing = new THREE.Mesh(canopyGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    this.wing.castShadow = true;
    this.wing.position.y = 5.2;
    this.canopy.add(this.wing);
    // Suspension lines from the wing's underside to the harness.
    const pts: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6 * 2 - 1;
      const x = u * SPAN * 0.47, y = 5.2 - u * u * 1.15 - 0.2;
      for (const z of [-CHORD * 0.3, CHORD * 0.3]) pts.push(x, y, z, u * 0.2, 1.45, 0);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7 }));
    this.canopy.add(this.lines);
    this.canopy.visible = false;
    scene.add(this.canopy);

    const packMat = new THREE.MeshStandardMaterial({ color: '#1b1b24', roughness: 0.6 });
    this.pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.18), packMat);
    this.pack.position.set(0, 1.25, -0.2);
    this.pack.visible = false;
    player.rig.body.add(this.pack);

    const tankMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.35, metalness: 0.5 });
    const tankGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.55, 12);
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(tankGeo, tankMat);
      t.position.set(s * 0.09, 1.22, -0.22);
      this.tank.add(t);
    }
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: '#19e6ff', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 }));
    mask.position.set(0, 1.64, 0.11);
    this.tank.add(mask);
    this.tank.visible = false;
    player.rig.body.add(this.tank);
  }

  update(dt: number, motor: Locomotion, hasScuba: boolean): void {
    const p = this.player;
    const chute = motor.state === 'parachute';
    this.pack.visible = motor.state === 'freefall' || chute;
    this.tank.visible = hasScuba && motor.swimming;

    if (chute) {
      this.collapse = -1;
      this.open = motor.flight.open;
      this.canopy.visible = true;
      const e = this.open;
      const sx = 0.12 + 0.88 * Math.min(1, e * 1.3);
      this.wing.scale.set(sx, 0.4 + 0.6 * e, 0.3 + 0.7 * Math.min(1, e * 1.6));
      this.wing.position.y = 2.4 + 2.8 * Math.min(1, e * 1.2);
      this.lines.scale.set(sx, Math.min(1, e * 1.2), 1);
      this.canopy.position.copy(p.position);
      this.lastYaw = p.yaw;
      this.canopy.rotation.set(-0.1 - motor.flare * 0.25, p.yaw, -motor.flight.bank * 1.6, 'YXZ');
    } else if (this.wasChute) {
      this.collapse = 0;
    }
    this.wasChute = chute;

    if (this.collapse >= 0) {
      // Deflate and settle behind the jumper.
      this.collapse += dt;
      const k = Math.min(1, this.collapse / 1.4);
      this.wing.scale.set(1 - k * 0.5, Math.max(0.05, 1 - k), 1);
      this.wing.position.y = 5.2 * (1 - k) + 0.2;
      this.lines.scale.set(1, Math.max(0.01, 1 - k), 1);
      this.canopy.rotation.set(k * 1.2, this.lastYaw, 0, 'YXZ');
      if (this.collapse > 2.2) { this.canopy.visible = false; this.collapse = -1; }
    }
  }
}
