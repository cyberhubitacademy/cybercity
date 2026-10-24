import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../src/world/Collision';
import { Vehicle, VEHICLE_DEFS, type VehicleKind } from '../src/vehicles/Vehicle';
import {
  applyDamage, gripCurve, healthState, impactDamage, landingDamage, repairCost, sanitizeUpgrades, springStep, torqueCurve, tunedStats,
} from '../src/vehicles/physics';
import { RAMPS, rampAt, rampHeightAt, rampSurface } from '../src/vehicles/ramps';

function finite(v: Vehicle): boolean {
  const p = v.position, q = v.velocity;
  return [p.x, p.y, p.z, q.x, q.y, q.z, v.yaw, v.speed].every(Number.isFinite);
}

function drive(v: Vehicle, world: CollisionWorld, seconds: number, dt = 1 / 60, ctl: Partial<Vehicle['controls']> = {}): void {
  v.controls = { throttle: 1, steer: 0, handbrake: false, ...ctl };
  for (let t = 0; t < seconds; t += dt) v.update(dt, world);
}

describe('vehicle physics stability', () => {
  const world = new CollisionWorld();

  it('every vehicle kind steps without NaN and respects its speed cap', () => {
    for (const kind of Object.keys(VEHICLE_DEFS) as VehicleKind[]) {
      const v = new Vehicle(VEHICLE_DEFS[kind]);
      const water = kind === 'boat' || kind === 'jetski' || kind === 'kayak' || kind === 'airboat';
      v.place(water ? 270 : 0, water ? 0 : 0, 0);
      v.driver = 'player';
      drive(v, world, 12, 1 / 60, { steer: 0.4 });
      expect(finite(v), kind).toBe(true);
      const hs = Math.hypot(v.velocity.x, v.velocity.z);
      expect(hs, kind).toBeLessThanOrEqual(v.def.maxSpeed * 1.05 + 0.5);
    }
  });

  it('survives garbage inputs and huge/odd time steps', () => {
    const v = new Vehicle(VEHICLE_DEFS.stinger);
    v.place(0, 0, 0);
    for (const dt of [0, -1, NaN, 5, 1e-6, 0.2]) {
      v.controls = { throttle: NaN, steer: Infinity, handbrake: true };
      v.update(dt, world);
      expect(finite(v)).toBe(true);
    }
    v.controls = { throttle: 1, steer: -1, handbrake: false };
    for (let i = 0; i < 2000; i++) v.update(1 / 30, world);
    expect(finite(v)).toBe(true);
  });

  it('accelerates forward and the handbrake breaks traction (drift)', () => {
    const v = new Vehicle(VEHICLE_DEFS.stinger);
    v.place(0, 0, 0);
    drive(v, world, 4);
    expect(v.speed).toBeGreaterThan(20);
    drive(v, world, 0.6, 1 / 60, { throttle: 1, steer: 1, handbrake: true });
    expect(v.slipAngle).toBeGreaterThan(0.15);
  });

  it('brakes to a stop', () => {
    const v = new Vehicle(VEHICLE_DEFS.sedan);
    v.place(0, 0, 0);
    drive(v, world, 3);
    drive(v, world, 4, 1 / 60, { throttle: -1 });
    expect(v.speed).toBeLessThan(0.5);
  });

  it('launches off a stunt ramp and lands', () => {
    const r = RAMPS[0];
    const v = new Vehicle(VEHICLE_DEFS.stinger);
    const back = r.length / 2 + 40;
    v.place(r.x - Math.sin(r.yaw) * back, r.z - Math.cos(r.yaw) * back, r.yaw);
    let launched: string | null | undefined;
    let landedAir = 0;
    v.onLaunch = (id) => { launched = id; };
    v.onLand = (_imp, air) => { landedAir = Math.max(landedAir, air); };
    let maxY = 0;
    v.controls = { throttle: 1, steer: 0, handbrake: false };
    for (let i = 0; i < 60 * 8; i++) {
      v.update(1 / 60, world);
      maxY = Math.max(maxY, v.position.y);
    }
    expect(launched).toBe(r.id);
    expect(maxY).toBeGreaterThan(r.height);
    expect(landedAir).toBeGreaterThan(0.6);
    expect(v.airborne).toBe(false);
    expect(finite(v)).toBe(true);
  });

  it('helicopter climbs, hovers and lands', () => {
    const v = new Vehicle(VEHICLE_DEFS.heli);
    v.place(0, 0, 0);
    v.driver = 'player';
    for (let i = 0; i < 60 * 8; i++) { v.flight = { lift: 1, yaw: 0, pitch: 0, roll: 0 }; v.update(1 / 60, world); }
    expect(v.position.y).toBeGreaterThan(15);
    const y0 = v.position.y;
    for (let i = 0; i < 60 * 3; i++) { v.flight = { lift: 0, yaw: 0.5, pitch: 1, roll: 0 }; v.update(1 / 60, world); }
    expect(Math.abs(v.position.y - y0)).toBeLessThan(12);
    expect(Math.hypot(v.velocity.x, v.velocity.z)).toBeGreaterThan(5);
    v.driver = null;
    for (let i = 0; i < 60 * 30; i++) v.update(1 / 60, world);
    expect(v.position.y).toBeLessThan(0.1);
    expect(finite(v)).toBe(true);
  });

  it('boats stay on water; cars stay out of it', () => {
    const b = new Vehicle(VEHICLE_DEFS.jetski);
    b.place(245, 0, -Math.PI / 2); // heading west toward the beach
    drive(b, world, 10);
    expect(b.position.x).toBeGreaterThan(236);
    const c = new Vehicle(VEHICLE_DEFS.sedan);
    c.place(225, 0, Math.PI / 2); // heading east into the sea
    drive(c, world, 10);
    expect(c.position.x).toBeLessThan(240);
  });

  it('wall impacts damage the vehicle, armor reduces it, repair restores', () => {
    const w = new CollisionWorld();
    w.addRect(-20, 30, 20, 32, 10);
    const a = new Vehicle(VEHICLE_DEFS.sedan);
    a.place(0, 0, 0);
    drive(a, w, 3);
    expect(a.health).toBeLessThan(a.maxHealth);
    const b = new Vehicle(VEHICLE_DEFS.sedan);
    b.setUpgrades({ armor: 4 });
    b.place(0, 0, 0);
    drive(b, w, 3);
    expect(b.maxHealth - b.health).toBeLessThan(a.maxHealth - a.health);
    a.repair();
    expect(a.health).toBe(a.maxHealth);
  });

  it('a dead engine gives no drive', () => {
    const v = new Vehicle(VEHICLE_DEFS.sedan);
    v.place(0, 0, 0);
    v.health = 0;
    drive(v, world, 3);
    expect(Math.abs(v.speed)).toBeLessThan(0.5);
  });
});

