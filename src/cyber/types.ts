// Shared contract between the game shell and every cybersecurity challenge.
// Challenge logic lives in DOM-free `logic.ts` files (unit-tested); the UI lives
// in `ui.ts` files that render into the root element the shell provides.

export type Topic =
  | 'phishing'
  | 'networking'
  | 'firewall'
  | 'identity'
  | 'crypto'
  | 'forensics'
  | 'incident'
  | 'social'
  | 'malware'
  | 'wireless'
  | 'web'
  | 'cloud'
  | 'ai'
  | 'ics'
  | 'supplychain';

export const TOPIC_LABELS: Record<Topic, string> = {
  phishing: 'Phishing & Email',
  networking: 'Networking & Traffic',
  firewall: 'Network Defense',
  identity: 'Identity & Passwords',
  crypto: 'Cryptography',
  forensics: 'Digital Forensics',
  incident: 'Incident Response',
  social: 'Social Engineering',
  malware: 'Malware & Endpoints',
  wireless: 'Wireless & IoT',
  web: 'Web App Security',
  cloud: 'Cloud Security',
  ai: 'AI & Deepfake Security',
  ics: 'Industrial Control Systems',
  supplychain: 'Supply-Chain Security',
};

export interface ConceptCard {
  id: string;
  title: string;
  topic: Topic;
  definition: string;
  whyItMatters: string;
  example: string;
  bestPractice: string;
}

export interface ScoreLine {
  label: string;
  value: number;
  max: number;
}

export interface ChallengeResult {
  challengeId: string;
  /** 0..100 */
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  /** ConceptCard ids the player practiced. */
  conceptsPracticed: string[];
  /** Short plain-language notes about mistakes, recorded in the learning journal. */
  mistakes: string[];
  hintsUsed: number;
}

export type SfxName = 'click' | 'good' | 'bad' | 'type' | 'alert' | 'open';

export interface ChallengeContext {
  /** Empty element the challenge renders its workspace into. */
  root: HTMLElement;
  /** Extra free hints granted by player skills (0..2). */
  bonusHints: number;
  sfx: (name: SfxName) => void;
  /** Call once, after the player has read the feedback and pressed Continue. */
  finish: (result: ChallengeResult) => void;
}

export interface ChallengeDefinition {
  id: string;
  title: string;
  topic: Topic;
  difficulty: 1 | 2 | 3;
  /** One-sentence learning objective. */
  objective: string;
  /** Short scenario intro shown above the workspace. */
  intro: string;
  /** Minimum score (0..100) to count as passed. */
  passScore: number;
  conceptCards: ConceptCard[];
  /** Render into ctx.root. Returns a cleanup function. */
  mount: (ctx: ChallengeContext) => () => void;
}

/** Helper for challenge UIs: tiny element builder. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** Clamp and round a 0..100 score. */
export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
