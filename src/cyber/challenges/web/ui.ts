import { el, type ChallengeContext } from '../../types';
import { FINDINGS, HINTS, freshWeb, replay, scoreWeb, type WebInput } from './logic';
import { Runner, chooser, meter, step } from './s2kit';
import './web.css';

const PASS = 65;

export function mountWeb(ctx: ChallengeContext): () => void {
  let st: WebInput = freshWeb();
  let open = FINDINGS[0].id;
  const replayText: Record<string, { blocked: boolean; text: string }> = {};
  const root = el('div', { class: 's2-root cx-col wb-root' });
  ctx.root.append(root);
  const runner = new Runner(ctx, HINTS, () => render());

  function progress(): number {
    const vulns = FINDINGS.filter((f) => f.vulnerable);
    const fixed = vulns.filter((f) => replay(f, st.patches[f.id] ?? []).blocked && st.verdict[f.id] === 'vulnerable').length;
    return fixed / vulns.length;
  }

  function findingPanel(id: string): HTMLElement {
    const f = FINDINGS.find((x) => x.id === id)!;
    const verdict = st.verdict[f.id];
    const chosen = st.patches[f.id] ?? [];
    const panel = el('div', { class: 'cx-card wb-panel' });
    panel.append(
      el('div', { class: 'cx-row' }, el('h4', {}, f.title), el('span', { class: 'cx-tag cyan' }, f.endpoint)),
      el('div', { class: 'wb-split' },
        el('div', {}, el('div', { class: 'cx-muted' }, 'Request (simulated)'), el('div', { class: 's2-code' }, f.request)),
        el('div', {}, el('div', { class: 'cx-muted' }, 'Response'), el('div', { class: 's2-code' }, f.response))),
      el('div', { class: 'cx-muted' }, 'Server code'), el('div', { class: 's2-code' }, f.code),
      el('div', { class: 'cx-muted' }, 'Your verdict'),
      chooser([{ id: 'vulnerable', label: '🚨 Vulnerable' }, { id: 'secure', label: '✅ Secure as-is' }], verdict ? [verdict] : [], false, (n) => {
        st.verdict[f.id] = (n[0] as 'vulnerable' | 'secure' | undefined);
        ctx.sfx('click');
        render();
      }, runner.finished),
    );
    if (verdict === 'vulnerable' && f.patches.length) {
      panel.append(el('div', { class: 'cx-muted' }, f.multi ? 'Choose every patch to apply' : 'Choose the patch'));
      panel.append(chooser(f.patches.map((p) => ({ id: p.id, label: p.label })), chosen, f.multi, (n) => {
        st.patches[f.id] = n;
        delete replayText[f.id];
        ctx.sfx('click');
        render();
      }, runner.finished));
      for (const pid of chosen) {
        const p = f.patches.find((x) => x.id === pid);
        if (p) panel.append(el('div', { class: 's2-code good' }, `+ ${p.code}`));
      }
      const btn = el('button', { class: 'cx-btn' }, '⚡ Replay the attack');
      btn.disabled = runner.finished;
      btn.onclick = () => {
        replayText[f.id] = replay(f, chosen);
        if (chosen.length && !st.replayed.includes(f.id)) st.replayed.push(f.id);
        ctx.sfx(replayText[f.id].blocked ? 'good' : 'alert');
        render();
      };
      panel.append(el('div', { class: 'cx-row' }, btn, el('span', { class: 'cx-muted' }, `Payload: ${f.attack}`)));
      const r = replayText[f.id];
      if (r) panel.append(el('div', { class: `s2-code s2-flash ${r.blocked ? 'good' : 'bad'}` }, `${r.blocked ? '🛡 BLOCKED' : '💥 BREACHED'} — ${r.text}`));
    }
    return panel;
  }

  function render(): void {
    root.innerHTML = '';
    const list = el('div', { class: 'wb-list' });
    for (const f of FINDINGS) {
      const v = st.verdict[f.id];
      const fixed = f.vulnerable && replay(f, st.patches[f.id] ?? []).blocked && v === 'vulnerable';
      const b = el('button', { class: `cx-btn small wb-item${open === f.id ? ' selected' : ''}` },
        el('span', {}, f.title), el('span', { class: `s2-badge ${fixed ? 'cx-good' : v ? 'cx-warn' : 'cx-muted'}` }, fixed ? 'patched' : v ? v : 'unreviewed'));
      b.onclick = () => { open = f.id; ctx.sfx('click'); render(); };
      list.append(b);
    }
    const submit = el('button', { class: 'cx-btn primary' }, 'Deploy patches & submit');
    submit.disabled = runner.finished;
    submit.onclick = () => {
      runner.finished = true;
      render();
      root.append(runner.feedback(scoreWeb(st), {
        id: 'web-1', passScore: PASS, concepts: ['web-injection', 'web-xss', 'web-access-control', 'web-headers', 'web-sessions'],
        defense: 'Fix the code (parameters, output encoding, server-side authorization), add secure defaults (headers, cookie flags), and verify every fix by re-running the attack in a test environment — then add it to automated security tests.',
        onRetry: () => { st = freshWeb(); runner.finished = false; for (const k of Object.keys(replayText)) delete replayText[k]; render(); },
      }));
    };
    root.append(
      step(1, 'Review Palmetto Bank’s online banking', 'Seven endpoints. Mark each vulnerable or secure, pick the right patch, then replay the attack to prove the fix.'),
      meter(progress(), 'Patched & verified'),
      el('div', { class: 'wb-layout' }, list, findingPanel(open)),
      runner.hintsBlock(),
      el('div', { class: 'cx-row' }, submit),
    );
  }

  render();
  return () => { root.remove(); };
}
