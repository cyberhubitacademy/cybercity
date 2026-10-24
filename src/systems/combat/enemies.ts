import * as THREE from 'three';
import type { CollisionWorld } from '../../world/Collision';
import { CombatActor, emptyPose, type PoseState } from './actor';
import { EnemyBrain, enemyHitChance, type Perception } from './ai';
import { enemyType, type EnemyType } from './enemyTypes';
import { WEAPONS, applyDamage, partMultiplier, type HitPart, type WeaponId } from './weapons';
import { buildWeapon, muzzleOffset } from './models';
import type { Effects } from './effects';
import { COMBAT_AUDIO } from './audio';

// Enemy actors (Black Lotus, gangs, guards, police officers, fighters) and the
// manager that perceives, moves, shoots and despawns them.

export interface EnemyHost {
  readonly scene: THREE.Scene;
  readonly collision: CollisionWorld;
  readonly effects: Effects;
  /** Point enemies aim at (player chest, or the car). */
  targetPoint(out: THREE.Vector3): THREE.Vector3;
  targetSpeed(): number;
  targetInCover(): boolean;
  /** True when something (cover car, human shield) blocks a shot from `from`. */
  shotBlocked(from: THREE.Vector3): boolean;
  damagePlayer(dmg: number, from: THREE.Vector3, melee: boolean, attacker: Enemy): void;
  /** Latest noise (gunshot/fight): position, radius, game time. */
  readonly noise: { x: number; z: number; r: number; t: number };
  time(): number;
  /** Enemy accuracy multiplier (Focus mode makes them worse). */
  accuracyScale(): number;
  onKilled(e: Enemy, byPlayer: boolean, lethal: boolean): void;
  /** Hostage taken by the player: enemies hold fire. */
  holdFire(): boolean;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _target = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);

let nextEnemyId = 1;

export class Enemy {
  readonly id = nextEnemyId++;
  readonly actor: CombatActor;
  readonly brain: EnemyBrain;
  readonly pos: THREE.Vector3;
  yaw: number;
  health: number;
  armor: number;
  weapon: WeaponId;
  private weaponMesh: THREE.Group | null = null;
  mag = 0;
  fireCd = 1 + Math.random();
  burst = 0;
  reloadT = 0;
  group = 0;
  mission = false;
  readonly home: THREE.Vector3;
  readonly goal = new THREE.Vector3();
  goalT = 0;
  readonly lastKnown = new THREE.Vector3();
  suppressed = 0;
  readonly cover = new THREE.Vector3();
  hasCover = false;
  coverT = Math.random();
  losT = Math.random() * 0.2;
  canSee = false;
  flinch = 0;
  downT = 0;
  deadT = 0;
  looted = false;
  /** Police at low stars run you down instead of shooting. */
  arrestMode = false;
  /** Kept still by a script (e.g. hostage taker) until alerted. */
  holdPosition = false;
  speed = 0;
  meleeT = 0;
  meleeHit = false;
  readonly pose: PoseState = emptyPose();
  hitBy: 'lethal' | 'nonlethal' | null = null;
  /** Seconds since the player last hurt this enemy (arena/police logic). */
  lastHurt = 99;
  /** onKilled already fired for the current neutralization. */
  reported = false;
  dist = 99;

