import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import {
  ENDPOINTS, HINTS, PORTS, PORT_NAMES, PROTOS, STARTER_DEFAULT, ZONE_INFO,
  findShadowed, isOverlyBroad, newRule, scoreFirewall, simulate, starterRules,
  type FlowOutcome, type FwAction, type Rule,
} from './logic';
import './firewall.css';

const PASS = 70;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text) n.textContent = text;
  return n;
}

function topology(): SVGSVGElement {
  const s = svg('svg', { viewBox: '0 0 760 240', class: 'fw-topo' });
  const defs = svg('defs', {});
  const g = svg('linearGradient', { id: 'fwgrad', x1: 0, y1: 0, x2: 1, y2: 1 });
  g.append(svg('stop', { offset: '0%', 'stop-color': '#ff2fa0', 'stop-opacity': 0.4 }), svg('stop', { offset: '100%', 'stop-color': '#7b2cff', 'stop-opacity': 0.4 }));
  defs.append(g);
  s.append(defs);

  const line = (x1: number, y1: number, x2: number, y2: number, label?: string) => {
    s.append(svg('line', { x1, y1, x2, y2, stroke: 'rgba(25,230,255,0.55)', 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
    if (label) s.append(svg('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, 'text-anchor': 'middle', fill: '#ffd23f', 'font-size': 11 }, label));
  };
  const node = (x: number, y: number, title: string, addr: string, color: string) => {
    s.append(svg('rect', { x: x - 80, y: y - 26, width: 160, height: 52, rx: 12, fill: 'rgba(21,16,58,0.95)', stroke: color, 'stroke-width': 2 }));
    s.append(svg('text', { x, y: y - 4, 'text-anchor': 'middle', fill: color, 'font-size': 14, 'font-weight': 700 }, title));
    s.append(svg('text', { x, y: y + 14, 'text-anchor': 'middle', fill: '#b9b0d9', 'font-size': 12, 'font-family': 'monospace' }, addr));
  };

  line(160, 100, 235, 100, 'untrusted');
  line(345, 90, 560, 36, ':80 :443');
  line(345, 100, 560, 100);
  line(345, 110, 560, 164);
  line(290, 138, 290, 186, 'VPN tunnel');
  line(640, 62, 640, 74, '');
  line(640, 126, 640, 138, '');
  s.append(svg('text', { x: 730, y: 72, 'text-anchor': 'middle', fill: '#ffd23f', 'font-size': 11 }, ':8080'));
  s.append(svg('text', { x: 730, y: 136, 'text-anchor': 'middle', fill: '#ffd23f', 'font-size': 11 }, ':3306'));

  node(85, 100, 'Internet', ZONE_INFO.internet.addr, '#ff8a3d');
  s.append(svg('rect', { x: 235, y: 62, width: 110, height: 76, rx: 10, fill: 'url(#fwgrad)', stroke: '#ff2fa0', 'stroke-width': 2 }));
  s.append(svg('text', { x: 290, y: 98, 'text-anchor': 'middle', fill: '#fff', 'font-size': 15, 'font-weight': 700 }, 'FIREWALL'));
  s.append(svg('text', { x: 290, y: 118, 'text-anchor': 'middle', fill: '#ff7cc6', 'font-size': 11 }, 'first match wins'));
  node(640, 36, 'DMZ web', ZONE_INFO.dmz.addr, '#19e6ff');
  node(640, 100, 'App server', ZONE_INFO.app.addr, '#b14dff');
  node(640, 164, 'Database', ZONE_INFO.db.addr, '#ff7cc6');
  node(290, 212, 'Admin VPN', ZONE_INFO['admin-vpn'].addr, '#3dffb0');
  return s;
}

export function mountFirewall(ctx: ChallengeContext): () => void {
  let rules: Rule[] = starterRules();
  let defaultAction: FwAction = STARTER_DEFAULT;
  let sim: FlowOutcome[] | null = null;
  let hintsShown = 0;
  let hintsUsed = 0;
  let finished = false;

  const root = el('div', { class: 'fw-root cx-col' });
  ctx.root.append(root);

  function select<T extends string | number>(options: readonly T[], value: T, label: (v: T) => string, onChange: (v: T) => void): HTMLSelectElement {
    const s = el('select', { class: 'cx-select fw-sel' }, ...options.map((o) => el('option', { value: String(o) }, label(o))));
    s.value = String(value);
    s.disabled = finished;
    s.onchange = () => {
      const picked = options.find((o) => String(o) === s.value);
      if (picked !== undefined) { onChange(picked); sim = null; ctx.sfx('click'); render(); }
    };
    return s;
  }

  const epLabel = (e: string) => (e === 'any' ? 'any' : ZONE_INFO[e as keyof typeof ZONE_INFO].name);

  function render(): void {
    root.replaceChildren();
    root.append(el('div', { class: 'cx-card fw-topo-wrap' }, topology()));

    // --- Rule editor ---
    const shadowed = new Set(findShadowed(rules));
    const tbody = el('tbody');
    rules.forEach((r, i) => {
      const up = el('button', { class: 'cx-btn small', title: 'Move up' }, '▲');
      up.disabled = i === 0 || finished;
      up.onclick = () => { [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]]; sim = null; ctx.sfx('click'); render(); };
      const down = el('button', { class: 'cx-btn small', title: 'Move down' }, '▼');
      down.disabled = i === rules.length - 1 || finished;
      down.onclick = () => { [rules[i + 1], rules[i]] = [rules[i], rules[i + 1]]; sim = null; ctx.sfx('click'); render(); };
      const del = el('button', { class: 'cx-btn small danger', title: 'Delete rule' }, '✕');
      del.disabled = finished;
      del.onclick = () => { rules = rules.filter((x) => x.id !== r.id); sim = null; ctx.sfx('click'); render(); };
      const warn: string[] = [];
      if (shadowed.has(i)) warn.push('shadowed');
      if (isOverlyBroad(r)) warn.push('too broad');
      tbody.append(el('tr', { class: shadowed.has(i) ? 'fw-shadowed' : '' },
        el('td', {}, String(i + 1)),
        el('td', {}, select(['ALLOW', 'DENY'] as const, r.action, (v) => v, (v) => { r.action = v; })),
        el('td', {}, select(ENDPOINTS, r.src, epLabel, (v) => { r.src = v; })),
        el('td', {}, select(ENDPOINTS, r.dst, epLabel, (v) => { r.dst = v; })),
        el('td', {}, select(PORTS, r.port, (p) => (p === 'any' ? 'any' : `${p} ${PORT_NAMES[String(p)]}`), (v) => { r.port = v; })),
        el('td', {}, select(PROTOS, r.proto, (p) => p.toUpperCase(), (v) => { r.proto = v; })),
        el('td', {}, ...warn.map((w) => el('span', { class: 'cx-tag warn' }, w))),
        el('td', { class: 'fw-ops' }, up, down, del)));
    });
    const add = el('button', { class: 'cx-btn small' }, '+ Add rule');
    add.disabled = finished;
    add.onclick = () => { rules.push(newRule()); sim = null; ctx.sfx('click'); render(); };

    const defBtn = el('button', { class: `cx-btn small ${defaultAction === 'DENY' ? 'selected' : 'danger'}` },
      `Default policy: ${defaultAction}`);
    defBtn.disabled = finished;
    defBtn.onclick = () => { defaultAction = defaultAction === 'DENY' ? 'ALLOW' : 'DENY'; sim = null; ctx.sfx('click'); render(); };

    root.append(el('div', { class: 'cx-card cx-col' },
      el('div', { class: 'cx-row fw-head' }, el('h4', {}, 'Rule list (evaluated top → bottom)'), defBtn, add),
      el('div', { class: 'cx-scroll fw-rules' }, el('table', { class: 'cx-table' },
        el('thead', {}, el('tr', {}, ...['#', 'Action', 'Source', 'Destination', 'Port', 'Proto', '', ''].map((h) => el('th', {}, h)))),
        tbody)),
      el('div', { class: 'cx-muted fw-small' },
        `If no rule matches → default policy (${defaultAction}). Rules marked "shadowed" can never fire because an earlier rule already catches all their traffic.`)));

    // --- Hints ---
    const hintBox = el('div', { class: 'cx-col' });
    for (let i = 0; i < hintsShown; i++) hintBox.append(el('div', { class: 'cx-hint' }, `💡 ${HINTS[i]}`));
    const freeLeft = Math.max(0, ctx.bonusHints - hintsShown);
    const hintBtn = el('button', { class: 'cx-btn small' },
      hintsShown >= HINTS.length ? 'No more hints' : `Hint (${HINTS.length - hintsShown} left${freeLeft ? `, ${freeLeft} free` : ''})`);
    hintBtn.disabled = hintsShown >= HINTS.length || finished;
    hintBtn.onclick = () => { if (hintsShown >= ctx.bonusHints) hintsUsed++; hintsShown++; ctx.sfx('open'); render(); };

    const simBtn = el('button', { class: 'cx-btn' }, '▶ Run traffic simulation');
    simBtn.disabled = finished;
    simBtn.onclick = () => {
      sim = simulate(rules, defaultAction);
      ctx.sfx(sim.every((o) => o.correct) ? 'good' : 'alert');
      render();
    };
    root.append(el('div', { class: 'cx-row' }, simBtn, hintBtn), hintBox);

    if (sim) root.append(renderSim(sim));

    if (!finished) {
      const submit = el('button', { class: 'cx-btn primary' }, 'Deploy ruleset');
      submit.onclick = () => { finished = true; sim = simulate(rules, defaultAction); render(); };
      root.append(el('div', { class: 'cx-row' }, submit, el('span', { class: 'cx-muted' }, 'Tip: run the simulation first — deploying is final.')));
    } else {
      root.append(renderFeedback());
    }
  }

  function renderSim(outcomes: FlowOutcome[]): HTMLElement {
    const ok = outcomes.filter((o) => o.correct).length;
    const tbody = el('tbody');
    for (const o of outcomes) {
      tbody.append(el('tr', {},
        el('td', {}, o.correct ? '✅' : '❌'),
        el('td', {}, o.flow.label),
        el('td', {}, `${ZONE_INFO[o.flow.src].name} → ${ZONE_INFO[o.flow.dst].name}:${o.flow.port}`),
        el('td', {}, el('span', { class: `cx-tag ${o.flow.legit ? 'good' : 'bad'}` }, o.flow.legit ? 'should allow' : 'should block')),
        el('td', { class: o.action === 'ALLOW' ? 'cx-good' : 'cx-bad' }, o.action === 'ALLOW' ? 'ALLOWED' : 'BLOCKED'),
        el('td', { class: 'cx-muted' }, o.ruleIndex >= 0 ? `rule #${o.ruleIndex + 1}` : 'default')));
    }
    return el('div', { class: 'cx-card cx-col' },
      el('h4', {}, `Simulation: ${ok} / ${outcomes.length} flows handled correctly`),
      el('div', { class: 'cx-scroll fw-sim' }, el('table', { class: 'cx-table' },
        el('thead', {}, el('tr', {}, ...['', 'Flow', 'Path', 'Expected', 'Result', 'Matched'].map((h) => el('th', {}, h)))), tbody)));
  }

  function renderFeedback(): HTMLElement {
    const s = scoreFirewall(rules, defaultAction, PASS);
    ctx.sfx(s.passed ? 'good' : 'bad');
    const box = el('div', { class: `cx-feedback${s.passed ? '' : ' fail'}` },
      el('h3', {}, s.passed ? 'Harbor Cloud is locked down tight.' : 'The walls have holes — the Pink Tide is walking in.'),
      el('div', { class: 'cx-row' }, el('span', { class: 'cx-score' }, `${s.score}`), el('span', { class: 'cx-muted' }, `/ 100 · pass ${PASS}`)));
    for (const b of s.breakdown) {
      box.append(el('div', { class: 'fw-line' }, el('span', {}, b.label), el('span', {}, `${b.value} / ${b.max}`)),
        el('div', { class: 'cx-bar' }, el('div', { style: `width:${(100 * b.value) / b.max}%` })));
    }
    const ul = el('ul');
    for (const o of s.outcomes) {
      ul.append(el('li', {}, el('b', { class: o.correct ? 'cx-good' : 'cx-bad' }, `${o.correct ? '✔' : '✘'} ${o.flow.label}: `),
        `${o.action === 'ALLOW' ? 'allowed' : 'blocked'} (${o.ruleIndex >= 0 ? `rule #${o.ruleIndex + 1}` : 'default policy'}). ${o.flow.why}`));
    }
    box.append(el('h4', {}, 'Flow-by-flow'), ul);
    if (s.broadRules.length) box.append(el('p', { class: 'cx-bad' }, `Rules ${s.broadRules.map((i) => `#${i + 1}`).join(', ')} allow any source or any port. Least privilege means opening only the exact path a service needs.`));
    if (defaultAction === 'ALLOW') box.append(el('p', { class: 'cx-bad' }, 'Default ALLOW means every port you forgot about is open. Professional firewalls end with an implicit or explicit deny-all.'));
    if (s.shadowed.length) box.append(el('p', { class: 'cx-warn' }, `Rules ${s.shadowed.map((i) => `#${i + 1}`).join(', ')} are shadowed by earlier rules and never fire — dead weight that confuses the next admin.`));
    box.append(el('p', { class: 'cx-muted' },
      '🛡 Real-world defense: segment networks into tiers, default-deny at every boundary, allow only required source/destination/port combinations, restrict admin protocols to a VPN or bastion, and review rules regularly for shadowing and drift.'));

    const result: ChallengeResult = {
      challengeId: 'firewall-1',
      score: s.score,
      passed: s.passed,
      breakdown: s.breakdown,
      conceptsPracticed: ['firewall-first-match', 'firewall-default-deny', 'firewall-least-privilege', 'firewall-segmentation'],
      mistakes: s.mistakes,
      hintsUsed,
    };
    const retry = el('button', { class: 'cx-btn' }, 'Retry');
    retry.onclick = () => { rules = starterRules(); defaultAction = STARTER_DEFAULT; sim = null; finished = false; ctx.sfx('click'); render(); };
    let done = false;
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue');
    cont.onclick = () => { if (done) return; done = true; ctx.finish(result); };
    box.append(el('div', { class: 'cx-row' }, retry, cont));
    return box;
  }

  render();
  return () => root.remove();
}
