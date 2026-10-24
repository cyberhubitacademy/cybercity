import { describe, expect, it } from 'vitest';
import {
  CLIMB_MAX, DEFAULT_STATS, WATER_Y, detectObstacle, fallDamage, growStats, landingKind, lungCapacity,
  staminaMultiplier, stepBreath, stepFreefall, stepParachute, terrainHeight, waterImpactDamage,
  type Breath, type FlightState,
} from '../src/systems/movement/physics';
import { POSE_BONES, poseTargets, type PoseName } from '../src/systems/movement/poses';
import { FISH_COUNTS, stepSchool, type School } from '../src/systems/movement/fish';
import type { Box } from '../src/world/Collision';

const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): Box => ({ x0, x1, z0, z1, y0, y1 });

describe('breath', () => {
  it('scales lung capacity 15..60 s', () => {
    expect(lungCapacity(0)).toBe(15);
    expect(lungCapacity(100)).toBe(60);
    expect(lungCapacity(50)).toBeCloseTo(37.5);
    expect(lungCapacity(500)).toBe(60);
  });

  it('drains underwater, then drowns, and refills at the surface', () => {
    const b: Breath = { air: 10, capacity: 10, drowning: 0 };
    let dmg = 0;
    for (let i = 0; i < 90; i++) dmg += stepBreath(b, 0.1, true, false, false); // 9 s
    expect(b.air).toBeCloseTo(1, 1);
    expect(dmg).toBe(0);
    for (let i = 0; i < 30; i++) dmg += stepBreath(b, 0.1, true, false, false); // 3 more s
    expect(b.air).toBe(0);
    expect(dmg).toBeGreaterThan(10);
    expect(b.drowning).toBeGreaterThan(1.5);
    for (let i = 0; i < 30; i++) stepBreath(b, 0.1, false, false, false);
    expect(b.air).toBe(10);
    expect(b.drowning).toBe(0);
  });

  it('drains faster when fast-swimming and never with scuba', () => {
    const a: Breath = { air: 10, capacity: 10, drowning: 0 };
    const f: Breath = { air: 10, capacity: 10, drowning: 0 };
    const s: Breath = { air: 10, capacity: 10, drowning: 0 };
    stepBreath(a, 1, true, false, false);
    stepBreath(f, 1, true, true, false);
    stepBreath(s, 1, true, true, true);
    expect(f.air).toBeLessThan(a.air);
    expect(s.air).toBe(10);
  });
});

