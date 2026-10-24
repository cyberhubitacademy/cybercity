import '../styles.css';
import { UI } from './UI';
import { AudioEngine } from '../audio/AudioEngine';
import { CHALLENGES, allConcepts, getChallenge } from '../cyber/registry';
import { TOPIC_LABELS, Topic } from '../cyber/types';
import { PLACES, SHARDS } from '../world/layout';
import type { Blip, HudState, MinimapState, PauseView, SettingsView, ShopItem, SkillRow } from './types';

// Dev-only preview of every UI screen with mock data. Open /ui-preview.html
// (add ?screen=menu|hud|dialogue|briefing|passed|failed|hospital|challenge|pause|map|shop|hub|settings|controls|credits|terminal|loading).

const ui = new UI(document.getElementById('ui') as HTMLElement);
const audio = new AudioEngine();
ui.sfx = (n) => audio.sfx(n);
window.addEventListener('pointerdown', () => audio.init(), { once: true });

const settings: SettingsView = {
  master: 0.8, music: 0.6, sfx: 0.8, ambient: 0.6, voice: 0.8, mouseSensitivity: 1, invertY: false,
  quality: 'high', bloom: true, shadows: true, reducedMotion: false, showHints: true, voiceTTS: false, subtitles: true,
};

const blips: Blip[] = [
  { x: PLACES.hq.x, z: PLACES.hq.z, kind: 'giver', label: 'M' },
  { x: PLACES.cafe.x, z: PLACES.cafe.z, kind: 'objective' },
  { x: PLACES.soc.x, z: PLACES.soc.z, kind: 'terminal' },
  { x: PLACES.market.x, z: PLACES.market.z, kind: 'shop' },
  { x: 182, z: -14, kind: 'vehicle' },
  ...SHARDS.slice(0, 4).map((s) => ({ x: s.x, z: s.z, kind: 'shard' as const })),
];
const mm: MinimapState = {
  x: 196, z: -24, heading: Math.PI, camYaw: Math.PI * 0.75, blips, waypoint: null,
  route: [{ x: 165, z: -24 }, { x: 165, z: 5 }, { x: 90, z: 5 }, { x: 90, z: 90 }, { x: 5, z: 90 }, { x: -40, z: 102 }],
};

const hud: HudState = {
  money: 1250, health: 82, maxHealth: 100, stamina: 0.7, level: 3, xp: 340, xpNext: 600, clock: '18:24',
  objective: 'Go to the [y]Coral Café[/y] and talk to [b]Carla[/b].', missionTitle: 'Catch of the Day', timer: null, chase: null,
  vehicle: null, radio: null,
};

let skills: SkillRow[] = [
  { id: 'hint-master', name: 'Hint Master', desc: '+1 free hint in every challenge.', branch: 'Analyst', tier: 1, owned: true, canBuy: false },
  { id: 'analyst-pro', name: 'Analyst Pro', desc: '+1 more free hint.', branch: 'Analyst', tier: 2, owned: false, canBuy: true },
  { id: 'mentor-network', name: 'Mentor Network', desc: '+25% XP from missions.', branch: 'Analyst', tier: 3, owned: false, canBuy: false },
  { id: 'quick-feet', name: 'Quick Feet', desc: '+50% sprint stamina.', branch: 'Street', tier: 1, owned: false, canBuy: true },
  { id: 'street-smart', name: 'Street Smart', desc: 'Data shards appear on the minimap.', branch: 'Street', tier: 2, owned: false, canBuy: false },
  { id: 'negotiator', name: 'Negotiator', desc: '+15% credits from missions.', branch: 'Hustle', tier: 1, owned: false, canBuy: true },
];

const concepts = allConcepts().map((c, i) => ({ ...c, unlocked: i % 3 !== 2, mastery: (i * 37) % 100 }));
const mastery = (Object.keys(TOPIC_LABELS) as Topic[]).map((t, i) => ({ topic: t, label: TOPIC_LABELS[t], percent: (i * 23) % 100 }));
const practice = CHALLENGES.map((c, i) => ({ id: c.id, title: c.title, topic: c.topic, best: i % 2 ? null : 60 + i * 4 }));

