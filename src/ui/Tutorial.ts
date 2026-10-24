import { el } from '../cyber/types';
import { rich } from './markup';
import { ILLUSTRATIONS } from './Illustrations';
import type { HudArea } from './Hud';

// Interactive first-play tutorial. A coach card shows one step at a time and
// waits for the game to report that the player actually did it
// (tutorial.signal('move'), ...). Completion is remembered in localStorage.

export interface TutorialStep {
  id: string;
  title: string;
  /** Supports [y]..[/y] colors and ~KEY~ keycaps. */
  text: string;
  /** Game event that completes this step. */
  waitFor: string;
  highlight?: HudArea;
  /** Key into ILLUSTRATIONS. */
  image?: string;
}

export const TUTORIAL_KEY = 'cybercity.tutorial.done';

export const DEFAULT_TUTORIAL: TutorialStep[] = [
  { id: 'look', title: 'Look around', text: 'Click the game once, then move the ~Mouse~ to turn the camera. Scroll the wheel to zoom.', waitFor: 'look', image: 'mouse' },
  { id: 'move', title: 'Walk', text: 'Use ~W~ ~A~ ~S~ ~D~ to walk. The camera decides which way is forward.', waitFor: 'move', image: 'wasd' },
  { id: 'sprint', title: 'Sprint', text: 'Hold ~Shift~ while moving to run. The [b]blue bar[/b] under the map is your stamina. ~Space~ jumps.', waitFor: 'sprint', image: 'shift', highlight: 'minimap' },
  { id: 'reach', title: 'Follow the yellow marker', text: 'Your goal is written at the bottom of the screen. Walk into the glowing [y]yellow marker[/y]; the [y]yellow dot[/y] on the radar shows the way.', waitFor: 'reach_marker', image: 'marker', highlight: 'objective' },
  { id: 'talk', title: 'Talk to people', text: 'Walk up to a character and press ~E~. People with a [b]letter above their head[/b] have missions for you.', waitFor: 'talk', image: 'talk', highlight: 'prompt' },
  { id: 'terminal', title: 'Use a cyber terminal', text: 'Glowing [b]cyan terminals[/b] open hacking workstations. Stand next to one and press ~E~. Hints are free, so use them!', waitFor: 'terminal', image: 'terminal', highlight: 'prompt' },
  { id: 'map', title: 'Open the map', text: 'Press ~M~ for the city map. Click anywhere to set a [p]waypoint[/p]; a route appears on your radar. ~M~ again closes it.', waitFor: 'map', image: 'map' },
  { id: 'car', title: 'Get a car', text: 'Walk to any parked car and press ~E~ (or ~F~) to get in. Press it again to get out.', waitFor: 'enter_vehicle', image: 'car' },
  { id: 'drive', title: 'Drive', text: '~W~ accelerate, ~S~ brake / reverse, ~A~ ~D~ steer, ~Space~ handbrake for drifts. ~H~ is the horn.', waitFor: 'drive', image: 'drive' },
  { id: 'radio', title: 'Change the radio', text: 'In a car, press ~R~ to switch radio stations. Every station is synthwave made live by the game.', waitFor: 'radio', image: 'drive' },
  { id: 'tab', title: 'Missions & menu', text: 'Press ~Tab~ to see all missions, skills, your journal and settings. ~Esc~ pauses the game.', waitFor: 'tab', image: 'tab' },
  { id: 'arcade', title: 'Cyber Arcade', text: 'Press ~G~ anywhere (on foot) to open the [y]Cyber Arcade[/y]: 1,291 quick cyber challenges. That\'s the tour. Go save Neon Bay!', waitFor: 'arcade', image: 'arcade' },
];

export class Tutorial {
  readonly root = el('div', { class: 'cc-coach-layer cc-passive' });
  private steps: TutorialStep[] = [];
  private index = -1;
  private card: HTMLElement | null = null;
  /** Called when a step needs a HUD area highlighted (wired to Hud.highlight). */
  onHighlight: (area: HudArea) => void = () => {};
  /** Optional sound hook. */
  onSound: (name: 'good' | 'click') => void = () => {};

  static isDone(): boolean {
    try {
      return localStorage.getItem(TUTORIAL_KEY) === '1';
    } catch {
      return false;
    }
  }

  static reset(): void {
    try { localStorage.removeItem(TUTORIAL_KEY); } catch { /* ignore */ }
  }

  get active(): boolean {
    return this.index >= 0;
  }

  get current(): TutorialStep | null {
    return this.index >= 0 ? this.steps[this.index] ?? null : null;
  }

  /** Begin the tutorial. Does nothing if already completed unless force is true. */
  start(steps: TutorialStep[] = DEFAULT_TUTORIAL, force = false): void {
    if (!force && Tutorial.isDone()) return;
    this.steps = steps;
    this.index = 0;
    this.render();
  }

  /** Report a game event; advances when it matches the current step. */
  signal(event: string): void {
    const step = this.current;
    if (!step || step.waitFor !== event) return;
    this.onSound('good');
    this.card?.classList.add('done');
    const at = this.index;
    window.setTimeout(() => {
      if (this.index !== at) return;
      this.index++;
      if (this.index >= this.steps.length) this.finish(true);
      else this.render();
    }, 700);
  }

  skip(): void {
    this.finish(false);
  }

  private finish(completed: boolean): void {
    this.index = -1;
    this.onHighlight('none');
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
    this.card?.remove();
    this.card = null;
    if (completed) {
      const bye = el('div', { class: 'cc-coach done-all' },
        el('div', { class: 'cc-coach-kicker' }, 'TUTORIAL COMPLETE'),
        rich(el('div', { class: 'cc-coach-text' }), 'You know everything you need. Press ~Tab~ for missions any time, and ~Esc~ → [y]How to Play[/y] to review.'));
      this.root.append(bye);
      window.setTimeout(() => { bye.classList.add('out'); window.setTimeout(() => bye.remove(), 500); }, 5000);
    }
  }

  private render(): void {
    const step = this.current;
    if (!step) return;
    this.card?.remove();
    const dots = el('div', { class: 'cc-coach-dots' });
    this.steps.forEach((_, i) => dots.append(el('i', { class: i < this.index ? 'past' : i === this.index ? 'now' : '' })));
    const ill = el('div', { class: 'cc-coach-ill' });
    const svg = step.image ? ILLUSTRATIONS[step.image]?.() : '';
    if (svg) ill.innerHTML = svg; // constant SVG from Illustrations.ts
    const skip = el('button', { class: 'cc-coach-skip cc-click' }, 'Skip tutorial');
    skip.addEventListener('click', () => { this.onSound('click'); this.skip(); });
    const card = el('div', { class: 'cc-coach' },
      el('div', { class: 'cc-coach-kicker' }, `HOW TO PLAY · STEP ${this.index + 1} OF ${this.steps.length}`),
      el('div', { class: 'cc-coach-title' }, step.title),
      svg ? ill : null,
      rich(el('div', { class: 'cc-coach-text' }), step.text),
      el('div', { class: 'cc-coach-foot' }, dots, skip),
      el('div', { class: 'cc-coach-check' }, '✓'));
    this.card = card;
    this.root.append(card);
    this.onHighlight(step.highlight ?? 'none');
  }
}
