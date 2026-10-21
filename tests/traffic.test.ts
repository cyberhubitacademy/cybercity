import { describe, expect, it } from 'vitest';
import { ACTIONS, ALL_LABELS, generateTraffic, scoreTraffic, serviceFor, type AnomalyLabel } from '../src/cyber/challenges/traffic/logic';

describe('traffic generator', () => {
  it('is deterministic for a seed', () => {
    expect(generateTraffic(1985)).toEqual(generateTraffic(1985));
  });

  it('keeps service names consistent with port/protocol', () => {
    for (const r of generateTraffic(7)) expect(r.service).toBe(serviceFor(r.dport, r.proto));
    expect(serviceFor(443, 'TCP')).toBe('https');
    expect(serviceFor(53, 'UDP')).toBe('dns');
    expect(serviceFor(23, 'TCP')).toBe('telnet');
  });

  it('contains every anomaly type with the expected patterns', () => {
    const rows = generateTraffic(1985);
    for (const l of ALL_LABELS) expect(rows.some((r) => r.truth === l)).toBe(true);
    const beacons = rows.filter((r) => r.truth === 'beacon');
    expect(beacons.every((r) => r.src === '10.20.5.14' && r.dst === '203.0.113.66' && r.dport === 4444)).toBe(true);
    const scan = rows.filter((r) => r.truth === 'scan').map((r) => r.dport);
    expect(scan).toEqual([8000, 8001, 8002, 8003]);
    expect(rows.filter((r) => r.truth !== null)).toHaveLength(14);
    // ids are sequential after sorting by time
    rows.forEach((r, i) => expect(r.id).toBe(i + 1));
  });
});

describe('traffic scoring', () => {
  const rows = generateTraffic(1985);
  const correctAction = ACTIONS.find((a) => a.correct)!.id;

  it('perfect investigation scores 100', () => {
    const flags = new Map<number, AnomalyLabel | null>();
    for (const r of rows) if (r.truth) flags.set(r.id, r.truth);
    const s = scoreTraffic(rows, flags, correctAction);
    expect(s.score).toBe(100);
    expect(s.passed).toBe(true);
  });

  it('penalizes false positives and wrong actions', () => {
    const flags = new Map<number, AnomalyLabel | null>();
    for (const r of rows) flags.set(r.id, r.truth ?? 'beacon');
    const s = scoreTraffic(rows, flags, 'ignore');
    expect(s.falsePositives.length).toBe(rows.length - 14);
    expect(s.breakdown.find((b) => b.label.startsWith('Precision'))!.value).toBe(0);
    expect(s.actionCorrect).toBe(false);
    expect(s.score).toBeLessThan(100);
  });

  it('nothing flagged fails', () => {
    const s = scoreTraffic(rows, new Map(), null);
    expect(s.passed).toBe(false);
    expect(s.missed).toHaveLength(14);
  });
});
