import { describe, expect, it } from 'vitest';
import { IDEAL, freshGrid, perfectGrid, scoreGrid } from '../src/cyber/challenges/grid/logic';

describe('blackout protocol', () => {
  it('perfect answers score 100', () => {
    expect(scoreGrid(perfectGrid()).score).toBe(100);
  });
  it('empty answers fail', () => {
    expect(scoreGrid(freshGrid()).score).toBeLessThan(65);
  });
  it('dangerous steps in the playbook are penalized', () => {
    const p = perfectGrid();
    p.order = [...IDEAL, 'gridoff'];
    expect(scoreGrid(p).score).toBeLessThan(100);
  });
  it('reversed order scores poorly on sequence', () => {
    const p = perfectGrid();
    p.order = [...IDEAL].reverse();
    const seq = scoreGrid(p).breakdown.find((b) => b.label === 'Incident sequence')!;
    expect(seq.value).toBe(0);
  });
  it('rebooting PLCs is not a safe response', () => {
    const p = perfectGrid();
    p.alerts.rdp = 'rebootall';
    expect(scoreGrid(p).score).toBe(90);
  });
});
