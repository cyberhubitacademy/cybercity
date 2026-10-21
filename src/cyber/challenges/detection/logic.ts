// Detection Engineering Lab — pure logic: a deterministic log dataset with
// hidden ground truth, a safe rule engine (no user-built RegExp), and
// precision/recall scoring. All events are fictional training data.

import { clampScore, type ScoreLine } from '../../types';

export type EventType = 'process' | 'auth' | 'dns' | 'proxy';

export interface LogEvent {
  id: number;
  time: string;
  hour: number;
  event_type: EventType;
  host: string;
  user: string;
  process_name: string;
  parent_process: string;
  command_line: string;
  src_ip: string;
  dest_domain: string;
}

export type Technique = 'T1059.001' | 'T1036' | 'T1071.004' | 'T1078';

export const TECHNIQUES: { id: Technique; name: string; hint: string }[] = [
  { id: 'T1059.001', name: 'Command & Scripting Interpreter: PowerShell', hint: 'Attacker-run (often encoded or hidden) PowerShell.' },
  { id: 'T1036', name: 'Masquerading', hint: 'Malware named or placed to look like a legitimate system file.' },
  { id: 'T1071.004', name: 'Application Layer Protocol: DNS', hint: 'Command-and-control or exfiltration hidden inside DNS queries.' },
  { id: 'T1078', name: 'Valid Accounts', hint: 'Logging in with real (stolen) credentials.' },
];

export const FIELDS = ['event_type', 'process_name', 'parent_process', 'command_line', 'user', 'src_ip', 'dest_domain', 'host', 'hour'] as const;
export type Field = (typeof FIELDS)[number];

export const OPERATORS = ['equals', 'not_equals', 'contains', 'starts_with', 'wildcard', 'in_list', 'greater_than'] as const;
export type Operator = (typeof OPERATORS)[number];

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  starts_with: 'starts with',
  wildcard: 'matches (* wildcard)',
  in_list: 'is one of (a,b,c)',
  greater_than: 'greater than (numbers)',
};

export interface Condition {
  field: Field;
  op: Operator;
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  conditions: Condition[];
  technique: Technique | null;
}

export const STARTER_RULE_ID = 'starter';

/** The noisy rule the player inherits and has to tune. */
export function starterRule(): Rule {
  return {
    id: STARTER_RULE_ID,
    name: 'Legacy: any PowerShell',
    conditions: [{ field: 'command_line', op: 'contains', value: 'powershell' }],
    technique: null,
  };
}

// ---------------- dataset ----------------

type Raw = Omit<LogEvent, 'id' | 'hour'> & { truth: Technique | null; why: string };

const P = (time: string, host: string, user: string, proc: string, parent: string, cmd: string, truth: Technique | null, why: string): Raw => ({
  time, event_type: 'process', host, user, process_name: proc, parent_process: parent, command_line: cmd, src_ip: '', dest_domain: '', truth, why,
});
const A = (time: string, host: string, user: string, ip: string, result: string, truth: Technique | null, why: string): Raw => ({
  time, event_type: 'auth', host, user, process_name: '', parent_process: '', command_line: `logon ${result} (vpn)`, src_ip: ip, dest_domain: '', truth, why,
});
const D = (time: string, host: string, user: string, ip: string, domain: string, truth: Technique | null, why: string): Raw => ({
  time, event_type: 'dns', host, user, process_name: '', parent_process: '', command_line: '', src_ip: ip, dest_domain: domain, truth, why,
});
const X = (time: string, host: string, user: string, ip: string, domain: string, why: string): Raw => ({
  time, event_type: 'proxy', host, user, process_name: 'chrome.exe', parent_process: 'explorer.exe', command_line: 'GET https://' + domain + '/', src_ip: ip, dest_domain: domain, truth: null, why,
});

