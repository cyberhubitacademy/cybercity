import * as THREE from 'three';
import { Renderer } from './Renderer';
import { WorldSim, daylight } from './WorldSim';
import { Input } from './Input';
import { WorldMarkers } from './WorldMarkers';
import { Interactions } from './Interactions';
import { UI } from '../ui/UI';
import type { Blip, DialogueLine as UiLine, PauseView, SettingsView, ShopItem as UiShopItem, PracticeRow, ConceptView, MasteryRow } from '../ui/types';
import { AudioEngine, SfxId } from '../audio/AudioEngine';
import { VoiceOver } from '../audio/VoiceOver';
import { SaveManager } from '../progression/SaveManager';
import { SaveFile, SaveEnvelope } from '../progression/SaveFile';
import type { PlayerProfile, Settings } from '../progression/types';
import { ORG_LABELS, ORGS } from '../progression/types';
import { addJournal, addXp, grantReward, masteryPercent, recordChallenge, xpToNext } from '../progression/progression';
import { SKILLS, SKILL_BRANCHES, canUnlock, effects, unlockSkill } from '../progression/skills';
import { SHOP_ITEMS, buy, getItem } from '../progression/shop';
import { MissionManager, objectiveTarget } from '../missions/MissionManager';
import { MISSIONS } from '../missions/data';
import type { MissionDef, MissionUpdate, ObjectiveDef } from '../missions/types';
import { CHARACTERS, ENDING_CUTSCENE, INTRO_CUTSCENE, PEDESTRIAN_LINES, DialogueLine } from '../story/characters';
import { CHALLENGES, allConcepts, getChallenge } from '../cyber/registry';
import { TOPIC_LABELS, Topic, ChallengeDefinition } from '../cyber/types';
import { ARCADE_TERMINALS, POSTS, TERMINALS } from '../world/spots';
import { DISTRICTS, PLACES, SHARDS } from '../world/layout';
import type { Vehicle } from '../vehicles/Vehicle';
import { MissionDirector } from './MissionDirector';
import { CinematicCamera } from './Cinematics';
import { Weather } from '../world/Weather';
import { SystemRegistry, type GameSystem, type SystemContext } from './Systems';

// Gameplay systems are discovered from src/systems/<name>/index.ts (default export: () => GameSystem).
const SYSTEM_MODULES = import.meta.glob<{ default: () => GameSystem }>('../systems/*/index.ts', { eager: true });
import { readDevice, recommendQuality } from './DeviceProfile';
import { SETTINGS_KEY } from '../progression/SaveManager';

// Top-level game: menus, the play loop, and the glue between the simulated
// world, the mission system, cyber challenges, progression and the UI.

type Mode = 'menu' | 'playing';

const SAVED_AT_KEY = 'cybercity.savedAt';
const BACKUP_KEY = 'cybercity.save.backup';

