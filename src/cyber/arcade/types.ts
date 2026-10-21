import type { Topic } from '../types';

// Content-bank and round types for the Cyber Arcade. Everything here is
// DOM-free so the logic can be unit-tested in node.

export type MechanicId = 'classify' | 'spot' | 'order' | 'match' | 'configure' | 'decode' | 'triage' | 'quiz-scenario';

export const MECHANICS: { id: MechanicId; label: string; icon: string; verb: string }[] = [
  { id: 'classify', label: 'Classify', icon: '🔍', verb: 'Sort each item as safe or suspicious' },
  { id: 'spot', label: 'Spot the Flags', icon: '🚩', verb: 'Tag every real red flag in the evidence (and skip the decoys)' },
  { id: 'order', label: 'Sequence', icon: '🧭', verb: 'Put the steps in the right order' },
  { id: 'match', label: 'Match-Up', icon: '🧩', verb: 'Match each term to its meaning' },
  { id: 'configure', label: 'Harden', icon: '🛠️', verb: 'Pick the secure setting for each control' },
  { id: 'decode', label: 'Decode', icon: '🔐', verb: 'Identify each encoding/cipher and recover the plaintext' },
  { id: 'triage', label: 'Triage', icon: '🚨', verb: 'Assign each alert the right priority' },
  { id: 'quiz-scenario', label: 'Scenario', icon: '🎬', verb: 'Choose the best response to each scenario' },
];

export interface ClassifyItem { text: string; suspicious: boolean; why: string }
export interface ConceptPair { term: string; definition: string }
export interface OrderSet { title: string; steps: string[]; why: string }
export interface ConfigItem { setting: string; insecure: string; secure: string; why: string }
export interface QuizItem { situation: string; options: string[]; correct: number; why: string }
/** Priority 1 = critical … 4 = benign / false positive. */
export interface TriageAlert { text: string; priority: 1 | 2 | 3 | 4; why: string }
export interface SpotArtifact {
  title: string;
  fields: [string, string][];
  flags: [string, string][];
  decoys: [string, string][];
}
export interface BankCard { title: string; definition: string; whyItMatters: string; example: string; bestPractice: string }

/** One content bank per catalog category. Compact tuple form for authoring. */
export interface BankSource {
  id: string;
  card: BankCard;
  classify: [string, boolean, string][];
  pairs: [string, string][];
  order: OrderSet[];
  configs: [string, string, string, string][];
  quiz: [string, string[], number, string][];
  triage: [string, 1 | 2 | 3 | 4, string][];
  spot: SpotArtifact[];
  /** Short words used to generate decode puzzles. */
  words: string[];
}

export interface Bank {
  id: string;
  topic: Topic;
  card: BankCard;
  classify: ClassifyItem[];
  pairs: ConceptPair[];
  order: OrderSet[];
  configs: ConfigItem[];
  quiz: QuizItem[];
  triage: TriageAlert[];
  spot: SpotArtifact[];
  words: string[];
}

// ---------- rounds ----------

export interface RoundItemResult { key: string; label: string; correct: boolean; partial?: boolean; why: string; expected: string }

export interface ClassifyRound { kind: 'classify'; items: { key: string; text: string; suspicious: boolean; why: string }[] }
export interface SpotRound {
  kind: 'spot';
  artifact: { title: string; fields: [string, string][] };
  chips: { key: string; text: string; isFlag: boolean; why: string }[];
}
export interface OrderRound { kind: 'order'; title: string; steps: { key: string; text: string }[]; correct: string[]; why: string }
export interface MatchRound { kind: 'match'; terms: { key: string; term: string; answer: string }[]; definitions: { key: string; text: string }[]; whyByTerm: Record<string, string> }
export interface ConfigureRound { kind: 'configure'; items: { key: string; setting: string; options: string[]; secure: string; why: string }[] }
export type DecodeMethod = 'base64' | 'hex' | 'caesar' | 'reverse' | 'vigenere';
export interface DecodeRound {
  kind: 'decode';
  items: { key: string; cipher: string; method: DecodeMethod; plaintext: string; hint: string; shift?: number; keyword?: string }[];
}
export interface TriageRound { kind: 'triage'; alerts: { key: string; text: string; priority: 1 | 2 | 3 | 4; why: string }[] }
export interface QuizRound { kind: 'quiz-scenario'; items: { key: string; situation: string; options: string[]; correct: number; why: string }[] }

export type Round = ClassifyRound | SpotRound | OrderRound | MatchRound | ConfigureRound | DecodeRound | TriageRound | QuizRound;

/**
 * Player answers, uniform across mechanics (string map):
 * classify: key → 'safe'|'suspicious'; spot: chipKey → 'flag';
 * order: 'order' → keys joined by '|'; match: termKey → definitionKey;
 * configure: key → chosen option text; decode: `${key}:method`, `${key}:text`;
 * triage: key → '1'..'4'; quiz: key → option index.
 */
export type Answers = Record<string, string>;

export interface RoundScore {
  score: number;
  breakdown: { label: string; value: number; max: number }[];
  items: RoundItemResult[];
}
