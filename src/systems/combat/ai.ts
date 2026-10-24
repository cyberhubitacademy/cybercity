// Enemy decision making as a pure state machine (no three.js): the Enemies
// manager feeds it a Perception every frame and acts on the resulting state.

export type EnemyState =
  | 'patrol' | 'alert' | 'chase' | 'attack' | 'cover' | 'flank' | 'flee'
  | 'surrender' | 'down' | 'tied' | 'shield' | 'dead';

export interface Perception {
  dist: number;
  /** Player inside the sight cone with a clear line of sight. */
  canSee: boolean;
  /** A gunshot (or fight) was heard this frame. */
  heard: boolean;
  /** 0..1 health fraction. */
  health: number;
  /** A cover spot is available nearby. */
  hasCover: boolean;
  /** 0..1 how hard bullets are flying past this enemy. */
  suppressed: number;
  /** Melee-only enemies close in instead of shooting. */
  melee: boolean;
}

export interface BrainTuning {
  sightRange: number;
  attackRange: number;
  /** 0..1 chance-weight to run away when badly hurt. */
  cowardice: number;
  /** Seconds of continuous sight needed to fully notice the player from patrol. */
  noticeTime: number;
  /** Civilians-in-the-way types (intruder, courier) run instead of fighting. */
  runner?: boolean;
}

export const DEFAULT_TUNING: BrainTuning = { sightRange: 38, attackRange: 26, cowardice: 0.35, noticeTime: 1.1 };

/** Terminal or externally-controlled states the brain never leaves on its own. */
const LOCKED: ReadonlySet<EnemyState> = new Set(['down', 'tied', 'shield', 'dead', 'surrender']);

export class EnemyBrain {
  state: EnemyState = 'patrol';
  /** Seconds in the current state. */
  t = 0;
  /** 0..1 suspicion while patrolling. */
  awareness = 0;
  /** Seconds since the player was last seen. */
  unseen = 0;
  /** True while the enemy wants to pull the trigger / swing. */
  wantsFire = false;
  private peekT = 0;

  constructor(readonly tune: BrainTuning = DEFAULT_TUNING, private rnd: () => number = Math.random) {}

  set(s: EnemyState): void {
    if (this.state === s) return;
    this.state = s;
    this.t = 0;
  }

  /** Force combat (script SET_ENEMY_TARGET, being shot, an ally alerting). */
  alert(): void {
    if (LOCKED.has(this.state)) return;
    this.awareness = 1;
    if (this.state === 'patrol' || this.state === 'alert') this.set(this.tune.runner ? 'flee' : 'chase');
  }

  get locked(): boolean { return LOCKED.has(this.state); }
  get hostile(): boolean { return !LOCKED.has(this.state) && this.state !== 'patrol' && this.state !== 'flee'; }

  update(dt: number, p: Perception): EnemyState {
    this.t += dt;
    this.wantsFire = false;
    if (LOCKED.has(this.state)) return this.state;
    if (p.canSee) this.unseen = 0;
    else this.unseen += dt;
    const tune = this.tune;
    const seeInRange = p.canSee && p.dist <= tune.sightRange;

    switch (this.state) {
      case 'patrol': {
        if (seeInRange) this.awareness += dt / tune.noticeTime * (p.dist < 10 ? 2.5 : 1);
        else this.awareness = Math.max(0, this.awareness - dt * 0.25);
        if (p.heard) this.awareness = Math.max(this.awareness, 0.6);
        if (this.awareness >= 1) this.set(tune.runner ? 'flee' : p.dist <= tune.attackRange ? 'attack' : 'chase');
        else if (p.heard || this.awareness > 0.5) this.set('alert');
        break;
      }
      case 'alert': {
        if (seeInRange) this.awareness += dt * 1.8;
        if (this.awareness >= 1 || (seeInRange && p.dist < 12)) this.set(tune.runner ? 'flee' : 'chase');
        else if (this.t > 9 && !p.heard) { this.awareness = 0.3; this.set('patrol'); }
        break;
      }
      case 'chase': {
        if (tune.runner) { this.set('flee'); break; }
        if (p.canSee && p.dist <= tune.attackRange) this.set('attack');
        else if (this.unseen > 12) this.set('alert');
        break;
      }
      case 'attack': {
        if (this.shouldFlee(p)) { this.set('flee'); break; }
        if (!p.melee && p.suppressed > 0.6 && p.hasCover && this.t > 0.6) { this.set('cover'); break; }
        if (!p.canSee && this.unseen > 2.5) { this.set(this.rnd() < 0.45 && !p.melee ? 'flank' : 'chase'); break; }
        if (p.dist > tune.attackRange * 1.25) { this.set('chase'); break; }
        this.wantsFire = p.canSee && (!p.melee || p.dist < 2);
        break;
      }
      case 'cover': {
        // duck, then peek out and return fire
        this.peekT += dt;
        if (this.shouldFlee(p)) { this.set('flee'); break; }
        if (this.t > 1.4 + this.rnd() * 1.6 && p.suppressed < 0.5) { this.peekT = 0; this.set('attack'); }
        else if (this.peekT > 0.9 && p.canSee) { this.wantsFire = this.rnd() < 0.5; this.peekT = 0; }
        break;
      }
      case 'flank': {
        if (p.canSee && this.t > 1.2) this.set('attack');
        else if (this.t > 4) this.set('chase');
        break;
      }
      case 'flee': {
        if (!tune.runner && this.t > 6 && p.health > 0.5) this.set('chase');
        break;
      }
      default:
        break;
    }
    return this.state;
  }

  private shouldFlee(p: Perception): boolean {
    return p.health < 0.25 && this.t > 0.5 && this.rnd() < this.tune.cowardice * 0.02;
  }
}

/** Hit chance for an enemy shot (accuracy falls with distance and target movement). */
export function enemyHitChance(base: number, dist: number, targetSpeed: number, targetInCover: boolean, focusSlow = 1): number {
  const d = Math.max(0, 1 - dist / 70);
  const move = 1 / (1 + targetSpeed * 0.18);
  const cover = targetInCover ? 0.25 : 1;
  return Math.max(0.03, Math.min(0.9, base * (0.35 + 0.65 * d) * move * cover * focusSlow));
}