function timeAgo(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

const SHIRTS: Record<string, [string, string]> = {
  default: ['#1fb5c9', '#ff3d9a'],
  'shirt-sunset': ['#ff8a3d', '#ff2fa0'],
  'shirt-midnight': ['#2a1a6b', '#19e6ff'],
  'shirt-mint': ['#7fe6c8', '#ff7cc6'],
};

export class Game {
  readonly camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 12000);
  readonly renderer: Renderer;
  readonly world: WorldSim;
  readonly input: Input;
  readonly ui: UI;
  readonly audio = new AudioEngine();
  readonly voice = new VoiceOver(import.meta.env.BASE_URL);
  readonly saves = new SaveManager();
  readonly saveFile = new SaveFile();
  readonly markers: WorldMarkers;
  readonly interactions = new Interactions();
  settings: Settings;
  profile: PlayerProfile;
  missions: MissionManager;
  readonly director: MissionDirector;
  readonly cinematic: CinematicCamera;
  readonly weather: Weather;
  private timeScale = 1;
  readonly systems = new SystemRegistry();
  private sysCtx!: SystemContext;
  private hudRoot = document.createElement('div');
  private slowUntil = 0;
  private mode: Mode = 'menu';
  /** True while a blocking screen (dialogue, challenge, menu) is open. */
  private busy = false;
  private clock = new THREE.Clock();
  private waypoint: { x: number; z: number } | null = null;
  private timer: number | null = null;
  private chase: { van: Vehicle; progress: number; tagSeconds: number; radius: number; engaged: boolean } | null = null;
  private collectActive = false;
  private autosave = 0;
  private menuT = 0;
  private lastSubtitle = 0;
  private hornCooldown = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = this.saves.loadSettings();
    // First launch on this machine: pick graphics from the hardware.
    let firstRun = true;
    try { firstRun = localStorage.getItem(SETTINGS_KEY) === null; } catch { /* storage blocked */ }
    if (firstRun) {
      const device = readDevice();
      this.settings = { ...this.settings, quality: recommendQuality(device), shadows: !device.software };
      this.saves.saveSettings(this.settings);
      console.info('[CyberCity] device', device, '→ quality', this.settings.quality);
    }
    this.profile = this.saves.newProfile();
    this.missions = new MissionManager(MISSIONS);
    this.ui = new UI(uiRoot);
    this.ui.showLoading(10, 'Painting the sunset…');
    this.renderer = new Renderer(canvas, new THREE.Scene(), this.camera, this.settings.quality);
    this.renderer.onAdjust = ({ shed }) => {
      // shed level 3 (last resort): drop real-time shadows to keep the frame rate up
      this.world?.env.setShadows(this.settings.shadows && shed < 3);
    };
    this.renderer.onContextLost = () => {
      this.ui.notify('Your graphics driver reset. Progress is saved — reload the page, and try Settings → Graphics → Low if it repeats.', 'warn');
      this.save();
    };
    this.ui.showLoading(35, 'Building Neon Bay…');
    this.world = new WorldSim(this.renderer.renderer, this.camera, this.settings.quality);
    this.renderer.setScene(this.world.scene);
    this.markers = new WorldMarkers(this.world.scene);
    // story characters are solid, like everyone else in Neon Bay
    for (const p of POSTS) this.world.city.collision.add({ x0: p.x - 0.35, x1: p.x + 0.35, z0: p.z - 0.35, z1: p.z + 0.35, y0: 0, y1: 1.8, solidForCars: true });
    this.cinematic = new CinematicCamera(this.camera);
    this.weather = new Weather(this.world.scene, this.camera, this.settings.quality);
    this.weather.onThunder = (strength) => { this.sfx('crash'); this.cinematic.shake(strength * 0.3); };
    this.director = new MissionDirector(this.world, {
      dialogue: (lines) => this.modal(() => this.ui.dialogue(this.lines(lines))).then(() => undefined),
      notify: (t, k) => this.ui.notify(t, k),
      fade: (b) => this.ui.fade(b),
      playChallenge: (id) => { const d = getChallenge(id); return d ? this.playChallenge(d, false) : Promise.resolve(false); },
      onComplete: () => {
        this.cleanupMissionProps();
        void this.completeMission(this.missions.completeActive(), true);
      },
      onFailed: (_def, reason) => {
        this.cleanupMissionProps();
        this.applyUpdate(this.missions.failActive(reason));
      },
      onObjective: () => this.refreshMarkers(),
      addMoney: (n) => { this.profile.credits += n; },
      isPlayerDead: () => this.world.player.health <= 0,
      cinematic: (on) => {
        this.ui.setCinematic(on);
        this.renderer.setCinematicDof(on, 7);
        this.input.enabled = !on;
        if (on) this.input.releasePointer();
      },
      cameraShot: (preset, target, ms) => this.cinematic.play({ preset, target, durationMs: ms }),
      cameraFollow: (v, ms) => this.cinematic.follow(v.root, ms),
      showTitle: (title, sub, ms) => this.ui.titleCard(title, sub, ms),
      musicCue: (mood) => this.audio.setScore(mood),
      slowMotion: (factor, ms) => { this.timeScale = factor; this.slowUntil = performance.now() + ms; },
      shake: (strength) => { this.world.rig.addShake(strength); this.cinematic.shake(strength); },
      setHour: (h) => { this.world.hour = daylight(h); }, // daylight only
      setWeather: (k) => this.weather.set(k),
      playSfx: (name) => {
        const ok: SfxId[] = ['click', 'good', 'bad', 'type', 'alert', 'open', 'pickup', 'levelup', 'passed', 'failed', 'crash', 'horn', 'door', 'whoosh', 'beep', 'cash'];
        if ((ok as string[]).includes(name)) this.audio.sfx(name as SfxId);
      },
    });
    this.input = new Input(canvas);
    this.ui.showLoading(80, 'Waking up the pedestrians…');
    this.ui.sfx = (n) => this.audio.sfx(n as SfxId);
    // Piper voice-over for every scripted line; browser speech only as an optional fallback.
    void this.voice.load();
    this.ui.lineDuration = (l) => (this.settings.voice > 0 ? this.voice.duration(l.speaker, l.text) : null);
    this.ui.onLine = (l) => {
      if (this.voice.play(l.speaker, l.text)) return;
      if (this.settings.voiceTTS) this.audio.speak(l.text, ['carla', 'marisol', 'lena', 'priya'].includes(l.speaker) ? 'female' : 'male');
    };
    this.ui.onDialogueEnd = () => this.voice.stop();
    this.applySettings(this.settings);
    this.wireWorldEvents();
    this.registerStaticInteractions();
    this.setupSystems(uiRoot);
    // Esc while the mouse is captured: the browser releases the cursor itself (the key never
    // reaches the page), so treat losing the lock during play as "pause", like GTA.
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.mode === 'playing' && this.input.captureWanted && !this.busy && !this.inCinematic) {
        void this.openPause();
      }
    });
    window.addEventListener('pointerdown', () => this.audio.init(), { once: false });
    window.addEventListener('keydown', () => this.audio.init(), { once: false });
    void this.saveFile.restore().then(() => { if (this.mode === 'menu') this.showMainMenu(); });
    const flush = () => { if (this.mode === 'playing') this.save(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    this.ui.showLoading(100, 'Ready');
    setTimeout(() => this.ui.hideLoading(), 250);
    this.showMainMenu();
    this.loop();
  }

  // ---------------------------------------------------------------- controls card

  /** GTA-style controls card shown at the start of every session (New Game or Continue). */
  private lockHint: HTMLDivElement | null = null;

  /** Hide the cursor while playing; nudge the player to click if the browser hasn't granted the lock yet. */
  private updatePointerUi(): void {
    const playing = this.mode === 'playing' && !this.busy;
    document.body.classList.toggle('cc-playing', playing);
    const needHint = playing && this.input.captureWanted && !this.input.locked;
    if (needHint && !this.lockHint) {
      this.lockHint = document.createElement('div');
      this.lockHint.className = 'cc-lock-hint';
      this.lockHint.textContent = 'Click the game (or press any key) to take control of the camera';
      document.body.append(this.lockHint);
    } else if (!needHint && this.lockHint) {
      this.lockHint.remove();
      this.lockHint = null;
    }
  }

  private showControlsCard(): void {
    document.querySelector('.cc-controls-card')?.remove();
    const rows: [string, string][] = [
      ['W A S D', 'Walk / drive'],
      ['Mouse', 'Look around (click the game to lock the mouse)'],
      ['V', 'Switch first-person / third-person view'],
      ['Shift', 'Sprint'],
      ['Space', 'Jump · climb · handbrake in cars'],
      ['C', 'Crouch / sneak · swim down'],
      ['E', 'Talk · use · enter'],
      ['F', 'Get in / out of a car · hijack a car on the road'],
      ['Right mouse', 'Aim'],
      ['Left mouse', 'Shoot / punch'],
      ['Q (hold)', 'Weapon wheel · move mouse, click to pick'],
      ['Alt (hold)', 'Switch character · move mouse / arrows, release'],
      ['F5 / F6', 'Quick switch to Rico / Maya'],
      ['Mouse wheel', 'Next / previous weapon'],
      ['X', 'Put the gun away / take it out'],
      ['R', 'Reload · next radio station in cars'],
      ['M', 'Map'],
      ['P', 'Phone'],
      ['G', 'Cyber Arcade'],
      ['Tab', 'Missions & status'],
      ['Esc', 'Pause menu'],
    ];
    const card = document.createElement('div');
    card.className = 'cc-controls-card';
    card.style.cssText = 'position:fixed;right:18px;top:110px;z-index:40;width:min(370px,90vw);background:rgba(0,0,0,0.78);color:#fff;'
      + 'border-left:4px solid #ffd23f;border-radius:6px;padding:12px 14px 10px;font:600 14px Rajdhani,system-ui,sans-serif;'
      + 'box-shadow:0 8px 30px rgba(0,0,0,0.5);pointer-events:auto;transition:opacity .4s,transform .4s';
    const title = document.createElement('div');
    title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font:400 20px Anton,Impact,sans-serif;letter-spacing:1px;color:#ffd23f';
    title.textContent = 'CONTROLS';
    const close = document.createElement('button');
    close.textContent = '✕';
    close.title = 'Hide controls';
    close.style.cssText = 'background:none;border:0;color:#fff;font-size:18px;cursor:pointer';
    title.append(close);
    card.append(title);
    for (const [key, what] of rows) {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;gap:10px;align-items:center;margin:3px 0' + (key === 'V' ? ';color:#8ff4ff' : '');
      const k = document.createElement('span');
      k.textContent = key;
      k.style.cssText = 'min-width:96px;text-align:center;padding:1px 6px;border-radius:4px;background:#fff;color:#111;font:700 12px "JetBrains Mono",monospace;box-shadow:0 2px 0 #888';
      const d = document.createElement('span');
      d.textContent = what;
      r.append(k, d);
      card.append(r);
    }
    const foot = document.createElement('div');
    foot.style.cssText = 'margin-top:8px;color:#bbb;font-size:12px';
    foot.textContent = 'Press F1 any time to show this again. Hides automatically in 25 s.';
    card.append(foot);
    document.body.append(card);
    const hide = () => {
      card.style.opacity = '0';
      card.style.transform = 'translateX(20px)';
      setTimeout(() => card.remove(), 450);
    };
    close.onclick = hide;
    setTimeout(hide, 25000);
  }

  // ---------------------------------------------------------------- gameplay systems

  private setupSystems(uiRoot: HTMLElement): void {
    this.hudRoot.className = 'sys-hud';
    this.hudRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6';
    uiRoot.append(this.hudRoot);
    for (const [path, mod] of Object.entries(SYSTEM_MODULES)) {
      try {
        this.systems.add(mod.default());
      } catch (err) {
        console.error('[systems] could not create', path, err);
      }
    }
    const game = this;
    this.sysCtx = {
      world: this.world, input: this.input, ui: this.ui, audio: this.audio, scene: this.world.scene, camera: this.camera,
      interactions: this.interactions, markers: this.markers, hudRoot: this.hudRoot,
      profile: () => game.profile,
      settings: () => game.settings,
      notify: (t, k) => game.ui.notify(t, k ?? 'info'),
      sfx: (n) => game.audio.sfx(n),
      addMoney: (n) => {
        if (n < 0 && game.profile.credits < -n) return false;
        game.profile.credits += n;
        return true;
      },
      modal: (fn) => game.modal(fn),
      isBusy: () => game.busy || game.inCinematic,
      save: () => game.save(),
      getData: <T,>(id: string, fallback: T): T => (id in game.profile.ext ? (game.profile.ext[id] as T) : fallback),
      setData: (id, v) => { game.profile.ext[id] = v; },
      system: <T extends GameSystem>(id: string) => game.systems.get<T>(id),
      // only a playing mission scene locks switching; travel/free-roam parts of a mission don't (GTA-like)
      missionActive: () => game.director.inCinematic,
    };
  }

  // ---------------------------------------------------------------- menus

  private showMainMenu(): void {
    this.mode = 'menu';
    this.input.captureWanted = false;
    this.input.releasePointer();
    this.ui.setHudVisible(false);
    this.audio.setMusicMode('menu');
    this.world.hour = 15.5;
    this.ui.mainMenu({
      hasSave: this.saves.hasSave(),
      onNew: () => void this.newGame(),
      onContinue: () => void this.continueGame(),
      onSettings: () => void this.modal(() => this.ui.settingsScreen(this.settingsView(), (s) => this.onSettingsChanged(s), () => this.resetSave())),
      onHub: () => void this.modal(() => this.ui.openLearningHub({ concepts: this.conceptViews(), mastery: this.masteryRows(), practice: this.practiceRows() })),
      onControls: () => void this.modal(() => this.ui.controlsScreen()),
      onCredits: () => void this.modal(() => this.ui.credits()),
      onHowToPlay: () => void this.modal(() => this.ui.openHowToPlay()),
      saveInfo: this.saveSummary(),
      onSaveFile: () => void this.openSaveFileScreen(),
    });
  }

  private savedAt(): number {
    try {
      return Number(localStorage.getItem(SAVED_AT_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  }

  private saveSummary(): string | undefined {
    const p = this.saves.load();
    if (!p) return undefined;
    const done = p.missions.completed.length;
    const at = this.savedAt();
    const ago = at ? timeAgo(at) : 'earlier';
    return `Level ${p.level} · $${p.credits.toLocaleString()} · ${done} mission${done === 1 ? '' : 's'} done · saved ${ago}${this.saveFile.linked ? ` · file: ${this.saveFile.fileName}` : ''}`;
  }

  /** Save-file screen: link a file on disk (Chrome/Edge), open, import or export. */
  private async openSaveFileScreen(): Promise<void> {
    const sf = this.saveFile;
    const options = sf.supported
      ? [sf.linked ? `Re-link (now: ${sf.fileName})` : 'Choose where to save my progress file', 'Open an existing save file', 'Download a copy of my save', 'Cancel']
      : ['Download a copy of my save', 'Load a save file from my computer', 'Cancel'];
    const intro = sf.supported
      ? 'Your progress autosaves in this browser. Link a save file and every autosave is also written to that file on your computer; Continue syncs from whichever copy is newer.'
      : 'Your progress autosaves in this browser. This browser cannot keep writing to a file, but you can download a copy of your save and load it later (or on another computer).';
    const pick = await this.modal(() => this.ui.dialogue([{ speaker: 'max', name: 'Save File', color: '#19e6ff', text: intro }], options, 'Save File'));
    const choice = options[pick];
    const local = this.saves.load();
    if (choice.startsWith('Choose') || choice.startsWith('Re-link')) {
      const ok = await sf.link(local ?? this.profile);
      this.ui.notify(ok ? `Linked ${sf.fileName}. Autosaves now go there too.` : 'No file linked.', ok ? 'good' : 'info');
    } else if (choice.startsWith('Open') || choice.startsWith('Load')) {
      const env = sf.supported ? await sf.openExisting() : await sf.importUpload();
      if (env) this.adoptEnvelope(env, 'Loaded save from file.');
      else this.ui.notify('That file is not a Cyber City save.', 'warn');
    } else if (choice.startsWith('Download')) {
      if (local) sf.exportDownload(local);
      else this.ui.notify('No save yet — start a game first.', 'info');
    }
    this.showMainMenu();
  }

  /** Take a save from a file as the current save (browser copy is overwritten). */
  private adoptEnvelope(env: SaveEnvelope, msg: string): void {
    this.saves.save(env.profile);
    try { localStorage.setItem(SAVED_AT_KEY, String(env.savedAt)); } catch { /* ignore */ }
    this.ui.notify(msg, 'good');
  }

  private async newGame(): Promise<void> {
    // New Game overwrites the save automatically; one backup of the old save is kept.
    const old = this.saves.load();
    if (old) {
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(old)); } catch { /* storage full or blocked */ }
    }
    await this.saveFile.ensurePermission();
    this.profile = this.saves.newProfile();
    this.missions = new MissionManager(MISSIONS);
    this.ui.hideMainMenu();
    await this.ui.fade(true);
    this.enterWorld();
    await this.ui.fade(false);
    await this.modal(() => this.ui.cutscene(this.lines(INTRO_CUTSCENE), { title: 'Neon Bay, 1986' }));
    this.ui.notify('Head to Sunset Shield HQ on Ocean Drive. Follow the yellow marker.', 'info');
    this.ui.tutorial.start();
    this.showControlsCard();
    this.save();
  }

  private async continueGame(): Promise<void> {
    // Sync: if a linked save file is newer than the browser copy, use it.
    if (this.saveFile.linked && (await this.saveFile.ensurePermission())) {
      const env = await this.saveFile.read();
      if (env && env.savedAt > this.savedAt()) this.adoptEnvelope(env, `Synced newer progress from ${this.saveFile.fileName}.`);
    }
    const p = this.saves.load();
    if (!p) {
      this.ui.notify('No valid save found — starting fresh.', 'warn');
      void this.newGame();
      return;
    }
    this.profile = p;
    this.missions = new MissionManager(MISSIONS, p.missions);
    this.ui.hideMainMenu();
    await this.ui.fade(true);
    this.enterWorld();
    await this.ui.fade(false);
    this.ui.notify('Welcome back to Neon Bay.', 'good');
    this.showControlsCard();
  }

  /**
   * Keep any device smooth: every point/spot light in the scene is paid for by every
   * pixel shader even at intensity 0, so lower tiers drop them (the game is daylight
   * only); then compile all shaders up front so nothing hitches the first time it appears.
   */
  private optimizeScene(): void {
    const scene = this.world.scene;
    const q = this.settings.quality;
    if (q === 'low' || q === 'medium') {
      const drop: THREE.Light[] = [];
      scene.traverse((o) => {
        const l = o as THREE.Light;
        if (((l as THREE.PointLight).isPointLight || (l as THREE.SpotLight).isSpotLight) && !l.userData.keep) drop.push(l);
      });
      for (const l of drop) l.removeFromParent();
    }
    const r = this.renderer.renderer;
    void r.compileAsync(scene, this.camera).catch(() => undefined);
  }

  private enterWorld(): void {
    const p = this.profile;
    if (this.world.vehicle) this.world.exitVehicle();
    this.world.player.place(p.position.x, p.position.z, p.position.yaw);
    this.world.rig.snapTo(this.world.player.position, p.position.yaw + Math.PI);
    this.world.hour = daylight(p.hour);
    this.applyProfileEffects();
    this.systems.init(this.sysCtx);
    this.optimizeScene();
    this.mode = 'playing';
    this.input.captureWanted = true;
    this.input.lockPointer();
    this.ui.setHudVisible(true);
    this.audio.setMusicMode('world');
    this.cleanupMissionProps();
    this.director.stop();
    const active = this.missions.active();
    if (active) this.director.start(active.def, false); // scripted missions restart from their beginning
    this.onObjectiveChanged();
  }

  // ---------------------------------------------------------------- settings & profile effects

  private applySettings(s: Settings): void {
    this.settings = s;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambient: s.ambient, voice: s.voice });
    this.audio.setVoiceEnabled(s.voiceTTS);
    this.voice.volume = s.voice * s.master;
    this.world.rig.sensitivity = s.mouseSensitivity;
    this.world.rig.invertY = s.invertY;
    this.world.rig.reducedMotion = s.reducedMotion;
    if (this.cinematic) this.cinematic.reducedMotion = s.reducedMotion;
    this.ui.setReducedMotion(s.reducedMotion);
    this.world.env.setShadows(s.shadows);
    this.renderer.renderer.shadowMap.enabled = s.shadows && s.quality !== 'low';
  }

  private onSettingsChanged(v: SettingsView): void {
    const qualityChanged = v.quality !== this.settings.quality;
    this.applySettings({ ...this.settings, ...v });
    this.saves.saveSettings(this.settings);
    if (qualityChanged) this.ui.notify('Graphics quality applies after reloading the page.', 'info');
  }

  private settingsView(): SettingsView {
    const s = this.settings;
    return { master: s.master, music: s.music, sfx: s.sfx, ambient: s.ambient, voice: s.voice, mouseSensitivity: s.mouseSensitivity, invertY: s.invertY, quality: s.quality, bloom: s.bloom, shadows: s.shadows, reducedMotion: s.reducedMotion, showHints: s.showHints, voiceTTS: s.voiceTTS, subtitles: s.subtitles };
  }

  private async resetSave(): Promise<void> {
    if (!(await this.ui.confirm('Delete your saved progress? This cannot be undone.', 'Delete save'))) return;
    this.saves.reset();
    this.ui.notify('Save deleted.', 'warn');
    location.reload();
  }

  private applyProfileEffects(): void {
    const e = effects(this.profile);
    this.world.player.maxHealth = e.maxHealth;
    this.world.player.health = Math.min(this.profile.health, e.maxHealth);
    this.world.player.staminaMult = e.staminaMult;
    this.world.carSpeedMult = e.carSpeedMult;
    this.audio.setBonusStation(e.bonusStation);
    const shirt = SHIRTS[this.profile.cosmetics.shirt] ?? SHIRTS.default;
    this.world.player.rig.setShirt(shirt[0], shirt[1]);
    this.markers.setCollectedShards(this.profile.shards);
  }

  save(): void {
    const p = this.profile;
    const pos = this.world.player.position;
    p.position = { x: pos.x, z: pos.z, yaw: this.world.player.yaw };
    if (this.world.vehicle) p.position = { x: this.world.vehicle.position.x, z: this.world.vehicle.position.z, yaw: this.world.vehicle.yaw };
    if (this.world.vehicle && ['boat', 'jetski', 'kayak', 'airboat', 'heli'].includes(this.world.vehicle.def.kind)) p.position = { ...PLACES.spawn, yaw: 0 };
    p.hour = this.world.hour;
    p.health = this.world.player.health;
    p.missions = this.missions.serialize();
    if (p.journal.length > 400) p.journal = p.journal.slice(-400);
    const at = Date.now();
    if (!this.saves.save(p)) this.ui.notify('Could not save (browser storage unavailable).', 'warn');
    try { localStorage.setItem(SAVED_AT_KEY, String(at)); } catch { /* ignore */ }
    void this.saveFile.write(p, at);
  }

  // ---------------------------------------------------------------- helpers

  private sfx = (name: SfxId): void => this.audio.sfx(name);

  /** Run a blocking UI screen: frees the mouse, freezes input, restores after. */
  /** A story cutscene or a system's own cinematic (character switch) owns the camera. */
  private get inCinematic(): boolean {
    return this.director.inCinematic || this.systems.inCinematic();
  }

  private async modal<T>(fn: () => Promise<T>): Promise<T> {
    this.busy = true;
    this.input.captureWanted = false;
    this.input.releasePointer();
    this.input.enabled = false;
    this.ui.prompt(null);
    this.audio.setPaused(true);
    try {
      return await fn();
    } finally {
      this.busy = false;
      this.input.enabled = true;
      this.input.captureWanted = this.mode === 'playing';
      this.input.lockPointer(); // works if the closing click/key is still the active gesture
      this.audio.setPaused(false);
      this.clock.getDelta();
    }
  }

  private lines(src: DialogueLine[]): UiLine[] {
    return src.map((l) => {
      const c = CHARACTERS[l.speaker];
      return { speaker: l.speaker, name: c ? c.name : l.speaker === 'narrator' ? '' : l.speaker, color: c ? c.portraitColor : '#ffd23f', text: l.text };
    });
  }

  // ---------------------------------------------------------------- world events

  private wireWorldEvents(): void {
    const w = this.world;
    w.events.onCrash = (s) => {
      w.rig.addShake(Math.min(1, s));
      if (s > 0.25) this.sfx('crash');
    };
    w.events.onPlayerHit = (dmg) => {
      if (this.mode !== 'playing') return;
      w.player.health = Math.max(0, w.player.health - dmg);
      this.sfx('crash');
      w.rig.addShake(0.6);
      if (w.player.health <= 0) void this.hospitalize();
    };
    w.events.onEnterVehicle = (v) => {
      this.sfx('door');
      this.audio.setMusicMode('vehicle');
      if (!this.audio.currentStation()) this.audio.setStation(0);
      this.ui.notify(`${v.def.name}. R = radio, Space = handbrake, E = exit.`, 'info');
      this.missionEvent({ type: 'drive' });
      this.ui.tutorial.signal('enter_vehicle');
    };
    w.events.onExitVehicle = () => {
      this.sfx('door');
      this.audio.setMusicMode('world');
      this.audio.engine(false, 0);
    };
    w.events.onDistrict = (id) => {
      if (this.mode !== 'playing') return;
      this.ui.districtBanner(DISTRICTS[id].name);
      if (!this.profile.discovered.includes(id)) {
        this.profile.discovered.push(id);
        addJournal(this.profile, 'concept', `Discovered ${DISTRICTS[id].name}`, DISTRICTS[id].blurb);
      }
    };
  }

  private async hospitalize(): Promise<void> {
    if (this.busy) return;
    if (this.world.vehicle) this.world.exitVehicle();
    const cost = Math.min(this.profile.credits, 100);
    await this.modal(() => this.ui.hospitalized(cost));
    this.profile.credits -= cost;
    this.world.player.health = this.world.player.maxHealth;
    this.world.player.place(PLACES.hospital.x, PLACES.hospital.z, Math.PI);
    this.world.rig.snapTo(this.world.player.position);
    if (this.chase || this.collectActive) this.applyUpdate(this.missions.handle({ type: 'timeout' }));
  }

  // ---------------------------------------------------------------- interactions

  private registerStaticInteractions(): void {
    // story characters
    for (const post of POSTS) {
      const c = CHARACTERS[post.npc];
      if (!c) continue;
      this.interactions.set({
        id: `npc:${post.npc}`, x: post.x, z: post.z, radius: 3.2, priority: 2,
        title: `Talk to ${c.name}`,
        desc: c.role,
        enabled: () => !this.world.vehicle,
        action: () => void this.talkTo(post.npc),
      });
    }
    // terminals
    for (const t of TERMINALS) {
      this.interactions.set({
        id: `term:${t.id}`, x: t.x, z: t.z, radius: 2.6, priority: 3,
        title: ARCADE_TERMINALS.has(t.id) ? 'Play the Cyber Arcade' : `Use ${t.name}`,
        desc: ARCADE_TERMINALS.has(t.id) ? '1,000+ cyber challenges in 31 categories' : this.terminalDesc(t.id),
        enabled: () => !this.world.vehicle,
        action: () => void this.useTerminal(t.id),
      });
    }
    // Byte Bazaar shop
    this.interactions.set({
      id: 'shop', x: -46, z: -30, radius: 3, priority: 1,
      title: 'Browse Byte Bazaar', desc: 'Upgrades, shirts and first aid',
      enabled: () => !this.world.vehicle,
      action: () => void this.openShop(),
    });
  }

  private terminalDesc(id: string): string {
    if (this.director.pendingChallenge?.terminal === id) return 'Start the mission challenge';
    const a = this.missions.active();
    if (!this.director.running && a && a.objective.type === 'challenge' && a.objective.terminal === id) return 'Start the mission challenge';
    if (id === 'hq-lab') return 'Replay any challenge you have unlocked';
    return 'Practice challenges here';
  }

  private async talkTo(npc: string): Promise<void> {
    if (this.busy) return;
    this.ui.tutorial.signal('talk');
    const c = CHARACTERS[npc];
    this.markers.waveAt(npc);
    const a = this.missions.active();
    if (this.director.running) {
      if (this.director.talked(npc)) return;
    } else if (a && a.objective.type === 'talk' && a.objective.npc === npc) {
      // active objective with this character (data-driven fallback)
      const obj = a.objective;
      await this.modal(() => this.ui.dialogue(this.lines(obj.lines)));
      this.missionEvent({ type: 'talk', npc });
      return;
    }
    // offer a mission
    const offers = this.missions.offeredBy(npc);
    if (offers.length && !a) {
      const def = offers[0];
      await this.modal(() => this.ui.dialogue(this.lines(def.briefing)));
      const ok = await this.modal(() => this.ui.briefing(this.briefingView(def)));
      if (ok && this.missions.accept(def.id)) {
        this.sfx('open');
        this.ui.notify(`Mission started: ${def.title}`, 'good');
        this.director.start(def, true);
        this.onObjectiveChanged();
      }
      return;
    }
    if (offers.length && a) {
      this.ui.notify(`Finish "${a.def.title}" first — ${c.name} will wait.`, 'info');
      return;
    }
    // small talk
    const pool = [...c.greeting, ...c.idle];
    const text = pool[Math.floor(Math.random() * pool.length)];
    await this.modal(() => this.ui.dialogue(this.lines([{ speaker: npc, text }])));
  }

  private briefingView(def: MissionDef) {
    const giver = def.giver ? CHARACTERS[def.giver]?.name ?? def.giver : 'Sunset Shield';
    const r = def.rewards;
    const rep = Object.entries(r.rep).map(([k, v]) => `+${v} ${ORG_LABELS[k as keyof typeof ORG_LABELS]}`);
    return {
      title: def.title,
      giver,
      location: DISTRICTS[def.district as keyof typeof DISTRICTS]?.name ?? def.district,
      difficulty: def.difficulty,
      objectives: def.objectives.map((o) => o.text),
      learning: def.learning,
      rewards: [`${r.xp} XP`, `$${r.credits}`, ...rep, ...(r.item ? [getItem(r.item)?.name ?? r.item] : [])],
      text: def.summary,
    };
  }

  private async useTerminal(id: string): Promise<void> {
    if (this.busy) return;
    this.ui.tutorial.signal('terminal');
    if (ARCADE_TERMINALS.has(id)) {
      await this.openArcadeBoard();
      return;
    }
    if (this.director.running && (await this.director.usedTerminal(id))) return;
    const a = this.missions.active();
    if (!this.director.running && a && a.objective.type === 'challenge' && a.objective.terminal === id) {
      const def = getChallenge(a.objective.challenge);
      if (def) await this.playChallenge(def, true);
      return;
    }
    // practice
    const unlocked = this.practiceRows().filter((r) => r.best !== null || id === 'hq-lab');
    if (!unlocked.length) {
      this.ui.notify('Nothing to do on this terminal yet. Check your mission objective.', 'info');
      return;
    }
    await this.modal(() => this.ui.openLearningHub({
      concepts: this.conceptViews(), mastery: this.masteryRows(), practice: id === 'hq-lab' ? this.practiceRows() : unlocked,
      onPractice: (cid) => { const d = getChallenge(cid); if (d) void this.playChallenge(d, false); },
    }));
  }

  /** Run a challenge screen and record the result. Returns pass/fail (null if exited). */
  async playChallenge(def: ChallengeDefinition, forMission: boolean): Promise<boolean | null> {
    const fx = effects(this.profile);
    this.sfx('open');
    const result = await this.modal(() => this.ui.runChallenge(def, { bonusHints: fx.bonusHints, sfx: this.sfx }));
    if (!result) return null;
    const titles: Record<string, string> = {};
    for (const c of def.conceptCards) titles[c.id] = c.title;
    const outcome = recordChallenge(this.profile, result, def.topic, titles);
    if (result.passed) this.profile.stats.challengesPassed++;
    const xp = Math.round(outcome.xp * fx.xpMult);
    if (xp > 0) {
      const ups = addXp(this.profile, xp);
      this.ui.notify(`+${xp} XP — ${def.title} (${result.score}%)`, 'xp');
      if (ups > 0) this.levelUp(ups);
    } else {
      this.ui.notify(`${def.title}: ${result.score}% (beat your best of ${outcome.previousBest}% for more XP)`, 'info');
    }
    for (const id of outcome.newConcepts) this.ui.notify(`New concept card: ${titles[id] ?? id}`, 'good');
    if (forMission) {
      this.missionEvent({ type: 'challenge', id: def.id, passed: result.passed });
      if (!result.passed) this.ui.notify(`Not quite — ${def.passScore}% needed. Use the hints and try the terminal again.`, 'warn');
    }
    this.save();
    return result.passed;
  }

  private levelUp(ups: number): void {
    this.sfx('levelup');
    this.ui.notify(`LEVEL UP! You are now level ${this.profile.level}. +${ups} skill point${ups > 1 ? 's' : ''} (Esc → Skills)`, 'good');
  }

  private async openArcadeBoard(): Promise<void> {
    this.ui.tutorial.signal('arcade');
    let mod: typeof import('./ArcadeOverlay');
    try {
      mod = await import('./ArcadeOverlay'); // lazy: the arcade content banks are large
    } catch (err) {
      console.error(err);
      this.ui.notify('The Cyber Arcade failed to load.', 'warn');
      return;
    }
    await this.modal(() => mod.openArcade(this.ui, this.profile, async (def) => {
      await this.playChallenge(def, false);
    }));
  }

  private async openShop(): Promise<void> {
    const items = (): UiShopItem[] => SHOP_ITEMS.filter((i) => i.forSale).map((i) => ({
      id: i.id, name: i.name, desc: i.description, price: i.price,
      owned: i.kind !== 'consumable' && this.profile.inventory.includes(i.id),
    }));
    await this.modal(() => this.ui.shop(items(), this.profile.credits, (id) => {
      this.profile.health = this.world.player.health;
      const r = buy(this.profile, id);
      if (r.ok) {
        this.sfx('cash');
        this.applyProfileEffects();
        this.world.player.health = this.profile.health;
        this.save();
      } else this.sfx('bad');
      return { ok: r.ok, msg: r.ok ? `Bought ${r.item.name}.` : r.reason, credits: this.profile.credits, items: items() };
    }));
  }

  // ---------------------------------------------------------------- missions

  private missionEvent(e: Parameters<MissionManager['handle']>[0]): void {
    if (this.mode !== 'playing') return;
    this.applyUpdate(this.missions.handle(e));
  }

  private applyUpdate(u: MissionUpdate): void {
    if (u.failed) {
      this.cleanupMissionProps();
      this.sfx('failed');
      void this.modal(() => this.ui.missionFailed(u.failed ?? ''));
      this.onObjectiveChanged();
      return;
    }
    if (u.completed || u.finished) {
      this.cleanupMissionProps();
      void this.completeMission(u);
      return;
    }
    if (u.advanced) {
      this.sfx('beep');
      this.onObjectiveChanged();
    } else if (u.objective?.type === 'collect') {
      this.sfx('pickup');
      this.ui.notify(`Rogue access point scanned (${this.missions.collectedCount()}/${u.objective.items.length})`, 'good');
    }
  }

  private async completeMission(u: MissionUpdate, fromScript = false): Promise<void> {
    const def = u.completed ?? u.finished;
    if (!def) return;
    if (!fromScript && def.completion.length) await this.modal(() => this.ui.dialogue(this.lines(def.completion)));
    if (u.completed) {
      const fx = effects(this.profile);
      const sum = grantReward(this.profile, def.rewards, { xpMult: fx.xpMult, creditMult: fx.creditMult });
      addJournal(this.profile, 'mission', `Mission passed: ${def.title}`, def.summary);
      this.sfx('passed');
      await this.modal(() => this.ui.missionPassed({
        title: def.title, xp: sum.xp, credits: sum.credits,
        rep: Object.entries(sum.rep).map(([k, v]) => `${ORG_LABELS[k as keyof typeof ORG_LABELS]} +${v}`),
        levelUps: sum.levelUps, summary: def.summary, learned: def.learning,
      }));
      if (sum.levelUps) this.levelUp(sum.levelUps);
      if (def.rewards.unlockNote) this.ui.notify(def.rewards.unlockNote, 'info');
      this.applyProfileEffects();
      this.save();
      if (def.id === 'm09-final') {
        await this.modal(() => this.ui.cutscene(this.lines(ENDING_CUTSCENE), { title: 'Neon Bay is safe… for now' }));
        await this.modal(() => this.ui.credits());
        this.ui.notify('Story complete! Side missions, shards and the Cyber Arcade are still waiting.', 'good');
      }
    } else {
      this.ui.notify(`Replay finished: ${def.title}`, 'good');
    }
    // Missions without a giver (e.g. the Season 2 opener) auto-start: run their script.
    const next = this.missions.active();
    if (next && !this.director.running) this.director.start(next.def, false);
    this.onObjectiveChanged();
  }

  /** Called whenever the active objective may have changed: markers, props, timers. */
  /** Markers for script-driven missions. */
  private refreshMarkers(): void {
    if (!this.director.running) return;
    const t = this.director.target();
    this.markers.setObjective(this.director.chase ? null : t, this.director.pendingChallenge ? '#19e6ff' : '#ffd23f');
    this.markers.setTerminalHighlight(this.director.pendingChallenge?.terminal ?? null);
    this.markers.setGiverIcons(new Set());
    const text = this.director.objective;
    if (text && text !== this.lastObjectiveNote && this.settings.showHints) {
      this.lastObjectiveNote = text;
      this.ui.notify(text, 'info');
    }
  }

  private lastObjectiveNote: string | null = null;
  private scriptCollectShown = false;

  /** Show/hide rogue AP props for a script's COLLECT_START. */
  private syncScriptCollect(): void {
    const c = this.director.collect;
    if (c && !this.scriptCollectShown) {
      this.scriptCollectShown = true;
      const items = c.items.filter((i) => !c.found.has(i.id));
      this.markers.showAccessPoints(items);
      for (const it of items) {
        this.interactions.set({
          id: `collect:${it.id}`, x: it.x, z: it.z, radius: 3, priority: 4,
          title: `Scan ${it.label}`, desc: 'Log the rogue access point for takedown',
          enabled: () => !this.world.vehicle,
          action: () => {
            this.interactions.remove(`collect:${it.id}`);
            this.markers.hideAccessPoint(it.id);
            this.sfx('pickup');
            this.ui.notify(`Rogue access point scanned (${c.found.size + 1}/${c.items.length})`, 'good');
            this.director.collected(it.id);
          },
        });
      }
    } else if (!c && this.scriptCollectShown) {
      this.scriptCollectShown = false;
      this.interactions.removePrefix('collect:');
      this.markers.clearAccessPoints();
    }
  }

  private onObjectiveChanged(): void {
    if (this.director.running) {
      this.refreshMarkers();
      return;
    }
    const a = this.missions.active();
    this.markers.setTerminalHighlight(null);
    this.timer = null;
    if (!a) {
      this.markers.setObjective(null);
    } else {
      const obj = a.objective;
      const t = objectiveTarget(obj);
      this.markers.setObjective(obj.type === 'chase' || obj.type === 'drive' ? null : t, obj.type === 'challenge' ? '#19e6ff' : '#ffd23f');
      if (obj.type === 'challenge') this.markers.setTerminalHighlight(obj.terminal);
      if (obj.type === 'chase') this.startChase(obj);
      if (obj.type === 'collect') this.startCollect(obj);
      if (this.settings.showHints) this.ui.notify(obj.text, 'info');
    }
    // giver icons for available missions
    const givers = new Set<string>();
    if (!a) for (const m of this.missions.available()) if (m.giver) givers.add(m.giver);
    this.markers.setGiverIcons(givers);
  }

  private startChase(obj: Extract<ObjectiveDef, { type: 'chase' }>): void {
    if (this.chase) return;
    const van = this.world.spawnVehicle('van', -76.6, -30, Math.PI);
    this.world.traffic.adopt(van, undefined, 19);
    this.chase = { van, progress: 0, tagSeconds: obj.tagSeconds, radius: obj.radius, engaged: false };
    this.timer = obj.duration;
    this.ui.notify('The Pink Tide van is leaving the Tech Market! Stay close to plant the tracker.', 'warn');
    this.sfx('alert');
  }

  private startCollect(obj: Extract<ObjectiveDef, { type: 'collect' }>): void {
    if (this.collectActive) return;
    this.collectActive = true;
    const remaining = new Set(this.missions.remainingItems().map((i) => i.id));
    const items = obj.items.filter((i) => remaining.has(i.id));
    this.markers.showAccessPoints(items);
    for (const it of items) {
      this.interactions.set({
        id: `collect:${it.id}`, x: it.x, z: it.z, radius: 3, priority: 4,
        title: `Scan ${it.label}`, desc: 'Log the rogue access point for takedown',
        enabled: () => !this.world.vehicle,
        action: () => {
          this.interactions.remove(`collect:${it.id}`);
          this.markers.hideAccessPoint(it.id);
          this.missionEvent({ type: 'collect', item: it.id });
        },
      });
    }
    if (obj.timeLimit) this.timer = obj.timeLimit;
  }

  private cleanupMissionProps(): void {
    if (this.chase) {
      const van = this.chase.van;
      this.chase = null;
      setTimeout(() => this.world.removeVehicle(van), 4000);
    }
    this.collectActive = false;
    this.interactions.removePrefix('collect:');
    this.markers.clearAccessPoints();
    this.timer = null;
  }

  private updateMissionFrame(dt: number): void {
    if (this.director.running) {
      this.director.update(dt);
      this.syncScriptCollect();
      return;
    }
    const a = this.missions.active();
    if (!a) return;
    const obj = a.objective;
    const pos = this.world.focus;
    if (obj.type === 'goto') {
      const p = PLACES[obj.place];
      if (p && Math.hypot(p.x - pos.x, p.z - pos.z) < (obj.radius ?? 7)) this.missionEvent({ type: 'reach', place: obj.place });
    }
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = null;
        this.applyUpdate(this.missions.handle({ type: 'timeout' }));
        return;
      }
    }
    if (this.chase) {
      const c = this.chase;
      const d = c.van.position.distanceTo(pos);
      if (this.world.vehicle && d < c.radius) {
        c.progress += dt / c.tagSeconds;
        if (c.progress >= 1) {
          this.sfx('good');
          this.ui.notify('Tracker planted on the van! Pink Tide will lead us to them.', 'good');
          this.missionEvent({ type: 'chase', success: true });
        }
      }
      if (d < 60) c.engaged = true;
      if (c.engaged && d > 200) this.missionEvent({ type: 'chase', success: false });
    }
  }

  // ---------------------------------------------------------------- per-frame gameplay

  private handleKeys(): void {
    const i = this.input;
    if (this.busy || this.inCinematic) return;
    if (i.wasPressed('Escape')) { void this.openPause(); return; }
    if (i.wasPressed('Tab')) { void this.openPause('missions'); return; }
    if (i.wasPressed('KeyI')) { void this.openPause('inventory'); return; }
    if (i.wasPressed('KeyJ')) { void this.openPause('journal'); return; }
    if (i.wasPressed('KeyM')) { void this.openMap(); return; }
    if (i.wasPressed('F1')) this.showControlsCard();
    if (i.wasPressed('KeyV')) {
      const fp = this.world.rig.toggleFirstPerson();
      this.ui.notify(fp ? 'First-person view  ~V~ to switch back' : 'Third-person view  ~V~ for first person', 'info');
    }
    if (i.wasPressed('KeyG') && !this.world.vehicle) { void this.openArcadeBoard(); return; }
    const w = this.world;
    if (w.entry.busy) return; // getting in or out of a car
    if (w.vehicle) {
      if (i.wasPressed('KeyE') || i.wasPressed('KeyF')) { w.requestExit(); return; }
      if (i.wasPressed('KeyR')) {
        this.ui.tutorial.signal('radio');
        const name = this.audio.nextStation();
        this.ui.notify(`📻 ${name}`, 'info');
      }
      if (i.wasPressed('KeyH') && this.hornCooldown <= 0) { this.sfx('horn'); this.hornCooldown = 0.4; }
      return;
    }
    if (i.wasPressed('KeyE') || i.wasPressed('KeyF')) {
      const best = this.interactions.best(w.player.position.x, w.player.position.z);
      const jack = w.nearestTraffic();
      if (jack && (i.wasPressed('KeyF') || !best || best.id === 'ped')) {
        w.hijack(jack);
        return;
      }
      if (best) best.action();
    }
  }

  private updateDynamicInteractions(): void {
    const w = this.world;
    const pos = w.player.position;
    const v = w.nearestVehicle();
    if (v && !w.vehicle) {
      this.interactions.set({ id: 'vehicle', x: v.position.x, z: v.position.z, radius: 99, priority: 0, title: `Enter ${v.def.name}`, desc: v.def.kind === 'boat' ? 'Speedboat — water only' : 'Drive anywhere in Neon Bay', action: () => w.requestEnter(v) });
    } else this.interactions.remove('vehicle');
    const ped = w.peds.nearest(pos, 2.6);
    if (ped && !w.vehicle) {
      this.interactions.set({
        id: 'ped', x: ped.pos.x, z: ped.pos.z, radius: 99, priority: -1, title: 'Chat with local', desc: 'Neon Bay residents have opinions',
        action: () => {
          w.peds.greet(ped, pos);
          const line = PEDESTRIAN_LINES[ped.line % PEDESTRIAN_LINES.length];
          ped.line++;
          this.ui.subtitle('Local', line);
          this.voice.play('Local', line);
          this.lastSubtitle = Math.max(4, (this.voice.duration('Local', line) ?? 0) + 0.8);
        },
      });
    } else this.interactions.remove('ped');
    // shards: walk-through pickup
    const shard = this.markers.nearestShard(pos, 1.8);
    if (shard && !this.profile.shards.includes(shard)) this.collectShard(shard);
  }

  private collectShard(id: string): void {
    this.profile.shards.push(id);
    this.markers.setCollectedShards(this.profile.shards);
    this.profile.credits += 100;
    this.sfx('pickup');
    const n = this.profile.shards.length;
    const concept = allConcepts()[(n * 7) % allConcepts().length];
    addJournal(this.profile, 'shard', `Data shard ${n}/${SHARDS.length}`, `Decrypted fragment: "${concept.title}" — ${concept.definition}`);
    this.ui.notify(`Data shard ${n}/${SHARDS.length} decrypted: ${concept.title}  (+$100)`, 'money');
    if (n === SHARDS.length) {
      this.profile.credits += 2500;
      this.ui.notify('All 12 data shards! +$2,500 and eternal bragging rights.', 'good');
    }
    this.save();
  }

  private async openMap(): Promise<void> {
    this.ui.tutorial.signal('map');
    await this.modal(() => this.ui.openMap(this.minimapState(), (x, z) => {
      this.waypoint = x === null || z === null ? null : { x, z };
      this.markers.setWaypoint(this.waypoint);
    }));
  }

  private async openPause(tab?: PauseView['initialTab']): Promise<void> {
    this.ui.tutorial.signal('tab');
    const view = this.pauseView(tab);
    await this.modal(() => this.ui.pauseMenu(view));
  }

  private pauseView(tab?: PauseView['initialTab']): PauseView {
    const p = this.profile;
    const a = this.missions.active();
    const skillRows = () => SKILLS.map((s) => ({
      id: s.id, name: s.name, desc: s.description, branch: SKILL_BRANCHES[s.branch], tier: s.tier,
      owned: p.skills.includes(s.id), canBuy: canUnlock(p, s.id).ok,
    }));
    return {
      missions: this.missions.list().map(({ def: m, status }) => ({ id: m.id, title: m.title, status, chapter: m.chapter === 'side' ? 'Side' : `Chapter ${m.chapter}`, summary: m.summary })),
      active: a ? { title: a.def.title, objective: a.objective.text } : null,
      stats: { level: p.level, xp: p.xp, xpNext: xpToNext(p.level), credits: p.credits, rep: ORGS.map((o) => ({ label: ORG_LABELS[o], value: p.rep[o] })), skillPoints: p.skillPoints },
      inventory: p.inventory.map((id) => ({ id, name: getItem(id)?.name ?? id, desc: getItem(id)?.description ?? '' })),
      skills: skillRows(),
      onBuySkill: (id) => {
        const r = unlockSkill(p, id);
        if (r.ok) { this.sfx('levelup'); this.applyProfileEffects(); this.save(); } else this.ui.notify(r.reason, 'warn');
        return skillRows();
      },
      journal: [...p.journal].reverse().map((j) => ({ time: new Date(j.time).toLocaleString(), kind: j.kind, title: j.title, text: j.text })),
      concepts: this.conceptViews(),
      mastery: this.masteryRows(),
      practice: this.practiceRows(),
      onPractice: (id) => { const d = getChallenge(id); if (d) void this.playChallenge(d, false); },
      settings: this.settingsView(),
      onSettings: (s) => this.onSettingsChanged(s),
      onSave: () => { this.save(); this.ui.notify('Game saved.', 'good'); },
      onQuitToMenu: () => { this.save(); this.director.stop(); this.showMainMenu(); },
      onOpenMap: () => void this.openMap(),
      onResetSave: () => void this.resetSave(),
      initialTab: tab,
    };
  }

  private conceptViews(): ConceptView[] {
    return allConcepts().map((c) => ({ ...c, unlocked: this.profile.concepts.includes(c.id), mastery: masteryPercent(this.profile, c.topic) }));
  }

  private masteryRows(): MasteryRow[] {
    return (Object.keys(TOPIC_LABELS) as Topic[]).map((t) => ({ topic: t, label: TOPIC_LABELS[t], percent: masteryPercent(this.profile, t) }));
  }

  private practiceRows(): PracticeRow[] {
    return CHALLENGES.map((c) => {
      const hist = this.profile.challengeHistory.filter((h) => h.id === c.id);
      return { id: c.id, title: c.title, topic: TOPIC_LABELS[c.topic], best: hist.length ? Math.max(...hist.map((h) => h.score)) : null };
    });
  }

  private minimapState() {
    const w = this.world;
    const f = w.focus;
    const blips: Blip[] = [];
    const a = this.missions.active();
    if (this.director.running) {
      const t = this.director.target();
      if (t && !this.director.chase) blips.push({ ...t, kind: 'objective', color: '#ffd23f', label: this.director.objective ?? '' });
      for (const b of this.director.blipList()) blips.push({ x: b.x, z: b.z, kind: b.handle !== undefined ? 'target' : 'mission', color: b.color });
      const col = this.director.collect;
      if (col) for (const it of col.items) if (!col.found.has(it.id)) blips.push({ x: it.x, z: it.z, kind: 'target', color: '#ff2fa0', label: it.label });
    } else if (a) {
      const t = objectiveTarget(a.objective);
      if (t && a.objective.type !== 'chase' && a.objective.type !== 'drive') blips.push({ ...t, kind: 'objective', color: '#ffd23f', label: a.objective.text });
      if (a.objective.type === 'collect') for (const it of this.missions.remainingItems()) blips.push({ x: it.x, z: it.z, kind: 'target', color: '#ff2fa0', label: it.label });
    } else {
      for (const m of this.missions.available()) {
        const post = POSTS.find((p) => p.npc === m.giver);
        if (post) blips.push({ x: post.x, z: post.z, kind: 'giver', color: CHARACTERS[post.npc]?.portraitColor, label: `${CHARACTERS[post.npc]?.name}: ${m.title}` });
      }
    }
    if (this.chase) blips.push({ x: this.chase.van.position.x, z: this.chase.van.position.z, kind: 'target', color: '#ff2fa0', label: 'Pink Tide van' });
    blips.push({ x: -46, z: -30, kind: 'shop', label: 'Byte Bazaar' });
    // gameplay systems contribute their own blips (shops, robberies, police, enemies...)
    type BlipSrc = { blips?(): Blip[] };
    for (const sys of this.systems.list()) for (const b of (sys as unknown as BlipSrc).blips?.() ?? []) blips.push(b);
    for (const t of TERMINALS) if (ARCADE_TERMINALS.has(t.id)) blips.push({ x: t.x, z: t.z, kind: 'terminal', color: '#ffd23f', label: 'Cyber Arcade' });
    if (effects(this.profile).shardRadar) for (const s of SHARDS) if (!this.profile.shards.includes(s.id)) blips.push({ x: s.x, z: s.z, kind: 'shard', label: 'Data shard' });
    const dest = this.waypoint ?? (this.director.running ? this.director.target() : a ? objectiveTarget(a.objective) : null);
    return {
      x: f.x, z: f.z, heading: w.vehicle ? w.vehicle.yaw : w.player.yaw, camYaw: w.rig.yaw + Math.PI, blips, waypoint: this.waypoint,
      route: this.gpsRoute(dest), routeColor: this.waypoint ? '#b14dff' : '#ffd23f',
    };
  }

  /** Tutorial signals that come from continuous play, plus the threat level. */
  private trackPlay(): void {
    const w = this.world;
    const t = this.ui.tutorial;
    if (t.active) {
      if (Math.abs(this.input.mouseDX) + Math.abs(this.input.mouseDY) > 4) t.signal('look');
      if (!w.vehicle && w.player.speed > 0.5) t.signal('move');
      if (!w.vehicle && w.player.speed > 5) t.signal('sprint');
      if (w.vehicle && w.vehicle.kmh > 15) t.signal('drive');
      const target = this.director.running ? this.director.target() : null;
      if (target && Math.hypot(target.x - w.focus.x, target.z - w.focus.z) < 9) t.signal('reach_marker');
    }
    this.ui.setThreat(this.director.chase ? 3 : 0);
  }

  /** GPS: shortest road path (BFS over the road grid) from the player to the destination. */
  private gpsRoute(to: { x: number; z: number } | null): { x: number; z: number }[] | undefined {
    if (!to) return undefined;
    const nodes = this.world.traffic.nodes;
    const f = this.world.focus;
    const nearest = (x: number, z: number) => {
      let best = 0, bd = Infinity;
      for (const n of nodes) {
        const d = (n.x - x) ** 2 + (n.z - z) ** 2;
        if (d < bd) { bd = d; best = n.id; }
      }
      return best;
    };
    const start = nearest(f.x, f.z), goal = nearest(to.x, to.z);
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    while (queue.length) {
      const id = queue.shift() as number;
      if (id === goal) break;
      for (const l of nodes[id].links) if (!prev.has(l)) { prev.set(l, id); queue.push(l); }
    }
    const path: { x: number; z: number }[] = [];
    for (let id = goal; id !== -1 && id !== undefined; id = prev.get(id) as number) path.unshift({ x: nodes[id].x, z: nodes[id].z });
    return [{ x: f.x, z: f.z }, ...path, to];
  }

  private updateHud(): void {
    this.trackPlay();
    const w = this.world;
    const p = this.profile;
    const a = this.missions.active();
    const hh = Math.floor(w.hour), mm = Math.floor((w.hour % 1) * 60);
    this.ui.updateHud({
      money: p.credits,
      health: w.player.health,
      maxHealth: w.player.maxHealth,
      stamina: w.player.stamina,
      level: p.level,
      xp: p.xp,
      xpNext: xpToNext(p.level),
      clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      objective: this.director.running ? this.director.objective : a ? a.objective.text : null,
      missionTitle: a ? a.def.title : null,
      timer: this.director.running ? (this.director.timer !== null ? Math.ceil(this.director.timer) : null) : this.timer !== null ? Math.ceil(this.timer) : null,
      chase: this.director.chase
        ? { progress: Math.min(1, this.director.chase.progress), distance: Math.round(this.director.chase.van.position.distanceTo(w.focus)) }
        : this.chase ? { progress: Math.min(1, this.chase.progress), distance: Math.round(this.chase.van.position.distanceTo(w.focus)) } : null,
      vehicle: w.vehicle ? { speedKmh: Math.round(w.vehicle.kmh), name: w.vehicle.def.name } : null,
      radio: w.vehicle ? this.audio.currentStation() : null,
    });
    this.ui.drawMinimap(this.minimapState());
    if (!this.busy) {
      const best = w.vehicle ? null : this.interactions.best(w.player.position.x, w.player.position.z);
      this.ui.prompt(best ? { key: best.key ?? 'E', title: best.title, desc: best.desc } : null);
    }
  }

  // ---------------------------------------------------------------- loop

  private loop = (): void => {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05);
    this.renderer.govern(raw);
    this.step(dt);
    requestAnimationFrame(this.loop);
  };

  step(dt: number): void {
    const w = this.world;
    if (this.mode === 'menu') {
      // cinematic flyover behind the main menu
      w.update(dt, this.input, false);
      this.menuT += dt * 0.04;
      const r = 230;
      this.camera.position.set(80 + Math.cos(this.menuT) * r, 70 + Math.sin(this.menuT * 0.7) * 15, -40 + Math.sin(this.menuT) * r);
      this.camera.lookAt(90, 10, -40);
    } else {
      this.handleKeys();
      // Slow motion scales game time only; UI and camera keep real time.
      if (this.timeScale < 1 && performance.now() > this.slowUntil) this.timeScale = 1;
      const gdt = dt * Math.min(this.timeScale, this.systems.timeScale()); // combat Focus, switch wheel...
      if (!this.busy) {
        w.update(gdt, this.input, !this.inCinematic);
        this.updateDynamicInteractions();
        this.updateMissionFrame(gdt);
        this.markers.update(gdt, w.time, w.focus);
        this.hornCooldown -= dt;
        this.autosave += dt;
        if (this.autosave > 30) { this.autosave = 0; this.save(); }
        if (this.lastSubtitle > 0) { this.lastSubtitle -= dt; if (this.lastSubtitle <= 0) this.ui.subtitle(null, null); }
        // audio: engine + ambience
        const v = w.vehicle;
        this.audio.engine(!!v && !(v.def as { pedal?: boolean }).pedal, v ? Math.min(1, Math.abs(v.speed) / v.def.maxSpeed) : 0);
        const f = w.focus;
        this.audio.ambient({ beach: THREE.MathUtils.clamp((f.x - 120) / 90, 0, 1), night: w.env.night, city: 1 - THREE.MathUtils.clamp((f.x - 150) / 80, 0, 1) });
      }
      this.world.player.speedMult = this.systems.speedMultiplier();
      this.systems.update(gdt, this.sysCtx, this.busy || this.inCinematic);
      this.weather.update(gdt);
      this.cinematic.update(dt); // overrides the gameplay camera while a shot plays
      this.updateHud();
    }
    this.updatePointerUi();
    // weather darkens the scene; lightning flashes light it up
    w.env.hemi.intensity += this.weather.flash * 2.5;
    this.renderer.setLook(w.env.exposure * (1 - this.weather.gloom * 0.35), w.env.night, this.settings.bloom);
    this.renderer.render();
    this.input.endFrame();
  }
}
