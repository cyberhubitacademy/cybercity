import { describe, expect, it } from 'vitest';
import {
  FLOWS, evaluate, findShadowed, newRule, referenceRules, scoreFirewall, starterRules, STARTER_DEFAULT, type Flow,
} from '../src/cyber/challenges/firewall/logic';

const flow = (p: Partial<Flow>): Flow => ({ id: 't', label: 't', src: 'internet', dst: 'db', port: 3306, proto: 'tcp', legit: false, why: '', ...p });

describe('firewall evaluation', () => {
  it('uses first-match semantics', () => {
    const rules = [newRule({ action: 'DENY', src: 'internet', dst: 'db', port: 3306 }), newRule({ action: 'ALLOW', src: 'any', dst: 'any', port: 'any', proto: 'any' })];
    expect(evaluate(rules, flow({}), 'DENY')).toEqual({ action: 'DENY', ruleIndex: 0 });
    expect(evaluate([...rules].reverse(), flow({}), 'DENY')).toEqual({ action: 'ALLOW', ruleIndex: 0 });
  });

  it('falls back to the default action', () => {
    expect(evaluate([], flow({}), 'DENY')).toEqual({ action: 'DENY', ruleIndex: -1 });
    expect(evaluate([], flow({}), 'ALLOW').action).toBe('ALLOW');
  });

  it('respects protocol and port matching', () => {
    const rules = [newRule({ action: 'ALLOW', src: 'internet', dst: 'dmz', port: 443, proto: 'tcp' })];
    expect(evaluate(rules, flow({ dst: 'dmz', port: 443 }), 'DENY').action).toBe('ALLOW');
    expect(evaluate(rules, flow({ dst: 'dmz', port: 443, proto: 'udp' }), 'DENY').action).toBe('DENY');
    expect(evaluate(rules, flow({ dst: 'dmz', port: 80 }), 'DENY').action).toBe('DENY');
  });

  it('detects shadowed rules', () => {
    const rules = [newRule({ action: 'ALLOW', src: 'any', dst: 'any', port: 'any', proto: 'any' }), newRule({ action: 'DENY', src: 'internet', dst: 'db', port: 3306 })];
    expect(findShadowed(rules)).toEqual([1]);
    expect(findShadowed(referenceRules())).toEqual([]);
  });
});

describe('firewall scoring', () => {
  it('reference ruleset with default deny is perfect', () => {
    const s = scoreFirewall(referenceRules(), 'DENY');
    expect(s.outcomes.every((o) => o.correct)).toBe(true);
    expect(s.score).toBe(100);
    expect(s.passed).toBe(true);
  });

  it('bad starter ruleset fails', () => {
    const s = scoreFirewall(starterRules(), STARTER_DEFAULT);
    expect(s.passed).toBe(false);
    expect(s.outcomes.filter((o) => !o.flow.legit).every((o) => !o.correct)).toBe(true);
  });

  it('has a mix of legit and attack flows', () => {
    expect(FLOWS).toHaveLength(14);
    expect(FLOWS.filter((f) => f.legit)).toHaveLength(7);
  });
});
