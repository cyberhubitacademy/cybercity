// SOC Night Shift — pure logic: a deterministic alert queue with enrichment
// context, hidden ground truth, and transparent triage scoring.
// All alerts, users and IPs are fictional training data.

import { clampScore, type ScoreLine } from '../../types';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Disposition = 'escalate' | 'benign' | 'false_positive' | 'needs_info';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type EnrichKind = 'ip' | 'hours' | 'asset' | 'related';

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  escalate: 'True positive → Escalate',
  benign: 'Benign true positive (expected)',
  false_positive: 'False positive → Close',
  needs_info: 'Needs more info',
};

export const ENRICH_LABELS: Record<EnrichKind, string> = {
  ip: 'Lookup IP reputation',
  hours: "Check user's normal hours",
  asset: 'Check asset criticality',
  related: 'View related alerts',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: 'P1 — critical, wake people up',
  P2: 'P2 — high, act this shift',
  P3: 'P3 — medium, next business day',
  P4: 'P4 — low, track',
};

export interface Alert {
  id: string;
  wave: 1 | 2 | 3;
  time: string;
  severity: Severity;
  source: string;
  rule: string;
  entity: string;
  count: number;
  raw: string;
  enrich: Record<EnrichKind, string>;
}

export interface Truth {
  disposition: Disposition;
  priority?: Priority;
  /** Part of the Pink Tide intrusion case. */
  incident: boolean;
  /** Enrichment is needed to decide correctly. */
  needsEnrichment: boolean;
  explain: string;
}

const NONE = 'No additional context for this entity.';

