// Walkable interiors (safehouse, gym, nightclub). Buildings in Neon Bay are
// solid boxes, so interiors are built as closed rooms floating high above the
// open ocean (east edge of the map) and entered through a street door with a
// fade + teleport, GTA style. One shared point light is moved into the active
// interior (constant light count = no shader recompiles).
import * as THREE from 'three';
import type { SystemContext } from '../../game/Systems';
import { box, mat } from './world';

export const INTERIOR_Y = 80;

export interface InteriorDef {
  id: string;
  name: string;
  /** World center of the room (x, z) — out over the ocean. */
  cx: number;
  cz: number;
  w: number;
  d: number;
  h: number;
  floor: string;
  wall: string;
  /** Local spawn (relative to center) + yaw when entering. */
  spawn: { x: number; z: number; yaw: number };
  /** Street door (outside) */
  door: { x: number; z: number; yaw: number };
  light?: { color: string; intensity: number };
}

export class Interior {
  readonly group = new THREE.Group();
  constructor(readonly def: InteriorDef, ctx: SystemContext) {
    const { cx, cz, w, d, h } = def;
    const Y = INTERIOR_Y;
    this.group.position.set(cx, Y, cz);
    const floorMat = mat(def.floor, 0.6);
    const wallMat = mat(def.wall, 0.85);
    const floor = box(w, 0.3, d, floorMat, 0, -0.15, 0);
    floor.castShadow = false;
    this.group.add(floor);
    const ceil = box(w, 0.3, d, mat('#1a1a22', 0.9), 0, h + 0.15, 0);
    ceil.castShadow = false;
    this.group.add(ceil);
    const t = 0.3;
    this.group.add(box(w + t * 2, h, t, wallMat, 0, h / 2, -d / 2 - t / 2));
    this.group.add(box(w + t * 2, h, t, wallMat, 0, h / 2, d / 2 + t / 2));
    this.group.add(box(t, h, d, wallMat, -w / 2 - t / 2, h / 2, 0));
    this.group.add(box(t, h, d, wallMat, w / 2 + t / 2, h / 2, 0));
    // baseboard trim
    const trim = mat('#ffffff', 0.5);
    for (const [x, z, bw, bd] of [[0, -d / 2 + 0.05, w, 0.1], [0, d / 2 - 0.05, w, 0.1], [-w / 2 + 0.05, 0, 0.1, d], [w / 2 - 0.05, 0, 0.1, d]]) {
      this.group.add(box(bw, 0.16, bd, trim, x, 0.08, z));
    }
    // ceiling light panels (emissive)
    const lp = new THREE.MeshBasicMaterial({ color: def.light?.color ?? '#fff3df', toneMapped: false });
    for (let i = -1; i <= 1; i += 2) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3, w / 4), 0.6), lp);
      p.rotation.x = Math.PI / 2;
      p.position.set(i * w * 0.22, h - 0.01, 0);
      this.group.add(p);
    }
    ctx.scene.add(this.group);
    const col = ctx.world.city.collision;
    col.add({ x0: cx - w / 2 - 1, x1: cx + w / 2 + 1, z0: cz - d / 2 - 1, z1: cz + d / 2 + 1, y0: Y - 0.6, y1: Y });
    col.add({ x0: cx - w / 2 - 1, x1: cx + w / 2 + 1, z0: cz - d / 2 - 1, z1: cz + d / 2 + 1, y0: Y + h, y1: Y + h + 0.4 });
    col.add({ x0: cx - w / 2 - 1, x1: cx + w / 2 + 1, z0: cz - d / 2 - 1, z1: cz - d / 2, y0: Y, y1: Y + h });
    col.add({ x0: cx - w / 2 - 1, x1: cx + w / 2 + 1, z0: cz + d / 2, z1: cz + d / 2 + 1, y0: Y, y1: Y + h });
    col.add({ x0: cx - w / 2 - 1, x1: cx - w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: Y, y1: Y + h });
    col.add({ x0: cx + w / 2, x1: cx + w / 2 + 1, z0: cz - d / 2, z1: cz + d / 2, y0: Y, y1: Y + h });
    this.group.visible = false;
  }

  /** Local (room) coords -> world xz. */
  wx(x: number): number { return this.def.cx + x; }
  wz(z: number): number { return this.def.cz + z; }

  /** Add a solid furniture collider (room coords). */
  solid(ctx: SystemContext, x: number, z: number, w: number, d: number, hgt: number): void {
    const X = this.wx(x), Z = this.wz(z);
    ctx.world.city.collision.add({ x0: X - w / 2, x1: X + w / 2, z0: Z - d / 2, z1: Z + d / 2, y0: INTERIOR_Y, y1: INTERIOR_Y + hgt });
  }
}

