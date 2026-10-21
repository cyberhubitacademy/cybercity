import * as THREE from 'three';
import {
  BEACH_X, Block, HARBOR_Z, ROADS_X, ROADS_Z, ROAD_WIDTH, SHORE_X, buildBlocks, mulberry32,
} from './layout';
import { CollisionWorld } from './Collision';
import { FacadeKind, asphalt, billboard, facade, grass, neonSign, sand, sidewalk } from './textures';
import { ARCADE_TERMINALS, TERMINALS } from './spots';

// Builds the static city: ground, blocks, buildings, landmarks. Props (palms,
// lamps, markings, beach furniture, pier) live in Props.ts.

export interface NightLit {
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  day: number;
  night: number;
  kind: 'emissive' | 'color';
}

export class CityBuilder {
  readonly group = new THREE.Group();
  readonly collision = new CollisionWorld();
  readonly nightLit: NightLit[] = [];
  readonly animated: ((t: number) => void)[] = [];
  readonly blocks: Block[] = buildBlocks();
  private matCache = new Map<string, THREE.MeshStandardMaterial>();
  private rnd = mulberry32(2026);

  build(): void {
    this.buildGround();
    for (const b of this.blocks) this.buildBlock(b);
    this.buildLandmarks();
    this.buildTerminals();
    this.buildBoundary();
  }

  // ---------- helpers ----------

  /** Facade material, cached by kind/color/seed; registers emissive windows for night. */
  facadeMat(kind: FacadeKind, color: string, seed = 1): THREE.MeshStandardMaterial {
    const key = `${kind}|${color}|${seed}`;
    const hit = this.matCache.get(key);
    if (hit) return hit;
    const maps = facade(kind, seed);
    const glassy = kind === 'glass';
    const m = new THREE.MeshStandardMaterial({
      color,
      map: maps.map,
      roughnessMap: maps.roughness,
      roughness: 1,
      metalness: glassy ? 0.55 : kind === 'datacenter' ? 0.25 : 0.05,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: maps.emissive,
      emissiveIntensity: 0,
      envMapIntensity: glassy ? 1.4 : 0.6,
    });
    m.userData.tile = maps.tile;
    this.matCache.set(key, m);
    this.nightLit.push({ material: m, day: kind === 'datacenter' ? 0.6 : 0.0, night: kind === 'datacenter' ? 1.8 : 0.9, kind: 'emissive' });
    return m;
  }

