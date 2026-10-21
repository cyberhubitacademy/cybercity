import { describe, expect, it } from 'vitest';
import {
  ALERTS, HANDOFF_FACTS, INCIDENT_IDS, TRUTH, emptyDecision, perfectDecisions, scoreSoc, type Decision,
} from '../src/cyber/challenges/soc/logic';

const keyFacts = HANDOFF_FACTS.filter((f) => f.key).map((f) => f.id);

describe('soc data', () => {
  it('every alert has ground truth and all four enrichments', () => {
    expect(ALERTS).toHaveLength(14);
    for (const a of ALERTS) {
      expect(TRUTH[a.id]).toBeDefined();
      expect(Object.keys(a.enrich).sort()).toEqual(['asset', 'hours', 'ip', 'related']);
    }
    expect([...INCIDENT_IDS].sort()).toEqual(['A01', 'A04', 'A08', 'A09']);
    expect(ALERTS.find((a) => a.id === 'A04')!.severity).toBe('low'); // hidden real incident
    expect(ALERTS.some((a) => a.entity.includes('VIP'))).toBe(true);
    expect(ALERTS.some((a) => a.count >= 40)).toBe(true); // alert-fatigue trap
  });
});

describe('soc scoring', () => {
  it('perfect shift scores 100', () => {
    const s = scoreSoc(perfectDecisions(), INCIDENT_IDS, keyFacts);
    expect(s.score).toBe(100);
    expect(s.passed).toBe(true);
  });
  it('doing nothing scores 0', () => {
    const s = scoreSoc({}, [], []);
    expect(s.score).toBe(0);
    expect(s.passed).toBe(false);
  });
  it('severity off by one gives half credit', () => {
    const d = perfectDecisions();
    d.A01 = { ...d.A01, priority: 'P2' };
    const s = scoreSoc(d, INCIDENT_IDS, keyFacts);
    expect(s.breakdown.find((b) => b.label === 'Severity calibration')!.value).toBe(Math.round((4.5 / 5) * 15));
  });
  it('correlation is scored by overlap', () => {
    const s = scoreSoc(perfectDecisions(), ['A01', 'A04', 'A05'], keyFacts);
    expect(s.breakdown.find((b) => b.label === 'Correlation into one incident')!.value).toBe(Math.round((2 / 5) * 20));
  });
  it('blind decisions lose enrichment points', () => {
    const d: Record<string, Decision> = {};
    for (const [id, t] of Object.entries(TRUTH)) {
      d[id] = { ...emptyDecision(), disposition: t.disposition, priority: t.priority ?? null, decidedBlind: true, enriched: ['ip'] };
    }
    const s = scoreSoc(d, INCIDENT_IDS, keyFacts);
    expect(s.breakdown.find((b) => b.label === 'Enrichment before decisions')!.value).toBe(0);
    expect(s.score).toBe(90);
  });
  it('wrong handoff facts cancel right ones', () => {
    const s = scoreSoc(perfectDecisions(), INCIDENT_IDS, [...keyFacts, 'h6', 'h7', 'h8']);
    expect(s.breakdown.find((b) => b.label === 'Shift handoff notes')!.value).toBe(Math.round((2 / 5) * 15));
  });
  it('is deterministic', () => {
    expect(scoreSoc(perfectDecisions(), INCIDENT_IDS, keyFacts)).toEqual(scoreSoc(perfectDecisions(), INCIDENT_IDS, keyFacts));
  });
});
