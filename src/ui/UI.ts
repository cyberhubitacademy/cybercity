import './ui.css';
import { el, TOPIC_LABELS } from '../cyber/types';
import type { ChallengeContext, ChallengeDefinition, ChallengeResult, SfxName } from '../cyber/types';
import { Hud } from './Hud';
import { buildMapScreen } from './MapScreen';
import { controlsPanel, learningHubPanel, settingsPanel } from './Panels';
import type {
  BriefingView, DialogueLine, HudState, LearningHubView, MainMenuOptions, MinimapState, MissionPassedView, NotifyKind,
  PauseTab, PauseView, PromptView, SettingsView, ShopBuyResult, ShopItem, SkillRow, TerminalOptions,
} from './types';

type KeyHandler = (e: KeyboardEvent) => boolean;
type UiSfx = 'click' | 'open' | 'good' | 'bad' | 'passed' | 'failed' | 'levelup' | 'type' | 'cash' | 'whoosh';

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * All DOM screens for Cyber City. One instance, mounted on #ui.
 * Modal screens push a key handler; the top handler receives keys first
 * (window capture phase) and the game should ignore input while isModalOpen().
 */
export class UI {
  readonly hud = new Hud();
  /** Optional hook for UI sounds (the game wires AudioEngine.sfx here). */
  sfx: (name: UiSfx) => void = () => {};
  /** Optional hook called for each dialogue line shown (e.g. text-to-speech). */
  onLine: (line: DialogueLine) => void = () => {};
  private keyStack: KeyHandler[] = [];
  private modals = 0;
  private loading: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private fadeEl = el('div', { class: 'cc-fade cc-passive' });
  private reducedMotion = false;

  constructor(private root: HTMLElement) {
    root.append(this.hud.root, this.fadeEl);
    window.addEventListener('keydown', this.onKey, true);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
  }