const RAW: Raw[] = [
  // --- Pink Tide activity ---
  P('02:14', 'WS-ACCT-07', 'j.morales', 'powershell.exe', 'invoice_view.exe', 'powershell.exe -nop -w hidden -enc SQBFAFgAIAAoAE4A… (inert training sample)', 'T1059.001', 'Encoded, hidden PowerShell spawned by a document viewer — classic malicious launcher.'),
  P('02:15', 'WS-ACCT-07', 'j.morales', 'powershell.exe', 'powershell.exe', 'powershell.exe -nop -enc JABjAD0ATgBlAHcA… (inert training sample)', 'T1059.001', 'Second-stage encoded PowerShell, child of the first.'),
  P('02:16', 'WS-ACCT-07', 'j.morales', 'svch0st.exe', 'powershell.exe', 'C:\\Users\\Public\\svch0st.exe --silent', 'T1036', 'svch0st (zero, not o) running from C:\\Users\\Public — a fake "svchost".'),
  P('02:31', 'WS-ACCT-07', 'j.morales', 'svch0st.exe', 'svch0st.exe', 'C:\\Users\\Public\\svch0st.exe --beacon 60', 'T1036', 'The lookalike re-launching itself to beacon.'),
  P('03:05', 'WS-HR-02', 'k.osei', 'powershell.exe', 'winword.exe', 'powershell.exe -w hidden -EncodedCommand UwB0AGEAcgB0AC0A… (inert training sample)', 'T1059.001', 'Word should never launch hidden, encoded PowerShell.'),
  A('03:02', 'VPN-GW', 'svc_backup', '198.51.100.77', 'success', 'T1078', 'Service account logging in over VPN from an external documentation-range IP at 3 AM.'),
  A('03:09', 'VPN-GW', 'svc_backup', '198.51.100.77', 'success', 'T1078', 'Same stolen service-account session re-authenticating.'),
  A('03:12', 'VPN-GW', 'm.vance', '198.51.100.81', 'success', 'T1078', 'COO account used from the same hostile range in the middle of the night.'),
  D('02:40', 'WS-ACCT-07', 'j.morales', '10.20.5.14', 'a9f3c0d1e7b24f6a8c1d.x.pinktide.nb', 'T1071.004', 'Long, random-looking subdomain under the attacker zone: DNS tunneling.'),
  D('02:41', 'WS-ACCT-07', 'j.morales', '10.20.5.14', '7c2e9b0f4d1a6e3c8b5f.x.pinktide.nb', 'T1071.004', 'DNS tunneling — data encoded in the label.'),
  D('02:42', 'WS-ACCT-07', 'j.morales', '10.20.5.14', 'e4b1d8a2c7f0359e6d2a.x.pinktide.nb', 'T1071.004', 'DNS tunneling — data encoded in the label.'),
  D('03:20', 'WS-HR-02', 'k.osei', '10.20.6.31', '0d6f2a9c4e8b1735f2c9.x.pinktide.nb', 'T1071.004', 'Second infected host using the same tunnel.'),
  // --- benign lookalikes & normal noise ---
  P('01:00', 'ADMIN-01', 'it_admin', 'powershell.exe', 'taskeng.exe', 'powershell.exe -File C:\\Scripts\\patch_report.ps1', null, 'Scheduled admin reporting script — signed, documented, runs nightly.'),
  P('01:30', 'ADMIN-01', 'it_admin', 'powershell.exe', 'taskeng.exe', 'powershell.exe -File C:\\Scripts\\disk_cleanup.ps1', null, 'Routine maintenance script.'),
  P('09:12', 'WS-IT-03', 'r.vega', 'powershell.exe', 'explorer.exe', 'powershell.exe Get-ADUser -Filter *', null, 'An analyst running an interactive query during the day shift.'),
  P('09:40', 'WS-IT-03', 'r.vega', 'powershell.exe', 'code.exe', 'powershell.exe -NoProfile npm test', null, 'Developer tooling inside an IDE terminal.'),
  P('02:00', 'BACKUP-02', 'svc_backup', 'backup.exe', 'services.exe', 'backup.exe /job nightly /target \\\\NAS-01\\vault', null, 'Expected nightly backup job.'),
  P('02:00', 'WS-ACCT-07', 'SYSTEM', 'svchost.exe', 'services.exe', 'C:\\Windows\\System32\\svchost.exe -k netsvcs', null, 'Real svchost.exe: correct name, System32 path, parent services.exe.'),
  P('08:55', 'WS-HR-02', 'k.osei', 'winword.exe', 'explorer.exe', 'winword.exe "Q3 hiring plan.docx"', null, 'Normal document opening.'),
  P('10:05', 'WS-ACCT-07', 'j.morales', 'outlook.exe', 'explorer.exe', 'outlook.exe', null, 'Normal mail client start.'),
  P('11:20', 'WS-ACCT-07', 'j.morales', 'excel.exe', 'outlook.exe', 'excel.exe "budget.xlsx"', null, 'Opening a spreadsheet attachment from a known colleague.'),
  P('03:00', 'ADMIN-01', 'it_admin', 'powershell.exe', 'taskeng.exe', 'powershell.exe -File C:\\Scripts\\rotate_logs.ps1', null, 'Night-time but scheduled and documented — not every 3 AM event is evil.'),
  A('08:31', 'VPN-GW', 'j.morales', '10.20.5.14', 'success', null, 'Office login from the internal network at start of day.'),
  A('08:47', 'VPN-GW', 'k.osei', '10.20.6.31', 'success', null, 'Normal internal login.'),
  A('02:00', 'VPN-GW', 'svc_backup', '10.20.0.5', 'success', null, 'Backup service logging in from the backup server itself — expected.'),
  A('22:10', 'VPN-GW', 'd.holloway', '203.0.113.20', 'success', null, 'Dex on the night shift connecting from the Sunset Shield office VPN egress.'),
  A('09:02', 'VPN-GW', 'm.vance', '10.20.1.4', 'success', null, 'COO logging in from the executive floor during business hours.'),
  A('13:15', 'VPN-GW', 'r.vega', '10.20.3.9', 'failure', null, 'One mistyped password — normal.'),
  D('08:32', 'WS-ACCT-07', 'j.morales', '10.20.5.14', 'mail.palmettobank.nb', null, 'Normal mail lookup.'),
  D('08:33', 'WS-ACCT-07', 'j.morales', '10.20.5.14', 'portal.harborcloud.nb', null, 'Company cloud portal.'),
  D('09:15', 'WS-IT-03', 'r.vega', '10.20.3.9', 'update.sunsetshield.nb', null, 'Patch server lookup.'),
  D('11:00', 'WS-HR-02', 'k.osei', '10.20.6.31', 'cdn-7f3a.harborcloud.nb', null, 'Short CDN label — a little random, but a known company domain.'),
  D('12:30', 'WS-HR-02', 'k.osei', '10.20.6.31', 'www.coralcafe.nb', null, 'Lunch order. Important business.'),
  D('02:05', 'BACKUP-02', 'svc_backup', '10.20.0.5', 'nas-01.harbor.internal', null, 'Backup job resolving the NAS.'),
  X('10:12', 'WS-ACCT-07', 'j.morales', '10.20.5.14', 'news.neonbay.nb', 'Ordinary browsing.'),
  X('12:31', 'WS-HR-02', 'k.osei', '10.20.6.31', 'www.coralcafe.nb', 'Ordinary browsing.'),
  X('14:02', 'WS-IT-03', 'r.vega', '10.20.3.9', 'docs.sunsetshield.nb', 'Internal documentation.'),
  X('15:44', 'WS-ACCT-07', 'j.morales', '10.20.5.14', 'portal.harborcloud.nb', 'Company cloud portal.'),
  P('16:10', 'WS-IT-03', 'r.vega', 'powershell.exe', 'explorer.exe', 'powershell.exe Test-NetConnection portal.harborcloud.nb -Port 443', null, 'Analyst troubleshooting connectivity.'),
  P('17:05', 'ADMIN-01', 'it_admin', 'powershell.exe', 'mmc.exe', 'powershell.exe Get-Service', null, 'Admin console check.'),
];