function pauseView(): PauseView {
  return {
    missions: [
      { id: 'm01', title: 'Welcome to Neon Bay', status: 'completed', chapter: 'Chapter 1', summary: 'Meet Max at Sunset Shield HQ.' },
      { id: 'm02', title: 'Catch of the Day', status: 'active', chapter: 'Chapter 1', summary: 'Phishing at the Coral Café.' },
      { id: 'm03', title: 'Something on the Wire', status: 'available', chapter: 'Chapter 2', summary: 'Strange traffic at the Harbor SOC.' },
      { id: 'm04', title: 'Walls of the Harbor', status: 'locked', chapter: 'Chapter 2', summary: '' },
    ],
    active: { title: 'Catch of the Day', objective: 'Use the café back-office PC.' },
    stats: { level: 3, xp: 340, xpNext: 600, credits: 1250, skillPoints: 2, rep: [{ label: 'Cyber Agency', value: 40 }, { label: 'Community', value: 15 }] },
    inventory: [{ id: 'phone', name: 'Shield Phone', desc: 'Calls, GPS and the Sunset Shield app.' }, { id: 'wifi', name: 'Wi-Fi Analyzer', desc: 'Finds rogue access points.' }],
    skills,
    onBuySkill: (id) => { skills = skills.map((s) => (s.id === id ? { ...s, owned: true, canBuy: false } : s)); return skills; },
    journal: [
      { time: 'Day 1 09:12', kind: 'Mission', title: 'Welcome to Neon Bay', text: 'Joined Sunset Shield Security.' },
      { time: 'Day 1 11:40', kind: 'Challenge', title: 'Phishing Detective — 86%', text: 'Spotted a lookalike domain (palmett0-bank.nb).' },
    ],
    concepts,
    mastery,
    practice,
    onPractice: (id) => void openChallenge(id),
    settings,
    onSettings: (s) => Object.assign(settings, s),
    onSave: () => ui.notify('Game saved', 'good'),
    onQuitToMenu: () => showMenu(),
    onOpenMap: () => void ui.openMap(mm, () => {}),
    onResetSave: () => ui.notify('Save erased', 'warn'),
  };
}

let shopItems: ShopItem[] = [
  { id: 'shoes', name: 'Neon Runners', desc: 'Sprint 15% longer.', price: 300, owned: false },
  { id: 'turbo', name: 'Turbo Kit', desc: '+10% top speed for all cars.', price: 800, owned: false },
  { id: 'shirt', name: 'Sunset Shirt', desc: 'Cosmetic: pink-and-orange Hawaiian shirt.', price: 200, owned: true },
  { id: 'rig', name: 'Workstation Upgrade', desc: '+1 free hint in every challenge.', price: 1200, owned: false },
];
let credits = 1250;

async function openChallenge(id = 'phishing-1'): Promise<void> {
  const def = getChallenge(id) ?? CHALLENGES[0];
  const r = await ui.runChallenge(def, { bonusHints: 1, sfx: (n) => audio.sfx(n) });
  ui.notify(r ? `Challenge result: ${r.score}% (${r.passed ? 'passed' : 'not passed'})` : 'Left the workstation', r?.passed ? 'good' : 'warn');
}

function showMenu(): void {
  ui.setHudVisible(false);
  ui.mainMenu({
    hasSave: true,
    onNew: () => { ui.hideMainMenu(); showHud(); },
    onContinue: () => { ui.hideMainMenu(); showHud(); },
    onSettings: () => void ui.settingsScreen(settings, (s) => Object.assign(settings, s), () => ui.notify('erased')),
    onHub: () => void ui.openLearningHub({ concepts, mastery, practice, onPractice: (id) => void openChallenge(id) }),
    onControls: () => void ui.controlsScreen(),
    onCredits: () => void ui.credits(),
    onHowToPlay: () => void ui.openHowToPlay(),
  });
}

let hudLoop = 0;
function showHud(): void {
  ui.hideMainMenu();
  ui.setHudVisible(true);
  cancelAnimationFrame(hudLoop);
  const t0 = performance.now();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    ui.updateHud({ ...hud, stamina: 0.5 + Math.sin(t) * 0.4 });
    ui.drawMinimap({ ...mm, camYaw: mm.camYaw + Math.sin(t * 0.3) * 0.4 });
    hudLoop = requestAnimationFrame(loop);
  };
  loop();
  ui.setZone('Neon Beach');
  ui.prompt({ key: 'E', title: 'Talk to Max Cortez', desc: 'Mission: Catch of the Day' });
  ui.notify('Press ~E~ to talk to people with a [b]letter[/b] above their head.', 'info');
  ui.setThreat(2);
  ui.notify('+150 XP', 'xp');
  ui.notify('+$250', 'money');
  ui.districtBanner('Neon Beach');
  ui.subtitle('Tourist', 'Is "password123" still a good password? Asking for a friend.');
}