export const ALERTS: Alert[] = [
  {
    id: 'A01', wave: 1, time: '01:52', severity: 'high', source: 'EDR', rule: 'Encoded PowerShell execution', entity: 'WS-ACCT-07 / j.morales', count: 1,
    raw: 'parent=invoice_view.exe child=powershell.exe args="-nop -w hidden -enc SQBFAFgA… (inert sample)"',
    enrich: { ip: NONE, hours: 'j.morales normally works 08:00–17:30. Activity at 01:52 is unusual.', asset: 'WS-ACCT-07: accounts-payable workstation, access to payment systems (HIGH).', related: 'Same host: A04 (DNS), A08 (scheduled task), A09 (large upload).' },
  },
  {
    id: 'A02', wave: 1, time: '01:55', severity: 'medium', source: 'Firewall', rule: 'Internal port scan', entity: '10.20.9.40 → 10.20.0.0/16', count: 1,
    raw: 'src=10.20.9.40 dst_ports=1-1024 hosts=212 window=01:00-04:00',
    enrich: { ip: '10.20.9.40 = VULN-SCAN-01, the approved vulnerability scanner.', hours: NONE, asset: 'VULN-SCAN-01: scheduled weekly scan, change ticket CHG-2207, window 01:00–04:00.', related: 'Same alert fires every Tuesday night.' },
  },
  {
    id: 'A03', wave: 1, time: '02:01', severity: 'low', source: 'Email gateway', rule: 'User-reported phishing', entity: 'k.osei — "Coral Café weekly specials"', count: 1,
    raw: 'from=news@coralcafe.nb spf=pass dkim=pass links=coralcafe.nb only attachments=none',
    enrich: { ip: 'Sender IP belongs to coralcafe.nb mail provider; clean reputation.', hours: NONE, asset: NONE, related: '214 employees received the same newsletter; no other reports.' },
  },
  {
    id: 'A07', wave: 1, time: '02:05', severity: 'medium', source: 'Monitoring', rule: 'Disk space low (BACKUP-02)', entity: 'BACKUP-02', count: 40,
    raw: 'volume=E: free=6% (deduplicated: 40 identical alerts in 30 min)',
    enrich: { ip: NONE, hours: NONE, asset: 'BACKUP-02 fills up every night during the backup job, then dedupe frees space at 04:00.', related: 'Same pattern every night this month (ops ticket OPS-118 open).' },
  },
  {
    id: 'A04', wave: 2, time: '02:40', severity: 'low', source: 'DNS', rule: 'Unusually long DNS query', entity: 'WS-ACCT-07', count: 3,
    raw: 'query=a9f3c0d1e7b24f6a8c1d.x.pinktide.nb type=TXT resolver=203.0.113.53 (external)',
    enrich: { ip: '203.0.113.53: external resolver linked to Pink Tide infrastructure (threat intel: HIGH).', hours: NONE, asset: 'WS-ACCT-07: accounts-payable workstation (HIGH).', related: 'Same host as A01 encoded PowerShell 48 minutes earlier.' },
  },
  {
    id: 'A05', wave: 2, time: '02:48', severity: 'medium', source: 'Identity provider', rule: 'MFA push fatigue', entity: 'm.vance (COO, VIP)', count: 16,
    raw: '15 MFA pushes denied, 1 approved at 02:47; login src=198.51.100.81 (VPN)',
    enrich: { ip: '198.51.100.81: not a company range; seen in Pink Tide password-spray campaigns.', hours: 'm.vance normally logs in 07:30–19:00 from the executive floor.', asset: 'VIP account with approval rights for wire transfers (CRITICAL).', related: 'No other alerts for this user tonight.' },
  },
  {
    id: 'A06', wave: 2, time: '02:51', severity: 'high', source: 'Identity provider', rule: 'Impossible travel', entity: 't.nguyen', count: 1,
    raw: 'login 1: Neon Bay 02:20; login 2: "Lisbon" 02:44 src=203.0.113.20',
    enrich: { ip: '203.0.113.20: Sunset Shield corporate VPN egress (geolocates to Lisbon).', hours: 't.nguyen is on the night support rota this week.', asset: NONE, related: 'Same rule fired for 6 other VPN users this week; all closed as VPN.' },
  },
  {
    id: 'A10', wave: 2, time: '03:00', severity: 'high', source: 'Antivirus', rule: 'EICAR test file detected', entity: 'LAB-PC-3', count: 1,
    raw: 'file=C:\\lab\\eicar.com hash=44d88612fea8a8f36de82e1278abb02f action=quarantined',
    enrich: { ip: NONE, hours: NONE, asset: 'LAB-PC-3: Sunset Shield training lab; AV validation test scheduled tonight (CHG-2210).', related: NONE },
  },
  {
    id: 'A14', wave: 2, time: '03:04', severity: 'low', source: 'Identity provider', rule: 'Login outside business hours', entity: 'd.holloway', count: 1,
    raw: 'login src=203.0.113.20 (office VPN) host=SOC-WS-01',
    enrich: { ip: '203.0.113.20: Sunset Shield office VPN egress.', hours: 'd.holloway is the SOC night-shift manager (22:00–06:00).', asset: NONE, related: NONE },
  },
  {
    id: 'A08', wave: 3, time: '03:15', severity: 'low', source: 'EDR', rule: 'New scheduled task', entity: 'WS-ACCT-07', count: 1,
    raw: 'task="SvcHostUpdater" action="C:\\Users\\Public\\svch0st.exe --silent" trigger=logon',
    enrich: { ip: NONE, hours: NONE, asset: 'WS-ACCT-07: accounts-payable workstation (HIGH).', related: 'Same host as A01 and A04 — persistence after the initial execution.' },
  },
  {
    id: 'A09', wave: 3, time: '03:22', severity: 'medium', source: 'Proxy', rule: 'Large outbound upload', entity: 'WS-ACCT-07 → 198.51.100.23', count: 1,
    raw: 'bytes_out=4.8GB dst=198.51.100.23:443 category=uncategorized',
    enrich: { ip: '198.51.100.23: newly registered, uncategorized; matches Pink Tide exfil IOC list.', hours: 'j.morales is not normally active at 03:22.', asset: 'WS-ACCT-07 holds payment and vendor data (HIGH).', related: 'Same host as A01, A04, A08.' },
  },
  {
    id: 'A11', wave: 3, time: '03:30', severity: 'medium', source: 'Identity provider', rule: 'Repeated failed logins', entity: 'svc_backup from 10.20.0.5', count: 12,
    raw: '12 failures in 10 min, src=10.20.0.5 (BACKUP-02), no success',
    enrich: { ip: '10.20.0.5 = BACKUP-02 (internal).', hours: 'Service account; runs nightly 02:00–04:00.', asset: 'Change CHG-2231 rotated svc_backup\'s password tonight; one backup script still uses the old one.', related: 'Ops already has ticket OPS-131 to update the script.' },
  },
  {
    id: 'A12', wave: 3, time: '03:41', severity: 'low', source: 'DLP', rule: 'Possible card numbers in email', entity: 'k.osei → payments@vendor.nb', count: 1,
    raw: 'pattern=PAN matches=3 sample="4111 1111 1111 ****" attachment=reconciliation.xlsx',
    enrich: { ip: NONE, hours: 'k.osei normally works days; email was scheduled-send.', asset: 'Vendor payments@vendor.nb is an approved processor, but no ticket says card data may be emailed.', related: 'No similar alerts for this user before.' },
  },
  {
    id: 'A13', wave: 3, time: '03:50', severity: 'high', source: 'Firewall', rule: 'Inbound RDP attempts (blocked)', entity: 'internet → 192.0.2.10:3389', count: 2000,
    raw: 'action=deny src=many dst_port=3389 all blocked',
    enrich: { ip: 'Sources are a known internet-wide scanning botnet; none succeeded.', hours: NONE, asset: '192.0.2.10 is the DMZ web server; RDP is not exposed (blocked by policy).', related: 'This happens daily on every internet-facing IP.' },
  },
];

