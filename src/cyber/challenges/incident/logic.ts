// "The Final Incident" — a fictional, inert ransomware outbreak at Palmetto Bank.
// Three phases: alert triage, response playbook ordering, incident report.

import { clampScore, type ScoreLine } from '../../types';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface SiemAlert {
  id: string;
  time: string;
  severity: Severity;
  title: string;
  host: string;
  detail: string;
  falsePositive: boolean;
  /** Ideal priority among real alerts (1 = handle first). FPs have 0. */
  idealRank: number;
  explain: string;
}

export const ALERTS: SiemAlert[] = [
  {
    id: 'al-vpn', time: '01:42', severity: 'high', host: 'VPN-GW',
    title: 'VPN login for j.ortiz from new country, no MFA challenge',
    detail: 'Successful login from 203.0.113.140 at 01:42; j.ortiz is normally in Neon Bay office hours only.',
    falsePositive: false, idealRank: 4,
    explain: 'This is the entry point — important for the root cause, but the attacker is already inside, so stopping active damage comes first.',
  },
  {
    id: 'al-backup', time: '02:00', severity: 'medium', host: 'BKP-01',
    title: 'High CPU on BKP-01 (98% for 40 min)',
    detail: 'Process: palmetto-backup.exe (signed). Scheduled task "Nightly Backup" runs 02:00–02:45 every night.',
    falsePositive: true, idealRank: 0,
    explain: 'Benign: the signed nightly backup job always spikes CPU in this window. Recognizing normal behavior saves precious response time.',
  },
  {
    id: 'al-c2', time: '02:05', severity: 'high', host: 'WS-114',
    title: 'Outbound beacon from WS-114 to 203.0.113.66:4444',
    detail: 'Connection every 60s since 01:51. Process: svch0st.exe running from a user temp folder.',
    falsePositive: false, idealRank: 3,
    explain: 'Command-and-control from patient zero. Isolating WS-114 cuts the attacker’s remote control.',
  },
  {
    id: 'al-shadow', time: '02:21', severity: 'critical', host: 'FS-02',
    title: 'Volume shadow copies deleted on FS-02',
    detail: 'vssadmin delete shadows /all /quiet executed by account j.ortiz.',
    falsePositive: false, idealRank: 2,
    explain: 'Ransomware deletes local recovery points right before encrypting. This is the last warning before the blast.',
  },
  {
    id: 'al-typo', time: '02:24', severity: 'low', host: 'AD-01',
    title: 'Failed login for m.lee (1 attempt), then success',
    detail: 'Single failure followed by success from the same office IP 10.30.4.22, during the night-shift roster.',
    falsePositive: true, idealRank: 0,
    explain: 'Benign: one typo then a correct password from the usual workstation is ordinary user behavior, not an attack.',
  },
  {
    id: 'al-encrypt', time: '02:27', severity: 'critical', host: 'FS-02',
    title: 'Mass file renames to *.flamingo on FS-02 (12,000 files/min)',
    detail: 'Files on \\\\FS-02\\loans being rewritten and renamed. Ransom note README_PINK_TIDE.txt dropped.',
    falsePositive: false, idealRank: 1,
    explain: 'Active encryption is destroying data right now — the top priority. Every minute counts.',
  },
];

export interface PlaybookCard {
  id: string;
  title: string;
  phase: string;
  /** 0 = distractor; otherwise position in the ideal sequence (1-based). */
  order: number;
  explain: string;
}

