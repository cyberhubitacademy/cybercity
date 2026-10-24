// Store robbery state machine (pure). The crime system feeds it whether the
// player is aiming at the clerk and how close they are.
//
//   idle --aim at clerk--> intimidate --held 1.2 s--> filling (bag timer)
//   filling --done--> grab (bag on the counter) --picked up--> escaped
//   filling --player stops aiming 2 s--> alarm early (smaller bag)
//   any --player leaves / dies--> failed;  every robbery ends with the alarm.

export type RobberyPhase = 'idle' | 'intimidate' | 'filling' | 'grab' | 'escaped' | 'failed' | 'cooldown';

export interface RobberyInput {
  aiming: boolean;
  dist: number;
  /** Shots fired inside the store this frame (clerk panics, bigger response). */
  shots: boolean;
}

export interface RobberyEvents {
  alarm?: (stars: number) => void;
  done?: (cash: number) => void;
  failed?: (reason: string) => void;
}

export const FILL_TIME = 8;
export const COOLDOWN = 600;

export class Robbery {
  phase: RobberyPhase = 'idle';
  t = 0;
  /** 0..1 how full the cash bag is. */
  fill = 0;
  intimidation = 0;
  alarmRaised = false;
  private notAiming = 0;
  shotsFired = false;
  cash = 0;
  events: RobberyEvents = {};

  constructor(readonly maxCash: number, private rnd: () => number = Math.random) {}

  get active(): boolean { return this.phase === 'intimidate' || this.phase === 'filling' || this.phase === 'grab'; }

  private go(p: RobberyPhase): void { this.phase = p; this.t = 0; }

  private alarm(): void {
    if (this.alarmRaised) return;
    this.alarmRaised = true;
    this.events.alarm?.(this.shotsFired ? 3 : 2);
  }

  update(dt: number, i: RobberyInput): RobberyPhase {
    this.t += dt;
    if (i.shots) this.shotsFired = true;
    switch (this.phase) {
      case 'cooldown':
        if (this.t > COOLDOWN) this.go('idle');
        break;
      case 'idle':
        if (i.aiming && i.dist < 7) {
          this.intimidation = 0;
          this.alarmRaised = false;
          this.shotsFired = i.shots;
          this.fill = 0;
          this.cash = 0;
          this.go('intimidate');
        }
        break;
      case 'intimidate':
        if (i.aiming && i.dist < 7) this.intimidation += dt / 1.2;
        else this.intimidation -= dt;
        if (this.intimidation >= 1) { this.fill = 0; this.notAiming = 0; this.go('filling'); }
        else if (this.intimidation < -0.5) this.go('idle');
        break;
      case 'filling': {
        if (i.dist > 14) { this.fail('You left the store before the bag was ready.'); break; }
        const scared = i.aiming && i.dist < 9;
        this.notAiming = scared ? 0 : this.notAiming + dt;
        this.fill = Math.min(1, this.fill + dt / FILL_TIME * (scared ? 1 : 0.3));
        if (this.notAiming > 2 || i.shots) this.alarm(); // the clerk hits the silent alarm
        if (this.fill >= 1 || (this.alarmRaised && this.notAiming > 3)) {
          this.cash = Math.round(this.maxCash * this.fill * (0.85 + this.rnd() * 0.3));
          this.alarm();
          this.go('grab');
        }
        break;
      }
      case 'grab':
        if (i.dist < 1.8) {
          this.events.done?.(this.cash);
          this.go('escaped');
        } else if (i.dist > 30) this.fail('You left the cash bag behind.');
        break;
      case 'escaped':
      case 'failed':
        this.go('cooldown');
        break;
    }
    return this.phase;
  }

  fail(reason: string): void {
    if (!this.active) return;
    this.alarm();
    this.events.failed?.(reason);
    this.go('failed');
  }

  /** Clear the cooldown (debug / script reset). */
  reset(): void { this.go('idle'); this.fill = 0; this.cash = 0; this.alarmRaised = false; this.shotsFired = false; this.intimidation = 0; }

  /** Start a new robbery attempt from idle/cooldown: re-arms alarm state. */
  arm(): void {
    if (this.phase === 'cooldown' || this.phase === 'idle') this.reset();
  }
}
