import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import {
  ALERTS, COMMS, HINTS, IDEAL_SEQUENCE, PLAYBOOK, ROOT_CAUSES, SYSTEMS,
  scoreIncident, type IncidentInput,
} from './logic';
import './incident.css';

const PASS = 65;
// Fixed shuffle so the card pool never reveals the answer order.
const POOL_ORDER = ['restore', 'pay', 'isolate', 'lessons', 'wipe', 'preserve', 'social', 'verify', 'disable', 'breaker', 'eradicate'];

function freshState(): IncidentInput {
  return {
    alertOrder: ALERTS.map((a) => a.id),
    falsePositives: [],
    playbook: [],
    rootCause: null,
    impacted: [],
    comms: null,
  };
}

export function mountIncident(ctx: ChallengeContext): () => void {
  let st = freshState();
  let phase = 1;
  let hintsShown = 0;
  let hintsUsed = 0;
  let finished = false;
  let soundPlayed = false;
  const started = performance.now();

  const root = el('div', { class: 'ir-root cx-col' });
  ctx.root.append(root);

  const clock = el('span', { class: 'ir-clock cx-mono' }, '02:31:00');
  const timer = window.setInterval(() => {
    const secs = 2 * 3600 + 31 * 60 + Math.floor((performance.now() - started) / 1000);
    clock.textContent = [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60].map((n) => String(n).padStart(2, '0')).join(':');
  }, 1000);

  const sevClass: Record<string, string> = { critical: 'bad', high: 'pink', medium: 'warn', low: 'cyan' };

  function move<T>(arr: T[], i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  function header(): HTMLElement {
    const tabs = el('div', { class: 'cx-row' });
    ['1 · Triage alerts', '2 · Response playbook', '3 · Incident report'].forEach((label, i) => {
      const b = el('button', { class: `cx-btn small${phase === i + 1 ? ' selected' : ''}` }, label);
      b.onclick = () => { phase = i + 1; ctx.sfx('click'); render(); };
      tabs.append(b);
    });
    return el('div', { class: 'ir-header' }, tabs,
      el('div', { class: 'ir-clockbox' }, el('span', { class: 'cx-tag bad ir-live' }, '● LIVE'), clock,
        el('span', { class: 'cx-muted ir-small' }, 'Take your time — the clock is just for drama.')));
  }

  function hintsBlock(): HTMLElement {
    const box = el('div', { class: 'cx-col' });
    const freeLeft = Math.max(0, ctx.bonusHints - hintsShown);
    const b = el('button', { class: 'cx-btn small' },
      hintsShown >= HINTS.length ? 'No more hints' : `Hint (${HINTS.length - hintsShown} left${freeLeft ? `, ${freeLeft} free` : ''})`);
    b.disabled = hintsShown >= HINTS.length || finished;
    b.onclick = () => { if (hintsShown >= ctx.bonusHints) hintsUsed++; hintsShown++; ctx.sfx('open'); render(); };
    box.append(el('div', { class: 'cx-row' }, b));
    for (let i = 0; i < hintsShown; i++) box.append(el('div', { class: 'cx-hint' }, `💡 ${HINTS[i]}`));
    return box;
  }

  function phaseTriage(): HTMLElement {
    const list = el('div', { class: 'cx-col' });
    st.alertOrder.forEach((id, i) => {
      const a = ALERTS.find((x) => x.id === id)!;
      const fp = st.falsePositives.includes(id);
      const up = el('button', { class: 'cx-btn small' }, '▲');
      up.disabled = i === 0 || finished;
      up.onclick = () => { move(st.alertOrder, i, -1); ctx.sfx('click'); render(); };
      const down = el('button', { class: 'cx-btn small' }, '▼');
      down.disabled = i === st.alertOrder.length - 1 || finished;
      down.onclick = () => { move(st.alertOrder, i, 1); ctx.sfx('click'); render(); };
      const fpBtn = el('button', { class: `cx-btn small${fp ? ' selected' : ''}` }, fp ? '✓ False positive' : 'Mark false positive');
      fpBtn.disabled = finished;
      fpBtn.onclick = () => {
        st.falsePositives = fp ? st.falsePositives.filter((x) => x !== id) : [...st.falsePositives, id];
        ctx.sfx('click'); render();
      };
      list.append(el('div', { class: `cx-card ir-alert${fp ? ' ir-fp' : ''}` },
        el('div', { class: 'ir-rank' }, `#${i + 1}`),
        el('div', { class: 'ir-alert-body' },
          el('div', { class: 'cx-row' },
            el('span', { class: `cx-tag ${sevClass[a.severity]}` }, a.severity),
            el('span', { class: 'cx-mono cx-muted' }, `${a.time} · ${a.host}`)),
          el('div', { class: 'ir-title' }, a.title),
          el('div', { class: 'cx-muted ir-small' }, a.detail)),
        el('div', { class: 'ir-ops' }, up, down, fpBtn)));
    });
    return el('div', { class: 'cx-col' },
      el('p', { class: 'cx-muted' }, 'Dex’s SIEM is screaming. Order the alerts by what you must handle first (top = most urgent) and mark the ones that are false positives.'),
      list);
  }

  function phasePlaybook(): HTMLElement {
    const pool = el('div', { class: 'ir-pool' });
    for (const id of POOL_ORDER) {
      const c = PLAYBOOK.find((x) => x.id === id)!;
      const used = st.playbook.includes(id);
      const b = el('button', { class: 'cx-btn ir-card-btn' }, `＋ ${c.title}`);
      b.disabled = used || finished;
      b.onclick = () => { st.playbook.push(id); ctx.sfx('click'); render(); };
      pool.append(b);
    }
    const seq = el('ol', { class: 'ir-seq' });
    st.playbook.forEach((id, i) => {
      const c = PLAYBOOK.find((x) => x.id === id)!;
      const up = el('button', { class: 'cx-btn small' }, '▲');
      up.disabled = i === 0 || finished;
      up.onclick = () => { move(st.playbook, i, -1); ctx.sfx('click'); render(); };
      const down = el('button', { class: 'cx-btn small' }, '▼');
      down.disabled = i === st.playbook.length - 1 || finished;
      down.onclick = () => { move(st.playbook, i, 1); ctx.sfx('click'); render(); };
      const rm = el('button', { class: 'cx-btn small danger' }, '✕');
      rm.disabled = finished;
      rm.onclick = () => { st.playbook.splice(i, 1); ctx.sfx('click'); render(); };
      seq.append(el('li', { class: 'cx-card ir-step' }, el('span', { class: 'ir-step-title' }, c.title), el('span', { class: 'ir-ops' }, up, down, rm)));
    });
    return el('div', { class: 'cx-split' },
      el('div', { class: 'cx-col' }, el('h4', { class: 'ir-h' }, 'Action cards'),
        el('p', { class: 'cx-muted ir-small' }, 'Not every card is a good idea. Click to add to your playbook.'), pool),
      el('div', { class: 'cx-col' }, el('h4', { class: 'ir-h' }, `Your response playbook (${st.playbook.length} steps)`),
        st.playbook.length ? seq : el('p', { class: 'cx-muted' }, 'Empty — add action cards in the order you would execute them.')));
  }

  function phaseReport(): HTMLElement {
    const rc = el('div', { class: 'cx-col' });
    for (const r of ROOT_CAUSES) {
      const b = el('button', { class: `cx-btn ir-choice${st.rootCause === r.id ? ' selected' : ''}` }, r.text);
      b.disabled = finished;
      b.onclick = () => { st.rootCause = r.id; ctx.sfx('click'); render(); };
      rc.append(b);
    }
    const sys = el('div', { class: 'cx-col' });
    for (const s of SYSTEMS) {
      const on = st.impacted.includes(s.id);
      const b = el('button', { class: `cx-btn ir-choice${on ? ' selected' : ''}` }, `${on ? '☑' : '☐'} ${s.text}`);
      b.disabled = finished;
      b.onclick = () => { st.impacted = on ? st.impacted.filter((x) => x !== s.id) : [...st.impacted, s.id]; ctx.sfx('click'); render(); };
      sys.append(b);
    }
    const cm = el('div', { class: 'cx-col' });
    for (const c of COMMS) {
      const b = el('button', { class: `cx-btn ir-choice${st.comms === c.id ? ' selected' : ''}` }, c.text);
      b.disabled = finished;
      b.onclick = () => { st.comms = c.id; ctx.sfx('click'); render(); };
      cm.append(b);
    }
    return el('div', { class: 'cx-grid' },
      el('div', { class: 'cx-card cx-col' }, el('h4', {}, 'Root cause'), rc),
      el('div', { class: 'cx-card cx-col' }, el('h4', {}, 'Impacted systems'), sys),
      el('div', { class: 'cx-card cx-col' }, el('h4', {}, 'Communication'), cm));
  }

  function render(): void {
    root.replaceChildren();
    root.append(header());
    root.append(phase === 1 ? phaseTriage() : phase === 2 ? phasePlaybook() : phaseReport());
    root.append(hintsBlock());

    if (finished) { root.append(renderFeedback()); return; }
    const nav = el('div', { class: 'cx-row' });
    if (phase > 1) {
      const back = el('button', { class: 'cx-btn' }, '← Back');
      back.onclick = () => { phase--; ctx.sfx('click'); render(); };
      nav.append(back);
    }
    if (phase < 3) {
      const next = el('button', { class: 'cx-btn primary' }, 'Next phase →');
      next.onclick = () => { phase++; ctx.sfx('click'); render(); };
      nav.append(next);
    } else {
      const ready = st.playbook.length > 0 && !!st.rootCause && !!st.comms;
      const submit = el('button', { class: 'cx-btn primary' }, 'File incident report');
      submit.disabled = !ready;
      submit.onclick = () => { finished = true; window.clearInterval(timer); render(); };
      nav.append(submit, el('span', { class: 'cx-muted' }, ready ? 'Ready to file.' : 'Build a playbook, pick a root cause and a communication step.'));
    }
    root.append(nav);
  }

  function renderFeedback(): HTMLElement {
    const s = scoreIncident(st, PASS);
    if (!soundPlayed) { soundPlayed = true; ctx.sfx(s.passed ? 'good' : 'bad'); }
    const box = el('div', { class: `cx-feedback${s.passed ? '' : ' fail'}` },
      el('h3', {}, s.passed ? 'Palmetto Bank is back online. The Flamingo is grounded.' : 'The Pink Tide still has its claws in Palmetto Bank.'),
      el('div', { class: 'cx-row' }, el('span', { class: 'cx-score' }, `${s.score}`), el('span', { class: 'cx-muted' }, `/ 100 · pass ${PASS}`)));
    for (const b of s.breakdown) {
      box.append(el('div', { class: 'ir-line' }, el('span', {}, b.label), el('span', {}, `${b.value} / ${b.max}`)),
        el('div', { class: 'cx-bar' }, el('div', { style: `width:${(100 * b.value) / b.max}%` })));
    }
    const triage = el('ul');
    for (const a of [...ALERTS].sort((x, y) => (x.idealRank || 9) - (y.idealRank || 9))) {
      const markedOk = st.falsePositives.includes(a.id) === a.falsePositive;
      triage.append(el('li', {}, el('b', { class: markedOk ? 'cx-good' : 'cx-bad' },
        `${markedOk ? '✔' : '✘'} ${a.falsePositive ? 'False positive' : `Priority ${a.idealRank}`}: ${a.title}. `), a.explain));
    }
    const steps = el('ol');
    for (const id of IDEAL_SEQUENCE) {
      const c = PLAYBOOK.find((x) => x.id === id)!;
      steps.append(el('li', {}, el('b', { class: st.playbook.includes(id) ? 'cx-good' : 'cx-bad' }, `${c.title} `),
        el('span', { class: 'cx-tag cyan' }, c.phase), ' ', c.explain));
    }
    box.append(el('h4', {}, 'Triage'), triage, el('h4', {}, 'Ideal playbook (NIST incident lifecycle)'), steps);
    if (s.distractorsUsed.length) {
      const bad = el('ul');
      for (const id of s.distractorsUsed) {
        const c = PLAYBOOK.find((x) => x.id === id)!;
        bad.append(el('li', {}, el('b', { class: 'cx-bad' }, `✘ ${c.title}: `), c.explain));
      }
      box.append(el('h4', {}, 'Harmful steps you included'), bad);
    }
    box.append(el('p', {}, el('b', { class: 'cx-good' }, 'Root cause: '),
      'phished credentials worked on a VPN with no MFA. One extra factor would have stopped the Flamingo at the door.'));
    box.append(el('p', { class: 'cx-muted' },
      '🛡 Real-world defense: keep an incident response plan and practice it, require MFA on all remote access, keep offline/immutable backups and test restores, and preserve evidence before you rebuild.'));

    const result: ChallengeResult = {
      challengeId: 'incident-1',
      score: s.score,
      passed: s.passed,
      breakdown: s.breakdown,
      conceptsPracticed: ['incident-lifecycle', 'incident-triage', 'incident-evidence', 'incident-backups'],
      mistakes: s.mistakes,
      hintsUsed,
    };
    const retry = el('button', { class: 'cx-btn' }, 'Retry');
    retry.onclick = () => { st = freshState(); phase = 1; finished = false; soundPlayed = false; ctx.sfx('click'); render(); };
    let done = false;
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue');
    cont.onclick = () => { if (done) return; done = true; ctx.finish(result); };
    box.append(el('div', { class: 'cx-row' }, retry, cont));
    return box;
  }

  render();
  return () => { window.clearInterval(timer); root.remove(); };
}