  constructor(readonly type: EnemyType, x: number, z: number, heading: number, private host: EnemyHost) {
    const female = Math.random() < (type.female ?? 0);
    this.actor = new CombatActor(type.outfit, female, this.id);
    this.pos = this.actor.root.position;
    this.pos.set(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
    this.goal.copy(this.home);
    this.yaw = heading;
    this.health = type.health;
    this.armor = type.armor;
    this.brain = new EnemyBrain({ ...type.tune });
    this.weapon = type.weapons[Math.floor(Math.random() * type.weapons.length)];
    this.equip(this.weapon);
    host.scene.add(this.actor.root);
  }

  get def() { return WEAPONS[this.weapon]; }
  get state() { return this.brain.state; }
  get alive(): boolean { return this.brain.state !== 'dead'; }
  /** Out of the fight (dead, knocked out, tied, surrendered). */
  get neutralized(): boolean { const s = this.brain.state; return s === 'dead' || s === 'down' || s === 'tied' || s === 'surrender'; }
  get melee(): boolean { return this.def.cls === 'melee'; }

  equip(w: WeaponId): void {
    this.weapon = w;
    this.mag = WEAPONS[w].magSize;
    if (this.weaponMesh) this.weaponMesh.removeFromParent();
    this.weaponMesh = w === 'fists' ? null : buildWeapon(w, this.type.faction === 'lotus' && Math.random() < 0.3);
    if (this.weaponMesh) this.host.scene.add(this.weaponMesh);
  }

  /** Drop the weapon (disarm). Returns what was dropped. */
  disarm(): WeaponId | null {
    if (this.weapon === 'fists') return null;
    const w = this.weapon;
    this.equip('fists');
    this.brain.tune.attackRange = 1.7;
    return w;
  }

  alertTo(x: number, z: number): void {
    this.lastKnown.set(x, 0, z);
    this.brain.alert();
  }

  suppress(amount: number): void { this.suppressed = Math.min(1, this.suppressed + amount); }

  /** Apply a hit. Returns true if this hit neutralized the enemy. */
  takeHit(dmg: number, part: HitPart, lethal: boolean, from: THREE.Vector3 | null): boolean {
    if (this.brain.state === 'dead') return false;
    this.lastHurt = 0;
    if (this.brain.state === 'down' || this.brain.state === 'tied' || this.brain.state === 'surrender') {
      if (!lethal) return false;
    }
    // helmets are rare in Neon Bay: headshots ignore body armor
    const r = applyDamage(this.health, part === 'head' ? 0 : this.armor, dmg);
    if (part !== 'head') this.armor = r.armor;
    this.health = r.health;
    this.flinch = 1;
    if (from) { this.lastKnown.copy(from); this.lastKnown.y = 0; }
    this.brain.alert();
    if (this.health <= 0) {
      if (lethal) this.die(); else this.knockOut(25);
      this.hitBy = lethal ? 'lethal' : 'nonlethal';
      return true;
    }
    return false;
  }

  knockOut(seconds: number): void {
    if (this.brain.state === 'dead') return;
    this.health = Math.max(this.health, 1);
    this.downT = seconds;
    this.brain.set('down');
    this.actor.fall();
    this.hitBy = 'nonlethal';
  }

  die(): void {
    if (this.brain.state === 'dead') return;
    this.health = 0;
    this.brain.set('dead');
    this.actor.fall();
    if (this.weaponMesh) { this.weaponMesh.removeFromParent(); this.weaponMesh = null; }
  }

  tie(): void { this.downT = Infinity; this.brain.set('tied'); this.actor.fall(); }

  surrender(): void {
    if (this.neutralized) return;
    this.brain.set('surrender');
    if (this.weapon !== 'fists') this.equip('fists');
  }

  dispose(): void {
    this.actor.dispose();
    this.weaponMesh?.removeFromParent();
  }

  /** Ray (origin o, dir d unit) vs this body. Returns distance and part, or null. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { t: number; part: HitPart } | null {
    if (this.brain.state === 'dead' && this.deadT > 0.4) return null;
    const lying = this.actor.isDown;
    let best = maxT, part: HitPart = 'body', hit = false;
    const parts = lying ? LYING : STANDING;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const yOff = this.actor.body.position.y; // crouch
    for (const [h, r, p, along] of parts) {
      const cx = this.pos.x + fx * along, cy = this.pos.y + h + (lying ? 0 : yOff), cz = this.pos.z + fz * along;
      const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z;
      const c = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) { best = t; part = p; hit = true; }
    }
    return hit ? { t: best, part } : null;
  }

  update(dt: number, mgr: EnemyManager): void {
    const host = this.host;
    const b = this.brain;
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.suppressed = Math.max(0, this.suppressed - dt * 0.5);
    this.lastHurt += dt;
    host.targetPoint(_target);
    const dx = _target.x - this.pos.x, dz = _target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.dist = dist;

    if (b.state === 'dead') {
      this.deadT += dt;
      this.actor.update(dt, 0, this.pose);
      return;
    }
    if (b.state === 'down') {
      this.downT -= dt;
      this.actor.update(dt, 0, this.pose);
      if (this.downT <= 0) {
        this.actor.rise();
        this.health = Math.max(this.health, this.type.health * 0.3);
        b.set(this.type.tune.runner ? 'flee' : 'chase');
      }
      this.syncWeapon(null);
      return;
    }
    if (b.state === 'tied') { this.actor.update(dt, 0, this.pose); return; }
    if (b.state === 'shield') {
      this.pose.handsUp = 0; this.pose.aim = null; this.pose.melee = null;
      this.actor.update(dt, 0.0, this.pose);
      this.actor.yawNode.rotation.y = this.yaw;
      this.syncWeapon(null);
      return;
    }

    // ---- perception (line of sight is throttled) ----
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.18 + Math.random() * 0.08;
      const facing = Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz;
      const inCone = dist < 5 || b.hostile || facing > dist * 0.34;
      this.canSee = false;
      if (dist < this.type.tune.sightRange * (b.hostile ? 1.4 : 1) && inCone) {
        _v.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
        _v2.copy(_target).sub(_v);
        const len = _v2.length();
        _v2.divideScalar(len || 1);
        const t = host.collision.raycast(_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, len);
        this.canSee = t >= len - 0.35 && !host.shotBlocked(_v);
      }
    }
    if (this.canSee) this.lastKnown.set(_target.x, 0, _target.z);
    const n = host.noise;
    const heard = host.time() - n.t < 0.12 && Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < n.r;
    if (heard && !this.canSee) this.lastKnown.set(n.x, 0, n.z);
    this.coverT -= dt;
    if (this.coverT <= 0) { this.coverT = 1.2 + Math.random(); this.findCover(_target); }
    const p: Perception = PERC;
    p.dist = dist; p.canSee = this.canSee; p.heard = heard; p.health = this.health / this.type.health;
    p.hasCover = this.hasCover; p.suppressed = this.suppressed; p.melee = this.melee || this.arrestMode;
    if (this.holdPosition && b.state === 'patrol' && !heard && this.lastHurt > 50) { /* stay put */ }
    else b.update(dt, p);