  private onKey = (e: KeyboardEvent): void => {
    const top = this.keyStack[this.keyStack.length - 1];
    if (!top) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    if (typing && e.key !== 'Escape' && e.key !== 'Enter' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (top(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  private pushModal(node: HTMLElement, onKey: KeyHandler): () => void {
    this.root.append(node);
    this.modals++;
    this.keyStack.push(onKey);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      const i = this.keyStack.lastIndexOf(onKey);
      if (i >= 0) this.keyStack.splice(i, 1);
      this.modals--;
      (node as HTMLElement & { cleanup?: () => void }).cleanup?.();
      node.remove();
    };
  }

  isModalOpen(): boolean {
    return this.modals > 0;
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.root.classList.toggle('cc-reduced', on);
  }

  // ---------------- loading / fade ----------------

  showLoading(pct: number, text: string): void {
    if (!this.loading) {
      this.loading = el('div', { class: 'cc-loading' },
        el('div', { class: 'cc-logo' }, el('h1', { class: 'l1' }, 'CYBER CITY'), el('div', { class: 'l2' }, 'Hack the Future')),
        el('div', { class: 'cc-sun' }),
        el('div', { class: 'cc-loading-bar' }, el('div')),
        el('div', { class: 'cc-loading-text' }, ''),
      );
      this.root.append(this.loading);
    }
    const bar = this.loading.querySelector('.cc-loading-bar > div') as HTMLElement;
    bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    (this.loading.querySelector('.cc-loading-text') as HTMLElement).textContent = text;
  }

  hideLoading(): void {
    const l = this.loading;
    if (!l) return;
    this.loading = null;
    l.classList.add('out');
    window.setTimeout(() => l.remove(), 650);
  }

  async fade(toBlack: boolean): Promise<void> {
    this.fadeEl.classList.toggle('on', toBlack);
    await wait(this.reducedMotion ? 30 : 520);
  }

  // ---------------- main menu ----------------

  mainMenu(o: MainMenuOptions): void {
    this.hideMainMenu();
    const items: [string, () => void, boolean][] = [
      ['Continue', o.onContinue, o.hasSave],
      ['New Game', o.onNew, true],
      ...(o.onSaveFile ? [['Save File', o.onSaveFile, true] as [string, () => void, boolean]] : []),
      ['Learning Hub', o.onHub, true],
      ['Settings', o.onSettings, true],
      ['Controls', o.onControls, true],
      ['Credits', o.onCredits, true],
    ];
    const list = el('div', { class: 'cc-menu-list' });
    const buttons: HTMLButtonElement[] = [];
    for (const [label, fn, enabled] of items) {
      const b = el('button', { class: 'cc-menu-btn' }, label);
      b.disabled = !enabled;
      b.addEventListener('click', () => { this.sfx('click'); fn(); });
      b.addEventListener('mouseenter', () => { if (!b.disabled) { focus(buttons.indexOf(b)); } });
      buttons.push(b);
      list.append(b);
      if (label === 'Continue' && o.saveInfo && o.hasSave) list.append(el('div', { class: 'cc-save-info' }, o.saveInfo));
    }
    let idx = buttons.findIndex((b) => !b.disabled);
    const focus = (i: number) => {
      idx = i;
      buttons.forEach((b, k) => b.classList.toggle('focus', k === i));
    };
    focus(idx);
    const menu = el('div', { class: 'cc-menu' },
      el('div', { class: 'cc-menu-left' },
        el('div', { class: 'cc-logo' }, el('h1', { class: 'l1' }, 'CYBER', el('br'), 'CITY'), el('div', { class: 'l2' }, 'Hack the Future')),
        list,
        el('div', { class: 'cc-tagline' }, 'Play. Hack. Be Cyber Safe.'),
        el('div', { class: 'cc-menu-foot' }, 'An original open-world cybersecurity adventure · all hacking is simulated'),
      ),
      el('div'),
    );
    this.menu = menu;
    // The menu is a screen, not a blocking modal: it handles its own keys.
    this.root.append(menu);
    this.keyStack.push(this.menuKeys);
    this.menuKeyFns = {
      move: (d: number) => {
        let i = idx;
        for (let k = 0; k < buttons.length; k++) {
          i = (i + d + buttons.length) % buttons.length;
          if (!buttons[i].disabled) break;
        }
        focus(i);
        this.sfx('click');
      },
      fire: () => buttons[idx]?.click(),
    };
  }

  private menuKeyFns: { move: (d: number) => void; fire: () => void } | null = null;
  private menuKeys: KeyHandler = (e) => {
    if (!this.menuKeyFns) return false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { this.menuKeyFns.move(1); return true; }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { this.menuKeyFns.move(-1); return true; }
    if (e.key === 'Enter' || e.key === ' ') { this.menuKeyFns.fire(); return true; }
    return false;
  };

  hideMainMenu(): void {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.menuKeyFns = null;
    const i = this.keyStack.lastIndexOf(this.menuKeys);
    if (i >= 0) this.keyStack.splice(i, 1);
  }

  // ---------------- HUD passthroughs ----------------

  setHudVisible(on: boolean): void {
    this.hud.root.classList.toggle('hidden-hud', !on);
  }

  updateHud(s: HudState): void {
    this.hud.update(s);
  }

  drawMinimap(m: MinimapState): void {
    this.hud.drawMinimap(m);
  }

  setZone(name: string): void {
    this.hud.setZone(name);
  }

  prompt(p: PromptView | null): void {
    this.hud.prompt(p);
  }

  notify(text: string, kind: NotifyKind = 'info'): void {
    this.hud.notify(text, kind);
  }

  districtBanner(name: string): void {
    this.hud.districtBanner(name);
  }

  subtitle(speaker: string | null, text: string | null): void {
    this.hud.subtitle(speaker, text);
  }

  // ---------------- confirm ----------------

  confirm(text: string, yes = 'Yes', no = 'Cancel'): Promise<boolean> {
    return new Promise((resolve) => {
      const yesB = el('button', { class: 'cx-btn primary' }, yes);
      const noB = el('button', { class: 'cx-btn' }, no);
      const node = el('div', { class: 'cc-modal', style: 'z-index:80' },
        el('div', { class: 'panel cc-window', style: 'width:min(460px,92vw)' },
          el('h3', { class: 'cyan-title' }, 'Are you sure?'),
          el('p', { style: 'font-size:18px' }, text),
          el('div', { class: 'cc-close-row' }, noB, yesB)));
      const done = (v: boolean) => { close(); this.sfx('click'); resolve(v); };
      const close = this.pushModal(node, (e) => {
        if (e.key === 'Escape') { done(false); return true; }
        if (e.key === 'Enter') { done(true); return true; }
        return false;
      });
      yesB.addEventListener('click', () => done(true));
      noB.addEventListener('click', () => done(false));
      yesB.focus();
    });
  }

  // ---------------- dialogue / cutscene ----------------

  dialogue(lines: DialogueLine[], choices?: string[], title?: string): Promise<number> {
    return new Promise((resolve) => {
      const box = el('div', { class: 'cc-letterbox' });
      if (title) box.append(el('div', { class: 'cc-cut-title' }, title));
      const portrait = el('div', { class: 'cc-portrait' });
      const speaker = el('div', { class: 'cc-speaker' });
      const text = el('div', { class: 'cc-dtext' });
      const hint = el('div', { class: 'cc-dhint' }, 'Click / Space / E to continue');
      const choiceBox = el('div', { class: 'cc-choices' });
      const dlg = el('div', { class: 'cc-dialog' }, portrait, el('div', {}, speaker, text, choiceBox, hint));
      box.append(dlg);
      let i = -1;
      let typing = 0;
      let full = '';
      let showingChoices = false;
      const finishTyping = () => {
        window.clearInterval(typing);
        typing = 0;
        text.textContent = full;
        if (i === lines.length - 1 && choices && choices.length) showChoices();
      };
      const showChoices = () => {
        if (showingChoices || !choices) return;
        showingChoices = true;
        hint.textContent = 'Choose a response (1–' + choices.length + ')';
        choices.forEach((c, k) => {
          const b = el('button', { class: 'cx-btn cc-choice' }, `${k + 1}. ${c}`);
          b.addEventListener('click', (ev) => { ev.stopPropagation(); end(k); });
          choiceBox.append(b);
        });
      };
      const next = () => {
        if (typing) { finishTyping(); return; }
        if (showingChoices) return;
        i++;
        if (i >= lines.length) { end(0); return; }
        const L = lines[i];
        portrait.textContent = initials(L.name);
        portrait.style.background = `radial-gradient(circle at 35% 30%, ${L.color}, #1a0f3a)`;
        portrait.style.color = L.color;
        speaker.textContent = L.name;
        speaker.style.color = L.color;
        full = L.text;
        this.onLine(L);
        if (this.reducedMotion) { text.textContent = full; finishTyping(); return; }
        text.textContent = '';
        let n = 0;
        typing = window.setInterval(() => {
          n += 2;
          text.textContent = full.slice(0, n);
          if (n % 6 === 0) this.sfx('type');
          if (n >= full.length) finishTyping();
        }, 18);
      };
      const end = (k: number) => {
        window.clearInterval(typing);
        close();
        resolve(k);
      };
      const close = this.pushModal(box, (e) => {
        if (showingChoices && choices) {
          const n = Number(e.key);
          if (n >= 1 && n <= choices.length) { end(n - 1); return true; }
          return e.key === ' ' || e.key === 'e' || e.key === 'E';
        }
        if (e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'Enter') { next(); return true; }
        if (e.key === 'Escape') { // skip conversation (only when there are no choices to make)
          if (!choices || !choices.length) { end(0); return true; }
          i = lines.length - 2;
          window.clearInterval(typing);
          typing = 0;
          next();
          return true;
        }
        return false;
      });
      box.addEventListener('click', () => next());
      if (!lines.length) { if (choices?.length) { showChoices(); } else { end(0); } return; }
      next();
    });
  }

  async cutscene(lines: DialogueLine[], opts: { title?: string } = {}): Promise<void> {
    await this.dialogue(lines, undefined, opts.title);
  }

  // ---------------- briefing / results ----------------

  briefing(b: BriefingView): Promise<boolean> {
    return new Promise((resolve) => {
      this.sfx('open');
      const stars = '★'.repeat(Math.max(1, Math.min(5, b.difficulty))) + '☆'.repeat(Math.max(0, 5 - b.difficulty));
      const accept = el('button', { class: 'cx-btn primary' }, 'Accept mission (Enter)');
      const later = el('button', { class: 'cx-btn' }, 'Maybe later (Esc)');
      const list = (title: string, items: string[], cls = '') =>
        el('div', { class: 'cx-card' }, el('h4', {}, title), el('ul', { class: cls }, ...items.map((t) => el('li', {}, t))));
      const node = el('div', { class: 'cc-modal' },
        el('div', { class: 'panel cc-window cc-brief' },
          el('div', { class: 'head' },
            el('div', {}, el('div', { class: 'kicker' }, 'MISSION BRIEFING'), el('h2', { class: 'neon-title' }, b.title)),
            el('span', { class: 'cx-tag pink' }, b.giver)),
          el('div', { class: 'meta' },
            el('span', {}, 'Location: ', el('b', {}, b.location)),
            el('span', {}, 'Difficulty: ', el('span', { class: 'cc-stars' }, stars))),
          el('div', { class: 'text' }, b.text),
          el('div', { class: 'cx-grid' }, list('Objectives', b.objectives), list('You will learn', b.learning), list('Rewards', b.rewards)),
          el('div', { class: 'cc-close-row' }, later, accept)));
      const done = (v: boolean) => { close(); this.sfx(v ? 'good' : 'click'); resolve(v); };
      const close = this.pushModal(node, (e) => {
        if (e.key === 'Enter') { done(true); return true; }
        if (e.key === 'Escape') { done(false); return true; }
        return false;
      });
      accept.addEventListener('click', () => done(true));
      later.addEventListener('click', () => done(false));
    });
  }

  private tickNumber(node: HTMLElement, to: number, prefix: string): void {
    if (this.reducedMotion || to === 0) { node.textContent = `${prefix}${to}`; return; }
    const start = performance.now();
    const dur = 1300;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / dur);
      node.textContent = `${prefix}${Math.round(to * (1 - Math.pow(1 - k, 3)))}`;
      if (k < 1) requestAnimationFrame(step);
    };
    window.setTimeout(step, 600);
  }

  missionPassed(r: MissionPassedView): Promise<void> {
    return new Promise((resolve) => {
      this.sfx('passed');
      const xp = el('div', { class: 'v', style: 'color:var(--yellow)' }, '+0');
      const cr = el('div', { class: 'v', style: 'color:var(--money)' }, '$0');
      const rewards = el('div', { class: 'cc-rewards' },
        el('div', { class: 'cc-reward' }, xp, el('div', { class: 'k' }, 'XP')),
        el('div', { class: 'cc-reward' }, cr, el('div', { class: 'k' }, 'Credits')),
        ...r.rep.map((t) => el('div', { class: 'cc-reward' }, el('div', { class: 'v', style: 'color:var(--pink);font-size:20px' }, t), el('div', { class: 'k' }, 'Reputation'))));
      const cont = el('button', { class: 'cx-btn primary' }, 'Continue (Enter)');
      const node = el('div', { class: 'cc-passed' },
        el('div', { class: 'big cc-outline-text' }, 'MISSION PASSED!'),
        el('div', { class: 'respect cc-outline-text' }, el('span', {}, 'RESPECT +'), '  ', r.title),
        rewards,
        r.levelUps > 0 ? el('div', { class: 'cc-levelup' }, r.levelUps > 1 ? `LEVEL UP ×${r.levelUps}!` : 'LEVEL UP! +1 skill point') : null,
        el('div', { class: 'summary' }, r.summary),
        r.learned.length ? el('div', { class: 'learned' }, ...r.learned.map((t) => el('span', { class: 'cx-tag cyan' }, t))) : null,
        cont);
      this.tickNumber(xp, r.xp, '+');
      this.tickNumber(cr, r.credits, '$');
      if (r.levelUps > 0) window.setTimeout(() => this.sfx('levelup'), 1000);
      const done = () => { close(); resolve(); };
      const close = this.pushModal(node, (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { done(); return true; }
        return false;
      });
      cont.addEventListener('click', done);
    });
  }

  private bigBanner(text: string, cls: string, sub: string, sfx: UiSfx): Promise<void> {
    return new Promise((resolve) => {
      this.sfx(sfx);
      const cont = el('button', { class: 'cx-btn primary' }, 'Continue (Enter)');
      const node = el('div', { class: 'cc-passed' },
        el('div', { class: `big ${cls} cc-outline-text` }, text),
        el('div', { class: 'summary' }, sub),
        cont);
      const done = () => { close(); resolve(); };
      const close = this.pushModal(node, (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { done(); return true; }
        return false;
      });
      cont.addEventListener('click', done);
    });
  }

  missionFailed(reason: string): Promise<void> {
    return this.bigBanner('MISSION FAILED', 'fail', reason, 'failed');
  }

  hospitalized(cost: number): Promise<void> {
    return this.bigBanner('HOSPITALIZED', 'hosp', `Neon Bay General patched you up. Medical bill: $${cost}. Look both ways on Ocean Drive!`, 'failed');
  }

  // ---------------- challenge workstation ----------------

  runChallenge(def: ChallengeDefinition, opts: { bonusHints: number; sfx: (name: SfxName) => void }): Promise<ChallengeResult | null> {
    return new Promise((resolve) => {
      this.sfx('open');
      const body = el('div', { class: 'cc-shell-body' });
      const exit = el('button', { class: 'cx-btn small danger' }, 'Exit workstation');
      const stars = '★'.repeat(def.difficulty) + '☆'.repeat(3 - def.difficulty);
      const node = el('div', { class: 'cc-shell' },
        el('div', { class: 'cc-bezel' },
          el('div', { class: 'cc-shell-head' },
            el('div', { class: 'cc-shell-top' },
              el('div', { class: 'cc-shell-title' },
                el('div', { class: 'cc-shell-dots' }, el('i', { style: 'background:#ff4d6d' }), el('i', { style: 'background:#ffd23f' }), el('i', { style: 'background:#3dff9a' })),
                el('h2', { class: 'neon-title' }, def.title),
                el('span', { class: 'cx-tag cyan' }, TOPIC_LABELS[def.topic]),
                el('span', { class: 'cc-stars', title: `Difficulty ${def.difficulty}/3` }, stars),
                el('span', { class: 'cx-tag' }, `Pass: ${def.passScore}%`)),
              exit),
            el('div', { class: 'cc-shell-obj' }, '🎯 ', def.objective),
            el('div', { class: 'cc-shell-intro' }, def.intro)),
          body,
          el('div', { class: 'cc-scanlines' })));
      let cleanup: (() => void) | null = null;
      let finished = false;
      const end = (r: ChallengeResult | null) => {
        if (finished) return;
        finished = true;
        try { cleanup?.(); } catch (err) { console.error(err); }
        close();
        resolve(r);
      };
      const close = this.pushModal(node, (e) => {
        if (e.key === 'Escape') { void askExit(); return true; }
        // Swallow game keys while working; typing in inputs is let through by onKey.
        return e.key.length === 1 || e.key === 'Tab';
      });
      const askExit = async () => {
        if (await this.confirm('Leave the workstation? Progress in this challenge will be lost.', 'Leave', 'Keep working')) end(null);
      };
      exit.addEventListener('click', () => void askExit());
      const root = el('div');
      body.append(root);
      const ctx: ChallengeContext = {
        root,
        bonusHints: opts.bonusHints,
        sfx: opts.sfx,
        finish: (r) => end(r),
      };
      try {
        cleanup = def.mount(ctx);
      } catch (err) {
        console.error('Challenge failed to start', err);
        root.append(el('div', { class: 'cx-feedback fail' }, el('h3', {}, 'This workstation crashed (simulation error).'), el('p', {}, String(err))));
      }
    });
  }

  // ---------------- terminal ----------------

  terminal(o: TerminalOptions): void {
    const out = el('div', { class: 'cc-term-out' });
    const input = el('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Terminal command' });
    const closeBtn = el('button', { class: 'cx-btn small' }, 'Close (Esc)');
    const node = el('div', { class: 'cc-modal' },
      el('div', { class: 'panel cc-term' },
        el('div', { class: 'cc-term-head' }, el('b', {}, `▣ ${o.name}`), closeBtn),
        out,
        el('div', { class: 'cc-term-in' }, el('span', {}, 'analyst@sunsetshield:~$'), input)));
    const history: string[] = [];
    let hIdx = 0;
    const print = (text: string, cls = '') => {
      const line = el('div', { class: cls }, text);
      out.append(line);
      out.scrollTop = out.scrollHeight;
    };
    const run = (raw: string) => {
      const line = raw.trim();
      print(`$ ${line}`, 'cmd');
      if (!line) return;
      history.push(line);
      hIdx = history.length;
      const parts = line.split(/\s+/);
      const names = Object.keys(o.commands);
      // allow two-word commands like "mission list"
      const two = parts.slice(0, 2).join(' ').toLowerCase();
      const one = parts[0].toLowerCase();
      if (one === 'clear') { out.innerHTML = ''; return; }
      if (one === 'exit' || one === 'quit') { done(); return; }
      if (one === 'help' && !o.commands.help) {
        print('Available commands:\n  ' + [...names, 'clear', 'exit'].join('\n  '), 'sys');
        return;
      }
      const key = names.find((n) => n.toLowerCase() === two) ?? names.find((n) => n.toLowerCase() === one);
      if (!key) {
        print(`command not found: ${parts[0]} — type "help"`, 'err');
        this.sfx('bad');
        return;
      }
      const args = parts.slice(key.split(' ').length);
      try {
        print(o.commands[key](args));
        this.sfx('click');
      } catch (err) {
        print(`error: ${err instanceof Error ? err.message : String(err)}`, 'err');
      }
    };
    const done = () => { close(); o.onClose(); };
    const close = this.pushModal(node, (e) => {
      if (e.key === 'Escape') { done(); return true; }
      if (e.target !== input) return false;
      if (e.key === 'Enter') { run(input.value); input.value = ''; return true; }
      if (e.key === 'ArrowUp') { hIdx = Math.max(0, hIdx - 1); input.value = history[hIdx] ?? ''; return true; }
      if (e.key === 'ArrowDown') { hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] ?? ''; return true; }
      return false;
    });
    closeBtn.addEventListener('click', done);
    node.addEventListener('click', (e) => { if (e.target === node) input.focus(); });
    print(o.banner ?? `${o.name}\nSIMULATION MODE — all data is fictional. Type "help" for commands.`, 'sys');
    window.setTimeout(() => input.focus(), 30);
  }

  // ---------------- map ----------------

  openMap(state: MinimapState, onWaypoint: (x: number | null, z: number | null) => void): Promise<void> {
    return new Promise((resolve) => {
      this.sfx('open');
      const done = () => { close(); resolve(); };
      const node = buildMapScreen(state, (x, z) => { this.sfx('click'); onWaypoint(x, z); }, () => onWaypoint(null, null), done);
      const close = this.pushModal(node, (e) => {
        if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') { done(); return true; }
        return false;
      });
    });
  }

  // ---------------- pause menu ----------------

  pauseMenu(p: PauseView): Promise<void> {
    return new Promise((resolve) => {
      this.sfx('open');
      const tabs: [PauseTab, string][] = [
        ['missions', 'Missions'], ['map', 'Map'], ['inventory', 'Inventory'], ['skills', 'Skills'],
        ['journal', 'Journal'], ['hub', 'Learning Hub'], ['settings', 'Settings'], ['save', 'Save & Quit'],
      ];
      const side = el('div', { class: 'cc-pause-side' }, el('h2', { class: 'neon-title' }, 'PAUSED'), el('div', { class: 'sub' }, 'Neon Bay waits…'));
      const main = el('div', { class: 'cc-pause-main' });
      const tabBtns = new Map<PauseTab, HTMLButtonElement>();
      let current: PauseTab = p.initialTab ?? 'missions';
      let skills = p.skills;
      const resume = el('button', { class: 'cx-btn primary', style: 'margin-top:auto' }, 'Resume (Esc)');
      for (const [id, label] of tabs) {
        const b = el('button', { class: 'cc-tab' }, label);
        b.addEventListener('click', () => { this.sfx('click'); show(id); });
        tabBtns.set(id, b);
        side.append(b);
      }
      side.append(resume);

      const statsRow = () => el('div', { class: 'cc-stat-row' },
        el('div', { class: 'cc-stat' }, el('div', { class: 'v', style: 'color:var(--yellow)' }, `LV ${p.stats.level}`), el('div', { class: 'k' }, `${p.stats.xp}/${p.stats.xpNext} XP`)),
        el('div', { class: 'cc-stat' }, el('div', { class: 'v', style: 'color:var(--money)' }, `$${p.stats.credits}`), el('div', { class: 'k' }, 'Credits')),
        el('div', { class: 'cc-stat' }, el('div', { class: 'v', style: 'color:var(--cyan)' }, String(p.stats.skillPoints)), el('div', { class: 'k' }, 'Skill points')),
        ...p.stats.rep.map((r) => el('div', { class: 'cc-stat' }, el('div', { class: 'v', style: 'color:var(--pink-soft);font-size:20px' }, String(r.value)), el('div', { class: 'k' }, r.label))));

      const statusTag = (s: string) => {
        const cls = s === 'completed' ? 'good' : s === 'active' ? 'pink' : s === 'available' ? 'cyan' : '';
        return el('span', { class: `cx-tag ${cls}` }, s);
      };

      const render: Record<PauseTab, () => HTMLElement[]> = {
        missions: () => {
          const out: HTMLElement[] = [el('h2', {}, 'Missions'), statsRow()];
          if (p.active) out.push(el('div', { class: 'cx-card active' }, el('h4', {}, `▶ ${p.active.title}`), el('div', {}, p.active.objective)));
          const list = el('div', { class: 'cc-list', style: 'margin-top:12px' });
          for (const m of p.missions) {
            list.append(el('div', { class: `cx-card cc-mrow${m.status === 'locked' ? ' locked' : ''}` },
              el('div', {}, el('div', { class: 't' }, m.title), el('div', { class: 's' }, `${m.chapter} · ${m.status === 'locked' ? 'Locked — keep progressing the story' : m.summary}`)),
              statusTag(m.status)));
          }
          out.push(list);
          return out;
        },
        map: () => {
          const b = el('button', { class: 'cx-btn primary' }, 'Open City Map (M)');
          b.addEventListener('click', () => { done(); p.onOpenMap(); });
          return [el('h2', {}, 'Map'), el('p', { class: 'cx-muted' }, 'View Neon Bay, mission markers and set a GPS waypoint.'), b];
        },
        inventory: () => {
          const grid = el('div', { class: 'cx-grid' });
          if (!p.inventory.length) grid.append(el('p', { class: 'cx-muted' }, 'Nothing yet. Missions and the Byte Bazaar provide gear.'));
          for (const it of p.inventory) grid.append(el('div', { class: 'cx-card' }, el('h4', {}, it.name), el('div', { class: 'cx-muted' }, it.desc)));
          return [el('h2', {}, 'Inventory'), grid];
        },
        skills: () => {
          const grid = el('div', { class: 'cc-skill-grid' });
          const branches = [...new Set(skills.map((s) => s.branch))];
          const out: HTMLElement[] = [el('h2', {}, 'Skills'), el('p', { class: 'cx-muted' }, `Skill points available: ${p.stats.skillPoints}. Earn points by levelling up. Core safety lessons are never locked behind skills.`)];
          for (const br of branches) {
            out.push(el('h3', { class: 'cyan-title' }, br));
            const g = el('div', { class: 'cc-skill-grid' });
            for (const s of skills.filter((x) => x.branch === br).sort((a, b) => a.tier - b.tier)) g.append(skillCard(s));
            out.push(g);
          }
          if (!branches.length) out.push(grid);
          return out;
        },
        journal: () => {
          const list = el('div', { class: 'cc-list' });
          if (!p.journal.length) list.append(el('p', { class: 'cx-muted' }, 'Your journal fills up as you complete challenges and missions.'));
          for (const j of [...p.journal].reverse()) {
            list.append(el('div', { class: 'cx-card' },
              el('div', { class: 'cx-row', style: 'justify-content:space-between' }, el('h4', {}, j.title), el('span', { class: 'cx-mono cx-muted' }, j.time)),
              el('span', { class: 'cx-tag' }, j.kind), el('p', { style: 'margin:6px 0 0' }, j.text)));
          }
          return [el('h2', {}, 'Learning Journal'), list];
        },
        hub: () => [el('h2', {}, 'Learning Hub'), learningHubPanel({ concepts: p.concepts, mastery: p.mastery, practice: p.practice, onPractice: (id) => { done(); p.onPractice(id); } })],
        settings: () => [el('h2', {}, 'Settings'), settingsPanel(p.settings, (s) => { p.settings = s; p.onSettings(s); this.setReducedMotion(s.reducedMotion); }, p.onResetSave, (t) => this.confirm(t, 'Erase', 'Keep'))],
        save: () => {
          const save = el('button', { class: 'cx-btn primary' }, 'Save game');
          const status = el('span', { class: 'cx-muted' }, '');
          save.addEventListener('click', () => { p.onSave(); status.textContent = 'Saved ✓'; this.sfx('good'); });
          const quit = el('button', { class: 'cx-btn danger' }, 'Quit to main menu');
          quit.addEventListener('click', async () => {
            if (await this.confirm('Return to the main menu? Unsaved progress since your last save will be lost.', 'Quit', 'Stay')) { done(); p.onQuitToMenu(); }
          });
          return [el('h2', {}, 'Save & Quit'), el('p', { class: 'cx-muted' }, 'The game also autosaves after every mission.'), el('div', { class: 'cx-row' }, save, status), el('div', { style: 'height:16px' }), quit];
        },
      };

      const skillCard = (s: SkillRow): HTMLElement => {
        const btn = el('button', { class: `cx-btn small${s.canBuy ? ' primary' : ''}` }, s.owned ? 'Owned' : 'Unlock (1 pt)');
        btn.disabled = s.owned || !s.canBuy;
        btn.addEventListener('click', () => {
          skills = p.onBuySkill(s.id);
          p.stats.skillPoints = Math.max(0, p.stats.skillPoints - 1);
          this.sfx('levelup');
          show('skills');
        });
        return el('div', { class: `cx-card cc-skill${s.owned ? ' owned' : ''}` }, el('span', { class: 'tier' }, `TIER ${s.tier}`), el('h4', {}, s.name), el('div', { class: 'cx-muted', style: 'margin-bottom:8px' }, s.desc), btn);
      };

      const show = (id: PauseTab) => {
        current = id;
        for (const [k, b] of tabBtns) b.classList.toggle('active', k === id);
        main.innerHTML = '';
        main.append(...render[id]());
        main.scrollTop = 0;
      };
      const node = el('div', { class: 'cc-pause' }, side, main);
      const done = () => { close(); resolve(); };
      const order = tabs.map((t) => t[0]);
      const close = this.pushModal(node, (e) => {
        if (e.key === 'Escape') { done(); return true; }
        if (e.key === 'Tab') { show(order[(order.indexOf(current) + (e.shiftKey ? order.length - 1 : 1)) % order.length]); return true; }
        if (e.key === 'q' || e.key === 'Q') { show(order[(order.indexOf(current) + order.length - 1) % order.length]); return true; }
        return false;
      });
      resume.addEventListener('click', done);
      show(current);
    });
  }

  // ---------------- shop ----------------

  shop(items: ShopItem[], credits: number, onBuy: (id: string) => ShopBuyResult): Promise<void> {
    return new Promise((resolve) => {
      this.sfx('open');
      const grid = el('div', { class: 'cc-shop-grid' });
      const wallet = el('span', { class: 'cc-money cc-outline-text', style: 'font-size:28px' });
      const msg = el('div', { class: 'cx-muted', style: 'min-height:24px;margin-top:8px' });
      const render = (list: ShopItem[], c: number) => {
        wallet.textContent = `$${c}`;
        grid.innerHTML = '';
        for (const it of list) {
          const b = el('button', { class: `cx-btn small${it.owned ? '' : ' primary'}` }, it.owned ? 'Owned' : 'Buy');
          b.disabled = it.owned || c < it.price;
          b.addEventListener('click', () => {
            const r = onBuy(it.id);
            msg.textContent = r.msg;
            msg.className = r.ok ? 'cx-good' : 'cx-bad';
            this.sfx(r.ok ? 'cash' : 'bad');
            render(r.items, r.credits);
          });
          grid.append(el('div', { class: 'cx-card cc-shop-item' }, el('h4', {}, it.name), el('div', { class: 'cx-muted', style: 'min-height:40px' }, it.desc),
            el('div', { class: 'cx-row', style: 'justify-content:space-between;margin-top:8px' }, el('span', { class: 'price' }, `$${it.price}`), b)));
        }
      };
      render(items, credits);
      const closeBtn = el('button', { class: 'cx-btn' }, 'Leave shop (Esc)');
      const node = el('div', { class: 'cc-modal' },
        el('div', { class: 'panel cc-window' },
          el('div', { class: 'cx-row', style: 'justify-content:space-between' }, el('h2', { class: 'neon-title' }, 'BYTE BAZAAR'), wallet),
          el('p', { class: 'cx-muted' }, 'Legit gear for legit defenders. No stolen data, no shady tools — Priya keeps it clean.'),
          grid, msg, el('div', { class: 'cc-close-row' }, closeBtn)));
      const done = () => { close(); resolve(); };
      const close = this.pushModal(node, (e) => { if (e.key === 'Escape') { done(); return true; } return false; });
      closeBtn.addEventListener('click', done);
    });
  }

  // ---------------- standalone screens ----------------

  private simpleWindow(title: string, content: HTMLElement, width = 980): Promise<void> {
    return new Promise((resolve) => {
      this.sfx('open');
      const closeBtn = el('button', { class: 'cx-btn primary' }, 'Back (Esc)');
      const node = el('div', { class: 'cc-modal', style: 'z-index:65' },
        el('div', { class: 'panel cc-window', style: `width:min(${width}px,96vw)` },
          el('h2', { class: 'neon-title', style: 'font-size:30px;margin-bottom:14px' }, title), content,
          el('div', { class: 'cc-close-row' }, closeBtn)));
      const done = () => { close(); this.sfx('click'); resolve(); };
      const close = this.pushModal(node, (e) => { if (e.key === 'Escape') { done(); return true; } return false; });
      closeBtn.addEventListener('click', done);
    });
  }

  openLearningHub(view: LearningHubView): Promise<void> {
    return this.simpleWindow('LEARNING HUB', learningHubPanel(view), 1100);
  }

  settingsScreen(view: SettingsView, onChange: (s: SettingsView) => void, onResetSave?: () => void): Promise<void> {
    return this.simpleWindow('SETTINGS', settingsPanel(view, (s) => { onChange(s); this.setReducedMotion(s.reducedMotion); }, onResetSave, (t) => this.confirm(t, 'Erase', 'Keep')));
  }

  controlsScreen(): Promise<void> {
    return this.simpleWindow('CONTROLS', el('div', {}, controlsPanel(), el('p', { class: 'cx-muted', style: 'margin-top:14px' }, 'Tip: approach glowing markers and press E. Terminals open cybersecurity workstations; people with letters above their heads have missions.')));
  }

  credits(): Promise<void> {
    return new Promise((resolve) => {
      const section = (h: string, ...lines: string[]) => [el('h3', {}, h), ...lines.map((l) => el('p', {}, l))];
      const roll = el('div', { class: 'cc-credits-roll' },
        el('div', { class: 'cc-logo' }, el('h1', { class: 'l1' }, 'CYBER CITY'), el('div', { class: 'l2' }, 'Hack the Future')),
        ...section('An original game', 'Inspired by the open-world adventures of the 1980s neon era', 'All characters, places and companies are fictional'),
        ...section('Starring', 'Rico Vega — Analyst', 'Max Cortez — Mentor', 'Carla Reyes — Coral Café', 'Dex Holloway — SOC Manager', 'Tito Ramos — Network Engineer', 'Dr. Lena Okafor — Forensics', 'Priya Shah — Researcher', 'The Flamingo — ???'),
        ...section('Technology', 'Three.js · TypeScript · Vite', 'Procedural city, textures and lighting', 'Procedural synthwave radio (Web Audio)'),
        ...section('Cybersecurity curriculum', 'Phishing · Networking · Firewalls · Passwords', 'Social engineering · Malware triage · Forensics', 'Cryptography · Incident response'),
        ...section('Safety', 'Every hack in this game is a simulation on fictional data.', 'Practice only on systems you own or are authorized to test.'),
        ...section('Thanks for playing', 'Play. Hack. Be Cyber Safe.'),
      );
      const node = el('div', { class: 'cc-credits' }, roll);
      const done = () => { close(); resolve(); };
      const close = this.pushModal(node, (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { done(); return true; } return false; });
      node.addEventListener('click', done);
      roll.addEventListener('animationend', done);
      if (this.reducedMotion) { roll.style.position = 'static'; node.style.overflow = 'auto'; }
    });
  }
}