const screens: Record<string, () => void> = {
  loading: () => { let p = 0; const iv = setInterval(() => { p += 7; ui.showLoading(p, p < 50 ? 'Painting the sunset…' : 'Planting palm trees…'); if (p >= 100) { clearInterval(iv); ui.hideLoading(); } }, 120); },
  menu: showMenu,
  hud: showHud,
  driving: () => { showHud(); hud.vehicle = { speedKmh: 128, name: 'Stinger GT' }; hud.radio = 'NEON FM 80.8'; hud.timer = 74; hud.chase = { progress: 0.45, distance: 38 }; hud.objective = 'Stay close to the Pink Tide van to plant the tracker!'; hud.missionTitle = 'Hot Pursuit'; ui.prompt(null); },
  dialogue: () => void ui.dialogue([
    { speaker: 'max', name: 'Max Cortez', color: '#ff2fa0', text: 'Rico! Welcome to Sunset Shield. Neon Bay looks like paradise, but its networks are under siege.' },
    { speaker: 'rico', name: 'Rico Vega', color: '#19e6ff', text: 'Sun, palm trees and packet captures. My kind of town.' },
    { speaker: 'max', name: 'Max Cortez', color: '#ff2fa0', text: 'Carla at the Coral Café got a weird email from her "bank". Want to take a look?' },
  ], ['On my way, boss.', 'Is it always this sunny?']).then((k) => ui.notify(`Chose option ${k + 1}`)),
  briefing: () => void ui.briefing({
    title: 'Catch of the Day', giver: 'Max Cortez', location: 'Coral Café, Neon Beach', difficulty: 1,
    text: 'Carla Reyes runs the best café on Ocean Drive. This morning her inbox filled up with "urgent" emails — one claims to be from Palmetto Bank. Find out which messages are traps before she clicks anything.',
    objectives: ['Go to the Coral Café', 'Talk to Carla', 'Inspect the inbox at the back-office PC'],
    learning: ['Spot lookalike domains', 'Check where links really go', 'Report, don\'t reply'],
    rewards: ['+150 XP', '$300', 'Community reputation'],
  }).then((ok) => ui.notify(ok ? 'Accepted' : 'Later')),
  passed: () => void ui.missionPassed({ title: 'Catch of the Day', xp: 150, credits: 300, rep: ['Community +10'], levelUps: 1, summary: 'You caught the fake Palmetto Bank email before Carla clicked. Lookalike domains and urgent payment requests are classic phishing tells.', learned: ['Lookalike domains', 'Link inspection', 'Reporting phishing'] }),
  failed: () => void ui.missionFailedRetry('The [r]Pink Tide van[/r] got away. Try staying closer!').then((r) => ui.notify(r ? 'Retry' : 'Continue')),
  titlecard: () => { showHud(); ui.setCinematic(true); void ui.titleCard('Ghost Protocol', 'Chapter 10', 3500).then(() => ui.setCinematic(false)); },
  tutorial: () => { showHud(); ui.tutorial.start(undefined, true); (window as unknown as { tut: typeof ui.tutorial }).tut = ui.tutorial; },
  howto: () => void ui.openHowToPlay(),
  hospital: () => void ui.hospitalized(100),
  challenge: () => void openChallenge(new URLSearchParams(location.search).get('id') ?? 'phishing-1'),
  pause: () => void ui.pauseMenu(pauseView()),
  map: () => void ui.openMap(mm, (x, z) => ui.notify(x === null ? 'Waypoint cleared' : `Waypoint ${Math.round(x)}, ${Math.round(z ?? 0)}`)),
  shop: () => void ui.shop(shopItems, credits, (id) => {
    const it = shopItems.find((s) => s.id === id);
    if (!it || it.owned || credits < it.price) return { ok: false, msg: 'Not enough credits.', credits, items: shopItems };
    credits -= it.price;
    shopItems = shopItems.map((s) => (s.id === id ? { ...s, owned: true } : s));
    return { ok: true, msg: `Bought ${it.name}!`, credits, items: shopItems };
  }),
  hub: () => void ui.openLearningHub({ concepts, mastery, practice, onPractice: (id) => void openChallenge(id) }),
  settings: () => void ui.settingsScreen(settings, (s) => Object.assign(settings, s), () => ui.notify('erased')),
  controls: () => void ui.controlsScreen(),
  credits: () => void ui.credits(),
  cutscene: () => void ui.cutscene([{ speaker: 'flamingo', name: 'The Flamingo', color: '#ff7cc6', text: 'Neon Bay\'s secrets are mine, little analyst. Catch me if you can.' }], { title: 'CHAPTER 5 — HOT PURSUIT' }),
  terminal: () => ui.terminal({
    name: 'Sunset Shield Cyber Lab',
    commands: {
      status: () => 'Analyst: Rico Vega\nLevel 3 · 340/600 XP\nThreat level: ELEVATED',
      'mission list': () => '▶ Catch of the Day (active)\n  Something on the Wire (available)',
      'hash calculate': (a) => `toy-hash(${a.join(' ') || '""'}) = ${(a.join(' ').length * 2654435761 >>> 0).toString(16)}`,
    },
    onClose: () => ui.notify('Terminal closed'),
  }),
};

const bar = document.getElementById('preview-bar') as HTMLElement;
for (const name of Object.keys(screens)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.addEventListener('click', () => screens[name]());
  bar.append(b);
}
const initial = new URLSearchParams(location.search).get('screen') ?? 'menu';
(screens[initial] ?? showMenu)();
(window as unknown as { screens: typeof screens; ui: UI }).screens = screens;
(window as unknown as { ui: UI }).ui = ui;
