// Poisoned Package — software supply-chain triage (pure data and scoring, no DOM).
// All package names, hashes and scripts are fictional; the "malicious" snippet is inert and truncated.

import { setFraction, weigh, type Explained, type Graded } from '../web/s2score';

export type Verdict = 'safe' | 'risky' | 'malicious';

export interface Pkg {
  id: string;
  name: string;
  version: string;
  facts: { label: string; value: string; alarm?: boolean }[];
  script?: string;
  answer: Verdict;
  why: string;
}

export const PACKAGES: Pkg[] = [
  {
    id: 'neonui', name: 'neon-ui', version: '4.2.1', answer: 'safe',
    facts: [{ label: 'Maintainers', value: '4, unchanged for 3 years' }, { label: 'Provenance', value: 'Signed build attestation ✔' }, { label: 'Lockfile hash', value: 'matches ✔' }],
    why: 'Long-standing maintainers, signed provenance and a matching hash. Nothing suspicious.',
  },
  {
    id: 'leftpadd', name: 'left-padd', version: '1.0.3', answer: 'malicious',
    facts: [{ label: 'Published', value: '2 days ago', alarm: true }, { label: 'Weekly downloads', value: '37 (popular "left-pad" has millions)', alarm: true }, { label: 'Install script', value: 'postinstall: node setup.js', alarm: true }],
    script: '// setup.js (SIMULATED, INERT, TRUNCATED)\nconst d=Buffer.from("aHR0cHM6Ly9sb3R1cy1jZG4ubmIv…","base64") // → lotus-cdn.nb\n/* … collects env vars … [redacted for training] */',
    why: 'Typosquat: one extra letter, brand new, tiny download count and an install script that phones home with environment secrets.',
  },
  {
    id: 'colorburst', name: 'color-burst', version: '3.1.0 → 3.1.1', answer: 'malicious',
    facts: [{ label: 'Maintainer', value: 'changed 6 days ago to "cb-helper2026"', alarm: true }, { label: 'Diff 3.1.0→3.1.1', value: 'adds obfuscated postinstall, no code changes', alarm: true }, { label: 'Provenance', value: 'missing for 3.1.1', alarm: true }],
    script: '// install.js (SIMULATED, INERT, TRUNCATED)\nvar _0x4f=["\\x6c\\x6f\\x74\\x75\\x73"…]; /* obfuscated loader — [redacted for training] */',
    why: 'Maintainer takeover: a trusted package gets a new owner and a patch release that only adds an obfuscated install script.',
  },
  {
    id: 'datewizard', name: 'date-wizard', version: '^2.0.0 (unpinned)', answer: 'risky',
    facts: [{ label: 'Version range', value: 'accepts any 2.x automatically', alarm: true }, { label: 'Maintainers', value: 'stable' }, { label: 'Current resolved', value: '2.4.0, signed ✔' }],
    why: 'Not malicious today, but an unpinned range would silently pull in a compromised future 2.x. Pin it and use the lockfile.',
  },
  {
    id: 'httptiny', name: 'http-tiny', version: '1.4.0', answer: 'malicious',
    facts: [{ label: 'Lockfile hash', value: 'sha512-9f3c… ≠ downloaded 7a1e…', alarm: true }, { label: 'Registry', value: 'served from mirror "fast-npm.nb"', alarm: true }, { label: 'Maintainers', value: 'unchanged' }],
    why: 'Hash mismatch against the lockfile means the bytes you got are not the bytes you reviewed — tampered in transit or on a rogue mirror.',
  },
  {
    id: 'artifact', name: 'cybercity-app (build artifact)', version: 'release 5.0.0', answer: 'risky',
    facts: [{ label: 'Signature', value: 'unsigned', alarm: true }, { label: 'Build', value: 'built on a developer laptop, not CI', alarm: true }],
    why: 'No signature or provenance means nobody can prove what went into it. Build in CI and sign the artifact (SLSA-style provenance).',
  },
  {
    id: 'utilbelt', name: 'util-belt', version: '4.17.21', answer: 'safe',
    facts: [{ label: 'Provenance', value: 'Signed, built from tagged commit ✔' }, { label: 'Lockfile hash', value: 'matches ✔' }],
    why: 'Verified provenance and matching hash.',
  },
  {
    id: 'cryptosafe', name: 'crypto-safe', version: '2.0.0', answer: 'safe',
    facts: [{ label: 'Maintainers', value: 'foundation-owned, 2FA required' }, { label: 'Audit', value: 'independent audit 2026 ✔' }],
    why: 'Well-governed, audited and verifiable.',
  },
];

