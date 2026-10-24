import { el, type ChallengeContext } from '../../types';
import { AUDIT_LOG, HINTS, IP_OPTIONS, ISSUES, KEY_OPTIONS, PERSIST_OPTIONS, SHARED_Q, freshCloud, posture, scoreCloud, type CloudInput } from './logic';
import { Runner, chooser, meter, step } from '../web/s2kit';
import './cloud.css';

const PASS = 65;

export function mountCloud(ctx: ChallengeContext): () => void {
  let st: CloudInput = freshCloud();
  const root = el('div', { class: 's2-root cx-col cl-root' });
  ctx.root.append(root);
  const runner = new Runner(ctx, HINTS, () => render());
  let lastPosture = 0;

  function consoleView(): HTMLElement {
    const grid = el('div', { class: 'cl-grid' });
    for (const i of ISSUES) {
      const fixed = st.fixes[i.id] === i.correct;
      const card = el('div', { class: `cx-card cl-res${fixed ? ' fixed' : st.fixes[i.id] ? ' tried' : ''}` },
        el('div', { class: 'cx-row' }, el('span', { class: 'cx-tag pink' }, i.kind), el('b', { class: 'cx-mono' }, i.resource)),
        el('div', { class: 'cl-finding' }, `⚠ ${i.finding}`),
        el('div', { class: 'cx-muted' }, i.detail),
        chooser(i.fixes.map((f) => ({ id: f.id, label: f.label })), st.fixes[i.id] ? [st.fixes[i.id]!] : [], false, (n) => {
          st.fixes[i.id] = n[0];
          const p = posture(st.fixes);
          ctx.sfx(p > lastPosture ? 'good' : 'click');
          lastPosture = p;
          render();
        }, runner.finished));
      grid.append(card);
    }
    return grid;
  }

  function logTable(): HTMLElement {
    const t = el('table', { class: 'cx-table' }, el('thead', {}, el('tr', {}, ...['Time', 'Access key', 'Source IP', 'Region', 'Action', 'Target'].map((h) => el('th', {}, h)))));
    const tb = el('tbody');
    for (const l of AUDIT_LOG) tb.append(el('tr', {}, ...[l.t, l.key, l.ip, l.region, l.action, l.target].map((c) => el('td', {}, c))));
    t.append(tb);
    return el('div', { class: 'cx-scroll' }, t);
  }

  function pick(label: string, opts: string[], cur: string | null, set: (v: string | null) => void): HTMLElement {
    return el('div', { class: 'cx-col' }, el('b', {}, label), chooser(opts.map((o) => ({ id: o, label: o })), cur ? [cur] : [], false, (n) => { set(n[0] ?? null); ctx.sfx('click'); render(); }, runner.finished));
  }

  function render(): void {
    root.innerHTML = '';
    const p = posture(st.fixes);
    const submit = el('button', { class: 'cx-btn primary' }, 'Lock it down & submit');
    submit.disabled = runner.finished;
    submit.onclick = () => {
      runner.finished = true;
      render();
      root.append(runner.feedback(scoreCloud(st), {
        id: 'cloud-1', passScore: PASS, concepts: ['cloud-shared-responsibility', 'cloud-public-storage', 'cloud-least-privilege', 'cloud-logging', 'cloud-secrets'],
        defense: 'Block public storage by default, give every identity least privilege with short-lived credentials, log every region to tamper-proof storage, keep secrets in a vault, and continuously scan posture (CSPM) so drift is caught in minutes, not months.',
        onRetry: () => { st = freshCloud(); lastPosture = 0; runner.finished = false; render(); },
      }));
    };
    root.append(
      step(1, 'Harden the Harbor Cloud account', 'Pick the right fix for each red finding. Watch the posture score climb.'),
      el('div', { class: 'cl-posture' }, el('span', { class: 'cx-score' }, `${p}`), el('div', { class: 'cx-col', style: 'flex:1' }, el('b', {}, 'Security posture'), meter(p / 100))),
      consoleView(),
      step(2, 'Investigate: who stole the patient files?', 'Correlate key → source IP → actions in the audit log.'),
      logTable(),
      el('div', { class: 'cl-q' },
        pick('Which access key did the attacker use?', KEY_OPTIONS, st.key, (v) => { st.key = v; }),
        pick('From which source IP?', IP_OPTIONS, st.ip, (v) => { st.ip = v; }),
        pick('Which action gave them a way back in?', PERSIST_OPTIONS, st.persistence, (v) => { st.persistence = v; })),
      step(3, 'Shared responsibility', 'The provider runs the cloud. Who owns this mistake?'),
      el('div', { class: 'cx-card' }, el('div', {}, SHARED_Q.question), chooser(SHARED_Q.options, st.shared ? [st.shared] : [], false, (n) => { st.shared = n[0] ?? null; ctx.sfx('click'); render(); }, runner.finished)),
      runner.hintsBlock(),
      el('div', { class: 'cx-row' }, submit),
    );
  }

  render();
  return () => { root.remove(); };
}
