import type { Topic } from '../types';
import type { MechanicId } from './types';
import { RAW_CATALOG } from './catalogData';
import { hashString, slugify } from './rng';

// Turns the player-supplied name list into arcade categories and entries.
// Each entry is a seeded variation of a shared mechanic over a content bank.

export interface ArcadeCategory {
  id: string;
  title: string;
  blurb: string;
  topic: Topic;
  icon: string;
  color: string;
  /** Content bank used by entries of this category. */
  bank: string;
  /** Mixed-name categories route each entry to a domain bank by keywords. */
  routeByKeyword: boolean;
}

export interface ArcadeEntry {
  id: string;
  name: string;
  categoryIds: string[];
  mechanic: MechanicId;
  difficulty: 1 | 2 | 3;
  seed: number;
  bank: string;
}

type Meta = Omit<ArcadeCategory, 'title'>;

// Same order as the headings in RAW_CATALOG.
const META: Meta[] = [
  { id: 'investigation', bank: 'investigation', topic: 'forensics', icon: '🕵️', color: '#19e6ff', routeByKeyword: false, blurb: 'Follow the evidence: logs, logins and clues that reveal an intruder.' },
  { id: 'phishing', bank: 'phishing', topic: 'phishing', icon: '🎣', color: '#ff2fa0', routeByKeyword: false, blurb: 'Spot lures, spoofs and scams across email, text, voice and QR codes.' },
  { id: 'passwords', bank: 'passwords', topic: 'identity', icon: '🔑', color: '#ffd23f', routeByKeyword: false, blurb: 'Passwords, MFA, hashing, sessions and account recovery done right.' },
  { id: 'network', bank: 'network', topic: 'networking', icon: '📡', color: '#3dffb0', routeByKeyword: false, blurb: 'Read the wire: ports, protocols, beacons and anomalies.' },
  { id: 'firewall', bank: 'firewall', topic: 'firewall', icon: '🧱', color: '#ff8a3d', routeByKeyword: false, blurb: 'Rules, zones and least privilege at the network edge.' },
  { id: 'incident', bank: 'incident', topic: 'incident', icon: '🚒', color: '#ff4d6d', routeByKeyword: false, blurb: 'Contain, eradicate, recover — in the right order, under pressure.' },
  { id: 'crypto', bank: 'crypto', topic: 'crypto', icon: '🔐', color: '#b14dff', routeByKeyword: false, blurb: 'Encoding vs encryption vs hashing, keys, signatures and ciphers.' },
  { id: 'forensics', bank: 'forensics', topic: 'forensics', icon: '🧪', color: '#8ff4ff', routeByKeyword: false, blurb: 'Preserve, image, hash and rebuild the timeline.' },
  { id: 'malware', bank: 'malware', topic: 'malware', icon: '🦠', color: '#7dff6a', routeByKeyword: false, blurb: 'Triage inert samples, process trees, persistence and IOCs — safely.' },
  { id: 'soc', bank: 'soc', topic: 'incident', icon: '🖥️', color: '#19c3d6', routeByKeyword: false, blurb: 'SIEM, alert triage and detection engineering on the night shift.' },
  { id: 'pentest', bank: 'pentest', topic: 'networking', icon: '🎯', color: '#ff7cc6', routeByKeyword: false, blurb: 'Authorized, scoped testing — find it, report it, fix it.' },
  { id: 'webapp', bank: 'webapp', topic: 'firewall', icon: '🌐', color: '#a0e7ff', routeByKeyword: false, blurb: 'OWASP-style flaws: injection, XSS, access control, headers and cookies.' },
  { id: 'cloud', bank: 'cloud', topic: 'firewall', icon: '☁️', color: '#9fd8ff', routeByKeyword: false, blurb: 'IAM, buckets, containers, secrets and secure pipelines.' },
  { id: 'ransomware', bank: 'ransomware', topic: 'incident', icon: '💾', color: '#ffb347', routeByKeyword: false, blurb: 'Backups that survive, data classification and leak prevention.' },
  { id: 'iot', bank: 'iot', topic: 'wireless', icon: '📶', color: '#3dffb0', routeByKeyword: false, blurb: 'Wi-Fi, Bluetooth, firmware and the device fleet.' },
  { id: 'awareness', bank: 'awareness', topic: 'social', icon: '🧠', color: '#ffd23f', routeByKeyword: false, blurb: 'Everyday habits of the human firewall.' },
  { id: 'ai', bank: 'ai', topic: 'social', icon: '🤖', color: '#c8b6ff', routeByKeyword: false, blurb: 'Prompt injection, deepfakes, poisoning and safe AI agents.' },
  { id: 'securecode', bank: 'securecode', topic: 'malware', icon: '💻', color: '#7fe0e6', routeByKeyword: false, blurb: 'Secure coding, code review and dependency hygiene.' },
  { id: 'privacy', bank: 'privacy', topic: 'identity', icon: '🛡️', color: '#ff9ef0', routeByKeyword: false, blurb: 'Personal data, consent, metadata and trackers.' },
  { id: 'threatintel', bank: 'threatintel', topic: 'malware', icon: '🗺️', color: '#ff8a3d', routeByKeyword: false, blurb: 'TTPs, MITRE ATT&CK, the kill chain and evidence-based attribution.' },
  { id: 'escape', bank: 'escape', topic: 'crypto', icon: '🗝️', color: '#ff2fa0', routeByKeyword: false, blurb: 'Locked terminals and vaults: peel the clues layer by layer.' },
  { id: 'risk', bank: 'risk', topic: 'firewall', icon: '📐', color: '#9fefff', routeByKeyword: false, blurb: 'Risk, threat models, trust boundaries and governance.' },
  { id: 'payments', bank: 'payments', topic: 'phishing', icon: '💳', color: '#7dff6a', routeByKeyword: false, blurb: 'Invoice fraud, account takeover, card testing and safe payments.' },
  { id: 'web3', bank: 'web3', topic: 'crypto', icon: '⛓️', color: '#ffd23f', routeByKeyword: false, blurb: 'Wallets, seed phrases, approvals and smart-contract bugs.' },
  { id: 'resilience', bank: 'resilience', topic: 'incident', icon: '🔁', color: '#19e6ff', routeByKeyword: false, blurb: 'RTO, RPO, failover and recovery drills.' },
  { id: 'competition', bank: 'competition', topic: 'networking', icon: '🏆', color: '#ffd23f', routeByKeyword: true, blurb: 'CTF and arena modes — solo practice versions of competition formats.' },
  { id: 'short', bank: 'short', topic: 'networking', icon: '⚡', color: '#ff2fa0', routeByKeyword: true, blurb: 'Quick, punchy rounds drawn from every discipline.' },
  { id: 'enterprise', bank: 'enterprise', topic: 'incident', icon: '🏢', color: '#a6b8ff', routeByKeyword: true, blurb: 'Professional lab formats across the enterprise security program.' },
  { id: 'missions', bank: 'missions', topic: 'incident', icon: '🎬', color: '#ff8a3d', routeByKeyword: true, blurb: 'Operations and projects with a clear objective.' },
  { id: 'style', bank: 'style', topic: 'forensics', icon: '📋', color: '#8ff4ff', routeByKeyword: true, blurb: 'Core analyst skills: concept + action.' },
  { id: 'creative', bank: 'creative', topic: 'malware', icon: '🌙', color: '#b14dff', routeByKeyword: true, blurb: 'Cyber mysteries with a story twist.' },
];

