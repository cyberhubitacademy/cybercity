import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import {
  ACTIONS, ALL_LABELS, ANOMALY_INFO, HINTS, LABEL_NAMES, PORT_CHEATSHEET,
  generateTraffic, scoreTraffic, type AnomalyLabel,
} from './logic';
import './traffic.css';

const PASS = 60;

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

export function mountTraffic(ctx: ChallengeContext): () => void {
  const rows = generateTraffic(1985);
  let flags = new Map<number, AnomalyLabel | null>();
  let actionId: string | null = null;
  let hintsShown = 0;
  let hintsUsed = 0;
  let finished = false;

  const root = el('div', { class: 'tr-root cx-col' });
  ctx.root.append(root);

  function render(): void {
    root.replaceChildren();

    // --- Top: cheat sheet + hints ---
    const cheat = el('div', { class: 'cx-card tr-cheat' },
      el('h4', {}, 'Analyst cheat sheet'),
      el('p', { class: 'cx-muted tr-small' },
        'Every connection = source IP:port → destination IP:port over a protocol. ',
        'TCP is a phone call (handshake, reliable); UDP is a postcard (fire-and-forget). ',
        '10.x.x.x addresses are inside Harbor Cloud; anything else is the outside world.'),
      el('div', { class: 'tr-ports' },
        ...PORT_CHEATSHEET.map((p) => el('div', { class: 'tr-port' },
          el('span', { class: 'cx-tag cyan' }, p.port), el('b', {}, ` ${p.name} `), el('span', { class: 'cx-muted' }, p.note)))),
    );

    const hintBox = el('div', { class: 'cx-col' });
    for (let i = 0; i < hintsShown; i++) hintBox.append(el('div', { class: 'cx-hint' }, `💡 ${HINTS[i]}`));
    const freeLeft = Math.max(0, ctx.bonusHints - hintsShown);
    const hintBtn = el('button', { class: 'cx-btn small' },
      hintsShown >= HINTS.length ? 'No more hints' : `Hint (${HINTS.length - hintsShown} left${freeLeft ? `, ${freeLeft} free` : ''})`);
    hintBtn.disabled = hintsShown >= HINTS.length || finished;
    hintBtn.onclick = () => {
      if (hintsShown >= ctx.bonusHints) hintsUsed++;
      hintsShown++;
      ctx.sfx('open');
      render();
    };

    const status = el('div', { class: 'cx-card tr-status' },
      el('h4', {}, 'Case board'),
      el('div', { class: 'cx-row' },
        el('span', { class: 'cx-tag pink' }, `${flags.size} flagged`),
        el('span', { class: 'cx-tag' }, `${rows.length} connections`)),
      el('p', { class: 'cx-muted tr-small' }, 'Click a row to flag it as suspicious, then pick what kind of threat it is. Click again to un-flag.'),
      hintBtn, hintBox);

    root.append(el('div', { class: 'tr-top' }, cheat, status));

    // --- Connection table ---
    const tbody = el('tbody');
    for (const r of rows) {
      const flagged = flags.has(r.id);
      const tr = el('tr', { class: `clickable${flagged ? ' flagged' : ''}` },
        el('td', {}, flagged ? '🚩' : String(r.id)),
        el('td', {}, r.time),
        el('td', {}, r.src),
        el('td', {}, String(r.sport)),
        el('td', {}, r.dst),
        el('td', {}, String(r.dport)),
        el('td', {}, r.proto),
        el('td', {}, r.service),
        el('td', {}, r.state),
        el('td', { class: r.bytes > 1e8 ? 'cx-warn' : '' }, fmtBytes(r.bytes)),
        el('td', { class: 'tr-info' }, r.info),
      );
      const labelCell = el('td');
      if (flagged) {
        const sel = el('select', { class: 'cx-select tr-sel' },
          el('option', { value: '' }, '— threat type —'),
          ...ALL_LABELS.map((l) => el('option', { value: l }, LABEL_NAMES[l])));
        sel.value = flags.get(r.id) ?? '';
        sel.onclick = (e) => e.stopPropagation();
        sel.onchange = () => {
          flags.set(r.id, (sel.value || null) as AnomalyLabel | null);
          ctx.sfx('click');
        };
        sel.disabled = finished;
        labelCell.append(sel);
      }
      tr.append(labelCell);
      tr.onclick = () => {
        if (finished) return;
        if (flags.has(r.id)) flags.delete(r.id);
        else flags.set(r.id, null);
        ctx.sfx('click');
        render();
      };
      tbody.append(tr);
    }
    const table = el('table', { class: 'cx-table' },
      el('thead', {}, el('tr', {}, ...['#', 'Time', 'Src IP', 'Sport', 'Dst IP', 'Dport', 'Proto', 'Service', 'State', 'Bytes', 'Info', 'Your verdict'].map((h) => el('th', {}, h)))),
      tbody);
    root.append(el('div', { class: 'cx-scroll tr-table' }, table));

    // --- Action ---
    const actions = el('div', { class: 'cx-col' },
      el('h4', { class: 'tr-h' }, 'Recommended response to Dex Holloway'));
    for (const a of ACTIONS) {
      const b = el('button', { class: `cx-btn tr-action${actionId === a.id ? ' selected' : ''}` }, a.text);
      b.disabled = finished;
      b.onclick = () => { actionId = a.id; ctx.sfx('click'); render(); };
      actions.append(b);
    }
    root.append(el('div', { class: 'cx-card' }, actions));

    if (!finished) {
      const submit = el('button', { class: 'cx-btn primary' }, 'Submit findings');
      submit.disabled = flags.size === 0 || !actionId;
      submit.onclick = () => { finished = true; render(); };
      root.append(el('div', { class: 'cx-row' }, submit,
        el('span', { class: 'cx-muted' }, flags.size === 0 ? 'Flag at least one row and choose a response.' : !actionId ? 'Choose a response.' : 'Ready when you are.')));
    } else {
      root.append(renderFeedback());
    }
  }

  function renderFeedback(): HTMLElement {
    const s = scoreTraffic(rows, flags, actionId, PASS);
    ctx.sfx(s.passed ? 'good' : 'bad');
    const box = el('div', { class: `cx-feedback${s.passed ? '' : ' fail'}` },
      el('h3', {}, s.passed ? 'Wire secured — nice catch, Rico.' : 'The Pink Tide slipped past this time.'),
      el('div', { class: 'cx-row' }, el('span', { class: 'cx-score' }, `${s.score}`), el('span', { class: 'cx-muted' }, `/ 100 · pass ${PASS}`)),
    );
    for (const b of s.breakdown) {
      box.append(el('div', { class: 'tr-line' }, el('span', {}, b.label), el('span', {}, `${b.value} / ${b.max}`)),
        el('div', { class: 'cx-bar' }, el('div', { style: `width:${(100 * b.value) / b.max}%` })));
    }
    const list = el('ul');
    for (const l of ALL_LABELS) {
      const f = s.found[l];
      const ok = f.found === f.total;
      list.append(el('li', {},
        el('b', { class: ok ? 'cx-good' : 'cx-bad' }, `${ok ? '✔' : '✘'} ${ANOMALY_INFO[l].title} (${f.found}/${f.total}) `),
        el('br'), el('span', { class: 'cx-warn' }, `Clue: ${ANOMALY_INFO[l].clue}`),
        el('br'), el('span', {}, ANOMALY_INFO[l].explanation)));
    }
    box.append(el('h4', {}, 'What was on the wire'), list);
    if (s.falsePositives.length) {
      box.append(el('p', { class: 'cx-bad' },
        `False alarms on rows ${s.falsePositives.join(', ')}: those were normal — DNS to the internal resolver, HTTPS to Harbor Cloud, NTP and mail relay all match the baseline.`));
    }
    const act = ACTIONS.find((a) => a.id === actionId);
    if (act) box.append(el('p', {}, el('b', { class: act.correct ? 'cx-good' : 'cx-bad' }, act.correct ? '✔ Response: ' : '✘ Response: '), act.explain));
    box.append(el('p', { class: 'cx-muted' },
      '🛡 Real-world defense: SOC teams baseline normal traffic, alert on periodic beacons and unusual egress volume, force DNS through internal resolvers, and block legacy cleartext protocols at the perimeter.'));

    const result: ChallengeResult = {
      challengeId: 'traffic-1',
      score: s.score,
      passed: s.passed,
      breakdown: s.breakdown,
      conceptsPracticed: ['networking-ip-ports', 'networking-baseline', 'networking-beaconing', 'networking-dns-tunneling'],
      mistakes: s.mistakes,
      hintsUsed,
    };
    const retry = el('button', { class: 'cx-btn' }, 'Retry');
    retry.onclick = () => {
      flags = new Map(); actionId = null; finished = false; ctx.sfx('click'); render();
    };
    let done = false;
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue');
    cont.onclick = () => { if (done) return; done = true; ctx.finish(result); };
    box.append(el('div', { class: 'cx-row' }, retry, cont));
    return box;
  }

  render();
  return () => root.remove();
}