    // ---- movement ----
    let mx = 0, mz = 0, spd = 0;
    const state = b.state;
    const faceTarget = state === 'attack' || state === 'cover' || state === 'surrender' || (state === 'chase' && dist < 12);
    switch (state) {
      case 'patrol':
        if (this.holdPosition) break;
        this.goalT -= dt;
        if (this.goalT <= 0) {
          this.goalT = 4 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
          this.goal.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        [mx, mz] = this.toward(this.goal, 0.6); spd = 1.4;
        break;
      case 'alert':
        [mx, mz] = this.toward(this.lastKnown, 1.5); spd = 2.2;
        break;
      case 'chase': {
        const stop = this.arrestMode ? 1.1 : this.melee ? 1.2 : 3;
        if (dist > stop) { [mx, mz] = this.toward(this.canSee ? _target : this.lastKnown, stop); spd = 4.9; }
        break;
      }
      case 'attack':
        if (this.melee || this.arrestMode) {
          if (dist > 1.25) { [mx, mz] = this.toward(_target, 1.1); spd = 4.2; }
        } else if (dist < 5) { [mx, mz] = this.toward(_target, 0); mx = -mx; mz = -mz; spd = 1.5; } // back off
        else if (Math.sin(host.time() * 0.7 + this.id) > 0.6) {
          // strafe a little while shooting
          const l = Math.max(0.001, dist);
          mx = -dz / l; mz = dx / l; spd = 1.3;
        }
        break;
      case 'cover':
        if (this.hasCover) { [mx, mz] = this.toward(this.cover, 0.4); spd = 4.5; }
        break;
      case 'flank': {
        const l = Math.max(0.001, dist);
        const side = this.id % 2 ? 1 : -1;
        mx = (-dz / l) * side * 0.8 + (dx / l) * 0.4; mz = (dx / l) * side * 0.8 + (dz / l) * 0.4;
        spd = 4.6;
        break;
      }
      case 'flee': {
        const l = Math.max(0.001, dist);
        mx = -dx / l; mz = -dz / l; spd = 5.2;
        break;
      }
      default:
        break;
    }
    if (this.reloadT > 0 && state === 'attack') spd *= 0.4;
    this.speed += (spd - this.speed) * Math.min(1, dt * 6);
    if (spd > 0 && (mx || mz)) {
      const desired = Math.atan2(mx, mz);
      if (!faceTarget) this.turnTo(desired, dt * 8);
      this.pos.x += mx * this.speed * dt;
      this.pos.z += mz * this.speed * dt;
    }
    if (faceTarget) this.turnTo(Math.atan2(dx, dz), dt * 10);
    host.collision.resolveCircle(this.pos, 0.36, this.pos.y, 1.7);
    this.pos.y = host.collision.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.3);
    mgr.separate(this);