// Keyword routing for mixed categories (checked in order).
const ROUTES: [RegExp, string][] = [
  [/phish|scam|email|inbox|spoof|lure|bait/i, 'phishing'],
  [/fraud|payment|transaction|invoice|heist|money/i, 'payments'],
  [/wallet|blockchain|ledger|web3|smart contract/i, 'web3'],
  [/\bai\b|deepfake|prompt|model|llm/i, 'ai'],
  [/ransomware|backup|recovery|restore|data|leak|exfiltration/i, 'ransomware'],
  [/resilien|continuity|failover|outage|availability|keep running/i, 'resilience'],
  [/cipher|crypt|code ?break|decode|encrypt|hash|key|certificate/i, 'crypto'],
  [/password|credential|login|identity|auth|session|access|trust/i, 'passwords'],
  [/forensic|evidence|disk|memory|artifact|reconstruct/i, 'forensics'],
  [/malware|trojan|payload|virus|process|backdoor|beacon|outbreak/i, 'malware'],
  [/soc\b|siem|alert|detection|monitor|log|telemetry|sentinel|watch|lens|scope|analytics|false positive|signal/i, 'soc'],
  [/firewall|perimeter|gateway|harden|boundary|infrastructure|endpoint|segment|armor|grid|lock ?down/i, 'firewall'],
  [/cloud|container|pipeline|deploy|automation|devsecops/i, 'cloud'],
  [/web|http|api|application|app\b|checkout/i, 'webapp'],
  [/code|coding|commit|bug|patch|secure dev/i, 'securecode'],
  [/packet|network|traffic|dns|protocol|net|trace|recon/i, 'network'],
  [/wireless|wi-?fi|iot|device|bluetooth|firmware|hardware|rogue device/i, 'iot'],
  [/privacy|persona|anonymous|tracker/i, 'privacy'],
  [/threat|intel|ttp|adversary|attribution|campaign|attack|actor|hunt/i, 'threatintel'],
  [/risk|compliance|governance|architect|blueprint|polic|control|audit|validation|assessment|engineering/i, 'risk'],
  [/pentest|red team|blue team|purple|exploit|vulnerab|bug bounty|testing/i, 'pentest'],
  [/incident|breach|response|contain|crisis|war room|rescue/i, 'incident'],
  [/escape|maze|labyrinth|locked|vault|room|puzzle|mystery|clue|secret|hidden|phantom|ghost|shadow|paradox/i, 'escape'],
  [/ctf|flag|arena|league|cup|tournament|championship|showdown|olympics|sprint|gauntlet|race|battle|duel|masters/i, 'competition'],
];

