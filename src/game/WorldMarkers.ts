import * as THREE from 'three';
import type { Outfit } from '../actors/Humanoid';
import { createRig, type Rig } from '../actors/CharacterModel';
import { CHARACTERS } from '../story/characters';
import { POSTS, TERMINALS } from '../world/spots';
import { SHARDS } from '../world/layout';
import { labelTexture, glowSprite } from '../world/textures';

// Everything the player can find in the world: story characters at their
// posts, GTA-style glowing mission cylinders, collectible data shards,
// checkpoints and rogue access points for timed side missions.

function ringMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float time; varying vec2 vUv;
      void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.25 * sin(time * 3.0 + vUv.y * 6.0));
        a *= smoothstep(0.0, 0.08, vUv.y) * 0.9 + 0.1; gl_FragColor = vec4(color * 1.6, a); }`,
  });
}

class Cylinder {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private disc: THREE.Mesh;
  constructor(color: string, radius = 1.6, height = 2.4) {
    this.mat = ringMaterial(color);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 40, 1, true), this.mat);
    cyl.position.y = height / 2;
    this.disc = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.7, radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.disc.position.y = 0.25;
    this.group.add(cyl, this.disc);
  }
  update(t: number): void {
    this.mat.uniforms.time.value = t;
    this.disc.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
  }
  setColor(c: string): void {
    this.mat.uniforms.color.value.set(c);
    (this.disc.material as THREE.MeshBasicMaterial).color.set(c);
  }
}

interface StoryNpc {
  id: string;
  rig: Rig;
  icon: THREE.Sprite;
  pos: THREE.Vector3;
  baseYaw: number;
  wave: number;
}

export class WorldMarkers {
  readonly npcs = new Map<string, StoryNpc>();
  private objective = new Cylinder('#ffd23f');
  private beam: THREE.Mesh;
  private shardMeshes = new Map<string, THREE.Group>();
  private checkpoints = new Map<string, Cylinder>();
  private aps = new Map<string, THREE.Group>();
  private terminalGlow = new Map<string, THREE.Sprite>();
  private waypoint: THREE.Mesh;

  constructor(private scene: THREE.Scene) {
    // story characters
    for (const post of POSTS) {
      const c = CHARACTERS[post.npc];
      if (!c) continue;
      const o = c.outfit;
      const outfit: Outfit = {
        shirt: o.shirt, pants: o.pants, skin: o.skin, hair: o.hair,
        pattern: o.shirtPattern ?? 'plain', accent: c.portraitColor,
        hairStyle: post.npc === 'lena' ? 'bun' : post.npc === 'carla' || post.npc === 'priya' || post.npc === 'marisol' ? 'long' : post.npc === 'dex' ? 'curly' : 'short',
        sunglasses: post.npc === 'tito', shoes: '#1b1b22',
      };
      const rig = createRig(outfit, { female: ['carla', 'marisol', 'lena', 'priya', 'amara', 'nova'].includes(post.npc), seed: post.npc.length });
      rig.root.position.set(post.x, 0.2, post.z);
      rig.body.rotation.y = post.facing;
      scene.add(rig.root);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(c.name[0], c.portraitColor), depthTest: false, transparent: true }));
      icon.scale.setScalar(1.1);
      icon.position.set(post.x, 3.0, post.z);
      icon.renderOrder = 10;
      icon.visible = false;
      scene.add(icon);
      this.npcs.set(post.npc, { id: post.npc, rig, icon, pos: new THREE.Vector3(post.x, 0.2, post.z), baseYaw: post.facing, wave: 0 });
    }
    // objective cylinder + sky beam (visible from afar, like GTA)
    this.objective.group.visible = false;
    scene.add(this.objective.group);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 160, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.beam.position.y = 80;
    this.objective.group.add(this.beam);
    // waypoint pin
    this.waypoint = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 4), new THREE.MeshBasicMaterial({ color: '#ff2fa0' }));
    this.waypoint.rotation.x = Math.PI;
    this.waypoint.visible = false;
    scene.add(this.waypoint);
    // terminal holo glow
    for (const t of TERMINALS) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#19e6ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(t.x, 2.6, t.z);
      s.scale.setScalar(1.6);
      s.visible = false;
      scene.add(s);
      this.terminalGlow.set(t.id, s);
    }
    // data shards
    const crystal = new THREE.OctahedronGeometry(0.45, 0);
    const shardMat = new THREE.MeshStandardMaterial({ color: '#ff7cc6', emissive: '#ff2fa0', emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.2 });
    for (const s of SHARDS) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(crystal, shardMat);
      m.position.y = 1.2;
      m.scale.y = 1.6;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ff2fa0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.y = 1.2;
      halo.scale.setScalar(2.2);
      g.add(m, halo);
      g.position.set(s.x, s.x > 238 ? 0.45 : 0, s.z);
      scene.add(g);
      this.shardMeshes.set(s.id, g);
    }
  }

  /** Show the floating letter above characters who have a mission for the player. */
  setGiverIcons(npcIds: Set<string>): void {
    for (const [id, n] of this.npcs) n.icon.visible = npcIds.has(id);
  }

  setTerminalHighlight(id: string | null): void {
    for (const [tid, s] of this.terminalGlow) s.visible = tid === id;
  }

  setObjective(pos: { x: number; z: number } | null, color = '#ffd23f'): void {
    this.objective.group.visible = !!pos;
    if (pos) {
      this.objective.group.position.set(pos.x, 0, pos.z);
      this.objective.setColor(color);
      (this.beam.material as THREE.MeshBasicMaterial).color.set(color);
    }
  }

  setWaypoint(pos: { x: number; z: number } | null): void {
    this.waypoint.visible = !!pos;
    if (pos) this.waypoint.position.set(pos.x, 4, pos.z);
  }

  setCollectedShards(ids: string[]): void {
    for (const [id, g] of this.shardMeshes) g.visible = !ids.includes(id);
  }

  nearestShard(p: THREE.Vector3, range: number): string | null {
    for (const [id, g] of this.shardMeshes) {
      if (g.visible && Math.hypot(g.position.x - p.x, g.position.z - p.z) < range) return id;
    }
    return null;
  }

  addCheckpoint(id: string, x: number, z: number, radius: number, color = '#19e6ff'): void {
    this.removeCheckpoint(id);
    const c = new Cylinder(color, radius, 3);
    c.group.position.set(x, 0, z);
    this.scene.add(c.group);
    this.checkpoints.set(id, c);
  }

  removeCheckpoint(id: string): void {
    const c = this.checkpoints.get(id);
    if (c) { this.scene.remove(c.group); this.checkpoints.delete(id); }
  }

  /** Rogue Wi-Fi access point props for the "Rogue Waves" side mission. */
  showAccessPoints(items: { id: string; x: number; z: number }[]): void {
    this.clearAccessPoints();
    for (const it of items) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), new THREE.MeshStandardMaterial({ color: '#cccccc', metalness: 0.6 }));
      pole.position.y = 0.8;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: '#1b1438', emissive: '#ff2fa0', emissiveIntensity: 0.6 }));
      box.position.y = 1.65;
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), new THREE.MeshStandardMaterial({ color: '#111' }));
      ant.position.set(0.18, 1.95, 0);
      const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ff2fa0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      pulse.position.y = 1.8;
      g.add(pole, box, ant, pulse);
      g.position.set(it.x, 0.1, it.z);
      g.userData.pulse = pulse;
      this.scene.add(g);
      this.aps.set(it.id, g);
    }
  }

  hideAccessPoint(id: string): void {
    const g = this.aps.get(id);
    if (g) { this.scene.remove(g); this.aps.delete(id); }
  }

  clearAccessPoints(): void {
    for (const id of [...this.aps.keys()]) this.hideAccessPoint(id);
  }

  waveAt(npc: string): void {
    const n = this.npcs.get(npc);
    if (n) n.wave = 2;
  }

  update(dt: number, t: number, player: THREE.Vector3): void {
    this.objective.update(t);
    for (const c of this.checkpoints.values()) c.update(t);
    for (const n of this.npcs.values()) {
      const d = n.pos.distanceTo(player);
      n.rig.root.visible = d < 160;
      if (!n.rig.root.visible) continue;
      // face the player when close, otherwise idle at post
      const yaw = d < 8 ? Math.atan2(player.x - n.pos.x, player.z - n.pos.z) : n.baseYaw;
      let diff = yaw - n.rig.body.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      n.rig.body.rotation.y += diff * Math.min(1, dt * 4);
      n.rig.animate(dt, 0);
      if (n.wave > 0) { n.wave -= dt; n.rig.wave(t); }
      n.icon.position.y = 3.0 + Math.sin(t * 2.5) * 0.12;
    }
    for (const g of this.shardMeshes.values()) {
      if (!g.visible) continue;
      g.children[0].rotation.y = t * 1.8;
      g.children[0].position.y = 1.2 + Math.sin(t * 2 + g.position.x) * 0.15;
    }
    for (const g of this.aps.values()) {
      const s = g.userData.pulse as THREE.Sprite;
      s.scale.setScalar(1 + ((t * 1.5) % 1) * 2.5);
      (s.material as THREE.SpriteMaterial).opacity = 1 - ((t * 1.5) % 1);
    }
    if (this.waypoint.visible) this.waypoint.position.y = 4 + Math.sin(t * 3) * 0.4;
  }
}