export const TRUTH: Record<string, Truth> = {
  A01: { disposition: 'escalate', priority: 'P1', incident: true, needsEnrichment: false, explain: 'Hidden, encoded PowerShell launched by a document viewer on a payments workstation is attacker execution. Escalate now.' },
  A02: { disposition: 'benign', incident: false, needsEnrichment: true, explain: 'It really is a port scan — by the approved vulnerability scanner inside its change window. Benign true positive.' },
  A03: { disposition: 'false_positive', incident: false, needsEnrichment: false, explain: 'SPF/DKIM pass, only links to the real coralcafe.nb, no attachments, 214 identical copies: a legit newsletter. Thank the reporter and close.' },
  A07: { disposition: 'benign', incident: false, needsEnrichment: true, explain: 'Alert-fatigue trap: 40 duplicates of an operational disk alert explained by the nightly backup. Not a security event — route to ops / tune the rule.' },
  A04: { disposition: 'escalate', priority: 'P2', incident: true, needsEnrichment: true, explain: 'Rated LOW, but it is DNS tunneling to Pink Tide infrastructure from the host already running encoded PowerShell. Severity labels are a starting point, not a verdict.' },
  A05: { disposition: 'escalate', priority: 'P1', incident: false, needsEnrichment: true, explain: 'MFA fatigue: 15 denials then an approval from a hostile IP at 02:47 on a VIP with wire-approval rights = likely account takeover. P1: revoke sessions, reset, call the user out-of-band.' },
  A06: { disposition: 'false_positive', incident: false, needsEnrichment: true, explain: 'The "Lisbon" login is the corporate VPN egress. The rule lacks VPN awareness — close and request tuning.' },
  A10: { disposition: 'benign', incident: false, needsEnrichment: true, explain: 'EICAR is a harmless industry test string, detected during a scheduled AV validation in the lab. Expected activity.' },
  A14: { disposition: 'benign', incident: false, needsEnrichment: true, explain: 'Dex is the night-shift SOC manager logging in from the office VPN. "After hours" is normal for him.' },
  A08: { disposition: 'escalate', priority: 'P2', incident: true, needsEnrichment: false, explain: 'A logon-triggered task running svch0st.exe from C:\\Users\\Public is persistence. Part of the same intrusion.' },
  A09: { disposition: 'escalate', priority: 'P1', incident: true, needsEnrichment: true, explain: '4.8 GB to an exfil IOC from a compromised payments host is active data theft. P1 — contain immediately.' },
  A11: { disposition: 'benign', incident: false, needsEnrichment: true, explain: 'Failures come from the backup server right after a documented password rotation. Expected; ops already owns the fix.' },
  A12: { disposition: 'needs_info', incident: false, needsEnrichment: true, explain: 'Could be a policy violation or a legitimate reconciliation (4111… is also a common test number). Ask the data owner / DLP team for business justification before deciding.' },
  A13: { disposition: 'benign', incident: false, needsEnrichment: false, explain: 'Real internet scanning, but every attempt was blocked as designed. Benign true positive — aggregate or tune so it stops paging.' },
};

export const INCIDENT_IDS = Object.keys(TRUTH).filter((id) => TRUTH[id].incident);

export interface Decision {
  disposition: Disposition | null;
  priority: Priority | null;
  enriched: EnrichKind[];
  /** True if a disposition was chosen before any enrichment was viewed. */
  decidedBlind: boolean;
}

export function emptyDecision(): Decision {
  return { disposition: null, priority: null, enriched: [], decidedBlind: false };
}

export interface HandoffFact {
  id: string;
  text: string;
  key: boolean;
}

export const HANDOFF_FACTS: HandoffFact[] = [
  { id: 'h1', text: 'WS-ACCT-07 (j.morales) compromised: encoded PowerShell → persistence → DNS tunnel → 4.8 GB exfil to 198.51.100.23.', key: true },
  { id: 'h2', text: 'COO m.vance likely account takeover via MFA fatigue from 198.51.100.81 — sessions must be revoked.', key: true },
  { id: 'h3', text: 'Block IOCs at egress: 198.51.100.23, 198.51.100.81, 203.0.113.53, *.x.pinktide.nb.', key: true },
  { id: 'h4', text: 'DLP alert A12 pending: asked k.osei / data owner for business justification.', key: true },
  { id: 'h5', text: 'Tuning requests: impossible-travel rule needs VPN egress list; disk-space alert should be deduplicated and routed to ops.', key: true },
  { id: 'h6', text: 'Ignored the low-severity alerts because they were low.', key: false },
  { id: 'h7', text: 'Blocked 10.20.9.40 because it was port scanning.', key: false },
  { id: 'h8', text: 'Nothing to report — quiet night.', key: false },
];