describe('falls', () => {
  it('lands soft, rolls, lands hard, tumbles by height', () => {
    expect(landingKind(1, 3)).toBe('soft');
    expect(landingKind(3, 5)).toBe('roll');
    expect(landingKind(3, 0)).toBe('soft');
    expect(landingKind(5, 0)).toBe('hard');
    expect(landingKind(5, 6)).toBe('roll');
    expect(landingKind(8, 6)).toBe('hard');
    expect(landingKind(12, 0)).toBe('tumble');
  });

  it('has a monotonic damage curve that is lethal around 16 m', () => {
    expect(fallDamage(2)).toBe(0);
    expect(fallDamage(3)).toBe(0);
    let prev = 0;
    for (let h = 3.5; h < 30; h += 0.5) {
      const d = fallDamage(h);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(fallDamage(6)).toBeLessThan(25);
    expect(fallDamage(16)).toBeGreaterThanOrEqual(100);
    expect(fallDamage(6, true)).toBeLessThan(fallDamage(6));
  });

  it('water breaks falls up to ~24 m', () => {
    expect(waterImpactDamage(12)).toBe(0);
    expect(waterImpactDamage(24)).toBe(0);
    expect(waterImpactDamage(60)).toBeGreaterThan(80);
  });
});

describe('vault / climb detection', () => {
  // Player at origin facing +z.
  it('vaults a low thin obstacle (bench / terminal)', () => {
    const o = detectObstacle([box(-1, 1, 0.6, 1.2, 0, 0.9)], 0, 0, 0, 0, 1);
    expect(o?.kind).toBe('vault');
    expect(o?.height).toBeCloseTo(0.9);
    expect(o?.dist).toBeCloseTo(0.6);
    expect(o?.landZ).toBeGreaterThan(1.2);
  });

  it('climbs onto a deep obstacle or a ledge up to 2.4 m', () => {
    const wall = detectObstacle([box(-3, 3, 0.5, 6, 0, 2)], 0, 0, 0, 0, 1);
    expect(wall?.kind).toBe('climb');
    expect(wall?.top).toBe(2);
    expect(wall?.landZ).toBeGreaterThan(0.5);
    const crate = detectObstacle([box(-1, 1, 0.5, 3, 0, 1.1)], 0, 0, 0, 0, 1);
    expect(crate?.kind).toBe('climb'); // too deep to vault: mount it
  });

  it('ignores steps, tall walls, overhead boxes and far boxes', () => {
    expect(detectObstacle([box(-1, 1, 0.5, 1, 0, 0.25)], 0, 0, 0, 0, 1)).toBeNull();
    expect(detectObstacle([box(-1, 1, 0.5, 1, 0, CLIMB_MAX + 0.5)], 0, 0, 0, 0, 1)).toBeNull();
    expect(detectObstacle([box(-1, 1, 0.5, 1, 1.5, 2.2)], 0, 0, 0, 0, 1)).toBeNull();
    expect(detectObstacle([box(-1, 1, 4, 5, 0, 1)], 0, 0, 0, 0, 1)).toBeNull();
    expect(detectObstacle([box(-1, 1, -2, -1, 0, 1)], 0, 0, 0, 0, 1)).toBeNull(); // behind
  });

  it('refuses a vault when the landing is blocked, but climbs if there is room on top', () => {
    const thin = [box(-1, 1, 0.5, 0.8, 0, 1), box(-1, 1, 1.0, 4, 0, 3)];
    expect(detectObstacle(thin, 0, 0, 0, 0, 1)).toBeNull();
    const ledge = [box(-1, 1, 0.5, 1, 0, 1), box(-1, 1, 1.2, 4, 0, 3)];
    expect(detectObstacle(ledge, 0, 0, 0, 0, 1)?.kind).toBe('climb');
    const room = [box(-1, 1, 0.5, 1.4, 0, 1), box(-1, 1, 2.6, 4, 0, 3)];
    expect(detectObstacle(room, 0, 0, 0, 0, 1)?.kind).toBe('vault');
  });

  it('lets a swimmer climb onto the pier deck but not over the railing from below', () => {
    // Pier deck (y -2..0.45) north edge at z=-126 with a railing on top.
    const deck = box(226, 302, -126, -114, -2, 0.45);
    const rail = box(238, 272, -126.05, -125.95, 0.45, 1.65);
    const feet = WATER_Y - 1.3;
    const o = detectObstacle([deck, rail], 250, feet, -127, 0, 1);
    expect(o?.kind).toBe('climb');
    expect(o?.top).toBeCloseTo(0.45);
    // From the deck the railing is a vault over the side.
    const v = detectObstacle([deck, rail], 250, 0.45, -125.3, 0, -1);
    expect(v?.kind).toBe('vault');
    expect(v?.height).toBeCloseTo(1.2);
  });
});

describe('terrain', () => {
  it('slopes from the beach into the deep ocean and harbor basin', () => {
    expect(terrainHeight(100, 0)).toBe(0);
    expect(terrainHeight(200, 0)).toBeGreaterThan(-0.3);
    expect(terrainHeight(250, 0)).toBeLessThan(WATER_Y - 1.5);
    expect(terrainHeight(400, 0)).toBeLessThan(-10);
    expect(terrainHeight(0, 240)).toBeLessThan(-5);
  });
});

describe('skydiving', () => {
  const fresh = (vy = 0): FlightState => ({ speed: 0, vy, yaw: 0, bank: 0, open: 0 });

  it('freefall approaches a ~45 m/s terminal velocity', () => {
    const s = fresh();
    for (let i = 0; i < 600; i++) stepFreefall(s, { fwd: 0, turn: 0 }, 1 / 60);
    expect(s.vy).toBeLessThan(-40);
    expect(s.vy).toBeGreaterThan(-48);
    const d = fresh();
    for (let i = 0; i < 600; i++) stepFreefall(d, { fwd: 1, turn: 0 }, 1 / 60);
    expect(d.vy).toBeLessThan(s.vy); // head-down dive falls faster
    expect(d.speed).toBeGreaterThan(s.speed);
  });

  it('parachute opens, slows the fall to a glide and flares for landing', () => {
    const s = fresh(-40);
    s.speed = 10;
    for (let i = 0; i < 300; i++) stepParachute(s, { fwd: 0, turn: 0 }, 1 / 60);
    expect(s.open).toBe(1);
    expect(s.vy).toBeGreaterThan(-5.5);
    expect(s.vy).toBeLessThan(-3.5);
    expect(s.speed).toBeGreaterThan(8);
    for (let i = 0; i < 120; i++) stepParachute(s, { fwd: 0, turn: 0, flare: true }, 1 / 60);
    expect(s.vy).toBeGreaterThan(-1.6);
    expect(s.speed).toBeLessThan(5);
  });

  it('steers with turn input and banks', () => {
    const s = fresh(-4);
    s.open = 1;
    for (let i = 0; i < 60; i++) stepParachute(s, { fwd: 0, turn: 1 }, 1 / 60);
    expect(s.yaw).toBeGreaterThan(0.8);
    expect(s.bank).toBeGreaterThan(0.3);
  });
});

describe('stat growth', () => {
  it('grows slowly, caps at 100 and reports whole-point gains', () => {
    const s = { ...DEFAULT_STATS };
    const r = growStats(s, 300, 0, 0);
    expect(s.stamina).toBeCloseTo(21.2);
    expect(r.stamina).toBe(true);
    expect(r.lung).toBe(false);
    growStats(s, 0, 100, 60);
    expect(s.lung).toBeCloseTo(20 + 0.3 + 3.6);
    for (let i = 0; i < 1000; i++) growStats(s, 1000, 1000, 100);
    expect(s.stamina).toBe(100);
    expect(s.lung).toBe(100);
    expect(staminaMultiplier(s.stamina)).toBe(2);
    expect(staminaMultiplier(0)).toBe(1);
  });
});

describe('poses', () => {
  it('produces unit directions for every pose bone', () => {
    const poses: PoseName[] = ['crouch', 'swim', 'tread', 'dive', 'climb', 'fall', 'aim', 'parachute', 'tuck'];
    for (const p of poses) {
      const t = poseTargets(p, 1.3, 0.7, { pitch: 0.3 });
      for (const k of POSE_BONES) {
        const d = t[k];
        if (!d) continue;
        expect(Math.hypot(...d)).toBeCloseTo(1, 5);
      }
    }
    expect(Object.keys(poseTargets('none', 0, 0))).toHaveLength(0);
    expect(Object.keys(poseTargets('aim', 0, 0))).toEqual(['armUR', 'armLR', 'armUL', 'armLL']);
  });
});

describe('fish schools', () => {
  it('caps counts by quality and keeps fish in the water column', () => {
    expect(FISH_COUNTS.low).toBeLessThan(FISH_COUNTS.ultra);
    const school: School = {
      hx: 300, hz: 0, cx: 300, cy: -5, cz: 0, phase: 0, radius: 10, speed: 0.1, model: 0, floor: () => -10,
      fish: Array.from({ length: 12 }, (_, i) => ({ x: 300 + i * 0.1, y: -5, z: 0, vx: 0, vy: 0, vz: 1, ox: i * 0.3, oy: 0, oz: 0, scale: 0.3 })),
    };
    for (let i = 0; i < 600; i++) stepSchool(school, 1 / 30, i / 30, { x: 300, y: -6, z: 0 });
    for (const f of school.fish) {
      expect(f.y).toBeGreaterThanOrEqual(-9.6 - 1e-6);
      expect(f.y).toBeLessThanOrEqual(WATER_Y - 0.4 + 1e-6);
      expect(Math.hypot(f.x - school.cx, f.z - school.cz)).toBeLessThan(20);
    }
  });
});

// ---------------------------------------------------------------- locomotion integration (fake player + input)

import * as THREE from 'three';
import { CollisionWorld } from '../src/world/Collision';
import { Locomotion, type MotorHooks } from '../src/systems/movement/Locomotion';
import type { Player } from '../src/actors/Player';
import type { Input } from '../src/game/Input';

class FakeInput {
  enabled = true;
  held = new Set<string>();
  pressed = new Set<string>();
  isDown(c: string): boolean { return this.held.has(c); }
  wasPressed(c: string): boolean { return this.pressed.has(c); }
  axis(neg: string[], pos: string[]): number {
    return (pos.some((k) => this.held.has(k)) ? 1 : 0) - (neg.some((k) => this.held.has(k)) ? 1 : 0);
  }
  tap(c: string): void { this.pressed.add(c); }
}

function fakePlayer(x: number, y: number, z: number, yaw = 0): Player {
  const poses: Record<string, number> = {};
  return {
    position: new THREE.Vector3(x, y, z), yaw, vy: 0, onGround: true, stamina: 1, health: 100, maxHealth: 100,
    staminaMult: 1, speedMult: 1, speed: 0, active: true, knock: new THREE.Vector3(),
    tiltPitch: 0, tiltRoll: 0, bodyLift: 0, animSpeed: 0, animAirborne: false,
    rig: { setPose: (n: string, wgt = 1) => { poses[n] = wgt; }, poseWeight: (n: string) => poses[n] ?? 0 },
  } as unknown as Player;
}

function sim(boxes: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[]) {
  const world = new CollisionWorld();
  for (const b of boxes) world.add(b);
  const log: string[] = [];
  let damage = 0;
  const hooks: MotorHooks = {
    damage: (hp) => { damage += hp; }, sound: (n) => log.push(n), splash: () => undefined, shake: () => undefined,
    camPitch: () => 0.2, peds: () => [], scuba: () => false, staminaStat: () => 20, lungStat: () => 20,
  };
  const motor = new Locomotion(hooks);
  const input = new FakeInput();
  const step = (p: Player, sec: number, camYaw = Math.PI): void => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      motor.update(p, 1 / 60, input as unknown as Input, camYaw, world);
      input.pressed.clear();
    }
  };
  return { world, motor, input, step, log, damage: () => damage };
}