    // ---- pose + weapons ----
    const pose = this.pose;
    pose.handsUp = state === 'surrender' ? 1 : 0;
    pose.crouch = state === 'cover' && this.hasCover && this.pos.distanceTo(this.cover) < 0.8 && !b.wantsFire ? 1 : 0;
    pose.flinch = this.flinch;
    pose.block = 0;
    _aim.set(_target.x - this.pos.x, _target.y - (this.pos.y + 1.4), _target.z - this.pos.z).normalize();
    const aiming = !this.melee && (state === 'attack' || (state === 'cover' && b.wantsFire)) && !this.arrestMode;
    pose.aim = aiming ? _aim : null;
    pose.twoHanded = this.weapon !== 'pistol';
    if (this.meleeT > 0) {
      this.meleeT -= dt;
      pose.melee = this.weapon === 'bat' || this.weapon === 'knife' ? 'swing' : null;
      pose.meleePhase = 1 - this.meleeT / 0.55;
      if (!this.meleeHit && this.meleeT < 0.3) {
        this.meleeHit = true;
        if (dist < 1.9) {
          const dmg = WEAPONS[this.weapon].damage * this.type.damage * (this.type.faction === 'fighter' ? 0.8 : 0.7);
          host.damagePlayer(dmg, this.pos, true, this);
          COMBAT_AUDIO.play('punch', { dist });
        }
      }
    } else pose.melee = null;
    this.actor.yawNode.rotation.y = this.yaw;
    this.actor.update(dt, this.speed, pose);
    this.syncWeapon(aiming ? _aim : null);

