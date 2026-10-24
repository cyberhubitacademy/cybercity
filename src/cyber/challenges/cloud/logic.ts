// Cloud Breach at Harbor Cloud — pure data and scoring (no DOM).
// A simulated cloud console: every resource, key and log line is fictional.

import { weigh, type Explained, type Graded } from '../web/s2score';

export interface Fix { id: string; label: string; why: string }
export interface Issue {
  id: string;
  resource: string;
  kind: 'Storage' | 'IAM' | 'Keys' | 'Network' | 'Logging' | 'Secrets';
  finding: string;
  detail: string;
  weight: number;
  fixes: Fix[];
  correct: string;
}

export const ISSUES: Issue[] = [
  {
    id: 'bucket', resource: 'bucket://nbg-patient-exports', kind: 'Storage', weight: 25,
    finding: 'Bucket is publicly readable',
    detail: 'ACL: AllUsers:READ · 18,400 objects · discharge summaries from Neon Bay General',
    fixes: [
      { id: 'block', label: 'Block all public access; share via short-lived pre-signed URLs', why: 'Removes anonymous access while still letting the hospital share files deliberately.' },
      { id: 'rename', label: 'Rename the bucket to something hard to guess', why: 'Obscurity is not access control; scanners and leaked links still find it.' },
      { id: 'delete', label: 'Delete the bucket immediately', why: 'Destroys patient records and evidence. Contain, don’t destroy.' },
    ],
    correct: 'block',
  },
  {
    id: 'role', resource: 'role/ci-deployer', kind: 'IAM', weight: 20,
    finding: 'CI role has Action "*" on Resource "*"',
    detail: 'Attached to the build pipeline · used by 3 repos · last policy review: never',
    fixes: [
      { id: 'scope', label: 'Least privilege: only deploy actions on the app’s own resources', why: 'If the pipeline is abused, the blast radius is one app, not the whole account.' },
      { id: 'alert', label: 'Keep "*" but alert when the role is used', why: 'Alerts tell you after the damage; the permission is still excessive.' },
      { id: 'mfa', label: 'Require MFA on the CI role', why: 'Pipelines can’t do interactive MFA; this breaks builds and doesn’t limit scope.' },
    ],
    correct: 'scope',
  },
  {
    id: 'keys', resource: 'user/jpark · key AKIAEXAMPLE7Q2', kind: 'Keys', weight: 15,
    finding: 'Long-lived access key, last rotated 400 days ago',
    detail: 'Owner: Jules Park (SRE) · programmatic access · no expiry',
    fixes: [
      { id: 'deactivate', label: 'Deactivate & delete the key; move to short-lived role credentials (SSO/OIDC)', why: 'Short-lived credentials expire on their own; nothing permanent to leak.' },
      { id: 'yearly', label: 'Rotate it once a year', why: 'A stolen key stays valid for months. Prefer no long-lived keys at all.' },
      { id: 'share', label: 'Share it with the team so it’s used more often', why: 'Shared credentials destroy accountability and multiply exposure.' },
    ],
    correct: 'deactivate',
  },
  {
    id: 'sg', resource: 'sg-patientdb', kind: 'Network', weight: 15,
    finding: 'Inbound 0.0.0.0/0 on ports 22 (SSH) and 5432 (PostgreSQL)',
    detail: 'Database server for patient records reachable from the whole internet',
    fixes: [
      { id: 'restrict', label: 'Allow 5432 only from the app subnet; remove 22, use a managed session manager', why: 'Shrinks the attack surface to the systems that actually need access.' },
      { id: 'port', label: 'Move SSH to port 2222', why: 'Scanners check every port within minutes. Not a control.' },
      { id: 'pw', label: 'Leave open but use a stronger database password', why: 'Good passwords help, but nothing should expose a database to the internet.' },
    ],
    correct: 'restrict',
  },
  {
    id: 'logging', resource: 'audit trail · region nb-south-2', kind: 'Logging', weight: 15,
    finding: 'Audit logging disabled in one region',
    detail: 'The other regions log to an immutable archive; nb-south-2 logs nothing',
    fixes: [
      { id: 'orgtrail', label: 'Enable an organization-wide trail for all regions to immutable storage with alerts', why: 'Attackers deliberately use unmonitored regions. Cover them all, and make logs tamper-proof.' },
      { id: 'main', label: 'Enable logging only in the main region', why: 'Leaves the blind spot the attacker is already using.' },
      { id: 'later', label: 'Turn it on after the incident to save costs', why: 'You can’t investigate what you didn’t record.' },
    ],
    correct: 'orgtrail',
  },
  {
    id: 'secret', resource: 'function/export-reports', kind: 'Secrets', weight: 10,
    finding: 'DB_PASSWORD stored in plain environment variable',
    detail: 'Visible to anyone with read access to the function configuration',
    fixes: [
      { id: 'vault', label: 'Move it to a secrets manager with rotation; grant the function read access only', why: 'Secrets stay encrypted, access is logged, and rotation is automatic.' },
      { id: 'b64', label: 'Base64-encode the value', why: 'Encoding is not encryption — anyone can decode it in a second.' },
      { id: 'commit', label: 'Hard-code it in the source code instead', why: 'Now it’s in git history forever. Much worse.' },
    ],
    correct: 'vault',
  },
];

export interface LogLine { t: string; key: string; ip: string; region: string; action: string; target: string }