const PIER = [
  { x0: 226, x1: 302, z0: -126, z1: -114, y0: -2, y1: 0.45 },
  { x0: 237.95, x1: 272.05, z0: -126.05, z1: -125.95, y0: 0.45, y1: 1.65 },
];

describe('locomotion', () => {
  it('wades into the sea, swims, dives, surfaces and climbs onto the pier', () => {
    const s = sim(PIER);
    const p = fakePlayer(246, 0, -132, 0);
    s.step(p, 1.5);
    expect(s.motor.state).toBe('swim');
    s.input.tap('KeyC');
    s.step(p, 1);
    expect(s.motor.state).toBe('under');
    expect(s.motor.cam.mode).toBe('underwater');
    const air = s.motor.breath.air;
    s.step(p, 2);
    expect(s.motor.breath.air).toBeLessThan(air);
    s.input.held.add('Space');
    s.step(p, 4);
    s.input.held.delete('Space');
    expect(s.motor.state).toBe('swim');
    // swim north (+z) to the pier and climb out
    s.input.held.add('KeyW');
    s.step(p, 5, Math.PI);
    s.input.held.delete('KeyW');
    expect(p.position.z).toBeLessThan(-126);
    expect(s.motor.prompts.some((x) => x.text === 'Climb out')).toBe(true);
    s.input.tap('Space');
    s.step(p, 2);
    expect(s.motor.state).toBe('ground');
    expect(p.position.y).toBeCloseTo(0.45, 2);
    expect(p.position.z).toBeGreaterThan(-126);
  });

  it('vaults the pier railing and drops into the sea', () => {
    const s = sim(PIER);
    const p = fakePlayer(250, 0.45, -125.3, Math.PI);
    s.input.held.add('KeyW');
    s.step(p, 0.2, 0);
    s.input.tap('Space');
    s.step(p, 0.1, 0);
    expect(s.motor.state).toBe('vault');
    s.step(p, 2, 0);
    s.input.held.delete('KeyW');
    expect(p.position.z).toBeLessThan(-126.1);
    expect(['swim', 'under']).toContain(s.motor.state);
    expect(s.log).toContain('vault');
  });

  it('crouches, sneaks slowly and quietly, and stands back up', () => {
    const s = sim([]);
    const p = fakePlayer(100, 0, 0, Math.PI);
    s.step(p, 0.2, 0);
    s.input.tap('KeyC');
    s.input.held.add('KeyW');
    s.step(p, 1.5, 0);
    expect(s.motor.crouched).toBe(true);
    expect(p.speed).toBeLessThan(1.6);
    expect(p.bodyLift).toBeLessThan(-0.3);
    expect(s.motor.noise(p)).toBeLessThan(0.3);
    s.input.tap('KeyC');
    s.step(p, 1, 0);
    expect(s.motor.crouched).toBe(false);
    expect(p.speed).toBeGreaterThan(3);
  });

  it('takes fall damage from a high drop and none from a small one', () => {
    const s = sim([{ x0: -5, x1: 5, z0: -5, z1: 5, y0: 0, y1: 2 }, { x0: 20, x1: 30, z0: -5, z1: 5, y0: 0, y1: 10 }]);
    const p = fakePlayer(4.5, 2, 0, Math.PI / 2);
    s.input.held.add('KeyW');
    s.step(p, 1.5, -Math.PI / 2);
    s.input.held.delete('KeyW');
    s.step(p, 1);
    expect(s.damage()).toBe(0);
    const q = fakePlayer(29.5, 10, 0, Math.PI / 2);
    s.input.held.add('KeyW');
    s.step(q, 0.4, -Math.PI / 2);
    s.input.held.delete('KeyW');
    s.step(q, 3);
    expect(s.damage()).toBeGreaterThan(20);
  });

  it('skydives from a tower, opens the parachute and lands softly', () => {
    const s = sim([{ x0: 0, x1: 10, z0: 0, z1: 10, y0: 0, y1: 120 }]);
    const p = fakePlayer(5, 120, 9.5, 0);
    s.motor.launch(p, 0, 8, 4);
    s.step(p, 2.5);
    expect(s.motor.state).toBe('freefall');
    expect(s.motor.prompts.some((x) => x.text === 'Deploy parachute')).toBe(true);
    s.input.tap('Space');
    s.step(p, 0.2);
    expect(s.motor.state).toBe('parachute');
    s.step(p, 6);
    expect(p.vy).toBeGreaterThan(-6);
    // glide down, flare near the ground
    for (let i = 0; i < 60 * 40 && s.motor.state === 'parachute'; i++) {
      if (p.position.y < 6) s.input.held.add('Space');
      s.step(p, 1 / 60);
    }
    s.input.held.delete('Space');
    expect(s.motor.state).toBe('ground');
    expect(s.damage()).toBe(0);
  });

  it('gets knocked over by a car and gets back up', () => {
    const s = sim([]);
    const p = fakePlayer(0, 0, 0);
    s.motor.hit(p, new THREE.Vector3(1, 0, 0), 12);
    expect(s.motor.state).toBe('tumble');
    s.step(p, 6);
    expect(s.motor.state).toBe('ground');
    expect(p.tiltPitch).toBe(0);
    expect(p.position.x).toBeGreaterThan(2);
  });
});