export const PLAYBOOK: PlaybookCard[] = [
  { id: 'preserve', title: 'Capture memory & logs from affected hosts', phase: 'Identification / evidence', order: 1,
    explain: 'Volatile evidence (running processes, network connections, encryption keys in RAM) disappears on shutdown. Capture it while the hosts are still powered on.' },
  { id: 'isolate', title: 'Isolate WS-114 and FS-02 from the network (keep powered on)', phase: 'Containment', order: 2,
    explain: 'Network isolation stops spread and C2 without destroying evidence. Evidence capture and isolation happen together, as fast as possible.' },
  { id: 'disable', title: 'Disable j.ortiz, revoke sessions, reset credentials', phase: 'Containment', order: 3,
    explain: 'The attacker is using stolen credentials. Lock the account and kill active sessions so they cannot simply log back in.' },
  { id: 'eradicate', title: 'Remove persistence & reimage infected machines', phase: 'Eradication', order: 4,
    explain: 'Delete the scheduled tasks/services the malware planted, then rebuild from a known-good image — cleaning in place is unreliable.' },
  { id: 'restore', title: 'Restore data from verified offline backups', phase: 'Recovery', order: 5,
    explain: 'Offline (or immutable) backups survive ransomware. Verify they are clean and complete before restoring.' },
  { id: 'verify', title: 'Monitor restored systems for re-infection', phase: 'Recovery', order: 6,
    explain: 'Watch closely for the same indicators (203.0.113.66, svch0st.exe) to confirm the threat is really gone.' },
  { id: 'lessons', title: 'Hold lessons-learned review & write report', phase: 'Post-incident', order: 7,
    explain: 'Document what happened and fix root causes (MFA on VPN!) so it does not happen again.' },
  { id: 'pay', title: 'Pay the Flamingo’s ransom in crypto', phase: '—', order: 0,
    explain: 'Paying funds criminals, does not guarantee working decryption, marks you as a repeat target and may break sanctions law. Restore from backups instead.' },
  { id: 'wipe', title: 'Wipe every server immediately', phase: '—', order: 0,
    explain: 'Wiping before collecting evidence destroys the clues you need to find the root cause and scope — and you may wipe clean systems for nothing.' },
  { id: 'social', title: 'Post about the hack on social media right away', phase: '—', order: 0,
    explain: 'External communication must follow the incident plan with leadership and legal. Premature posts leak details and cause panic.' },
  { id: 'breaker', title: 'Cut power to the whole building at the main breaker', phase: '—', order: 0,
    explain: 'Pulling power destroys volatile evidence, takes down unaffected critical services and can corrupt data. Isolate surgically instead.' },
];

export const IDEAL_SEQUENCE = PLAYBOOK.filter((c) => c.order > 0).sort((a, b) => a.order - b.order).map((c) => c.id);

/** Pairs whose relative order does not matter (done in parallel in practice). */
const INTERCHANGEABLE = new Set(['preserve|isolate']);

export const ROOT_CAUSES = [
  { id: 'phish-mfa', text: 'Phished VPN credentials for j.ortiz, and the VPN did not require MFA', correct: true },
  { id: 'zero-day', text: 'An unstoppable zero-day exploit in the firewall', correct: false },
  { id: 'backup', text: 'The nightly backup job overloaded the server', correct: false },
  { id: 'insider', text: 'Intern m.lee mistyped a password', correct: false },
];

export const SYSTEMS = [
  { id: 'FS-02', text: 'FS-02 file server (encrypted)', impacted: true },
  { id: 'WS-114', text: 'WS-114 workstation (malware / C2)', impacted: true },
  { id: 'j.ortiz', text: 'j.ortiz account (compromised)', impacted: true },
  { id: 'BKP-01', text: 'BKP-01 backup server', impacted: false },
  { id: 'WEB', text: 'Public website', impacted: false },
];

export const COMMS = [
  { id: 'plan', text: 'Notify leadership, legal and compliance per the incident response plan; they handle regulators and customers', correct: true },
  { id: 'silence', text: 'Tell nobody and hope it stays quiet', correct: false },
  { id: 'press', text: 'Call the Neon Bay Herald yourself', correct: false },
];

/** Pairwise-order credit for a sequence of card ids (distractors ignored here). 0..1 */
export function orderCredit(sequence: string[]): number {
  const pos = new Map<string, number>();
  sequence.forEach((id, i) => { if (IDEAL_SEQUENCE.includes(id) && !pos.has(id)) pos.set(id, i); });
  let total = 0;
  let ok = 0;
  for (let i = 0; i < IDEAL_SEQUENCE.length; i++) {
    for (let j = i + 1; j < IDEAL_SEQUENCE.length; j++) {
      const a = IDEAL_SEQUENCE[i];
      const b = IDEAL_SEQUENCE[j];
      if (INTERCHANGEABLE.has(`${a}|${b}`)) {
        total++;
        if (pos.has(a) && pos.has(b)) ok++;
        continue;
      }
      total++;
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (pa !== undefined && pb !== undefined && pa < pb) ok++;
    }
  }
  return ok / total;
}

/** Pairwise-order credit for the alert priority list among real alerts. 0..1 */
export function triageOrderCredit(order: string[]): number {
  const real = ALERTS.filter((a) => !a.falsePositive);
  const pos = new Map(order.map((id, i) => [id, i]));
  let total = 0;
  let ok = 0;
  for (const a of real) {
    for (const b of real) {
      if (a.idealRank >= b.idealRank) continue;
      total++;
      const pa = pos.get(a.id);
      const pb = pos.get(b.id);
      if (pa !== undefined && pb !== undefined && pa < pb) ok++;
    }
  }
  return total ? ok / total : 1;
}