const PRIO_RANK: Record<Priority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

export interface SocScore {
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  correct: Record<string, boolean>;
  mistakes: string[];
}

export function scoreSoc(decisions: Record<string, Decision>, caseIds: string[], handoff: string[], passScore = 60): SocScore {
  const ids = Object.keys(TRUTH);
  const correct: Record<string, boolean> = {};
  const mistakes: string[] = [];

  // disposition accuracy (40)
  let right = 0;
  for (const id of ids) {
    const ok = decisions[id]?.disposition === TRUTH[id].disposition;
    correct[id] = ok;
    if (ok) right++;
    else mistakes.push(`${id}: should be "${DISPOSITION_LABELS[TRUTH[id].disposition]}" — ${TRUTH[id].explain}`);
  }

  // severity calibration (15): over alerts that truly need escalation
  const esc = ids.filter((id) => TRUTH[id].disposition === 'escalate');
  let sev = 0;
  for (const id of esc) {
    const d = decisions[id];
    if (d?.disposition !== 'escalate' || !d.priority) continue;
    const diff = Math.abs(PRIO_RANK[d.priority] - PRIO_RANK[TRUTH[id].priority ?? 'P4']);
    sev += diff === 0 ? 1 : diff === 1 ? 0.5 : 0;
  }
  const sevFrac = esc.length ? sev / esc.length : 0;

  // correlation (20): Jaccard of the case vs true incident alerts
  const sel = new Set(caseIds);
  const truthSet = new Set(INCIDENT_IDS);
  const inter = [...sel].filter((x) => truthSet.has(x)).length;
  const union = new Set([...sel, ...truthSet]).size;
  const corr = union ? inter / union : 0;
  if (corr < 1) mistakes.push(`Incident case should link exactly ${INCIDENT_IDS.join(', ')} (all on WS-ACCT-07).`);

  // enrichment discipline (10)
  const needs = ids.filter((id) => TRUTH[id].needsEnrichment);
  const disciplined = needs.filter((id) => {
    const d = decisions[id];
    return d && d.enriched.length > 0 && !d.decidedBlind;
  }).length;
  const enrichFrac = needs.length ? disciplined / needs.length : 0;
  if (enrichFrac < 1) mistakes.push('Some decisions were made before checking enrichment context.');

  // handoff (15)
  const keys = HANDOFF_FACTS.filter((f) => f.key).map((f) => f.id);
  const hs = new Set(handoff);
  const good = keys.filter((k) => hs.has(k)).length;
  const bad = HANDOFF_FACTS.filter((f) => !f.key && hs.has(f.id)).length;
  const handFrac = Math.max(0, (good - bad) / keys.length);
  if (handFrac < 1) mistakes.push('Handoff notes were missing key facts or included wrong ones.');

  const breakdown: ScoreLine[] = [
    { label: 'Disposition accuracy', value: Math.round((right / ids.length) * 40), max: 40 },
    { label: 'Severity calibration', value: Math.round(sevFrac * 15), max: 15 },
    { label: 'Correlation into one incident', value: Math.round(corr * 20), max: 20 },
    { label: 'Enrichment before decisions', value: Math.round(enrichFrac * 10), max: 10 },
    { label: 'Shift handoff notes', value: Math.round(handFrac * 15), max: 15 },
  ];
  const score = clampScore(breakdown.reduce((s, b) => s + b.value, 0));
  return { score, passed: score >= passScore, breakdown, correct, mistakes };
}

/** Perfect play, used by tests. */
export function perfectDecisions(): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const [id, t] of Object.entries(TRUTH)) {
    out[id] = { disposition: t.disposition, priority: t.priority ?? null, enriched: ['related'], decidedBlind: false };
  }
  return out;
}

export const HINTS = [
  'Severity is the rule author\'s guess, not the truth. A "low" DNS alert from a host that just ran encoded PowerShell is part of the same story — open "View related alerts".',
  'Before closing anything that looks scary, enrich it: approved scanners, VPN egress IPs, test files (EICAR) and change tickets explain most of tonight\'s noise.',
  'Four alerts on WS-ACCT-07 form one intrusion (execution → DNS tunnel → persistence → exfil). The VIP MFA alert is serious too, but it\'s a separate account takeover.',
];
