import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import {
  FIELDS, HINTS, OPERATORS, OPERATOR_LABELS, STARTER_RULE_ID, TECHNIQUES,
  buildDataset, dominantTechnique, evaluate, publicEvents, ruleMatches, scoreDetection, starterRule,
  type Condition, type Field, type Operator, type Rule, type Technique,
} from './logic';
import './detection.css';

const PASS = 60;

export function mountDetection(ctx: ChallengeContext): () => void {
  const ds = buildDataset();
  const events = publicEvents(ds);
  let rules: Rule[] = [starterRule()];
  let selected = STARTER_RULE_ID;
  let filterHits = false;
  let hintsShown = 0;
  let hintsUsed = 0;
  let finished = false;
  let ruleSeq = 1;

  const root = el('div', { class: 'de-root cx-col' });
  ctx.root.append(root);

  const clone = (rs: Rule[]): Rule[] => rs.map((r) => ({ ...r, conditions: r.conditions.map((c) => ({ ...c })) }));

  function render(): void {
    root.replaceChildren();
    const m = evaluate(ds, rules);
    const current = rules.find((r) => r.id === selected) ?? rules[0];

    // ---------- header metrics ----------
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    const freeLeft = Math.max(0, ctx.bonusHints - hintsShown);
    const hintBtn = el('button', { class: 'cx-btn small' },
      hintsShown >= HINTS.length ? 'No more hints' : `Hint (${HINTS.length - hintsShown} left${freeLeft ? `, ${freeLeft} free` : ''})`);
    hintBtn.disabled = hintsShown >= HINTS.length || finished;
    hintBtn.onclick = () => { if (hintsShown >= ctx.bonusHints) hintsUsed++; hintsShown++; ctx.sfx('open'); render(); };
    const hintBox = el('div', { class: 'cx-col' }, ...HINTS.slice(0, hintsShown).map((h) => el('div', { class: 'cx-hint' }, `💡 ${h}`)));

    root.append(el('div', { class: 'de-top' },
      el('div', { class: 'cx-card' },
        el('h4', {}, 'Live test bench (rules vs. 40 events of last night\'s telemetry)'),
        el('div', { class: 'de-metrics' },
          metric('Alerts fired', String(m.hits.size), ''),
          metric('True positives', String(m.tp), 'good'),
          metric('False positives', String(m.fp), m.fp ? 'bad' : ''),
          metric('Precision', pct(m.precision), m.precision >= 0.9 ? 'good' : ''),
          metric('Recall', pct(m.recall), m.recall >= 0.9 ? 'good' : ''),
          metric('F1', m.f1.toFixed(2), '')),
        el('p', { class: 'cx-muted de-small' },
          'Ground truth is hidden — the bench only tells you how many hits were attacks. Precision = how much of what you flag is real. Recall = how much of the attack you caught. Missed attacks: ',
          el('b', { class: m.fn ? 'cx-bad' : 'cx-good' }, String(m.fn)), '.')),
      el('div', { class: 'cx-card cx-col' },
        el('h4', {}, 'Dex\'s brief'),
        el('p', { class: 'de-small' }, 'The old rule "any PowerShell" pages the SOC every night for admin scripts. Tune it, then write rules for the rest of the Pink Tide kill chain. Tag each rule with its MITRE ATT&CK technique.'),
        hintBtn, hintBox)));

    // ---------- rule list + editor ----------
    const list = el('div', { class: 'cx-col de-rules' }, el('h4', { class: 'de-h' }, 'Detection rules'));
    for (const r of rules) {
      const st = m.perRule.find((p) => p.ruleId === r.id);
      const b = el('button', { class: `cx-btn de-rulebtn${r.id === selected ? ' selected' : ''}` },
        el('span', {}, r.name || '(unnamed)'),
        el('span', { class: 'de-rulestats' },
          el('span', { class: 'cx-tag good' }, `${st?.tp ?? 0} TP`), ' ',
          el('span', { class: `cx-tag ${st?.fp ? 'bad' : ''}` }, `${st?.fp ?? 0} FP`)));
      b.onclick = () => { selected = r.id; ctx.sfx('click'); render(); };
      list.append(b);
    }
    const add = el('button', { class: 'cx-btn small' }, '+ New rule');
    add.disabled = finished || rules.length >= 8;
    add.onclick = () => {
      const id = `rule-${ruleSeq++}`;
      rules = [...clone(rules), { id, name: `New rule ${ruleSeq - 1}`, technique: null, conditions: [{ field: 'process_name', op: 'equals', value: '' }] }];
      selected = id;
      ctx.sfx('click');
      render();
    };
    list.append(add);

    root.append(el('div', { class: 'de-main' }, list, editor(current)));

    // ---------- log viewer ----------
    const hitIds = current ? new Set(ds.filter((e) => ruleMatches(e, current)).map((e) => e.id)) : new Set<number>();
    const tbody = el('tbody');
    for (const e of events) {
      if (filterHits && !hitIds.has(e.id)) continue;
      tbody.append(el('tr', { class: hitIds.has(e.id) ? 'flagged' : '' },
        el('td', {}, hitIds.has(e.id) ? '🔔' : String(e.id)),
        el('td', {}, e.time),
        el('td', {}, e.event_type),
        el('td', {}, e.host),
        el('td', {}, e.user),
        el('td', {}, e.process_name),
        el('td', {}, e.parent_process),
        el('td', { class: 'de-cmd', title: e.command_line }, e.command_line),
        el('td', {}, e.src_ip),
        el('td', { class: 'de-cmd', title: e.dest_domain }, e.dest_domain)));
    }
    const toggle = el('button', { class: `cx-btn small${filterHits ? ' selected' : ''}` }, filterHits ? 'Showing hits of selected rule' : 'Show only hits of selected rule');
    toggle.onclick = () => { filterHits = !filterHits; render(); };
    root.append(el('div', { class: 'cx-col' },
      el('div', { class: 'cx-row' }, el('h4', { class: 'de-h' }, 'Telemetry (🔔 = selected rule fires)'), toggle),
      el('div', { class: 'cx-scroll de-table' }, el('table', { class: 'cx-table' },
        el('thead', {}, el('tr', {}, ...['#', 'Time', 'Type', 'Host', 'User', 'Process', 'Parent', 'Command line', 'Src IP', 'Domain'].map((h) => el('th', {}, h)))),
        tbody))));

    if (!finished) {
      const submit = el('button', { class: 'cx-btn primary' }, 'Deploy rules to production');
      submit.onclick = () => { finished = true; render(); };
      root.append(el('div', { class: 'cx-row' }, submit, el('span', { class: 'cx-muted' }, 'Deploying ends the lab and scores your detections.')));
    } else {
      root.append(feedback());
    }
  }

  function metric(label: string, value: string, cls: string): HTMLElement {
    return el('div', { class: 'de-metric' }, el('div', { class: `de-mval ${cls ? `cx-${cls}` : ''}` }, value), el('div', { class: 'cx-muted' }, label));
  }

  function editor(r: Rule | undefined): HTMLElement {
    const box = el('div', { class: 'cx-card cx-col de-editor' });
    if (!r) return box;
    const update = (fn: (x: Rule) => void) => {
      rules = clone(rules);
      const target = rules.find((x) => x.id === r.id);
      if (target) fn(target);
      render();
    };
    const name = el('input', { class: 'cx-input', value: r.name, maxlength: '40' });
    name.disabled = finished;
    name.onchange = () => update((x) => { x.name = name.value.slice(0, 40); });
    const tech = el('select', { class: 'cx-select' }, el('option', { value: '' }, '— ATT&CK technique —'),
      ...TECHNIQUES.map((t) => el('option', { value: t.id }, `${t.id} · ${t.name}`)));
    tech.value = r.technique ?? '';
    tech.disabled = finished;
    tech.onchange = () => update((x) => { x.technique = (tech.value || null) as Technique | null; });

    box.append(el('h4', {}, r.id === STARTER_RULE_ID ? 'Editing: legacy starter rule (tune me!)' : 'Editing rule'),
      el('div', { class: 'cx-row' }, name, tech));
    r.conditions.forEach((c, i) => box.append(conditionRow(c, i, update)));
    const addCond = el('button', { class: 'cx-btn small' }, '+ AND condition');
    addCond.disabled = finished || r.conditions.length >= 4;
    addCond.onclick = () => update((x) => { x.conditions.push({ field: 'command_line', op: 'contains', value: '' }); });
    const del = el('button', { class: 'cx-btn small danger' }, 'Delete rule');
    del.disabled = finished;
    del.onclick = () => {
      rules = clone(rules).filter((x) => x.id !== r.id);
      selected = rules[0]?.id ?? '';
      ctx.sfx('click');
      render();
    };
    box.append(el('div', { class: 'cx-row' }, addCond, del),
      el('p', { class: 'cx-muted de-small' }, 'All conditions must match (AND). Values are case-insensitive. Wildcard supports * only — e.g. *.evil.nb. "is one of" takes a comma list. "hour" is 0–23.'));
    return box;
  }

  function conditionRow(c: Condition, i: number, update: (fn: (x: Rule) => void) => void): HTMLElement {
    const f = el('select', { class: 'cx-select' }, ...FIELDS.map((x) => el('option', { value: x }, x)));
    f.value = c.field;
    const o = el('select', { class: 'cx-select' }, ...OPERATORS.map((x) => el('option', { value: x }, OPERATOR_LABELS[x])));
    o.value = c.op;
    const v = el('input', { class: 'cx-input de-val', value: c.value, maxlength: '80', placeholder: 'value' });
    const rm = el('button', { class: 'cx-btn small' }, '✕');
    for (const x of [f, o, v, rm]) (x as HTMLInputElement).disabled = finished;
    f.onchange = () => update((x) => { x.conditions[i].field = f.value as Field; });
    o.onchange = () => update((x) => { x.conditions[i].op = o.value as Operator; });
    v.onchange = () => update((x) => { x.conditions[i].value = v.value.slice(0, 80); });
    rm.onclick = () => update((x) => { x.conditions.splice(i, 1); });
    return el('div', { class: 'cx-row de-cond' }, el('span', { class: 'cx-tag cyan' }, i === 0 ? 'IF' : 'AND'), f, o, v, rm);
  }

  function feedback(): HTMLElement {
    const s = scoreDetection(ds, rules, PASS);
    ctx.sfx(s.passed ? 'good' : 'bad');
    const box = el('div', { class: `cx-feedback${s.passed ? '' : ' fail'}` },
      el('h3', {}, s.passed ? 'Rules deployed — the Tide can\'t hide in the logs now.' : 'Too much noise or too many misses — the SOC would drown or go blind.'),
      el('div', { class: 'cx-row' }, el('span', { class: 'cx-score' }, String(s.score)), el('span', { class: 'cx-muted' }, `/ 100 · pass ${PASS}`)));
    for (const b of s.breakdown) {
      box.append(el('div', { class: 'de-line' }, el('span', {}, b.label), el('span', {}, `${b.value} / ${b.max}`)),
        el('div', { class: 'cx-bar' }, el('div', { style: `width:${(100 * b.value) / b.max}%` })));
    }
    const missed = el('ul');
    for (const id of s.metrics.missed) {
      const e = ds[id - 1];
      missed.append(el('li', {}, el('b', { class: 'cx-bad' }, `✘ #${id} ${e.time} ${e.truth}: `), e.why));
    }
    const noisy = el('ul');
    for (const id of s.metrics.hits) {
      const e = ds[id - 1];
      if (e.truth === null) noisy.append(el('li', {}, el('b', { class: 'cx-warn' }, `⚠ #${id} false positive: `), e.why));
    }
    if (s.metrics.missed.length) box.append(el('h4', {}, 'Attacks your rules missed'), missed);
    if (noisy.childElementCount) box.append(el('h4', {}, 'Benign events your rules paged on'), noisy);
    box.append(el('p', {}, el('b', { class: s.tuned ? 'cx-good' : 'cx-bad' }, s.tuned ? '✔ Starter rule tuned. ' : '✘ Starter rule not tuned. '),
      'Admin scripts run PowerShell with -File; attackers hide theirs with -nop -w hidden -enc. Adding "command_line contains -enc" kept every attack and dropped every admin false positive.'));
    const mapping = el('ul');
    for (const r of rules) {
      const dom = dominantTechnique(ds, r);
      if (!dom) continue;
      const ok = r.technique === dom;
      mapping.append(el('li', {}, el('b', { class: ok ? 'cx-good' : 'cx-bad' }, `${ok ? '✔' : '✘'} ${r.name}: `),
        `catches ${dom} (${TECHNIQUES.find((t) => t.id === dom)?.name})${ok ? '' : ` — you tagged ${r.technique ?? 'nothing'}`}.`));
    }
    if (mapping.childElementCount) box.append(el('h4', {}, 'ATT&CK mapping'), mapping);
    box.append(el('h4', {}, 'Model answer'), el('ul', {},
      el('li', {}, 'T1059.001 — command_line contains powershell AND contains -enc'),
      el('li', {}, 'T1036 — process_name equals svch0st.exe'),
      el('li', {}, 'T1078 — event_type equals auth AND src_ip starts with 198.51.100.'),
      el('li', {}, 'T1071.004 — event_type equals dns AND dest_domain matches *.x.pinktide.nb')));
    box.append(el('p', { class: 'cx-muted' },
      '🛡 Real-world defense: detection engineers keep rules as version-controlled code, test every change against known-good and known-bad data before deploying, tune noisy rules instead of muting them, and map coverage to MITRE ATT&CK to find gaps.'));

    const result: ChallengeResult = {
      challengeId: 'detection-1',
      score: s.score,
      passed: s.passed,
      breakdown: s.breakdown,
      conceptsPracticed: ['detection-signal-vs-noise', 'detection-precision-recall', 'detection-as-code', 'detection-attack-mapping', 'detection-tuning'],
      mistakes: s.mistakes,
      hintsUsed,
    };
    const retry = el('button', { class: 'cx-btn' }, 'Retry');
    retry.onclick = () => { rules = [starterRule()]; selected = STARTER_RULE_ID; finished = false; ctx.sfx('click'); render(); };
    let done = false;
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue');
    cont.onclick = () => { if (done) return; done = true; ctx.finish(result); };
    box.append(el('div', { class: 'cx-row' }, retry, cont));
    return box;
  }

  render();
  return () => root.remove();
}
