import type { CombatSystem } from './system';

// Hostage negotiation (SCM NEGOTIATE): a few rounds of de-escalation choices.
// Calm, honest, safety-first answers lower the tension; threats and promises
// you can't keep raise it. Low tension at the end = the suspects surrender.

interface Round { line: string; options: { text: string; delta: number; reply: string }[] }

export const NEGOTIATIONS: Record<string, { title: string; who: string; rounds: Round[] }> = {
  bank: {
    title: 'Palmetto Bank — hostage negotiation',
    who: 'Lotus crew leader',
    rounds: [
      {
        line: 'Nobody comes closer! We walk out with the vault drives or these people don\'t walk out at all!',
        options: [
          { text: 'I\'m Rico. I\'m not armed in here and I\'m not going anywhere. Is anyone hurt?', delta: -25, reply: '...Nobody\'s hurt. Yet. Keep your hands where I can see them.' },
          { text: 'Put the gun down right now or SWAT comes through that wall.', delta: 30, reply: 'You think I\'m scared of SWAT? Try me!' },
          { text: 'Fine, take the drives. Just let them go.', delta: 10, reply: 'Just like that? You\'re lying. Nobody hands over the crown jewels.' },
        ],
      },
      {
        line: 'The badge reader let us in. Your security is a joke. Why should I trust anything you say?',
        options: [
          { text: 'You shouldn\'t have to trust me. Let one person go, and I\'ll get you water. Small steps.', delta: -25, reply: 'Okay. The old man goes. Water first.' },
          { text: 'Because I\'m the only thing standing between you and a very bad night.', delta: 15, reply: 'Big talk from a guy in a flower shirt.' },
          { text: 'Lotus already sold you out. They\'re watching you fail on CCTV.', delta: 5, reply: 'Shut up. Shut UP.' },
        ],
      },
      {
        line: 'They promised us nobody would get caught. That the cameras were looped. It was supposed to be clean.',
        options: [
          { text: 'It\'s not too late to make it clean. Nobody\'s been hurt. Walk out with me and that matters.', delta: -30, reply: 'Nobody\'s hurt. That counts for something, right?' },
          { text: 'You\'re going away for a long time either way.', delta: 30, reply: 'Then I\'ve got nothing to lose.' },
          { text: 'I can make the charges disappear.', delta: 15, reply: 'You can\'t. And now I know you\'ll say anything.' },
        ],
      },
    ],
  },
};

function el(tag: string, css: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export function negotiate(combat: CombatSystem, scene: string): Promise<boolean> {
  const ctx = combat.ctx;
  const data = NEGOTIATIONS[scene] ?? NEGOTIATIONS.bank;
  return ctx.modal(() => new Promise<boolean>((resolve) => {
    let tension = 55;
    let round = 0;
    const wrap = el('div', 'position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:0 0 9vh;background:linear-gradient(transparent 40%,rgba(0,0,0,.75));pointer-events:auto;z-index:40;font-family:Oswald,sans-serif');
    const box = el('div', 'width:min(760px,94vw);background:rgba(0,0,0,.82);color:#fff;padding:18px 22px;border-left:4px solid #e0453a');
    const head = el('div', 'font-size:12px;letter-spacing:3px;color:#f0c850;text-transform:uppercase', data.title);
    const meterWrap = el('div', 'height:8px;background:rgba(255,255,255,.12);margin:10px 0 4px');
    const meter = el('div', 'height:100%;background:#e0453a;transition:width .4s');
    meterWrap.append(meter);
    const meterLabel = el('div', 'font-size:11px;letter-spacing:2px;color:#bbb', 'TENSION');
    const line = el('div', 'font-size:20px;line-height:1.4;margin:12px 0');
    const opts = el('div', 'display:flex;flex-direction:column;gap:8px');
    const lesson = el('div', 'font-size:12px;color:#9fd8ff;margin-top:12px', 'De-escalation: slow down, keep people safe, be honest, trade small steps. Never give away what you can\'t.');
    box.append(head, meterWrap, meterLabel, line, opts, lesson);
    wrap.append(box);
    (ctx.hudRoot.parentElement ?? document.body).append(wrap);
    const setMeter = () => { meter.style.width = `${Math.max(0, Math.min(100, tension))}%`; meter.style.background = tension < 35 ? '#72cc72' : tension < 70 ? '#f0c850' : '#e0453a'; };
    const finish = (ok: boolean) => {
      window.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(ok);
    };
    let current: Round | null = null;
    let locked = false;
    const choose = (i: number) => {
      if (!current || locked) return;
      const o = current.options[i];
      if (!o) return;
      locked = true;
      tension += o.delta;
      setMeter();
      ctx.sfx(o.delta < 0 ? 'good' : 'bad');
      line.textContent = `“${o.reply}”`;
      opts.innerHTML = '';
      setTimeout(() => {
        locked = false;
        round++;
        if (tension >= 100) finish(false);
        else if (round >= data.rounds.length) finish(tension <= 35);
        else show();
      }, 1700);
    };
    const show = () => {
      current = data.rounds[round];
      line.textContent = `${data.who}: “${current.line}”`;
      opts.innerHTML = '';
      current.options.forEach((o, i) => {
        const b = el('button', 'text-align:left;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;padding:10px 12px;font:400 16px Oswald,sans-serif;cursor:pointer', `${i + 1}. ${o.text}`);
        b.onmouseenter = () => { b.style.background = 'rgba(255,255,255,.18)'; };
        b.onmouseleave = () => { b.style.background = 'rgba(255,255,255,.08)'; };
        b.onclick = () => choose(i);
        opts.append(b);
      });
    };
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 3) { e.preventDefault(); e.stopPropagation(); choose(n - 1); }
    };
    window.addEventListener('keydown', onKey, true);
    setMeter();
    show();
  })).then((ok) => {
    // outcome on the street
    for (const e of combat.enemies.list) {
      if (!e.mission || e.neutralized) continue;
      if (ok) e.surrender();
      else { e.holdPosition = false; e.alertTo(ctx.world.focus.x, ctx.world.focus.z); }
    }
    ctx.notify(ok ? 'They put the guns down. Nobody got hurt.' : 'Negotiation failed. They\'re opening fire!', ok ? 'good' : 'warn');
    return ok;
  });
}
