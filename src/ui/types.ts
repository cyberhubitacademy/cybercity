// View-model types for the DOM UI. The game adapts its own state into these.
import type { ConceptCard } from '../cyber/types';

export interface HudState {
  money: number;
  health: number;
  maxHealth: number;
  /** 0..1 */
  stamina: number;
  level: number;
  xp: number;
  xpNext: number;
  /** 'HH:MM' */
  clock: string;
  objective: string | null;
  missionTitle: string | null;
  /** Seconds left on a timed objective; null hides the countdown. */
  timer: number | null;
  chase: { progress: number; distance: number } | null;
  vehicle: { speedKmh: number; name: string } | null;
  radio: string | null;
}

export type BlipKind = 'mission' | 'giver' | 'terminal' | 'shop' | 'shard' | 'vehicle' | 'target' | 'objective' | 'place';

export interface Blip {
  x: number;
  z: number;
  kind: BlipKind;
  color?: string;
  label?: string;
}

export interface MinimapState {
  x: number;
  z: number;
  /** Player yaw (radians, 0 = facing +z). */
  heading: number;
  /** Camera yaw (radians, 0 = looking toward +z). The minimap rotates so camera-forward is up. */
  camYaw: number;
  blips: Blip[];
  waypoint: { x: number; z: number } | null;
  /** Optional GPS route (road-following points from the player to the destination). */
  route?: { x: number; z: number }[];
  /** Route color: defaults to purple for a waypoint, yellow for a mission destination. */
  routeColor?: string;
}

export interface PromptView {
  key: string;
  title: string;
  desc?: string;
}

export type NotifyKind = 'info' | 'good' | 'warn' | 'xp' | 'money';

export interface DialogueLine {
  /** Speaker id (used only for keys). */
  speaker: string;
  name: string;
  color: string;
  text: string;
}

export interface BriefingView {
  title: string;
  giver: string;
  location: string;
  difficulty: number;
  objectives: string[];
  learning: string[];
  rewards: string[];
  text: string;
}

export interface MissionPassedView {
  title: string;
  xp: number;
  credits: number;
  rep: string[];
  levelUps: number;
  summary: string;
  learned: string[];
}

export interface MainMenuOptions {
  hasSave: boolean;
  onNew: () => void;
  onContinue: () => void;
  onSettings: () => void;
  onHub: () => void;
  onControls: () => void;
  onCredits: () => void;
  /** Short progress summary shown under Continue, e.g. "Level 3 · $1,250 · saved 5 min ago". */
  saveInfo?: string;
  /** Opens the save-file screen (link a file on disk, import/export). */
  onSaveFile?: () => void;
  /** Opens the illustrated How to Play guide. */
  onHowToPlay?: () => void;
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface SettingsView {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  voice: number;
  mouseSensitivity: number;
  invertY: boolean;
  quality: QualityLevel;
  bloom: boolean;
  shadows: boolean;
  reducedMotion: boolean;
  showHints: boolean;
  voiceTTS: boolean;
  subtitles: boolean;
}

export interface MissionRow {
  id: string;
  title: string;
  /** e.g. 'locked' | 'available' | 'active' | 'completed' */
  status: string;
  chapter: string;
  summary: string;
}

export interface SkillRow {
  id: string;
  name: string;
  desc: string;
  branch: string;
  tier: number;
  owned: boolean;
  canBuy: boolean;
}

export interface JournalRow {
  time: string;
  kind: string;
  title: string;
  text: string;
}

export type ConceptView = ConceptCard & { mastery?: number; unlocked: boolean };

export interface MasteryRow {
  topic: string;
  label: string;
  /** 0..100 */
  percent: number;
}

export interface PracticeRow {
  id: string;
  title: string;
  topic: string;
  /** Best score, or null if never played. */
  best: number | null;
}

export interface LearningHubView {
  concepts: ConceptView[];
  mastery: MasteryRow[];
  practice: PracticeRow[];
  onPractice?: (id: string) => void;
}

export interface PauseView {
  missions: MissionRow[];
  active: { title: string; objective: string } | null;
  stats: { level: number; xp: number; xpNext: number; credits: number; rep: { label: string; value: number }[]; skillPoints: number };
  inventory: { id: string; name: string; desc: string }[];
  skills: SkillRow[];
  onBuySkill: (id: string) => SkillRow[];
  journal: JournalRow[];
  concepts: ConceptView[];
  mastery: MasteryRow[];
  practice: PracticeRow[];
  onPractice: (id: string) => void;
  settings: SettingsView;
  onSettings: (s: SettingsView) => void;
  onSave: () => void;
  onQuitToMenu: () => void;
  onOpenMap: () => void;
  onResetSave: () => void;
  /** Optional: which tab to open first. */
  initialTab?: PauseTab;
}

export type PauseTab = 'missions' | 'map' | 'inventory' | 'skills' | 'journal' | 'hub' | 'howto' | 'settings' | 'save';

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  owned: boolean;
}

export interface ShopBuyResult {
  ok: boolean;
  msg: string;
  credits: number;
  items: ShopItem[];
}

export interface TerminalOptions {
  name: string;
  commands: Record<string, (args: string[]) => string>;
  onClose: () => void;
  /** Optional banner text printed on open. */
  banner?: string;
}