export interface DatasetEvent extends LogEvent {
  truth: Technique | null;
  why: string;
}

/** Events sorted chronologically with stable ids. Deterministic. */
export function buildDataset(): DatasetEvent[] {
  return RAW.map((r) => ({ ...r, hour: Number(r.time.slice(0, 2)) }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.host.localeCompare(b.host))
    .map((r, i) => ({ ...r, id: i + 1 }));
}

/** Player-visible copy: no ground-truth fields. */
export function publicEvents(ds: DatasetEvent[]): LogEvent[] {
  return ds.map(({ truth: _t, why: _w, ...e }) => e);
}

// ---------------- rule engine ----------------

/** Safe glob: only `*` is special. No RegExp is built from player input. */
export function wildcardMatch(text: string, pattern: string): boolean {
  const t = text.toLowerCase();
  const parts = pattern.toLowerCase().split('*');
  if (parts.length === 1) return t === parts[0];
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      if (!t.startsWith(part)) return false;
      pos = part.length;
      continue;
    }
    if (i === parts.length - 1) {
      return part === '' || (t.length - part.length >= pos && t.endsWith(part));
    }
    const at = t.indexOf(part, pos);
    if (at < 0) return false;
    pos = at + part.length;
  }
  return true;
}

export function fieldValue(e: LogEvent, f: Field): string {
  return f === 'hour' ? String(e.hour) : e[f];
}

