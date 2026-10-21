// Pure, DOM-free logic for "Digital Footprints" (Dr. Okafor's forensics lab).
// All artifacts are fictional. Local time in Neon Bay is UTC-5.

import { clampScore, type ScoreLine } from '../../types';

export const LOCAL_OFFSET_HOURS = -5;

export interface Artifact {
  id: string;
  source: string;
  title: string;
  raw: string;
  /** Timestamp as written in the log, 'YYYY-MM-DD HH:MM:SS'. */
  timestamp: string;
  /** Offset of that timestamp from UTC in hours (0 = UTC, -5 = Neon Bay local). */
  utcOffsetHours: number;
  relevant: boolean;
  explanation: string;
}

/** Convert a log timestamp with known UTC offset into epoch milliseconds (UTC). */
export function toUtcMillis(timestamp: string, utcOffsetHours: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(timestamp.trim());
  if (!m) throw new Error(`Bad timestamp: ${timestamp}`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  // Local = UTC + offset  →  UTC = local − offset
  return Date.UTC(y, mo - 1, d, h, mi, s) - utcOffsetHours * 3600_000;
}

/** Render epoch ms as Neon Bay local time 'HH:MM:SS'. */
export function formatLocal(ms: number): string {
  const d = new Date(ms + LOCAL_OFFSET_HOURS * 3600_000);
  return d.toISOString().slice(11, 19);
}

export const ARTIFACTS: Artifact[] = [
  {
    id: 'av-update', source: 'Endpoint AV', title: 'Antivirus definition update',
    raw: '2026-10-14 08:30:02  [AV] Definitions updated to 2026.10.14.01 (scheduled task)',
    timestamp: '2026-10-14 08:30:02', utcOffsetHours: -5, relevant: false,
    explanation: 'Red herring: a routine scheduled update that happens every morning on every machine.',
  },
  {
    id: 'mail-gw', source: 'Email gateway (UTC)', title: 'Suspicious invoice delivered',
    raw: '2026-10-14 14:02:11Z  DELIVER from=billing@palmetto-bank-secure.nb to=j.morales@palmettobank.nb att=Invoice_Q3.zip spf=fail',
    timestamp: '2026-10-14 14:02:11', utcOffsetHours: 0, relevant: true,
    explanation: 'Initial access: a look-alike domain (palmetto-bank-secure.nb) with a failed SPF check delivered a zipped attachment. 14:02 UTC = 09:02 local — the first event.',
  },
  {
    id: 'file-meta', source: 'File system metadata', title: 'Script dropped in Downloads',
    raw: 'C:\\Users\\j.morales\\Downloads\\Invoice_Q3.js  created 2026-10-14 09:05:40  size 18 KB',
    timestamp: '2026-10-14 09:05:40', utcOffsetHours: -5, relevant: true,
    explanation: 'The zip contained a JavaScript file disguised as an invoice — extracted three minutes after delivery.',
  },
  {
    id: 'proc', source: 'Process creation (Sysmon-style)', title: 'Script launched PowerShell',
    raw: '2026-10-14 09:05:52  ProcessCreate parent=wscript.exe child=powershell.exe -nop -w hidden … (truncated) user=PALMETTO\\j.morales',
    timestamp: '2026-10-14 09:05:52', utcOffsetHours: -5, relevant: true,
    explanation: 'Execution: wscript running the .js spawned a hidden PowerShell — a classic loader pattern. Twelve seconds after the file appeared.',
  },
  {
    id: 'win-update', source: 'Windows Update', title: 'Patch reboot scheduled',
    raw: '2026-10-14 10:00:00  [WU] Cumulative update staged, reboot scheduled for 23:00',
    timestamp: '2026-10-14 10:00:00', utcOffsetHours: -5, relevant: false,
    explanation: 'Red herring: normal patch management. Nothing malicious here — in fact, patching is good!',
  },
  {
    id: 'vpn', source: 'VPN concentrator (UTC)', title: 'VPN login from unusual IP',
    raw: '2026-10-14 15:47:30Z  VPN AUTH OK user=j.morales src=203.0.113.45 geo=unknown-offshore mfa=none',
    timestamp: '2026-10-14 15:47:30', utcOffsetHours: 0, relevant: true,
    explanation: "Credential misuse: j.morales's stolen credentials used from an external IP with no MFA. 15:47 UTC = 10:47 local.",
  },
  {
    id: 'auth', source: 'File server audit', title: 'Payroll share accessed',
    raw: '2026-10-14 10:52:14  FS01 ACCESS user=j.morales path=\\\\FS01\\Finance\\payroll_2026.xlsx op=READ src=10.20.9.200 (VPN pool)',
    timestamp: '2026-10-14 10:52:14', utcOffsetHours: -5, relevant: true,
    explanation: 'Collection: the VPN session (10.20.9.200 is the VPN pool) read the payroll spreadsheet five minutes after logging in.',
  },
  {
    id: 'hash', source: 'File hash inventory', title: 'Archive staged',
    raw: '2026-10-14 11:03:09  NEW FILE C:\\ProgramData\\pt_drop.7z sha256=9f3c…a41e size 1.7 GB',
    timestamp: '2026-10-14 11:03:09', utcOffsetHours: -5, relevant: true,
    explanation: 'Staging: data compressed into a single archive before exfiltration. Its hash lets you prove later that the copied file is identical.',
  },
  {
    id: 'netflow', source: 'Firewall netflow (UTC)', title: 'Large outbound transfer',
    raw: '2026-10-14 16:10:44Z  FLOW 10.20.4.17:51544 -> 198.51.100.23:443 bytes_out=1.8 GB duration=9m',
    timestamp: '2026-10-14 16:10:44', utcOffsetHours: 0, relevant: true,
    explanation: 'Exfiltration: 1.8 GB leaves for an unknown external host. 16:10 UTC = 11:10 local — right after the archive was created.',
  },
  {
    id: 'usb', source: 'Device log', title: 'USB drive inserted',
    raw: '2026-10-14 13:15:27  USB MOUNT vendor=SecureVault serial=SV-2231 user=PALMETTO\\k.lee ticket=IT-4471 (approved encrypted backup drive)',
    timestamp: '2026-10-14 13:15:27', utcOffsetHours: -5, relevant: false,
    explanation: 'Red herring: an IT admin used an approved, encrypted backup drive under a change ticket — two hours after the data already left.',
  },
];

export const RELEVANT_IDS = ARTIFACTS.filter((a) => a.relevant).map((a) => a.id);
export const HERRING_IDS = ARTIFACTS.filter((a) => !a.relevant).map((a) => a.id);

export function artifactById(id: string): Artifact {
  const a = ARTIFACTS.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown artifact ${id}`);
  return a;
}

/** The correct chronological order of the relevant artifacts, after normalising to UTC. */
export function correctOrder(): string[] {
  return ARTIFACTS.filter((a) => a.relevant)
    .slice()
    .sort((a, b) => toUtcMillis(a.timestamp, a.utcOffsetHours) - toUtcMillis(b.timestamp, b.utcOffsetHours))
    .map((a) => a.id);
}

/** Naive order that ignores time zones (what a rushed analyst might produce). */
export function naiveOrder(): string[] {
  return ARTIFACTS.filter((a) => a.relevant)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((a) => a.id);
}

/**
 * Fraction (0..1) of relevant-artifact pairs placed in the correct relative order.
 * A pair involving a missing relevant artifact counts as wrong.
 */
export function orderAccuracy(timeline: string[]): number {
  const truth = correctOrder();
  const pos = new Map<string, number>();
  timeline.forEach((id, i) => pos.set(id, i));
  let good = 0;
  let total = 0;
  for (let i = 0; i < truth.length; i++) {
    for (let j = i + 1; j < truth.length; j++) {
      total++;
      const pi = pos.get(truth[i]);
      const pj = pos.get(truth[j]);
      if (pi !== undefined && pj !== undefined && pi < pj) good++;
    }
  }
  return total === 0 ? 1 : good / total;
}

export type HandlingAction = 'image-hash' | 'open-original' | 'reboot' | 'email-files';
export const HANDLING_OPTIONS: { id: HandlingAction; label: string; explain: string }[] = [
  { id: 'open-original', label: 'Open the suspicious files directly on the original disk to take a quick look', explain: 'Opening files on the original changes access times and metadata — and could even run the payload. Evidence is contaminated.' },
  { id: 'image-hash', label: 'Create a forensic image with a write-blocker, hash original + image, log chain of custody', explain: 'Correct. A write-blocked image preserves the original, matching hashes prove the copy is exact, and the custody log records who handled it and when.' },
  { id: 'reboot', label: 'Reboot the workstation to clear the infection first', explain: 'Rebooting wipes volatile memory (running processes, network connections, keys) and changes the disk.' },
  { id: 'email-files', label: 'Email the logs to yourself so you can study them at home', explain: 'Moving evidence over insecure channels breaks chain of custody and may leak sensitive data.' },
];

export type Vector = 'phishing' | 'vpn-bruteforce' | 'usb' | 'insider';
export const VECTOR_OPTIONS: { id: Vector; label: string }[] = [
  { id: 'usb', label: 'Malicious USB drive' },
  { id: 'phishing', label: 'Phishing email with a script attachment' },
  { id: 'vpn-bruteforce', label: 'Brute-forced VPN password' },
  { id: 'insider', label: 'Malicious insider (IT admin)' },
];
export const ACCOUNT_OPTIONS = ['k.lee', 'j.morales', 'administrator', 'svc_backup'] as const;
export type Account = (typeof ACCOUNT_OPTIONS)[number];
export const EXFIL_OPTIONS = ['09:05 local', '10:47 local', '11:10 local', '13:15 local', '16:10 local'] as const;
export type ExfilTime = (typeof EXFIL_OPTIONS)[number];

export interface ForensicsAnswers {
  handling: HandlingAction | null;
  timeline: string[];
  vector: Vector | null;
  account: Account | null;
  exfil: ExfilTime | null;
  hintPenalty: number;
}

export interface ForensicsEvaluation {
  score: number;
  breakdown: ScoreLine[];
  mistakes: string[];
  notes: { ok: boolean; text: string }[];
}

export function evaluateForensics(a: ForensicsAnswers): ForensicsEvaluation {
  const notes: { ok: boolean; text: string }[] = [];
  const mistakes: string[] = [];

  const handlingOk = a.handling === 'image-hash';
  const hOpt = HANDLING_OPTIONS.find((o) => o.id === a.handling);
  notes.push({ ok: handlingOk, text: hOpt ? hOpt.explain : 'No evidence-handling action chosen. Always image and hash before analysis.' });
  if (!handlingOk) mistakes.push('Evidence handling: image with a write-blocker and hash before touching anything.');

  const acc = orderAccuracy(a.timeline);
  const missing = RELEVANT_IDS.filter((id) => !a.timeline.includes(id));
  const herringsIncluded = HERRING_IDS.filter((id) => a.timeline.includes(id));
  notes.push({
    ok: acc === 1,
    text: acc === 1
      ? 'Timeline perfect. You normalised the UTC logs (email gateway, VPN, netflow) to local time (UTC−5) before ordering.'
      : `Timeline ${Math.round(acc * 100)}% in correct order. Remember: logs ending in "Z" are UTC — subtract 5 hours for Neon Bay time. Correct order: ${correctOrder().map((id) => artifactById(id).title).join(' → ')}.`,
  });
  if (missing.length) mistakes.push(`Timeline missing: ${missing.map((id) => artifactById(id).title).join(', ')}.`);
  if (acc < 1) mistakes.push('Timeline order wrong — normalise time zones before sorting.');
  notes.push({
    ok: herringsIncluded.length === 0,
    text: herringsIncluded.length === 0
      ? 'Red herrings excluded: the AV update, the patch reboot and the approved IT backup drive are routine activity.'
      : `Included noise: ${herringsIncluded.map((id) => artifactById(id).title).join(', ')}. ${herringsIncluded.map((id) => artifactById(id).explanation).join(' ')}`,
  });
  if (herringsIncluded.length) mistakes.push('Put routine activity on the attack timeline (red herrings).');

  const vectorOk = a.vector === 'phishing';
  const accountOk = a.account === 'j.morales';
  const exfilOk = a.exfil === '11:10 local';
  notes.push({ ok: vectorOk, text: vectorOk ? 'Initial access: phishing email with Invoice_Q3.zip → .js script.' : 'Initial access was the phishing email (SPF fail, look-alike domain), not USB or brute force — the VPN login used already-stolen credentials and succeeded on the first try.' });
  notes.push({ ok: accountOk, text: accountOk ? 'Compromised account: j.morales (opened the attachment, then credentials reused over VPN).' : 'The compromised account is j.morales. k.lee was the IT admin with an approved backup ticket.' });
  notes.push({ ok: exfilOk, text: exfilOk ? 'Exfiltration at 11:10 local (16:10 UTC) — the 1.8 GB netflow.' : 'Exfiltration was the 1.8 GB flow at 16:10 UTC = 11:10 local. "16:10 local" forgets the time-zone conversion.' });
  if (!vectorOk) mistakes.push('Misidentified the initial access vector.');
  if (!accountOk) mistakes.push('Misidentified the compromised account.');
  if (!exfilOk) mistakes.push('Wrong exfiltration time (convert UTC to local).');

  const breakdown: ScoreLine[] = [
    { label: 'Evidence handling & chain of custody', value: handlingOk ? 20 : 0, max: 20 },
    { label: 'Timeline order (pairwise)', value: Math.round(acc * 40), max: 40 },
    { label: 'Red herrings excluded', value: (HERRING_IDS.length - herringsIncluded.length) * 5, max: HERRING_IDS.length * 5 },
    { label: 'Conclusions', value: (vectorOk ? 9 : 0) + (accountOk ? 8 : 0) + (exfilOk ? 8 : 0), max: 25 },
  ];
  if (a.hintPenalty > 0) breakdown.push({ label: 'Paid hints', value: -a.hintPenalty, max: 0 });
  return { score: clampScore(breakdown.reduce((s, b) => s + b.value, 0)), breakdown, mistakes, notes };
}