    // ---- attack ----
    this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.def.magSize;
    }
    if (b.wantsFire && !this.arrestMode && !host.holdFire() && this.fireCd <= 0) {
      if (this.melee) {
        if (dist < 1.9 && this.meleeT <= 0) {
          this.meleeT = 0.55;
          this.meleeHit = false;
          if (this.weapon === 'fists') this.actor.punch();
          this.fireCd = 0.9 + Math.random() * 0.6;
        }
      } else if (this.reloadT <= 0) this.shoot(dist);
    }
  }

  private shoot(dist: number): void {
    const host = this.host;
    const d = this.def;
    if (this.mag <= 0) { this.reloadT = d.reloadTime * 1.3; return; }
    this.mag--;
    this.burst++;
    const burstLen = d.auto ? 4 : 2;
    if (this.burst >= burstLen) { this.burst = 0; this.fireCd = 0.9 + Math.random() * 1.3; }
    else this.fireCd = Math.max(1 / d.rate, 0.13) * 1.4;
    this.actor.handPosition(_hand);
    _hand.addScaledVector(_aim, muzzleOffset(this.weapon));
    host.effects.muzzle(_hand.x, _hand.y, _hand.z, 0.35);
    COMBAT_AUDIO.play('shot', { weapon: this.weapon, dist });
    // noise: other enemies hear it too
    host.targetPoint(_target);
    const chance = enemyHitChance(this.type.accuracy, dist, host.targetSpeed(), host.targetInCover(), host.accuracyScale());
    const blocked = host.shotBlocked(_hand);
    const pellets = d.pellets;
    let hits = 0;
    for (let i = 0; i < pellets; i++) if (!blocked && Math.random() < chance) hits++;
    if (hits > 0 && dist <= d.range * 1.2) {
      const dmg = d.damage * hits * this.type.damage * 0.5 * (dist > d.range * 0.6 ? 0.6 : 1);
      host.damagePlayer(dmg, this.pos, false, this);
      host.effects.tracer(_hand.x, _hand.y, _hand.z, _target.x, _target.y, _target.z);
    } else {
      // miss: tracer flies past and hits the world behind the player
      _v.copy(_target).sub(_hand).normalize();
      _v.x += (Math.random() - 0.5) * 0.12; _v.y += (Math.random() - 0.3) * 0.1; _v.z += (Math.random() - 0.5) * 0.12;
      _v.normalize();
      const t = host.collision.raycast(_hand.x, _hand.y, _hand.z, _v.x, _v.y, _v.z, 80);
      host.effects.tracer(_hand.x, _hand.y, _hand.z, _hand.x + _v.x * t, _hand.y + _v.y * t, _hand.z + _v.z * t);
      if (t < 80) host.effects.burst(_hand.x + _v.x * t, _hand.y + _v.y * t, _hand.z + _v.z * t, 4, 'spark');
      if (dist < 14) COMBAT_AUDIO.play('whizz', { dist: dist * 0.3 });
    }
  }

  private syncWeapon(aim: THREE.Vector3 | null): void {
    const m = this.weaponMesh;
    if (!m) return;
    m.visible = this.actor.root.visible && !this.actor.isDown;
    if (!m.visible) return;
    this.actor.handPosition(m.position);
    if (aim) _q.setFromUnitVectors(_z, aim);
    else {
      _v.set(Math.sin(this.yaw) * 0.5, -0.86, Math.cos(this.yaw) * 0.5).normalize();
      _q.setFromUnitVectors(_z, _v);
    }
    m.quaternion.copy(_q);
  }

  private toward(p: THREE.Vector3, stop: number): [number, number] {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stop || d < 0.001) return [0, 0];
    return [dx / d, dz / d];
  }

  private turnTo(target: number, k: number): void {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, k);
  }

  /** Look for a spot within 6 m that blocks the line to the target. */
  private findCover(target: THREE.Vector3): void {
    const col = this.host.collision;
    this.hasCover = false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.id;
      const r = 2 + (i % 3) * 1.8;
      const cx = this.pos.x + Math.cos(a) * r, cz = this.pos.z + Math.sin(a) * r;
      const dx = target.x - cx, dz = target.z - cz;
      const len = Math.hypot(dx, dz);
      if (len < 4) continue;
      const t = col.raycast(cx, 0.9, cz, dx / len, 0, dz / len, Math.min(3, len));
      if (t < 2.2) {
        // the spot itself must be free
        _v.set(cx, 0, cz);
        col.resolveCircle(_v, 0.36, 0, 1.7);
        if (Math.hypot(_v.x - cx, _v.z - cz) > 0.3) continue;
        this.cover.set(cx, 0, cz);
        this.hasCover = true;
        return;
      }
    }
  }
}

const PERC: Perception = { dist: 0, canSee: false, heard: false, health: 1, hasCover: false, suppressed: 0, melee: false };
/** Hit spheres: [height, radius, part, forward offset]. */
const STANDING: [number, number, HitPart, number][] = [[1.63, 0.13, 'head', 0.02], [1.3, 0.24, 'body', 0], [1.0, 0.23, 'body', 0], [0.6, 0.2, 'limb', 0], [0.25, 0.18, 'limb', 0]];
const LYING: [number, number, HitPart, number][] = [[0.2, 0.25, 'body', -0.5], [0.2, 0.25, 'body', -1.0], [0.2, 0.22, 'limb', 0]];