export function conditionMatches(e: LogEvent, c: Condition): boolean {
  const raw = fieldValue(e, c.field);
  const v = raw.toLowerCase();
  const want = c.value.trim().toLowerCase();
  switch (c.op) {
    case 'equals': return v === want;
    case 'not_equals': return v !== want;
    case 'contains': return want !== '' && v.includes(want);
    case 'starts_with': return want !== '' && v.startsWith(want);
    case 'wildcard': return want !== '' && wildcardMatch(raw, want);
    case 'in_list': return want.split(',').map((s) => s.trim()).filter(Boolean).includes(v);
    case 'greater_than': {
      const a = Number(raw), b = Number(want);
      return raw !== '' && Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
  }
}

/** A rule needs at least one condition; all conditions must match (AND). */
export function ruleMatches(e: LogEvent, r: Rule): boolean {
  return r.conditions.length > 0 && r.conditions.every((c) => conditionMatches(e, c));
}

export interface RuleStats {
  ruleId: string;
  hits: number[];
  tp: number;
  fp: number;
}

export interface Metrics {
  hits: Set<number>;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  perRule: RuleStats[];
  missed: number[];
}

export function evaluate(ds: DatasetEvent[], rules: Rule[]): Metrics {
  const hits = new Set<number>();
  const perRule: RuleStats[] = rules.map((r) => {
    const h = ds.filter((e) => ruleMatches(e, r)).map((e) => e.id);
    h.forEach((id) => hits.add(id));
    const tp = h.filter((id) => ds[id - 1].truth !== null).length;
    return { ruleId: r.id, hits: h, tp, fp: h.length - tp };
  });
  const malicious = ds.filter((e) => e.truth !== null);
  const tp = malicious.filter((e) => hits.has(e.id)).length;
  const fp = hits.size - tp;
  const fn = malicious.length - tp;
  const precision = hits.size ? tp / hits.size : 0;
  const recall = malicious.length ? tp / malicious.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { hits, tp, fp, fn, precision, recall, f1, perRule, missed: malicious.filter((e) => !hits.has(e.id)).map((e) => e.id) };
}

/** Starter rule counts as tuned when it still exists, still catches every PowerShell attack, and has zero false positives. */
export function starterTuned(ds: DatasetEvent[], rules: Rule[]): boolean {
  const r = rules.find((x) => x.id === STARTER_RULE_ID);
  if (!r) return false;
  const h = ds.filter((e) => ruleMatches(e, r));
  const ps = ds.filter((e) => e.truth === 'T1059.001');
  return h.every((e) => e.truth !== null) && ps.every((e) => h.includes(e));
}

/** Majority technique among a rule's true-positive hits. */
export function dominantTechnique(ds: DatasetEvent[], r: Rule): Technique | null {
  const counts = new Map<Technique, number>();
  for (const e of ds) if (e.truth && ruleMatches(e, r)) counts.set(e.truth, (counts.get(e.truth) ?? 0) + 1);
  let best: Technique | null = null, n = 0;
  for (const [t, c] of counts) if (c > n) { best = t; n = c; }
  return best;
}

/** Fraction of rules with true positives whose ATT&CK tag matches what they actually catch. */
export function attackAccuracy(ds: DatasetEvent[], rules: Rule[]): number {
  const useful = rules.filter((r) => dominantTechnique(ds, r) !== null);
  if (!useful.length) return 0;
  return useful.filter((r) => r.technique === dominantTechnique(ds, r)).length / useful.length;
}

export interface DetectionScore {
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  metrics: Metrics;
  tuned: boolean;
  attack: number;
  mistakes: string[];
}

export function scoreDetection(ds: DatasetEvent[], rules: Rule[], passScore = 60): DetectionScore {
  const m = evaluate(ds, rules);
  const tuned = starterTuned(ds, rules);
  const attack = attackAccuracy(ds, rules);
  const breakdown: ScoreLine[] = [
    { label: 'Attacks detected (recall)', value: Math.round(m.recall * 40), max: 40 },
    { label: 'Signal vs noise (precision)', value: Math.round(m.precision * 30), max: 30 },
    { label: 'MITRE ATT&CK mapping', value: Math.round(attack * 15), max: 15 },
    { label: 'Noisy starter rule tuned', value: tuned ? 15 : 0, max: 15 },
  ];
  const score = clampScore(breakdown.reduce((s, b) => s + b.value, 0));
  const mistakes: string[] = [];
  if (m.fn) mistakes.push(`Detections missed ${m.fn} Pink Tide event(s).`);
  if (m.fp) mistakes.push(`Rules fired on ${m.fp} benign event(s) — alert fatigue for the SOC.`);
  if (!tuned) mistakes.push('The legacy "any PowerShell" rule still flags admin scripts or misses attacks.');
  if (attack < 1 && rules.some((r) => dominantTechnique(ds, r))) mistakes.push('Some rules were tagged with the wrong ATT&CK technique.');
  return { score, passed: score >= passScore, breakdown, metrics: m, tuned, attack, mistakes };
}

export const HINTS = [
  'Edit the starter rule instead of deleting it: keep "command_line contains powershell" and add a second AND condition that only attacker launches have — look for "-enc".',
  'Masquerading: one process name is spelled with a zero. "process_name equals svch0st.exe" catches it without touching the real svchost.exe.',
  'Valid Accounts: stolen logins all come from 198.51.100.* over the VPN (event_type equals auth AND src_ip starts with 198.51.100.). DNS tunneling hides under *.x.pinktide.nb (wildcard).',
];

/** A reference solution used by tests and the post-game "model answer". */
export function referenceRules(): Rule[] {
  return [
    { id: STARTER_RULE_ID, name: 'Encoded PowerShell', technique: 'T1059.001', conditions: [{ field: 'command_line', op: 'contains', value: 'powershell' }, { field: 'command_line', op: 'contains', value: '-enc' }] },
    { id: 'r-mask', name: 'Fake svchost', technique: 'T1036', conditions: [{ field: 'process_name', op: 'equals', value: 'svch0st.exe' }] },
    { id: 'r-vpn', name: 'VPN login from hostile range', technique: 'T1078', conditions: [{ field: 'event_type', op: 'equals', value: 'auth' }, { field: 'src_ip', op: 'starts_with', value: '198.51.100.' }] },
    { id: 'r-dns', name: 'Pink Tide DNS tunnel', technique: 'T1071.004', conditions: [{ field: 'event_type', op: 'equals', value: 'dns' }, { field: 'dest_domain', op: 'wildcard', value: '*.x.pinktide.nb' }] },
  ];
}
