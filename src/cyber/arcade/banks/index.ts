import type { Topic } from '../../types';
import type { Bank, BankCard, BankSource } from '../types';
import { investigation, phishing, passwords, network, firewall } from './bankA';
import { incident, crypto, forensics, malware, soc } from './bankB';
import { pentest, webapp, cloud, ransomware, iot } from './bankC';
import { awareness, ai, securecode, privacy, threatintel } from './bankD';
import { escape, risk, payments, web3, resilience, competition } from './bankE';

// Bank registry: 26 authored domain banks plus 5 composed banks for the
// mixed-name categories (short names, enterprise labs, missions, style, creative).

const DOMAIN: { src: BankSource; topic: Topic }[] = [
  { src: investigation, topic: 'forensics' },
  { src: phishing, topic: 'phishing' },
  { src: passwords, topic: 'identity' },
  { src: network, topic: 'networking' },
  { src: firewall, topic: 'firewall' },
  { src: incident, topic: 'incident' },
  { src: crypto, topic: 'crypto' },
  { src: forensics, topic: 'forensics' },
  { src: malware, topic: 'malware' },
  { src: soc, topic: 'incident' },
  { src: pentest, topic: 'networking' },
  { src: webapp, topic: 'firewall' },
  { src: cloud, topic: 'firewall' },
  { src: ransomware, topic: 'incident' },
  { src: iot, topic: 'wireless' },
  { src: awareness, topic: 'social' },
  { src: ai, topic: 'social' },
  { src: securecode, topic: 'malware' },
  { src: privacy, topic: 'identity' },
  { src: threatintel, topic: 'malware' },
  { src: escape, topic: 'crypto' },
  { src: risk, topic: 'firewall' },
  { src: payments, topic: 'phishing' },
  { src: web3, topic: 'crypto' },
  { src: resilience, topic: 'incident' },
  { src: competition, topic: 'networking' },
];

function normalize(src: BankSource, topic: Topic): Bank {
  return {
    id: src.id,
    topic,
    card: src.card,
    classify: src.classify.map(([text, suspicious, why]) => ({ text, suspicious, why })),
    pairs: src.pairs.map(([term, definition]) => ({ term, definition })),
    order: src.order,
    configs: src.configs.map(([setting, insecure, secure, why]) => ({ setting, insecure, secure, why })),
    quiz: src.quiz.map(([situation, options, correct, why]) => ({ situation, options, correct, why })),
    triage: src.triage.map(([text, priority, why]) => ({ text, priority, why })),
    spot: src.spot,
    words: src.words,
  };
}

const COMPOSED: { id: string; topic: Topic; card: BankCard; includes: string[] }[] = [
  {
    id: 'short', topic: 'networking', includes: ['investigation', 'network', 'soc', 'crypto', 'malware', 'escape'],
    card: { title: 'Rapid-fire defense skills', definition: 'Short, fast challenges mixing detection, decoding and triage.', whyItMatters: 'Real analysts switch contexts constantly; quick recognition saves time.', example: 'Spot a beacon, decode a Base64 clue, then rank three alerts — in two minutes.', bestPractice: 'Learn the common patterns so rare ones stand out.' },
  },
  {
    id: 'enterprise', topic: 'incident', includes: ['soc', 'incident', 'cloud', 'risk', 'threatintel', 'forensics'],
    card: { title: 'Enterprise security programs', definition: 'Coordinated people, processes and tools that protect a whole organization.', whyItMatters: 'Large environments fail at the seams between teams and tools.', example: 'SOC, cloud and risk teams share one incident playbook and asset inventory.', bestPractice: 'Standardize processes, measure them, and run joint exercises.' },
  },
  {
    id: 'missions', topic: 'incident', includes: ['incident', 'phishing', 'network', 'crypto', 'ransomware', 'iot'],
    card: { title: 'Mission-based operations', definition: 'Goal-focused operations with clear objectives, timelines and success criteria.', whyItMatters: 'Clear objectives keep a response focused under pressure.', example: 'Operation Safe Harbor: contain, recover and report within the shift.', bestPractice: 'Define the objective and the "done" criteria before you start.' },
  },
  {
    id: 'style', topic: 'forensics', includes: ['forensics', 'network', 'passwords', 'firewall', 'threatintel', 'cloud'],
    card: { title: 'Core analyst disciplines', definition: 'The day-to-day practices: analysis, auditing, hardening and monitoring.', whyItMatters: 'Fundamentals stop most attacks long before advanced techniques are needed.', example: 'Log correlation reveals a credential-stuffing burst that firewall tuning then blocks.', bestPractice: 'Practice fundamentals regularly; automate the repetitive parts.' },
  },
  {
    id: 'creative', topic: 'malware', includes: ['escape', 'malware', 'crypto', 'incident', 'network', 'privacy'],
    card: { title: 'Story-driven cyber mysteries', definition: 'Narrative challenges where clues are spread across artifacts.', whyItMatters: 'Stories help you remember patterns you\'ll see in real incidents.', example: 'The Ghost Login: an account that "never logs in" shows up in VPN logs at 3 AM.', bestPractice: 'Treat every narrative clue as evidence to verify, not a fact.' },
  },
];

const BANKS = new Map<string, Bank>();
for (const d of DOMAIN) BANKS.set(d.src.id, normalize(d.src, d.topic));

function merge(id: string, topic: Topic, card: BankCard, includes: string[]): Bank {
  const parts = includes.map((i) => BANKS.get(i)).filter((b): b is Bank => !!b);
  return {
    id, topic, card,
    classify: parts.flatMap((b) => b.classify),
    pairs: parts.flatMap((b) => b.pairs),
    order: parts.flatMap((b) => b.order),
    configs: parts.flatMap((b) => b.configs),
    quiz: parts.flatMap((b) => b.quiz),
    triage: parts.flatMap((b) => b.triage),
    spot: parts.flatMap((b) => b.spot),
    words: parts.flatMap((b) => b.words),
  };
}
for (const c of COMPOSED) BANKS.set(c.id, merge(c.id, c.topic, c.card, c.includes));

export const DOMAIN_BANK_IDS = DOMAIN.map((d) => d.src.id);
export const COMPOSED_BANK_IDS = COMPOSED.map((c) => c.id);

export function getBank(id: string): Bank {
  const b = BANKS.get(id);
  if (!b) throw new Error(`Unknown arcade bank "${id}"`);
  return b;
}

export function allBanks(): Bank[] {
  return [...BANKS.values()];
}

/** Banks to fill a round from when the main bank runs short: same topic first, then the rest. */
export function relatedBanks(id: string): Bank[] {
  const main = getBank(id);
  const domain = DOMAIN_BANK_IDS.map((i) => getBank(i)).filter((b) => b.id !== id);
  const same = domain.filter((b) => b.topic === main.topic);
  const other = domain.filter((b) => b.topic !== main.topic);
  return [...same, ...other];
}

/** Total authored items in a bank (used by tests and the board). */
export function bankItemCount(b: Bank): number {
  return b.classify.length + b.pairs.length + b.order.length + b.configs.length + b.quiz.length + b.triage.length + b.spot.length;
}