describe('physics math', () => {
  it('grip curve peaks then settles for drifts', () => {
    expect(gripCurve(0.15)).toBeGreaterThan(gripCurve(0.8));
    expect(gripCurve(2)).toBeGreaterThanOrEqual(0.55);
    expect(gripCurve(NaN)).toBe(0.55);
  });
  it('torque falls to zero at top speed', () => {
    expect(torqueCurve(0)).toBeGreaterThan(torqueCurve(0.8));
    expect(torqueCurve(1)).toBe(0);
    expect(torqueCurve(1.5)).toBe(0);
  });
  it('springs settle on the target', () => {
    let x = 1, v = 0;
    for (let i = 0; i < 600; i++) [x, v] = springStep(x, v, 0, 70, 9, 1 / 60);
    expect(Math.abs(x)).toBeLessThan(1e-3);
  });
  it('damage & repair math', () => {
    expect(impactDamage(2)).toBe(0);
    expect(impactDamage(20)).toBeGreaterThan(impactDamage(10));
    expect(impactDamage(20, 0.6)).toBeCloseTo(impactDamage(20) * 0.4);
    expect(landingDamage(5)).toBe(0);
    expect(landingDamage(-20)).toBeGreaterThan(0);
    expect(applyDamage(100, 250)).toBe(0);
    expect(applyDamage(100, -5)).toBe(100);
    expect(healthState(1000, 1000)).toBe('ok');
    expect(healthState(300, 1000)).toBe('smoking');
    expect(healthState(100, 1000)).toBe('critical');
    expect(healthState(0, 1000)).toBe('dead');
    expect(repairCost(1000, 1000, 5000)).toBe(0);
    expect(repairCost(0, 1000, 5000)).toBeGreaterThan(repairCost(500, 1000, 5000));
  });
  it('upgrades tune stats and sanitize bad input', () => {
    const base = VEHICLE_DEFS.sedan;
    const t = tunedStats(base, sanitizeUpgrades({ engine: 3, turbo: true, armor: 9, brakes: -2 }));
    expect(t.maxSpeed).toBeGreaterThan(base.maxSpeed);
    expect(t.accel).toBeGreaterThan(base.accel);
    expect(t.armor).toBeCloseTo(0.6);
    expect(t.brake).toBe(base.brake);
  });
  it('ramp surface rises toward the lip and is zero elsewhere', () => {
    const r = RAMPS[1];
    const at = (k: number) => rampSurface(r, r.x + Math.sin(r.yaw) * k, r.z + Math.cos(r.yaw) * k);
    expect(at(-r.length / 2 + 0.01)).toBeLessThan(0.1);
    expect(at(r.length / 2 - 0.01)).toBeCloseTo(r.height, 1);
    expect(at(r.length)).toBe(-1);
    expect(rampHeightAt(0, 0)).toBe(0);
    expect(rampAt(r.x, r.z)?.id).toBe(r.id);
  });
});