export const AUDIT_LOG: LogLine[] = [
  { t: '02:58:11', key: 'ASIAROLEci01', ip: '10.20.4.15', region: 'nb-east-1', action: 'PutObject', target: 'build-artifacts/app-4.2.1.zip' },
  { t: '03:02:47', key: 'AKIAEXAMPLE7Q2', ip: '203.0.113.77', region: 'nb-south-2', action: 'ListBuckets', target: '*' },
  { t: '03:05:09', key: 'ASIAROLEapp7', ip: '10.20.8.31', region: 'nb-east-1', action: 'GetObject', target: 'nbg-patient-exports/daily/2026-10-23.csv' },
  { t: '03:09:33', key: 'AKIAEXAMPLE7Q2', ip: '203.0.113.77', region: 'nb-south-2', action: 'GetBucketAcl', target: 'nbg-patient-exports' },
  { t: '03:14:02', key: 'AKIAEXAMPLE7Q2', ip: '203.0.113.77', region: 'nb-south-2', action: 'GetObject ×18,400', target: 'nbg-patient-exports/*' },
  { t: '03:15:40', key: 'AKIAEXAMPLE7Q2', ip: '203.0.113.77', region: 'nb-south-2', action: 'CreateUser', target: 'user/backup-svc2' },
  { t: '03:21:18', key: 'ASIAROLEsoc', ip: '10.20.1.4', region: 'nb-east-1', action: 'DescribeAlarms', target: 'soc-dashboard' },
];

export const KEY_OPTIONS = ['ASIAROLEci01', 'AKIAEXAMPLE7Q2', 'ASIAROLEapp7', 'ASIAROLEsoc'];
export const IP_OPTIONS = ['10.20.4.15', '203.0.113.77', '10.20.8.31', '10.20.1.4'];
export const PERSIST_OPTIONS = ['GetBucketAcl on nbg-patient-exports', 'CreateUser user/backup-svc2', 'DescribeAlarms', 'PutObject build artifact'];

export const SHARED_Q = {
  question: 'Who is responsible for the public bucket permissions in this breach?',
  options: [
    { id: 'customer', label: 'The customer (Harbor Cloud’s tenant): configuration, identities and data are theirs' },
    { id: 'provider', label: 'The cloud provider: they run the storage service' },
    { id: 'nobody', label: 'Nobody: default settings are always safe' },
  ],
  correct: 'customer',
};

export const HINTS = [
  'Every fix should shrink who or what can reach the data — never just hide it or delete it.',
  'In the audit log, look for an outside IP address in a region with no other activity, using a long-lived key (AKIA…).',
  'After stealing data, attackers create something that lets them come back. Which action creates new access?',
];

export interface CloudInput {
  fixes: Record<string, string | undefined>;
  key: string | null;
  ip: string | null;
  persistence: string | null;
  shared: string | null;
}

export function freshCloud(): CloudInput {
  return { fixes: {}, key: null, ip: null, persistence: null, shared: null };
}

/** Live posture score 0..100 from applied fixes. */
export function posture(fixes: CloudInput['fixes']): number {
  const total = ISSUES.reduce((s, i) => s + i.weight, 0);
  const got = ISSUES.filter((i) => fixes[i.id] === i.correct).reduce((s, i) => s + i.weight, 0);
  return Math.round((got / total) * 100);
}

export function scoreCloud(input: CloudInput): Graded {
  const items: Explained[] = [];
  const mistakes: string[] = [];
  for (const i of ISSUES) {
    const ok = input.fixes[i.id] === i.correct;
    const best = i.fixes.find((f) => f.id === i.correct)!;
    const picked = i.fixes.find((f) => f.id === input.fixes[i.id]);
    if (!ok) mistakes.push(`${i.resource}: ${picked ? picked.label : 'left unfixed'}`);
    items.push({ title: `${i.kind}: ${i.finding}`, ok, text: `${ok ? best.why : (picked ? picked.why + ' ' : 'Left unfixed. ') + `Better: ${best.label}.`}` });
  }
  const keyOk = input.key === 'AKIAEXAMPLE7Q2';
  const ipOk = input.ip === '203.0.113.77';
  const persistOk = input.persistence === 'CreateUser user/backup-svc2';
  items.push({ title: 'Attacker key', ok: keyOk, text: 'AKIAEXAMPLE7Q2 — the 400-day-old key — listed buckets, read the ACL and downloaded 18,400 files from 203.0.113.77 in the unlogged-by-default region nb-south-2.' });
  items.push({ title: 'Source IP', ok: ipOk, text: '203.0.113.77 is the only external address; every legitimate call came from internal 10.20.x.x ranges.' });
  items.push({ title: 'Persistence', ok: persistOk, text: 'CreateUser backup-svc2 is a backdoor account. Disable it, or the attacker returns after you rotate the key.' });
  if (!keyOk || !ipOk) mistakes.push('Misattributed the stolen credential');
  if (!persistOk) mistakes.push('Missed the attacker’s backdoor account');
  const sharedOk = input.shared === SHARED_Q.correct;
  items.push({ title: 'Shared responsibility', ok: sharedOk, text: 'The provider secures the cloud; the customer secures what they put in it — identities, permissions, network rules and data.' });
  const { score, breakdown } = weigh([
    { label: 'Cloud posture fixed', frac: posture(input.fixes) / 100, max: 55 },
    { label: 'Audit-log investigation', frac: ((keyOk ? 1 : 0) + (ipOk ? 1 : 0) + (persistOk ? 1 : 0)) / 3, max: 35 },
    { label: 'Shared responsibility', frac: sharedOk ? 1 : 0, max: 10 },
  ]);
  return { score, breakdown, items, mistakes };
}

export function perfectCloud(): CloudInput {
  const fixes: CloudInput['fixes'] = {};
  for (const i of ISSUES) fixes[i.id] = i.correct;
  return { fixes, key: 'AKIAEXAMPLE7Q2', ip: '203.0.113.77', persistence: 'CreateUser user/backup-svc2', shared: 'customer' };
}