// Mechanic keywords (checked in order); detective-style names alternate by seed.
function chooseMechanic(name: string, seed: number): MechanicId {
  const n = name.toLowerCase();
  if (/\bor\b|\bvs\.?\b|bait|legit|real\?|safe or|signal vs/.test(n)) return 'classify';
  if (/cipher|crypt|code ?break|decode|decrypt|encrypt|hash|vigen|caesar|\brsa\b|\baes\b|secret message|codeword|cryptogram|keyspace|signal lock|encoding/.test(n)) return 'decode';
  if (/triage|alert|prioriti|escalat|overload|fatigue|noise|dashboard|matrix|countdown|critical|metrics|scorecard/.test(n)) return 'triage';
  if (/command|response|recover|restore|timeline|playbook|sequence|chain|path|roadmap|drill|first 15|contain|reconstruct|rebuild|failover|continuity|kill chain|mission:|operation|rescue|release|narrative/.test(n)) return 'order';
  if (/architect|builder|designer|harden|fortress|lockdown|lock down|config|policy|baseline|rule|guardian|protector|shield|defender|secure the|engineer|tuning|armor|keeper|boundary|gatekeeper/.test(n)) return 'configure';
  if (/inspector|spotter|finder|radar|analy[sz]|auditor|audit|scanner|reviewer|review|smell/.test(n)) return 'spot';
  if (/detective|hunter|hunt|investigat|sleuth|tracker|trail|trace|watch|forensic|evidence|suspicious|clue|spot/.test(n)) return seed % 3 === 0 ? 'spot' : 'classify';
  if (/match|pattern|fingerprint|correlat|map|explorer|navigator|academy|101|vocab|terms/.test(n)) return 'match';
  if (/quest|lab|workshop|workbench|center|simulator|challenge|room|arena|league|cup|mission|project|tournament/.test(n)) return seed % 2 === 0 ? 'quiz-scenario' : 'match';
  const fallback: MechanicId[] = ['quiz-scenario', 'classify', 'match', 'spot'];
  return fallback[seed % fallback.length];
}

function chooseDifficulty(name: string, seed: number): 1 | 2 | 3 {
  const n = name.toLowerCase();
  if (/master|\bpro\b|ultimate|gauntlet|championship|elite|under pressure|zero-day|expert|mastermind|tournament|cup/.test(n)) return 3;
  if (/lab|academy|101|basics|playground|quest/.test(n)) return 1;
  return ((seed % 3) + 1) as 1 | 2 | 3;
}

function parse(): { categories: ArcadeCategory[]; entries: ArcadeEntry[]; namesInOrder: string[] } {
  const categories: ArcadeCategory[] = [];
  const entries = new Map<string, ArcadeEntry>();
  const names: string[] = [];
  let cat: ArcadeCategory | null = null;
  for (const raw of RAW_CATALOG.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) {
      const meta = META[categories.length];
      if (!meta) throw new Error(`No metadata for category "${line}"`);
      cat = { ...meta, title: line.slice(3).trim() };
      categories.push(cat);
      continue;
    }
    if (!cat) continue;
    names.push(line);
    let id = slugify(line);
    const existing = entries.get(id);
    if (existing && existing.name !== line) id = `${id}-${hashString(line).toString(36).slice(0, 4)}`;
    const hit = entries.get(id);
    if (hit) {
      if (!hit.categoryIds.includes(cat.id)) hit.categoryIds.push(cat.id);
      continue;
    }
    const seed = hashString(id);
    let bank = cat.bank;
    if (cat.routeByKeyword) {
      const route = ROUTES.find(([re]) => re.test(line));
      if (route) bank = route[1];
    }
    entries.set(id, {
      id, name: line, categoryIds: [cat.id],
      mechanic: chooseMechanic(line, seed),
      difficulty: chooseDifficulty(line, seed),
      seed, bank,
    });
  }
  return { categories, entries: [...entries.values()], namesInOrder: names };
}

const parsed = parse();

export const ARCADE_CATEGORIES: ArcadeCategory[] = parsed.categories;
export const ARCADE_ENTRIES: ArcadeEntry[] = parsed.entries;
/** Every listed name in the original order, duplicates included (for auditing). */
export const ARCADE_NAMES_RAW: string[] = parsed.namesInOrder;

const entryById = new Map(ARCADE_ENTRIES.map((e) => [e.id, e]));
const categoryById = new Map(ARCADE_CATEGORIES.map((c) => [c.id, c]));

export function getEntry(id: string): ArcadeEntry | undefined {
  return entryById.get(id);
}

export function getCategory(id: string): ArcadeCategory | undefined {
  return categoryById.get(id);
}

export function entriesIn(categoryId: string): ArcadeEntry[] {
  return ARCADE_ENTRIES.filter((e) => e.categoryIds.includes(categoryId));
}