  plainMat(color: string, rough = 0.8, metal = 0, emissive?: string, emissiveNight = 0): THREE.MeshStandardMaterial {
    const key = `plain|${color}|${rough}|${metal}|${emissive ?? ''}|${emissiveNight}`;
    const hit = this.matCache.get(key);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveNight * 0.4;
      this.nightLit.push({ material: m, day: emissiveNight * 0.4, night: emissiveNight, kind: 'emissive' });
    }
    this.matCache.set(key, m);
    return m;
  }

  /** Box with UVs scaled so the material's texture tiles in world meters. */
  tiledBox(w: number, h: number, d: number, tileW: number, tileH: number): THREE.BoxGeometry {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // faces: +x, -x, +y, -y, +z, -z (4 verts each)
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const [fu, fv] = dims[f];
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * (fu / tileW), uv.getY(i) * (fv / tileH));
      }
    }
    uv.needsUpdate = true;
    return g;
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, cast = true, receive = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }

  /** Solid building volume with roof material on top. Registers a collider. */
  building(x0: number, z0: number, x1: number, z1: number, h: number, kind: FacadeKind, color: string, seed = 1, y0 = 0): THREE.Mesh {
    const w = x1 - x0, d = z1 - z0;
    const mat = this.facadeMat(kind, color, seed);
    const [tw, th] = mat.userData.tile as [number, number];
    const roof = this.plainMat(kind === 'glass' ? '#3a4152' : '#c9c2bb', 0.9);
    const geo = this.tiledBox(w, h, d, tw, th);
    const m = this.mesh(geo, [mat, mat, roof, roof, mat, mat], (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    this.collision.addRect(x0, z0, x1, z1, h, y0);
    return m;
  }

  neon(text: string, color: string, x: number, y: number, z: number, height: number, yaw: number, vertical = false, script = false): THREE.Mesh {
    const { tex, aspect } = neonSign(text, color, vertical, script);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    mat.color.setScalar(1.2);
    this.nightLit.push({ material: mat, day: 1.1, night: 2.6, kind: 'color' });
    const w = height * aspect;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, height), mat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  /** Thin decorative band (art deco stripes, canopies). No collider. */
  band(x0: number, z0: number, x1: number, z1: number, y: number, h: number, color: string, glow = 0): void {
    const mat = glow ? this.plainMat(color, 0.4, 0, color, glow) : this.plainMat(color, 0.6);
    this.mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), mat, (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, glow === 0, true);
  }

  // ---------- ground ----------

  private buildGround(): void {
    const landX0 = -300, landX1 = BEACH_X - 3, landZ0 = -300, landZ1 = HARBOR_Z;
    const tex = asphalt().clone();
    tex.needsUpdate = true;
    tex.repeat.set((landX1 - landX0) / 10, (landZ1 - landZ0) / 10);
    const road = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, color: '#d9d6e6' });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(landX1 - landX0, landZ1 - landZ0), road);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((landX0 + landX1) / 2, 0, (landZ0 + landZ1) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Beach: sand that slopes into the water.
    const sx0 = BEACH_X - 3, sx1 = SHORE_X + 40, sz0 = -300, sz1 = HARBOR_Z + 40;
    const segX = 60, segZ = 80;
    const sg = new THREE.PlaneGeometry(sx1 - sx0, sz1 - sz0, segX, segZ);
    sg.rotateX(-Math.PI / 2);
    const pos = sg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + (sx0 + sx1) / 2;
      const wz = pos.getZ(i) + (sz0 + sz1) / 2;
      const distShore = Math.max(wx - (SHORE_X - 14), wz - (HARBOR_Z - 6));
      let y = 0.06 + Math.sin(wx * 0.08) * Math.cos(wz * 0.05) * 0.18;
      if (distShore > 0) y -= distShore * 0.09;
      pos.setY(i, y);
    }
    sg.computeVertexNormals();
    const st = sand().clone();
    st.needsUpdate = true;
    st.repeat.set((sx1 - sx0) / 12, (sz1 - sz0) / 12);
    const sandMesh = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: st, roughness: 0.95, color: '#e3c596' }));
    sandMesh.position.set((sx0 + sx1) / 2, 0, (sz0 + sz1) / 2);
    sandMesh.receiveShadow = true;
    this.group.add(sandMesh);

    // Harbor quay wall
    const quay = this.plainMat('#9aa3ad', 0.85);
    this.mesh(new THREE.BoxGeometry(BEACH_X + 300, 2.2, 2), quay, (BEACH_X - 300) / 2 - 2, -0.9, HARBOR_Z + 1, false, true);
  }

  private sidewalkSlab(x0: number, z0: number, x1: number, z1: number, mat?: THREE.Material): void {
    const tex = sidewalk();
    const m = (mat as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const geo = this.tiledBox(x1 - x0, 0.18, z1 - z0, 4, 4);
    this.mesh(geo, m, (x0 + x1) / 2, 0.09, (z0 + z1) / 2, false, true);
    this.collision.addRect(x0, z0, x1, z1, 0.18);
  }

  private sidewalkMat?: THREE.MeshStandardMaterial;
  private grassMat?: THREE.MeshStandardMaterial;

  private lawn(x0: number, z0: number, x1: number, z1: number): void {
    if (!this.grassMat) {
      const t = grass();
      this.grassMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, color: '#c7f0b0' });
    }
    const geo = this.tiledBox(x1 - x0, 0.22, z1 - z0, 8, 8);
    this.mesh(geo, this.grassMat, (x0 + x1) / 2, 0.11, (z0 + z1) / 2, false, true);
  }

  // ---------- blocks ----------

  private buildBlock(b: Block): void {
    if (!this.sidewalkMat) this.sidewalkMat = new THREE.MeshStandardMaterial({ map: sidewalk(), roughness: 0.85, color: '#e6dcd6' });
    this.sidewalkSlab(b.x0, b.z0, b.x1, b.z1, this.sidewalkMat);
    const key = `${b.col},${b.row}`;
    // Landmark blocks get custom content in buildLandmarks().
    const landmark: Record<string, true> = { '4,2': true, '4,3': true, '3,4': true, '2,4': true, '3,1': true, '1,0': true, '2,2': true, '0,3': true };
    if (landmark[key]) {
      if (key === '4,3') this.beachHotels(b, true);
      if (key === '1,0') this.campusFill(b, true);
      if (key === '0,3') this.industrialFill(b, true);
      return;
    }
    switch (b.district) {
      case 'beach': this.beachHotels(b, false); break;
      case 'downtown': this.downtownTowers(b); break;
      case 'harbor': this.harborFill(b); break;
      case 'oldtown': this.oldTownHouses(b); break;
      case 'industrial': this.industrialFill(b, false); break;
      case 'university': this.campusFill(b, false); break;
      default: break;
    }
  }

  private pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rnd() * arr.length)];
  }

  private static readonly PASTELS = ['#ffb3c7', '#9ff0e0', '#ffd6a5', '#c8b6ff', '#a0e7ff', '#fff1a8', '#ff9fb2', '#b8f2b0', '#ffc8e6'];
  private static readonly TRIMS = ['#ff2fa0', '#19c3d6', '#7b2cff', '#ff8a3d', '#16a3a3', '#ffffff'];
  private static readonly HOTEL_NAMES = ['PALM INN', 'OCEAN VIEW', 'NEON NIGHTS', 'COCO CABANA', 'LAGUNA', 'STARLIGHT', 'SUNRISE', 'MARLIN CLUB', 'TROPICANA', 'EL CORAL', 'AQUA', 'BAYSIDE'];
  private static readonly NEONS = ['#ff2fa0', '#19e6ff', '#b14dff', '#ffd23f', '#3dffb0', '#ff8a3d'];

  /** Art-deco hotels facing Ocean Drive (east). */
  private beachHotels(b: Block, southHalfOnly: boolean): void {
    const zStart = southHalfOnly ? b.z0 + 58 : b.z0 + 6;
    let z = zStart;
    while (z < b.z1 - 14) {
      const len = 18 + this.rnd() * 14;
      const z1 = Math.min(z + len, b.z1 - 6);
      if (z1 - z < 12) break;
      const depth = 26 + this.rnd() * 18;
      const x1 = b.x1 - 9, x0 = x1 - depth;
      const floors = 3 + Math.floor(this.rnd() * 4);
      this.decoBuilding(x0, z, x1, z1, floors * 3.6, this.pick(CityBuilder.PASTELS), this.pick(CityBuilder.TRIMS), this.pick(CityBuilder.HOTEL_NAMES), this.pick(CityBuilder.NEONS));
      z = z1 + 4 + this.rnd() * 4;
    }
    // back row: smaller apartments
    if (!southHalfOnly) {
      for (let zz = b.z0 + 8; zz < b.z1 - 20; zz += 26) {
        this.building(b.x0 + 6, zz, b.x0 + 26, zz + 20, 8 + this.rnd() * 10, 'deco', this.pick(CityBuilder.PASTELS), 2);
      }
    }
  }

  /** Streamline-moderne hotel: stacked volume, colored bands, rounded corner tower, neon. */
  decoBuilding(x0: number, z0: number, x1: number, z1: number, h: number, color: string, trim: string, name: string, neonColor: string): void {
    this.building(x0, z0, x1, z1, h, 'deco', color, 1 + Math.floor(this.rnd() * 3));
    // horizontal eyebrow bands on the facade
    for (let y = 3.4; y < h - 1; y += 3.6) this.band(x1, z0 + 0.5, x1 + 0.6, z1 - 0.5, y, 0.25, '#ffffff');
    this.band(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h, 0.9, trim);
    // corner tower / fin with vertical neon
    const finZ = z0 + 2;
    this.band(x1 - 1, finZ - 1, x1 + 1.2, finZ + 1, 0, h + 4.5, color);
    const vertical = name.replace(/\s/g, '').slice(0, 6);
    this.neon(vertical, neonColor, x1 + 1.25, h * 0.55 + 2, finZ, Math.min(h + 2, vertical.length * 2.6), Math.PI / 2, true);
    // canopy over entrance with glowing edge
    const mid = (z0 + z1) / 2;
    this.band(x1, mid - 4, x1 + 3, mid + 4, 3.1, 0.3, trim);
    this.band(x1 + 2.9, mid - 4, x1 + 3.05, mid + 4, 3.0, 0.15, neonColor, 2.5);
    // rooftop name sign
    if (this.rnd() < 0.7) this.neon(name, neonColor, x1 - 0.2, h + 2.6, mid, 3, Math.PI / 2, false, this.rnd() < 0.4);
  }

  private downtownTowers(b: Block): void {
    const glassColors = ['#9ad7ff', '#7fe0e6', '#c3a6ff', '#ffc0e0', '#a8c7ff', '#eaf6ff'];
    const lots: [number, number, number, number][] = [];
    const midX = (b.x0 + b.x1) / 2, midZ = (b.z0 + b.z1) / 2;
    lots.push([b.x0 + 6, b.z0 + 6, midX - 3, midZ - 3], [midX + 3, b.z0 + 6, b.x1 - 6, midZ - 3], [b.x0 + 6, midZ + 3, midX - 3, b.z1 - 6], [midX + 3, midZ + 3, b.x1 - 6, b.z1 - 6]);
    for (const [x0, z0, x1, z1] of lots) {
      if (this.rnd() < 0.15) {
        this.lawn(x0, z0, x1, z1);
        continue;
      }
      const shrink = 2 + this.rnd() * 4;
      const h = 30 + this.rnd() * 75;
      const color = this.pick(glassColors);
      this.building(x0 + shrink, z0 + shrink, x1 - shrink, z1 - shrink, h, 'glass', color, 1 + Math.floor(this.rnd() * 3));
      // podium
      this.building(x0, z0, x1, z1, 6, 'deco', '#efe7e1', 3);
      // setback crown with light strip
      if (this.rnd() < 0.6) {
        const inset = 4;
        this.building(x0 + shrink + inset, z0 + shrink + inset, x1 - shrink - inset, z1 - shrink - inset, 10, 'glass', color, 2, h);
        this.band(x0 + shrink + inset - 0.2, z0 + shrink + inset - 0.2, x1 - shrink - inset + 0.2, z1 - shrink - inset + 0.2, h + 10, 0.5, this.pick(CityBuilder.NEONS), 3);
      } else {
        this.band(x0 + shrink - 0.2, z0 + shrink - 0.2, x1 - shrink + 0.2, z1 - shrink + 0.2, h, 0.6, this.pick(CityBuilder.NEONS), 3);
      }
    }
    if (this.rnd() < 0.5) this.rooftopBillboard(midX, b.z0 + 10, 6);
  }

  rooftopBillboard(x: number, z: number, y: number): void {
    const ads: [string, string, string, string][] = [
      ['PATCH TUESDAY', 'Update today. Sleep tonight.', '#ff2fa0', '#7b2cff'],
      ['USE MFA', 'Two factors > one regret.', '#19c3d6', '#7b2cff'],
      ['SUNSET SHIELD', 'Neon Bay\'s cyber defenders', '#ff8a3d', '#ff2fa0'],
      ['RADIO NEON FM', '80.8 — all synth, all night', '#b14dff', '#19c3d6'],
      ['BACK IT UP', '3 copies · 2 media · 1 offsite', '#16a3a3', '#ff8a3d'],
    ];
    const [h, s, a, c] = this.pick(ads);
    const tex = billboard(h, s, a, c);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.6 });
    this.nightLit.push({ material: mat, day: 0.25, night: 1.2, kind: 'emissive' });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), mat);
    board.position.set(x, y + 7, z);
    board.castShadow = true;
    this.group.add(board);
    const legMat = this.plainMat('#555a66', 0.6, 0.6);
    this.mesh(new THREE.BoxGeometry(0.4, 7, 0.4), legMat, x - 6, y + 3.5, z + 0.3);
    this.mesh(new THREE.BoxGeometry(0.4, 7, 0.4), legMat, x + 6, y + 3.5, z + 0.3);
  }

  private oldTownHouses(b: Block): void {
    for (let x = b.x0 + 6; x < b.x1 - 14; x += 18) {
      for (const side of [0, 1]) {
        const z0 = side === 0 ? b.z0 + 6 : b.z1 - 20;
        const w = 12 + this.rnd() * 3, d = 12 + this.rnd() * 2;
        const h = 6 + Math.floor(this.rnd() * 2) * 3.4;
        const col = this.pick(CityBuilder.PASTELS);
        this.building(x, z0, x + w, z0 + d, h, 'house', col, 1 + Math.floor(this.rnd() * 3));
        // terracotta roof slab + awning
        this.band(x - 0.5, z0 - 0.5, x + w + 0.5, z0 + d + 0.5, h, 0.6, '#e07a5f');
        const awningZ = side === 0 ? z0 + d : z0 - 1.6;
        this.band(x + 2, awningZ, x + w - 2, awningZ + 1.6, 2.8, 0.2, this.pick(CityBuilder.TRIMS));
      }
    }
    this.lawn(b.x0 + 8, (b.z0 + b.z1) / 2 - 8, b.x1 - 8, (b.z0 + b.z1) / 2 + 8);
  }

  private harborFill(b: Block): void {
    const colors = ['#ff9f6b', '#5fc9c9', '#f6e3b4', '#c4d6e8', '#ff7fa8'];
    for (let x = b.x0 + 6; x < b.x1 - 20; x += 36) {
      this.building(x, b.z0 + 8, x + 30, b.z0 + 40, 10 + this.rnd() * 6, 'warehouse', this.pick(colors), 1);
    }
    this.containers(b.x0 + 8, b.z1 - 26, b.x1 - 8, b.z1 - 6);
  }

  containers(x0: number, z0: number, x1: number, z1: number): void {
    const colors = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#ff2fa0', '#ffd23f', '#7b2cff'];
    const geo = new THREE.BoxGeometry(12, 2.6, 2.5);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3 });
    const spots: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    for (let x = x0 + 6; x < x1 - 6; x += 13) {
      for (let z = z0 + 1.5; z < z1 - 1.5; z += 2.7) {
        const stack = 1 + Math.floor(this.rnd() * 3);
        for (let s = 0; s < stack; s++) {
          spots.push(new THREE.Matrix4().makeTranslation(x, 1.3 + s * 2.6, z));
          cols.push(new THREE.Color(this.pick(colors)));
        }
      }
    }
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((m, i) => { inst.setMatrixAt(i, m); inst.setColorAt(i, cols[i]); });
    inst.castShadow = inst.receiveShadow = true;
    this.group.add(inst);
    this.collision.addRect(x0, z0, x1, z1, 2.6);
  }

  private industrialFill(b: Block, withHospital: boolean): void {
    if (withHospital) {
      // Neon Bay General hospital (respawn point)
      this.building(b.x0 + 10, b.z0 + 14, b.x1 - 10, b.z0 + 52, 18, 'deco', '#f4f7fb', 3);
      this.neon('NEON BAY GENERAL', '#ff4d6d', (b.x0 + b.x1) / 2, 20.5, b.z0 + 13.6, 3, Math.PI, false);
      this.band((b.x0 + b.x1) / 2 - 1.2, b.z0 + 13.4, (b.x0 + b.x1) / 2 + 1.2, b.z0 + 13.7, 9, 6, '#ff4d6d', 3);
      this.band((b.x0 + b.x1) / 2 - 3, b.z0 + 13.4, (b.x0 + b.x1) / 2 + 3, b.z0 + 13.7, 11.8, 2.4, '#ff4d6d', 3);
      return;
    }
    const colors = ['#d9a066', '#8fb3c9', '#c98f8f', '#a9c9a0', '#e6c27a'];
    this.building(b.x0 + 8, b.z0 + 8, b.x0 + 46, b.z0 + 40, 14, 'warehouse', this.pick(colors), 1);
    this.building(b.x0 + 8, b.z0 + 46, b.x1 - 8, b.z1 - 8, 9, 'warehouse', this.pick(colors), 1);
    // smokestacks + storage tanks
    const stackMat = this.plainMat('#b5654a', 0.8);
    for (let i = 0; i < 2; i++) {
      const x = b.x1 - 14 - i * 9, z = b.z0 + 16;
      this.mesh(new THREE.CylinderGeometry(1.4, 2, 34, 14), stackMat, x, 17, z);
      this.band(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 28, 1.2, '#ffffff');
      this.band(x - 1.5, z - 1.5, x + 1.5, z + 1.5, 33.6, 0.4, '#ff4d6d', 3);
      this.collision.addRect(x - 2, z - 2, x + 2, z + 2, 34);
    }
    const tankMat = this.plainMat('#dfe6ec', 0.4, 0.5);
    this.mesh(new THREE.CylinderGeometry(5, 5, 9, 24), tankMat, b.x1 - 20, 4.5, b.z0 + 34);
    this.collision.addRect(b.x1 - 25, b.z0 + 29, b.x1 - 15, b.z0 + 39, 9);
  }

  private campusFill(b: Block, main: boolean): void {
    this.lawn(b.x0 + 4, b.z0 + 4, b.x1 - 4, b.z1 - 4);
    if (main) return; // forensics lab is a landmark
    const brick = '#e8a87c';
    this.building(b.x0 + 8, b.z0 + 8, b.x1 - 8, b.z0 + 26, 14, 'campus', brick, 1);
    this.building(b.x0 + 8, b.z1 - 24, b.x0 + 34, b.z1 - 8, 11, 'campus', '#f2c6a0', 2);
    // clock tower landmark
    const cx = b.x1 - 20, cz = b.z1 - 18;
    this.building(cx - 4, cz - 4, cx + 4, cz + 4, 34, 'campus', '#f5e6d3', 3);
    const clockMat = this.plainMat('#fff8e1', 0.3, 0, '#ffe9a8', 2);
    for (const [dx, dz, yaw] of [[0, 4.05, 0], [0, -4.05, Math.PI], [4.05, 0, Math.PI / 2], [-4.05, 0, -Math.PI / 2]] as const) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), clockMat);
      face.position.set(cx + dx, 29, cz + dz);
      face.rotation.y = yaw;
      this.group.add(face);
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.6, 9, 4), this.plainMat('#3b7a8c', 0.5, 0.3));
    spire.position.set(cx, 38.5, cz);
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = true;
    this.group.add(spire);
  }

  // ---------- landmarks ----------

  private buildLandmarks(): void {
    this.sunsetShieldHQ();
    this.coralCafe();
    this.socBuilding();
    this.dataCenter();
    this.palmettoBank();
    this.forensicsLab();
    this.techMarket();
  }

  /** Open-front lobby you can walk into, with a tower above. */
  private sunsetShieldHQ(): void {
    const x0 = 104, x1 = 148, z0 = -64, z1 = -16;
    const wallMat = this.plainMat('#ffd0e4', 0.7);
    // lobby walls (back, north, south) – walkable interior
    const walls: [number, number, number, number][] = [[x0, z0, x0 + 1.2, z1], [x0, z0, x1, z0 + 1.2], [x0, z1 - 1.2, x1, z1]];
    for (const [a, b, c, d] of walls) {
      this.mesh(new THREE.BoxGeometry(c - a, 6, d - b), wallMat, (a + c) / 2, 3, (b + d) / 2);
      this.collision.addRect(a, b, c, d, 6);
    }
    // pillars at the open front
    for (const z of [z0 + 12, z1 - 12]) {
      this.mesh(new THREE.CylinderGeometry(0.7, 0.7, 6, 16), this.plainMat('#ffffff', 0.4), x1 - 1, 3, z);
      this.collision.addRect(x1 - 1.7, z - 0.7, x1 - 0.3, z + 0.7, 6);
    }
    // lobby floor (glossy terrazzo)
    const floor = this.mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), this.plainMat('#d8cce2', 0.45, 0.05), (x0 + x1) / 2, 0.1, (z0 + z1) / 2, false, true);
    floor.receiveShadow = true;
    this.collision.addRect(x0, z0, x1, z1, 0.2);
    // ceiling glow strips
    this.band(x0 + 2, z0 + 8, x1 - 2, z0 + 8.4, 5.6, 0.1, '#19e6ff', 3);
    this.band(x0 + 2, z1 - 8.4, x1 - 2, z1 - 8, 5.6, 0.1, '#ff2fa0', 3);
    // reception desk
    const desk = this.plainMat('#2a1f4f', 0.35, 0.2);
    this.mesh(new THREE.BoxGeometry(2, 1.1, 10), desk, 128, 0.75, -40);
    this.band(129, -45, 129.1, -35, 0.6, 0.12, '#ff2fa0', 3);
    this.collision.add({ x0: 127, x1: 129, z0: -45, z1: -35, y0: 0, y1: 1.2 });
    // logo wall
    this.neon('SUNSET SHIELD', '#ff2fa0', x0 + 1.3, 3.6, -40, 1.6, Math.PI / 2);
    // tower above
    this.building(x0, z0, x1, z1, 30, 'deco', '#ff9fc8', 3, 6);
    for (let y = 9.6; y < 36; y += 3.6) this.band(x1, z0, x1 + 0.4, z1, y, 0.35, '#19e6ff', 0.6);
    this.band(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, 36, 1.2, '#7b2cff');
    this.neon('SUNSET SHIELD', '#19e6ff', x1 + 0.6, 39.5, (z0 + z1) / 2, 4.5, Math.PI / 2);
    this.neon('SECURITY', '#ff2fa0', x1 + 0.6, 7.6, (z0 + z1) / 2, 1.4, Math.PI / 2);
    this.neon('SHIELD', '#ffd23f', x1 + 1.6, 22, z0 + 2, 18, Math.PI / 2, true);
    // interior lights
    const l1 = new THREE.PointLight('#ff7cc6', 30, 26, 1.6);
    l1.position.set(126, 5, -48);
    const l2 = new THREE.PointLight('#8ff4ff', 30, 26, 1.6);
    l2.position.set(126, 5, -30);
    this.group.add(l1, l2);
  }

  private coralCafe(): void {
    const x0 = 116, x1 = 146, z0 = 32, z1 = 64;
    this.building(x0, z0, x1, z1, 8, 'deco', '#9ff0e0', 2);
    this.band(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, 8, 0.8, '#ff7f6b');
    // striped awning
    for (let i = 0; i < 8; i++) {
      const z = z0 + 2 + i * 3.5;
      this.band(x1, z, x1 + 4, z + 1.75, 3.2, 0.2, '#ffffff');
      this.band(x1, z + 1.75, x1 + 4, z + 3.5, 3.2, 0.2, '#ff5c8a');
    }
    this.neon('Coral Café', '#ff7f6b', x1 + 0.3, 6.2, (z0 + z1) / 2, 2.4, Math.PI / 2, false, true);
    // terrace tables + umbrellas
    const tableMat = this.plainMat('#ffffff', 0.4);
    const umbrellaCols = ['#ff2fa0', '#19c3d6', '#ffd23f'];
    for (let i = 0; i < 3; i++) {
      const z = z0 + 6 + i * 9;
      const x = x1 + 7;
      this.mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 20), tableMat, x, 1, z);
      this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), tableMat, x, 1.3, z);
      const um = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.8, 12), this.plainMat(umbrellaCols[i], 0.7));
      um.position.set(x, 2.8, z);
      um.castShadow = true;
      this.group.add(um);
      this.collision.add({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, y0: 0, y1: 1.1, solidForCars: false });
    }
  }

  private socBuilding(): void {
    const x0 = -66, x1 = -14, z0 = 112, z1 = 160;
    this.building(x0, z0, x1, z1, 26, 'glass', '#6a7bff', 2);
    this.band(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, 26, 0.6, '#19e6ff', 3);
    // video wall over the entrance
    const tex = billboard('SOC 24/7', 'Harbor Security Operations Center', '#0b0a24', '#7b2cff');
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.color.setScalar(1.3);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), mat);
    wall.position.set((x0 + x1) / 2, 15, z0 - 0.2);
    wall.rotation.y = Math.PI;
    this.group.add(wall);
    this.neon('HARBOR SOC', '#19e6ff', (x0 + x1) / 2, 5, z0 - 0.3, 2.4, Math.PI);
  }

  private dataCenter(): void {
    const x0 = 16, x1 = 80, z0 = 116, z1 = 166;
    this.building(x0, z0, x1, z1, 16, 'datacenter', '#e8eef5', 1);
    // rooftop chillers
    const unit = this.plainMat('#aab6c3', 0.5, 0.5);
    for (let x = x0 + 8; x < x1 - 6; x += 10) {
      for (let z = z0 + 8; z < z1 - 6; z += 12) this.mesh(new THREE.BoxGeometry(6, 2.4, 6), unit, x, 17.2, z);
    }
    this.neon('HARBOR CLOUD', '#19e6ff', (x0 + x1) / 2, 12, z0 - 0.3, 3, Math.PI);
    // security fence posts with gate light
    this.band(x0 - 2, z0 - 3, x0 + 18, z0 - 2.8, 0, 2.2, '#4a5466');
    this.band(x1 - 18, z0 - 3, x1 + 2, z0 - 2.8, 0, 2.2, '#4a5466');
    this.collision.addRect(x0 - 2, z0 - 3, x0 + 18, z0 - 2.8, 2.2);
    this.collision.addRect(x1 - 18, z0 - 3, x1 + 2, z0 - 2.8, 2.2);
    // docks south of the harbor road: crane
    this.crane(60, 196);
    this.crane(-20, 196);
    this.containers(90, 182, 160, 206);
    this.containers(-70, 182, -30, 206);
  }

  private crane(x: number, z: number): void {
    const m = this.plainMat('#ff8a3d', 0.55, 0.4);
    for (const dx of [-4, 4]) for (const dz of [-4, 4]) {
      this.mesh(new THREE.BoxGeometry(0.8, 24, 0.8), m, x + dx, 12, z + dz);
      this.collision.addRect(x + dx - 0.5, z + dz - 0.5, x + dx + 0.5, z + dz + 0.5, 24);
    }
    this.mesh(new THREE.BoxGeometry(10, 2, 46), m, x, 25, z + 10);
    this.mesh(new THREE.BoxGeometry(5, 3.4, 5), this.plainMat('#ffffff', 0.4), x, 23, z - 6);
    this.band(x - 0.3, z + 31, x + 0.3, z + 33, 26, 0.4, '#ff4d6d', 4);
  }

  private palmettoBank(): void {
    const x0 = 26, x1 = 70, z0 = -152, z1 = -110;
    this.building(x0, z0, x1, z1, 128, 'glass', '#ffd9a0', 3);
    this.building(x0 + 8, z0 + 8, x1 - 8, z1 - 8, 18, 'glass', '#ffe8c2', 1, 128);
    // gold crown + beacon
    this.band(x0 + 7.6, z0 + 7.6, x1 - 7.6, z1 - 7.6, 146, 0.8, '#ffd23f', 3);
    this.mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 8), this.plainMat('#dddddd', 0.3, 0.8), (x0 + x1) / 2, 153, (z0 + z1) / 2);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), this.plainMat('#ff2fa0', 0.3, 0, '#ff2fa0', 6));
    beacon.position.set((x0 + x1) / 2, 160.5, (z0 + z1) / 2);
    this.group.add(beacon);
    this.animated.push((t) => { beacon.visible = Math.sin(t * 3) > -0.2; });
    this.neon('PALMETTO BANK', '#ffd23f', (x0 + x1) / 2, 12, z1 + 0.3, 3, 0);
    // plaza fountain
    const fx = 48, fz = -102;
    this.mesh(new THREE.CylinderGeometry(4, 4.4, 0.8, 32), this.plainMat('#f1ece4', 0.6), fx + 14, 0.4, fz);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.1, 32), new THREE.MeshStandardMaterial({ color: '#4fd6ff', roughness: 0.05, metalness: 0.2, emissive: '#19a6ff', emissiveIntensity: 0.3 }));
    water.position.set(fx + 14, 0.78, fz);
    this.group.add(water);
    this.collision.addRect(fx + 10, fz - 4, fx + 18, fz + 4, 0.8);
  }

  private forensicsLab(): void {
    const x0 = -152, x1 = -98, z0 = -238, z1 = -194;
    this.building(x0, z0, x1, z1, 16, 'campus', '#e8a87c', 2);
    this.band(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, 16, 0.8, '#ffffff');
    this.neon('OKAFOR FORENSICS LAB', '#b14dff', (x0 + x1) / 2, 6, z1 + 0.3, 1.8, 0);
    this.neon('BAYVIEW U', '#ffd23f', (x0 + x1) / 2, 18.6, z1 - 1, 3, 0);
  }

  private techMarket(): void {
    // Neon stalls ring a plaza under string lights.
    const cx = -38, cz = -38;
    const stallColors = ['#ff2fa0', '#19e6ff', '#b14dff', '#ffd23f', '#3dffb0', '#ff8a3d'];
    const names = ['BYTE BAZAAR', 'CHIP SHOP', 'RAM RANCH', 'DISK DEPOT', 'GADGETS', 'RETRO PCs'];
    const ring = 22;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = -a - Math.PI / 2;
      const col = stallColors[i];
      const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 2), this.plainMat('#2a1f4f', 0.4));
      counter.position.set(0, 0.55, 0);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 4), this.plainMat(col, 0.5));
      roof.position.set(0, 3.2, -0.6);
      const back = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.3), this.plainMat('#1b1438', 0.6));
      back.position.set(0, 1.6, -2.4);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 0.12), this.plainMat(col, 0.3, 0, col, 4));
      edge.position.set(0, 3.1, 1.4);
      for (const m of [counter, roof, back]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(counter, roof, back, edge);
      this.group.add(g);
      const sign = this.neon(names[i], col, 0, 0, 0, 0.9, 0);
      sign.removeFromParent();
      sign.position.set(0, 3.9, 1.4);
      g.add(sign);
      this.collision.addRect(x - 3.5, z - 3.5, x + 3.5, z + 3.5, 1.1);
    }
    // string lights (glowing bulbs) across the plaza
    const bulbGeo = new THREE.SphereGeometry(0.14, 6, 6);
    const bulbs: THREE.Matrix4[] = [];
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + 0.3, a1 = ((i + 3) / 6) * Math.PI * 2 + 0.3;
      const p0 = new THREE.Vector3(cx + Math.cos(a0) * ring, 4.2, cz + Math.sin(a0) * ring);
      const p1 = new THREE.Vector3(cx + Math.cos(a1) * ring, 4.2, cz + Math.sin(a1) * ring);
      for (let t = 0.04; t < 1; t += 0.04) {
        const p = p0.clone().lerp(p1, t);
        p.y -= Math.sin(t * Math.PI) * 1.6;
        bulbs.push(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      }
    }
    const bulbMat = this.plainMat('#ffe9a8', 0.3, 0, '#ffd27a', 4);
    const inst = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
    bulbs.forEach((m, i) => inst.setMatrixAt(i, m));
    this.group.add(inst);
    this.neon('UNDERGROUND TECH MARKET', '#ff2fa0', cx, 8, cz - 34.5, 2.2, 0);
    // surrounding low buildings
    this.building(-72, -72, -48, -64, 12, 'deco', '#c8b6ff', 2);
    this.building(-28, -72, -4, -64, 10, 'deco', '#ffb3c7', 1);
  }

  private arcadeCabinet(x: number, z: number, facing: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 1.1), this.plainMat('#2a0f5a', 0.35, 0.3));
    body.position.y = 1.15;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.05), this.plainMat('#0c2a3a', 0.2, 0, '#ff2fa0', 2.6));
    screen.position.set(0, 1.55, 0.56);
    screen.rotation.x = -0.15;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.45), this.plainMat('#19e6ff', 0.3, 0, '#19e6ff', 2));
    deck.position.set(0, 1.05, 0.62);
    body.castShadow = true;
    g.add(body, screen, deck);
    this.group.add(g);
    const marquee = this.neon('ARCADE', '#ffd23f', 0, 0, 0, 0.45, 0);
    marquee.removeFromParent();
    marquee.position.set(0, 2.5, 0.56);
    g.add(marquee);
    this.collision.add({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, y0: 0, y1: 2.3 });
  }

  private buildTerminals(): void {
    for (const t of TERMINALS) {
      if (ARCADE_TERMINALS.has(t.id)) {
        this.arcadeCabinet(t.x, t.z, t.facing);
        continue;
      }
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      g.rotation.y = t.facing;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.8), this.plainMat('#241a4a', 0.35, 0.3));
      base.position.y = 0.55;
      const screenMat = this.plainMat('#0c2a3a', 0.2, 0, '#19e6ff', 2.2);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.08), screenMat);
      screen.position.set(0, 1.6, 0.05);
      screen.rotation.x = -0.25;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 0.82), this.plainMat('#ff2fa0', 0.3, 0, '#ff2fa0', 3));
      stripe.position.y = 1.12;
      for (const m of [base, screen]) { m.castShadow = true; }
      g.add(base, screen, stripe);
      this.group.add(g);
      this.collision.add({ x0: t.x - 0.7, x1: t.x + 0.7, z0: t.z - 0.7, z1: t.z + 0.7, y0: 0, y1: 1.2, solidForCars: true });
    }
  }

  private buildBoundary(): void {
    // Low sea wall / hedge at the north and west edges keeps players in the map.
    const hedge = this.plainMat('#2f7d3a', 0.9);
    const edge = -262;
    this.mesh(new THREE.BoxGeometry(540, 2, 2), hedge, -20, 1, edge);
    this.mesh(new THREE.BoxGeometry(2, 2, 480), hedge, edge, 1, -30);
    this.collision.addRect(-300, -300, 300, edge + 1, 4);
    this.collision.addRect(-300, -300, edge + 1, 300, 4);
    // hills on the horizon (north-west) for a skyline backdrop
    const hillMat = new THREE.MeshStandardMaterial({ color: '#5f9c6e', roughness: 1 });
    const r = mulberry32(5);
    for (let i = 0; i < 10; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(40 + r() * 40, 16, 10), hillMat);
      h.scale.y = 0.35 + r() * 0.25;
      h.position.set(-330 + r() * 40, 0, -320 + i * 70);
      this.group.add(h);
      const h2 = h.clone();
      h2.position.set(-320 + i * 70, 0, -330 + r() * 30);
      this.group.add(h2);
    }
  }
}

/** Road centerline segments (for markings, lamps and the minimap). */
export function roadSegments(): { x0: number; z0: number; x1: number; z1: number }[] {
  const segs: { x0: number; z0: number; x1: number; z1: number }[] = [];
  for (const x of ROADS_X) segs.push({ x0: x, z0: ROADS_Z[0], x1: x, z1: ROADS_Z[ROADS_Z.length - 1] });
  for (const z of ROADS_Z) segs.push({ x0: ROADS_X[0], z0: z, x1: ROADS_X[ROADS_X.length - 1], z1: z });
  return segs;
}

export const HALF_ROAD = ROAD_WIDTH / 2;
