import { describe, expect, it } from 'vitest';
import {
  RACES, advance, driftCash, driftRate, formatTime, newProgress, ordinal, passedCount, rank, rubberBand, stuntJumpCash,
  totalCheckpoints, trackDistance, trackTable,
} from '../src/systems/racing/logic';
import { TRAM_STOPS, TramController, pointAt, routeLength, taxiFare } from '../src/systems/transit/logic';

describe('race checkpoints', () => {
  it('only the next checkpoint counts (ordering)', () => {
    const r = RACES[0];
    const p = newProgress();
    const c2 = r.checkpoints[2];
    expect(advance(r, p, c2.x, c2.z, 10, 0)).toBe('none');
    expect(p.cp).toBe(0);
    const c0 = r.checkpoints[0];
    expect(advance(r, p, c0.x + 3, c0.z, 10, 1)).toBe('checkpoint');
    expect(p.cp).toBe(1);
    expect(advance(r, p, c0.x, c0.z, 10, 1)).toBe('none');
  });

  it('street race finishes after the last checkpoint', () => {
    const r = RACES[0];
    const p = newProgress();
    let res = '';
    r.checkpoints.forEach((c, i) => { res = advance(r, p, c.x, c.z, 10, i); });
    expect(res).toBe('finish');
    expect(p.finished).toBe(true);
    expect(passedCount(r, p)).toBe(totalCheckpoints(r));
  });

  it('circuits count laps', () => {
    const r = RACES.find((x) => x.laps === 2)!;
    const p = newProgress();
    const results: string[] = [];
    for (let lap = 0; lap < 2; lap++) for (const c of r.checkpoints) results.push(advance(r, p, c.x, c.z, 10, 0));
    expect(results.filter((x) => x === 'lap')).toHaveLength(1);
    expect(results[results.length - 1]).toBe('finish');
  });

  it('positions follow along-track distance', () => {
    const r = RACES[1];
    const table = trackTable(r);
    const a = newProgress(), b = newProgress();
    const c0 = r.checkpoints[0];
    advance(r, a, c0.x, c0.z, 10, 0);
    const c1 = r.checkpoints[1];
    const dA = trackDistance(r, table, a, (c0.x + c1.x) / 2, (c0.z + c1.z) / 2);
    const dB = trackDistance(r, table, b, r.start.x, r.start.z);
    expect(dA).toBeGreaterThan(dB);
    expect(rank([{ id: 'b', distance: dB }, { id: 'a', distance: dA }])).toEqual(['a', 'b']);
    // a finished racer always ranks ahead
    const f = newProgress();
    f.finished = true;
    f.finishTime = 90;
    expect(trackDistance(r, table, f, 0, 0)).toBeGreaterThan(dA * 10);
  });

  it('rubber band slows leaders and helps stragglers within bounds', () => {
    expect(rubberBand(100)).toBeLessThan(1);
    expect(rubberBand(-100)).toBeGreaterThan(1);
    expect(rubberBand(1e6)).toBeGreaterThanOrEqual(0.84);
    expect(rubberBand(-1e6)).toBeLessThanOrEqual(1.2);
    expect(rubberBand(NaN)).toBe(1);
  });

  it('formats', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(formatTime(75.5)).toBe('1:15.50');
  });

  it('stunt scoring', () => {
    expect(driftRate(5, 0.5)).toBe(0);
    expect(driftRate(20, 0.5)).toBeGreaterThan(0);
    expect(driftCash(500)).toBe(0);
    expect(driftCash(1500)).toBe(10);
    expect(stuntJumpCash(true, 1.2, 30)).toBe(1000);
    expect(stuntJumpCash(false, 1.2, 30)).toBeLessThan(1000);
    expect(stuntJumpCash(true, 0.3, 30)).toBe(0);
  });
});

describe('transit', () => {
  it('route geometry', () => {
    expect(routeLength()).toBeCloseTo(490);
    const p = pointAt(200);
    expect(p.z).toBeCloseTo(5);
    expect(p.x).toBeCloseTo(130);
    for (const s of TRAM_STOPS) {
      const q = pointAt(s.s);
      expect(Math.hypot(q.x - s.x, q.z - s.z)).toBeLessThan(10);
    }
  });

  it('tram visits stops in order and turns around at the ends', () => {
    const t = new TramController(TRAM_STOPS.map((s) => s.s), 0);
    const visits: number[] = [];
    for (let i = 0; i < 60 * 60 * 6; i++) {
      const a = t.step(1 / 60);
      if (a !== null) visits.push(a);
      expect(Number.isFinite(t.s)).toBe(true);
    }
    expect(visits.slice(0, 7)).toEqual([1, 2, 3, 4, 5, 4, 3]);
  });

  it('eta is positive and zero when docked there', () => {
    const t = new TramController(TRAM_STOPS.map((s) => s.s), 2);
    expect(t.eta(2)).toBe(0);
    expect(t.eta(5)).toBeGreaterThan(0);
    expect(t.eta(0)).toBeGreaterThan(t.eta(3));
  });

  it('taxi fares grow with distance', () => {
    expect(taxiFare(0)).toBe(15);
    expect(taxiFare(1000)).toBeGreaterThan(taxiFare(100));
  });
});
