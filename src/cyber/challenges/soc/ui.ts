import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import {
  ALERTS, DISPOSITION_LABELS, ENRICH_LABELS, HANDOFF_FACTS, HINTS, INCIDENT_IDS, PRIORITY_LABELS, TRUTH,
  emptyDecision, scoreSoc,
  type Decision, type Disposition, type EnrichKind, type Priority,
} from './logic';
import './soc.css';

const PASS = 60;
const SEV_CLASS: Record<string, string> = { low: '', medium: 'warn', high: 'pink', critical: 'bad' };

export function mountSoc(ctx: ChallengeContext): () => void {
  let decisions: Record<string, Decision> = {};
  let caseIds = new Set<string>();
  let handoff = new Set<string>();
  let wave = 1;
  let open: string | null = ALERTS[0].id;
  let hintsShown = 0;
  let hintsUsed = 0;
  let finished = false;
  let clockMin = 1 * 60 + 50;

  // Cosmetic shift clock — never affects the score.
  const tick = window.setInterval(() => {
    if (finished) return;
    clockMin = (clockMin + 1) % (24 * 60);
    const c = root.querySelector('.so-clock');
    if (c) c.textContent = fmtClock();
  }, 3000);
  const fmtClock = () => `🕑 ${String(Math.floor(clockMin / 60)).padStart(2, '0')}:${String(clockMin % 60).padStart(2, '0')}`;

  const root = el('div', { class: 'so-root cx-col' });
  ctx.root.append(root);

  const dec = (id: string): Decision => (decisions[id] ??= emptyDecision());

  function render(): void {
    root.replaceChildren();
    const visible = ALERTS.filter((a) => a.wave <= wave);
    const decided = visible.filter((a) => decisions[a.id]?.disposition).length;

    const freeLeft = Math.max(0, ctx.bonusHints - hintsShown);
    const hintBtn = el('button', { class: 'cx-btn small' },
      hintsShown >= HINTS.length ? 'No more hints' : `Hint (${HINTS.length - hintsShown} left${freeLeft ? `, ${freeLeft} free` : ''})`);
    hintBtn.disabled = hintsShown >= HINTS.length || finished;
    hintBtn.onclick = () => { if (hintsShown >= ctx.bonusHints) hintsUsed++; hintsShown++; ctx.sfx('open'); render(); };

    const next = el('button', { class: 'cx-btn primary' }, wave < 3 ? `Advance shift ▶ (wave ${wave + 1})` : 'All waves in');
    next.disabled = wave >= 3 || finished;
    next.onclick = () => { wave++; ctx.sfx('alert'); render(); };

    root.append(el('div', { class: 'so-bar cx-card' },
      el('span', { class: 'so-clock cx-score' }, fmtClock()),
      el('div', { class: 'cx-col so-barinfo' },
        el('b', {}, 'Harbor SOC — night shift with Dex Holloway'),
        el('span', { class: 'cx-muted' }, `Queue: ${visible.length} alerts · ${decided} triaged · case: ${caseIds.size} linked · wave ${wave}/3. The clock is just for atmosphere — take your time.`)),
      next, hintBtn),
      ...(hintsShown ? [el('div', { class: 'cx-col' }, ...HINTS.slice(0, hintsShown).map((h) => el('div', { class: 'cx-hint' }, `💡 ${h}`)))] : []));

    // queue + detail
    const queue = el('div', { class: 'cx-col so-queue' });
    for (const a of visible) {
      const d = decisions[a.id];
      const b = el('button', { class: `cx-btn so-alert${open === a.id ? ' selected' : ''}` },
        el('div', { class: 'so-alert-top' },
          el('span', { class: `cx-tag ${SEV_CLASS[a.severity]}` }, a.severity),
          el('span', { class: 'cx-muted' }, `${a.time} · ${a.source}`),
          a.count > 1 ? el('span', { class: 'cx-tag warn' }, `×${a.count}`) : null),
        el('div', { class: 'so-alert-rule' }, a.rule),
        el('div', { class: 'cx-muted so-small' }, a.entity),
        el('div', { class: 'so-alert-state' },
          d?.disposition ? el('span', { class: 'cx-tag cyan' }, d.disposition === 'escalate' ? `escalated ${d.priority ?? ''}` : d.disposition.replace('_', ' ')) : el('span', { class: 'cx-tag' }, 'untriaged'),
          caseIds.has(a.id) ? el('span', { class: 'cx-tag pink' }, '🔗 case') : null));
      b.onclick = () => { open = a.id; ctx.sfx('click'); render(); };
      queue.append(b);
    }
    root.append(el('div', { class: 'so-main' }, queue, detail(open)));

    // handoff + submit
    const facts = el('div', { class: 'cx-col' });
    for (const f of HANDOFF_FACTS) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = handoff.has(f.id);
      cb.disabled = finished;
      cb.onchange = () => { if (cb.checked) handoff.add(f.id); else handoff.delete(f.id); ctx.sfx('click'); };
      facts.append(el('label', { class: 'so-fact' }, cb, el('span', {}, f.text)));
    }
    root.append(el('div', { class: 'cx-card cx-col' }, el('h4', {}, 'End-of-shift handoff notes (tick what the day shift must know)'), facts));

    if (!finished) {
      const submit = el('button', { class: 'cx-btn primary' }, 'End shift & submit');
      const allIn = wave >= 3;
      submit.disabled = !allIn;
      submit.onclick = () => { finished = true; render(); };
      root.append(el('div', { class: 'cx-row' }, submit,
        el('span', { class: 'cx-muted' }, allIn ? 'Untriaged alerts count as wrong.' : 'Advance through all three waves first.')));
    } else {
      root.append(feedback());
    }
  }

  function detail(id: string | null): HTMLElement {
    const a = ALERTS.find((x) => x.id === id && x.wave <= wave);
    const box = el('div', { class: 'cx-card cx-col so-detail' });
    if (!a) {
      box.append(el('p', { class: 'cx-muted' }, 'Select an alert.'));
      return box;
    }
    const d = dec(a.id);
    box.append(
      el('div', { class: 'cx-row' }, el('span', { class: `cx-tag ${SEV_CLASS[a.severity]}` }, a.severity), el('h4', { class: 'so-h' }, `${a.id} · ${a.rule}`)),
      el('div', { class: 'cx-muted' }, `${a.time} · ${a.source} · ${a.entity}${a.count > 1 ? ` · ${a.count} occurrences (collapsed)` : ''}`),
      el('pre', { class: 'cx-mono so-raw' }, a.raw));

    const enrich = el('div', { class: 'cx-row' });
    const shown = el('div', { class: 'cx-col' });
    for (const k of Object.keys(ENRICH_LABELS) as EnrichKind[]) {
      const b = el('button', { class: `cx-btn small${d.enriched.includes(k) ? ' selected' : ''}` }, ENRICH_LABELS[k]);
      b.disabled = finished;
      b.onclick = () => { if (!d.enriched.includes(k)) d.enriched.push(k); ctx.sfx('open'); render(); };
      enrich.append(b);
      if (d.enriched.includes(k)) shown.append(el('div', { class: 'so-enrich' }, el('b', {}, `${ENRICH_LABELS[k]}: `), a.enrich[k]));
    }
    box.append(el('h4', { class: 'so-sub' }, 'Enrichment'), enrich, shown);

    const disp = el('div', { class: 'cx-row' });
    for (const k of Object.keys(DISPOSITION_LABELS) as Disposition[]) {
      const b = el('button', { class: `cx-btn small${d.disposition === k ? ' selected' : ''}` }, DISPOSITION_LABELS[k]);
      b.disabled = finished;
      b.onclick = () => {
        if (!d.disposition && d.enriched.length === 0) d.decidedBlind = true;
        d.disposition = k;
        if (k !== 'escalate') d.priority = null;
        ctx.sfx('click');
        render();
      };
      disp.append(b);
    }
    box.append(el('h4', { class: 'so-sub' }, 'Disposition'), disp);
    if (d.disposition === 'escalate') {
      const sel = el('select', { class: 'cx-select' }, el('option', { value: '' }, '— priority —'),
        ...(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => el('option', { value: p }, PRIORITY_LABELS[p])));
      sel.value = d.priority ?? '';
      sel.disabled = finished;
      sel.onchange = () => { d.priority = (sel.value || null) as Priority | null; ctx.sfx('click'); render(); };
      box.append(el('div', { class: 'cx-row' }, el('span', {}, 'Escalation priority:'), sel));
    }
    const link = el('input', { type: 'checkbox' });
    link.checked = caseIds.has(a.id);
    link.disabled = finished;
    link.onchange = () => { if (link.checked) caseIds.add(a.id); else caseIds.delete(a.id); ctx.sfx('click'); render(); };
    box.append(el('label', { class: 'so-fact' }, link, el('span', {}, 'Link to incident case "PINK-TIDE-001" (same attack chain)')));
    if (d.decidedBlind && !finished) box.append(el('p', { class: 'cx-warn so-small' }, '⚠ You decided before checking any enrichment. Analysts verify context first.'));
    return box;
  }

  function feedback(): HTMLElement {
    const s = scoreSoc(decisions, [...caseIds], [...handoff], PASS);
    ctx.sfx(s.passed ? 'good' : 'bad');
    const box = el('div', { class: `cx-feedback${s.passed ? '' : ' fail'}` },
      el('h3', {}, s.passed ? 'Shift handed over clean — Dex buys the coffee.' : 'Rough shift — the Pink Tide got further than it should have.'),
      el('div', { class: 'cx-row' }, el('span', { class: 'cx-score' }, String(s.score)), el('span', { class: 'cx-muted' }, `/ 100 · pass ${PASS}`)));
    for (const b of s.breakdown) {
      box.append(el('div', { class: 'so-line' }, el('span', {}, b.label), el('span', {}, `${b.value} / ${b.max}`)),
        el('div', { class: 'cx-bar' }, el('div', { style: `width:${(100 * b.value) / b.max}%` })));
    }
    const list = el('ul');
    for (const a of ALERTS) {
      const t = TRUTH[a.id];
      const ok = s.correct[a.id];
      list.append(el('li', {},
        el('b', { class: ok ? 'cx-good' : 'cx-bad' }, `${ok ? '✔' : '✘'} ${a.id} ${a.rule} → ${DISPOSITION_LABELS[t.disposition]}${t.priority ? ` (${t.priority})` : ''}${t.incident ? ' · in case' : ''}. `),
        t.explain));
    }
    box.append(el('h4', {}, 'Alert by alert'), list,
      el('p', {}, el('b', {}, 'Incident case: '), `${INCIDENT_IDS.join(', ')} are one intrusion on WS-ACCT-07 (execution → DNS tunnel → persistence → exfiltration). Correlating them turns four "meh" alerts into one P1 incident.`),
      el('p', { class: 'cx-muted' },
        '🛡 Real-world defense: SOCs triage with an escalation matrix, enrich before deciding, correlate related alerts into one case, feed false positives back as tuning requests, and write handoffs so nothing falls between shifts.'));

    const result: ChallengeResult = {
      challengeId: 'soc-1',
      score: s.score,
      passed: s.passed,
      breakdown: s.breakdown,
      conceptsPracticed: ['soc-triage', 'soc-false-positives', 'soc-enrichment', 'soc-correlation', 'soc-handoff'],
      mistakes: s.mistakes.slice(0, 6),
      hintsUsed,
    };
    const retry = el('button', { class: 'cx-btn' }, 'Retry');
    retry.onclick = () => {
      decisions = {}; caseIds = new Set(); handoff = new Set(); wave = 1; open = ALERTS[0].id; finished = false;
      ctx.sfx('click'); render();
    };
    let done = false;
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue');
    cont.onclick = () => { if (done) return; done = true; ctx.finish(result); };
    box.append(el('div', { class: 'cx-row' }, retry, cont));
    return box;
  }

  render();
  return () => { window.clearInterval(tick); root.remove(); };
}