export const FIXES = [
  { id: 'pin', label: 'Pin exact versions and commit the lockfile; review every dependency update', correct: true },
  { id: 'verify', label: 'Verify signatures and build provenance (SLSA attestations) in CI; fail the build on mismatch', correct: true },
  { id: 'scripts', label: 'Disable install scripts by default; allowlist the few that need them', correct: true },
  { id: 'registry', label: 'Use an internal registry/proxy with an allowlist of approved packages', correct: true },
  { id: 'sbom', label: 'Generate an SBOM for every build and monitor it for new advisories', correct: true },
  { id: 'autolatest', label: 'Auto-update everything to the latest version nightly without review', correct: false },
  { id: 'skipci', label: 'Skip CI security checks to ship the hotfix faster', correct: false },
  { id: 'vendorcopy', label: 'Copy package code into the repo without reviewing it', correct: false },
];

export const DISCLOSURE = [
  { id: 'coordinated', label: 'Report to the registry security team and the original maintainer, share indicators privately, publish an advisory after takedown', correct: true, why: 'Coordinated disclosure gets the packages removed fast and protects every other victim without tipping off the attacker early.' },
  { id: 'tweet', label: 'Post the malware publicly on social media right away', correct: false, why: 'Dumping details publicly before takedown helps copycats and warns the attacker.' },
  { id: 'quiet', label: 'Remove it from our project and tell no one', correct: false, why: 'Thousands of other projects stay infected. Report it.' },
];

export const HINTS = [
  'Look at publish dates, download counts, maintainer changes and install scripts — new + tiny + script is a classic pattern.',
  'A lockfile hash mismatch means the package bytes changed. That’s not "risky", that’s tampering.',
  '"Risky" items aren’t malicious yet but need hardening: unpinned ranges and unsigned builds.',
];

export interface SupplyInput {
  verdicts: Record<string, Verdict | undefined>;
  fixes: string[];
  disclosure: string | null;
}

export function freshSupply(): SupplyInput {
  return { verdicts: {}, fixes: [], disclosure: null };
}

export function scoreSupply(input: SupplyInput): Graded {
  const items: Explained[] = [];
  const mistakes: string[] = [];
  let hits = 0;
  for (const p of PACKAGES) {
    const v = input.verdicts[p.id];
    const ok = v === p.answer;
    if (ok) hits++;
    else mistakes.push(`${p.name}: marked ${v ?? 'nothing'}, actually ${p.answer}`);
    items.push({ title: `${p.name} → ${p.answer}`, ok, text: p.why });
  }
  const fixIds = FIXES.filter((f) => f.correct).map((f) => f.id);
  const fixFrac = setFraction(input.fixes, fixIds);
  items.push({ title: 'Pipeline hardening', ok: fixFrac === 1, text: 'Pin + lockfile, verify signatures/provenance, block install scripts by default, approved registry, SBOM monitoring. Never auto-merge unreviewed updates or skip checks.' });
  if (fixFrac < 1) mistakes.push('Incomplete build-pipeline hardening');
  const d = DISCLOSURE.find((x) => x.id === input.disclosure);
  const dOk = !!d?.correct;
  items.push({ title: 'Disclosure', ok: dOk, text: DISCLOSURE.find((x) => x.correct)!.why });
  if (!dOk) mistakes.push('Unsafe disclosure choice');
  const { score, breakdown } = weigh([
    { label: 'Packages triaged correctly', frac: hits / PACKAGES.length, max: 45 },
    { label: 'Pipeline fixes', frac: fixFrac, max: 35 },
    { label: 'Responsible disclosure', frac: dOk ? 1 : 0, max: 20 },
  ]);
  return { score, breakdown, items, mistakes };
}

export function perfectSupply(): SupplyInput {
  const verdicts: SupplyInput['verdicts'] = {};
  for (const p of PACKAGES) verdicts[p.id] = p.answer;
  return { verdicts, fixes: FIXES.filter((f) => f.correct).map((f) => f.id), disclosure: 'coordinated' };
}