export interface IncidentInput {
  /** Alert ids, highest priority first (all six). */
  alertOrder: string[];
  /** Alert ids the player marked as false positive. */
  falsePositives: string[];
  /** Playbook card ids in the order the player placed them. */
  playbook: string[];
  rootCause: string | null;
  impacted: string[];
  comms: string | null;
}

export interface IncidentScore {
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  mistakes: string[];
  distractorsUsed: string[];
  fpCorrect: number;
}

/**
 * Triage 30 (FP marking 12 + priority order 18) · Playbook 45 (order credit, −12 per distractor)
 * · Report 25 (root cause 10, impacted systems 10, communication 5)
 */
export function scoreIncident(input: IncidentInput, passScore = 65): IncidentScore {
  const mistakes: string[] = [];

  let fpCorrect = 0;
  for (const a of ALERTS) {
    const marked = input.falsePositives.includes(a.id);
    if (marked === a.falsePositive) fpCorrect++;
    else mistakes.push(a.falsePositive
      ? `Treated a benign alert as an attack: ${a.title}.`
      : `Dismissed a real alert as a false positive: ${a.title}.`);
  }
  const fpPts = (12 * fpCorrect) / ALERTS.length;
  const triageOrder = triageOrderCredit(input.alertOrder);
  const orderPts = 18 * triageOrder;
  if (triageOrder < 1) mistakes.push('Alert priority was off — stop active damage (encryption) first, then the warning signs, then the entry point.');

  const distractorsUsed = input.playbook.filter((id) => PLAYBOOK.find((c) => c.id === id)?.order === 0);
  const credit = orderCredit(input.playbook);
  const playbookPts = Math.max(0, 45 * credit - 12 * distractorsUsed.length);
  for (const id of distractorsUsed) mistakes.push(`Included a harmful step: ${PLAYBOOK.find((c) => c.id === id)?.title}.`);
  const missing = IDEAL_SEQUENCE.filter((id) => !input.playbook.includes(id));
  for (const id of missing) mistakes.push(`Skipped a response step: ${PLAYBOOK.find((c) => c.id === id)?.title}.`);
  if (credit < 1 && missing.length === 0) mistakes.push('Response steps were out of order — follow identify → contain → eradicate → recover → lessons learned.');

  const rcOk = ROOT_CAUSES.find((r) => r.id === input.rootCause)?.correct ?? false;
  if (!rcOk) mistakes.push('Wrong root cause — the evidence shows phished credentials used on a VPN without MFA.');
  let sysOk = 0;
  for (const s of SYSTEMS) if (input.impacted.includes(s.id) === s.impacted) sysOk++;
  if (sysOk < SYSTEMS.length) mistakes.push('Impact scope was inaccurate — FS-02, WS-114 and j.ortiz were affected; backups and website were not.');
  const commsOk = COMMS.find((c) => c.id === input.comms)?.correct ?? false;
  if (!commsOk) mistakes.push('Communication must follow the plan: leadership, legal and compliance first.');
  const reportPts = (rcOk ? 10 : 0) + (10 * sysOk) / SYSTEMS.length + (commsOk ? 5 : 0);

  const score = clampScore(fpPts + orderPts + playbookPts + reportPts);
  return {
    score,
    passed: score >= passScore,
    breakdown: [
      { label: 'Alert triage', value: Math.round(fpPts + orderPts), max: 30 },
      { label: 'Response playbook', value: Math.round(playbookPts), max: 45 },
      { label: 'Incident report', value: Math.round(reportPts), max: 25 },
    ],
    mistakes,
    distractorsUsed,
    fpCorrect,
  };
}

export function perfectInput(): IncidentInput {
  const real = ALERTS.filter((a) => !a.falsePositive).sort((a, b) => a.idealRank - b.idealRank).map((a) => a.id);
  const fps = ALERTS.filter((a) => a.falsePositive).map((a) => a.id);
  return {
    alertOrder: [...real, ...fps],
    falsePositives: fps,
    playbook: [...IDEAL_SEQUENCE],
    rootCause: 'phish-mfa',
    impacted: SYSTEMS.filter((s) => s.impacted).map((s) => s.id),
    comms: 'plan',
  };
}

export const HINTS = [
  'Triage: ask "what is destroying data RIGHT NOW?" first. Then check the details of each alert — a signed, scheduled job doing its usual thing is not an attack.',
  'Playbook: identify & preserve → contain → eradicate → recover → learn. Anything that destroys evidence, funds criminals or leaks details does not belong.',
  'Report: the very first alert of the night tells you how they got in. Which control would have stopped a stolen password from working?',
];
