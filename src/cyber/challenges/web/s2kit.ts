// Shared UI helpers for the Season 2 challenges: hints, meters, option
// pickers and the feedback panel with Retry / Continue.

import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import type { Graded } from './s2score';
import './s2kit.css';

export class Runner {
  hintsShown = 0;
  hintsUsed = 0;
  finished = false;
  constructor(private ctx: ChallengeContext, private hints: string[], private rerender: () => void) {}

  hintsBlock(): HTMLElement {
    const box = el('div', { class: 'cx-col' });
    const freeLeft = Math.max(0, this.ctx.bonusHints - this.hintsShown);
    const left = this.hints.length - this.hintsShown;
    const b = el('button', { class: 'cx-btn small' }, left <= 0 ? 'No more hints' : `💡 Hint (${left} left${freeLeft ? `, ${freeLeft} free` : ''})`);
    b.disabled = left <= 0 || this.finished;
    b.onclick = () => {
      if (this.hintsShown >= this.ctx.bonusHints) this.hintsUsed++;
      this.hintsShown++;
      this.ctx.sfx('open');
      this.rerender();
    };
    box.append(el('div', { class: 'cx-row' }, b));
    for (let i = 0; i < this.hintsShown; i++) box.append(el('div', { class: 'cx-hint' }, `💡 ${this.hints[i]}`));
    return box;
  }

  /** Render graded feedback; Continue calls ctx.finish exactly once. */
  feedback(g: Graded, opts: { id: string; passScore: number; concepts: string[]; defense: string; onRetry: () => void }): HTMLElement {
    const passed = g.score >= opts.passScore;
    this.ctx.sfx(passed ? 'good' : 'bad');
    const result: ChallengeResult = {
      challengeId: opts.id, score: g.score, passed, breakdown: g.breakdown,
      conceptsPracticed: opts.concepts, mistakes: g.mistakes, hintsUsed: this.hintsUsed,
    };
    const lines = el('div', { class: 'cx-col' }, ...g.breakdown.map((b) =>
      el('div', { class: 's2-line' }, el('span', {}, b.label), meter(b.value / Math.max(1, b.max)), el('b', { class: 'cx-mono' }, `${b.value}/${b.max}`))));
    const items = el('ul', {}, ...g.items.map((it) => el('li', {}, el('b', { class: it.ok ? 'cx-good' : 'cx-bad' }, `${it.ok ? '✔' : '✘'} ${it.title}: `), it.text)));
    const retry = el('button', { class: 'cx-btn' }, '↺ Retry');
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue ▶');
    retry.onclick = () => { this.ctx.sfx('click'); opts.onRetry(); };
    let sent = false;
    cont.onclick = () => { if (sent) return; sent = true; this.ctx.sfx('click'); this.ctx.finish(result); };
    return el('div', { class: `cx-feedback s2-feedback${passed ? '' : ' fail'}` },
      el('h3', {}, passed ? '✅ Threat neutralized' : '⚠️ Not yet — the attackers still have a way in'),
      el('div', { class: 'cx-row' }, el('span', { class: `cx-score ${passed ? 'cx-good' : 'cx-bad'}` }, `${g.score}%`), el('span', { class: 'cx-muted' }, `Pass mark ${opts.passScore}%`)),
      lines, el('h4', {}, 'Debrief'), items,
      el('div', { class: 's2-defense' }, el('b', {}, '🛡 Real-world defense: '), opts.defense),
      el('div', { class: 'cx-row' }, retry, cont));
  }
}

/** Horizontal gradient meter, 0..1. */
export function meter(frac: number, label?: string): HTMLElement {
  const f = Math.max(0, Math.min(1, frac));
  const bar = el('div', { class: 's2-meter' }, el('div', { style: `width:${Math.round(f * 100)}%` }));
  bar.classList.toggle('low', f < 0.4);
  bar.classList.toggle('high', f >= 0.8);
  return label ? el('div', { class: 's2-meterwrap' }, el('span', { class: 'cx-muted' }, label), bar, el('b', { class: 'cx-mono' }, `${Math.round(f * 100)}%`)) : bar;
}

/** Row of toggle buttons for a single or multi choice. */
export function chooser(
  options: { id: string; label: string }[],
  selected: string[],
  multi: boolean,
  onChange: (next: string[]) => void,
  disabled = false,
): HTMLElement {
  const row = el('div', { class: 's2-choices' });
  for (const o of options) {
    const b = el('button', { class: `cx-btn small s2-choice${selected.includes(o.id) ? ' selected' : ''}` }, o.label);
    b.disabled = disabled;
    b.onclick = () => {
      let next: string[];
      if (multi) next = selected.includes(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id];
      else next = selected[0] === o.id ? [] : [o.id];
      onChange(next);
    };
    row.append(b);
  }
  return row;
}

/** Up/down reorderable list. */
export function reorderList(items: { id: string; label: string }[], onMove: (from: number, to: number) => void, onRemove: (i: number) => void, disabled = false): HTMLElement {
  const list = el('ol', { class: 's2-order' });
  items.forEach((it, i) => {
    const up = el('button', { class: 'cx-btn small' }, '▲');
    const dn = el('button', { class: 'cx-btn small' }, '▼');
    const rm = el('button', { class: 'cx-btn small danger' }, '✕');
    up.disabled = disabled || i === 0;
    dn.disabled = disabled || i === items.length - 1;
    rm.disabled = disabled;
    up.onclick = () => onMove(i, i - 1);
    dn.onclick = () => onMove(i, i + 1);
    rm.onclick = () => onRemove(i);
    list.append(el('li', { class: 's2-orderitem' }, el('span', {}, it.label), el('span', { class: 'cx-row' }, up, dn, rm)));
  });
  return list;
}

/** Section header with step number. */
export function step(n: number, title: string, sub?: string): HTMLElement {
  return el('div', { class: 's2-step' }, el('span', { class: 's2-stepnum' }, String(n)), el('div', {}, el('h4', {}, title), sub ? el('div', { class: 'cx-muted' }, sub) : null));
}
