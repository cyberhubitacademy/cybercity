import { describe, expect, it } from 'vitest';
import {
  STARTER_RULE_ID, attackAccuracy, buildDataset, conditionMatches, evaluate, publicEvents, referenceRules,
  ruleMatches, scoreDetection, starterRule, starterTuned, wildcardMatch, type Rule,
} from '../src/cyber/challenges/detection/logic';

const ds = buildDataset();

describe('detection dataset', () => {
  it('is deterministic with sequential ids', () => {
    expect(buildDataset()).toEqual(ds);
    ds.forEach((e, i) => expect(e.id).toBe(i + 1));
    expect(ds.length).toBeGreaterThanOrEqual(38);
  });
  it('has every technique and hides ground truth from the public view', () => {
    for (const t of ['T1059.001', 'T1036', 'T1071.004', 'T1078']) expect(ds.some((e) => e.truth === t)).toBe(true);
    const pub = publicEvents(ds)[0] as unknown as Record<string, unknown>;
    expect('truth' in pub).toBe(false);
    expect('why' in pub).toBe(false);
  });
});

describe('rule engine', () => {
  it('wildcard is a safe glob', () => {
    expect(wildcardMatch('a1b2.x.pinktide.nb', '*.x.pinktide.nb')).toBe(true);
    expect(wildcardMatch('portal.harborcloud.nb', '*.x.pinktide.nb')).toBe(false);
    expect(wildcardMatch('svch0st.exe', 'svch?st.exe')).toBe(false); // ? is literal
    expect(wildcardMatch('abc', 'a*c')).toBe(true);
    expect(wildcardMatch('a.b', '(.*)+$')).toBe(false); // regex syntax is inert
  });
  it('operators behave', () => {
    const e = ds.find((x) => x.process_name === 'svch0st.exe')!;
    expect(conditionMatches(e, { field: 'process_name', op: 'equals', value: 'SVCH0ST.EXE' })).toBe(true);
    expect(conditionMatches(e, { field: 'process_name', op: 'not_equals', value: 'svchost.exe' })).toBe(true);
    expect(conditionMatches(e, { field: 'hour', op: 'greater_than', value: '1' })).toBe(true);
    expect(conditionMatches(e, { field: 'user', op: 'in_list', value: 'a, j.morales ,b' })).toBe(true);
    expect(conditionMatches(e, { field: 'command_line', op: 'contains', value: '' })).toBe(false);
  });
  it('empty rules match nothing; AND semantics', () => {
    const empty: Rule = { id: 'x', name: 'x', conditions: [], technique: null };
    expect(ds.some((e) => ruleMatches(e, empty))).toBe(false);
    const both: Rule = {
      id: 'y', name: 'y', technique: null,
      conditions: [{ field: 'event_type', op: 'equals', value: 'auth' }, { field: 'src_ip', op: 'starts_with', value: '198.51.100.' }],
    };
    const hits = ds.filter((e) => ruleMatches(e, both));
    expect(hits.length).toBe(3);
    expect(hits.every((e) => e.truth === 'T1078')).toBe(true);
  });
});

describe('detection scoring', () => {
  it('reference rules score 100', () => {
    const s = scoreDetection(ds, referenceRules());
    expect(s.metrics.precision).toBe(1);
    expect(s.metrics.recall).toBe(1);
    expect(s.tuned).toBe(true);
    expect(s.score).toBe(100);
    expect(s.passed).toBe(true);
  });
  it('untouched starter rule is noisy and incomplete', () => {
    const rules = [starterRule()];
    const m = evaluate(ds, rules);
    expect(m.fp).toBeGreaterThan(0);
    expect(m.recall).toBeLessThan(0.5);
    expect(starterTuned(ds, rules)).toBe(false);
    expect(scoreDetection(ds, rules).passed).toBe(false);
  });
  it('deleting the starter rule forfeits the tuning points', () => {
    const rules = referenceRules().filter((r) => r.id !== STARTER_RULE_ID);
    expect(starterTuned(ds, rules)).toBe(false);
  });
  it('wrong ATT&CK tags lose mapping points only', () => {
    const rules: Rule[] = referenceRules().map((r) => ({ ...r, technique: 'T1078' }));
    expect(attackAccuracy(ds, rules)).toBeCloseTo(0.25);
    const s = scoreDetection(ds, rules);
    expect(s.score).toBe(100 - 15 + Math.round(0.25 * 15));
  });
  it('no rules scores 0', () => {
    expect(scoreDetection(ds, []).score).toBe(0);
  });
});