export class InteriorManager {
  readonly list = new Map<string, Interior>();
  current: Interior | null = null;
  private light: THREE.PointLight;
  private light2: THREE.PointLight;
  private ctx: SystemContext | null = null;
  onChange?: (id: string | null) => void;

  constructor(scene: THREE.Scene) {
    this.light = new THREE.PointLight('#fff1dc', 0, 30, 1.4);
    this.light2 = new THREE.PointLight('#fff1dc', 0, 30, 1.4);
    this.light.castShadow = false;
    this.light.userData.keep = this.light2.userData.keep = true; // interiors need them on every quality tier
    scene.add(this.light, this.light2);
  }

  add(ctx: SystemContext, def: InteriorDef): Interior {
    this.ctx = ctx;
    const i = new Interior(def, ctx);
    this.list.set(def.id, i);
    ctx.interactions.set({
      id: `life-door-${def.id}`, x: def.door.x, z: def.door.z, radius: 2.4, priority: 2,
      title: `Enter ${def.name}`, desc: 'Walk inside',
      enabled: () => !this.current && !ctx.world.vehicle,
      action: () => void this.enter(def.id),
    });
    const ex = def.cx + def.spawn.x - Math.sin(def.spawn.yaw) * 1.4, ez = def.cz + def.spawn.z - Math.cos(def.spawn.yaw) * 1.4;
    ctx.interactions.set({
      id: `life-exit-${def.id}`, x: ex, z: ez, radius: 2, priority: 3,
      title: `Leave ${def.name}`, desc: 'Back to the street',
      enabled: () => this.current === i,
      action: () => void this.exit(),
    });
    return i;
  }

  inside(): string | null {
    return this.current?.def.id ?? null;
  }

  async enter(id: string): Promise<void> {
    const ctx = this.ctx, i = this.list.get(id);
    if (!ctx || !i) return;
    await ctx.ui.fade(true);
    ctx.sfx('door');
    for (const o of this.list.values()) o.group.visible = o === i;
    this.current = i;
    const s = i.def.spawn;
    this.teleport(i.def.cx + s.x, i.def.cz + s.z, s.yaw, INTERIOR_Y);
    const L = i.def.light ?? { color: '#fff1dc', intensity: 40 };
    this.light.color.set(L.color);
    this.light.intensity = L.intensity;
    this.light.position.set(i.def.cx - i.def.w * 0.22, INTERIOR_Y + i.def.h - 0.6, i.def.cz);
    this.light2.color.set(L.color);
    this.light2.intensity = L.intensity;
    this.light2.position.set(i.def.cx + i.def.w * 0.22, INTERIOR_Y + i.def.h - 0.6, i.def.cz);
    this.onChange?.(id);
    await ctx.ui.fade(false);
  }

  async exit(): Promise<void> {
    const ctx = this.ctx, i = this.current;
    if (!ctx || !i) return;
    await ctx.ui.fade(true);
    ctx.sfx('door');
    this.leaveNow();
    await ctx.ui.fade(false);
  }

  /** Instant exit (e.g. on load / death). */
  leaveNow(): void {
    const ctx = this.ctx, i = this.current;
    if (!ctx || !i) return;
    this.current = null;
    i.group.visible = false;
    this.light.intensity = 0;
    this.light2.intensity = 0;
    const d = i.def.door;
    this.teleport(d.x + Math.sin(d.yaw) * 1.2, d.z + Math.cos(d.yaw) * 1.2, d.yaw, 0);
    this.onChange?.(null);
  }

  teleport(x: number, z: number, yaw: number, y: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = ctx.world.player;
    p.place(x, z, yaw);
    p.position.y = y;
    p.sync();
    ctx.world.rig.snapTo(p.position, yaw + Math.PI);
  }

  /** Called each frame: if the player somehow left the room (fell, respawned), reset state. */
  check(): void {
    const ctx = this.ctx, i = this.current;
    if (!ctx || !i) return;
    const p = ctx.world.player.position;
    if (p.y < INTERIOR_Y - 5 || Math.abs(p.x - i.def.cx) > i.def.w || Math.abs(p.z - i.def.cz) > i.def.d) {
      this.current = null;
      i.group.visible = false;
      this.light.intensity = 0;
      this.light2.intensity = 0;
      this.onChange?.(null);
    }
  }
}