export class EnemyManager {
  readonly list: Enemy[] = [];
  readonly groups = new Map<number, Set<Enemy>>();
  private nextGroup = 1;
  cap = 12;

  constructor(private host: EnemyHost) {}

  spawn(typeId: string, x: number, z: number, heading: number, opts: { mission?: boolean; group?: number } = {}): Enemy | null {
    const alive = this.list.filter((e) => !e.neutralized).length;
    if (alive >= this.cap && !opts.mission) return null;
    // keep spawns out of walls
    _v.set(x, 0, z);
    this.host.collision.resolveCircle(_v, 0.4, 0, 1.7);
    const e = new Enemy(enemyType(typeId), _v.x, _v.z, heading, this.host);
    e.mission = !!opts.mission;
    if (opts.group) { e.group = opts.group; this.groups.get(opts.group)?.add(e); }
    this.list.push(e);
    return e;
  }

  newGroup(): number {
    const id = this.nextGroup++;
    this.groups.set(id, new Set());
    return id;
  }

  byId(id: number): Enemy | undefined { return this.list.find((e) => e.id === id); }

  /** All members of a group out of the fight (dead, down, tied, surrendered, gone or fled far). */
  groupCleared(g: number): boolean {
    const set = this.groups.get(g);
    if (!set) return true;
    for (const e of set) {
      if (!this.list.includes(e)) continue;
      if (e.neutralized) continue;
      if (e.state === 'flee' && e.dist > 90) continue;
      return false;
    }
    return true;
  }

  hostileCount(): number {
    let n = 0;
    for (const e of this.list) if (!e.neutralized && e.brain.hostile && e.type.faction !== 'police') n++;
    return n;
  }

  /** Alert everyone within radius (gunshots, an ally getting hit). */
  alertAround(x: number, z: number, r: number, faction?: string): void {
    for (const e of this.list) {
      if (e.neutralized || (faction && e.type.faction !== faction)) continue;
      if (Math.hypot(e.pos.x - x, e.pos.z - z) < r) e.alertTo(x, z);
    }
  }

  /** Push overlapping enemies apart (cheap O(n^2) for small n). */
  separate(e: Enemy): void {
    for (const o of this.list) {
      if (o === e || o.actor.isDown || e.actor.isDown) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.5 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.71 - d) * 0.5;
      e.pos.x += (dx / d) * push; e.pos.z += (dz / d) * push;
    }
  }

  remove(e: Enemy): void {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (e.group) this.groups.get(e.group)?.delete(e);
    e.dispose();
  }

  update(dt: number, focus: THREE.Vector3): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const far = e.pos.distanceTo(focus);
      // visibility cull: skip animation work for very distant actors
      e.actor.root.visible = far < 160;
      e.update(dt, this);
      if (e.neutralized && !e.reported) {
        e.reported = true;
        this.host.onKilled(e, e.lastHurt < 0.5, e.state === 'dead');
      } else if (!e.neutralized) e.reported = false;
      const despawn = (e.state === 'dead' && (e.deadT > 60 || far > 150)) || (!e.mission && far > 220) || (e.state === 'flee' && far > 140 && !e.mission);
      if (despawn) this.remove(e);
    }
  }

  clear(filter: (e: Enemy) => boolean = () => true): void {
    for (const e of [...this.list]) if (filter(e)) this.remove(e);
  }

  /** Closest hit among enemies along a ray. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { e: Enemy; t: number; part: HitPart } | null {
    let best: { e: Enemy; t: number; part: HitPart } | null = null;
    let bt = maxT;
    for (const e of this.list) {
      if (!e.actor.root.visible) continue;
      const h = e.raycast(o, d, bt);
      if (h && h.t < bt) { bt = h.t; best = { e, t: h.t, part: h.part }; }
    }
    return best;
  }

  /** Multiplier helper exported for melee. */
  static meleeDamage(w: WeaponId, part: HitPart): number {
    return WEAPONS[w].damage * partMultiplier(WEAPONS[w], part);
  }
}
