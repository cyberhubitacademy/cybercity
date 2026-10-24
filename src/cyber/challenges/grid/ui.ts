import { el, type ChallengeContext } from '../../types';
import { ALERTS, HINTS, LINKS, PRIORITY_Q, STEPS, TRAPS, ZONES, freshGrid, scoreGrid, type GridInput, type LinkMode } from './logic';
import { Runner, chooser, reorderList, step } from '../web/s2kit';
import './grid.css';

const PASS = 65;
const MODES: { id: LinkMode; label: string }[] = [
  { id: 'allow', label: '✅ Allow (filtered)' },
  { id: 'deny', label: '⛔ Deny' },
  { id: 'oneway', label: '➡ One-way diode' },
];

export function mountGrid(ctx: ChallengeContext): () => void {
  let st: GridInput = freshGrid();
  const root = el('div', { class: 's2-root cx-col gr-root' });
  ctx.root.append(root);
  const runner = new Runner(ctx, HINTS, () => render());
  let rpm = 3000;
  const tick = window.setInterval(() => {
    // Turbine creeps up until the Modbus alert is handled safely.
    const safe = st.alerts.modbus === 'manual';
    rpm = safe ? Math.max(3000, rpm - 40) : Math.min(3600, rpm + 6);
    const g = root.querySelector<HTMLElement>('.gr-rpm');
    if (g) {
      g.textContent = `Turbine 3: ${rpm} RPM`;
      g.classList.toggle('danger', rpm > 3300);
    }
  }, 500);

  function diagram(): HTMLElement {
    const box = el('div', { class: 'gr-zones' });
    for (const z of ZONES) box.append(el('div', { class: `gr-zone gr-${z.id}` }, el('b', {}, z.name), el('span', { class: 'cx-muted' }, z.level)));
    return box;
  }

  function render(): void {
    root.innerHTML = '';
    const links = el('div', { class: 'cx-col' });
    for (const l of LINKS) {
      links.append(el('div', { class: `cx-card gr-link ${st.links[l.id] ?? ''}` }, el('b', {}, l.label),
        chooser(MODES, st.links[l.id] ? [st.links[l.id]!] : [], false, (n) => { st.links[l.id] = n[0] as LinkMode | undefined; ctx.sfx('click'); render(); }, runner.finished)));
    }
    const alerts = el('div', { class: 'cx-col' });
    for (const a of ALERTS) {
      alerts.append(el('div', { class: 'cx-card gr-alert' },
        el('div', { class: 'cx-row' }, el('span', { class: 'cx-tag bad' }, 'ALERT'), el('b', {}, a.title)),
        el('div', { class: 's2-code' }, a.detail),
        chooser(a.options.map((o) => ({ id: o.id, label: o.label })), st.alerts[a.id] ? [st.alerts[a.id]!] : [], false, (n) => { st.alerts[a.id] = n[0]; ctx.sfx(a.id === 'modbus' && n[0] === 'manual' ? 'good' : 'click'); render(); }, runner.finished)));
    }
    const pool = el('div', { class: 's2-choices' });
    for (const s of [...STEPS, ...TRAPS].sort((x, y) => x.label.localeCompare(y.label))) {
      if (st.order.includes(s.id)) continue;
      const b = el('button', { class: 'cx-btn small s2-choice' }, `+ ${s.label}`);
      b.disabled = runner.finished;
      b.onclick = () => { st.order = [...st.order, s.id]; ctx.sfx('click'); render(); };
      pool.append(b);
    }
    const labelOf = (id: string) => [...STEPS, ...TRAPS].find((s) => s.id === id)!.label;
    const order = reorderList(st.order.map((id) => ({ id, label: labelOf(id) })), (a, b) => {
      if (b < 0 || b >= st.order.length) return;
      const o = [...st.order];
      [o[a], o[b]] = [o[b], o[a]];
      st.order = o;
      ctx.sfx('click');
      render();
    }, (i) => { st.order = st.order.filter((_, k) => k !== i); render(); }, runner.finished);
    const submit = el('button', { class: 'cx-btn primary' }, 'Execute response plan');
    submit.disabled = runner.finished;
    submit.onclick = () => {
      runner.finished = true;
      render();
      root.append(runner.feedback(scoreGrid(st), {
        id: 'grid-1', passScore: PASS, concepts: ['ics-purdue', 'ics-safety-first', 'ics-remote-access', 'ics-data-diode'],
        defense: 'Segment OT from IT with an industrial DMZ, send data out through one-way paths, force vendor access through MFA jump hosts, monitor industrial protocols for unexpected writes, and rehearse incident response with operators — safety always comes first.',
        onRetry: () => { st = freshGrid(); runner.finished = false; render(); },
      }));
    };
    root.append(
      el('div', { class: 'gr-status' }, el('span', { class: 'gr-rpm cx-mono' }, `Turbine 3: ${rpm} RPM`), el('span', { class: 'cx-muted' }, 'City load 81% · Neon Bay General on grid power')),
      step(1, 'Segment the plant', 'Set every connection between zones (Purdue model).'), diagram(), links,
      step(2, 'Respond to live alerts', 'Pick the safe response. The turbine is speeding up.'), alerts,
      step(3, 'Order the incident plan', 'Add steps in order. Leave dangerous ones out.'), pool, order,
      step(4, 'OT priorities'),
      el('div', { class: 'cx-card' }, el('div', {}, PRIORITY_Q.question), chooser(PRIORITY_Q.options, st.priority ? [st.priority] : [], false, (n) => { st.priority = n[0] ?? null; ctx.sfx('click'); render(); }, runner.finished)),
      runner.hintsBlock(),
      el('div', { class: 'cx-row' }, submit),
    );
  }

  render();
  return () => { window.clearInterval(tick); root.remove(); };
}
