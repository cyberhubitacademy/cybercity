import type { ChallengeDefinition } from '../../types';
import { mountSupply } from './ui';

export const supplyChainChallenge: ChallengeDefinition = {
  id: 'supplychain-1',
  title: 'Poisoned Package',
  topic: 'supplychain',
  difficulty: 3,
  objective: 'Find typosquatted, hijacked and tampered dependencies in an SBOM, harden the build pipeline, and disclose responsibly.',
  intro:
    "Black Lotus didn't attack Sunset Shield's network. They attacked its code. Tomorrow's release of the city's alert app ships to 300,000 phones — and something in its dependency tree is calling home. NOVA found the beacon; you have to find the package.",
  passScore: 65,
  conceptCards: [
    { id: 'supplychain-typosquat', title: 'Typosquatting', topic: 'supplychain', definition: 'Publishing a malicious package with a name almost identical to a popular one.', whyItMatters: 'One typo in an install command runs attacker code on developer machines and build servers.', example: '"left-padd" instead of "left-pad", two days old with an install script.', bestPractice: 'Use allowlisted registries, review new dependencies, and block install scripts by default.' },
    { id: 'supplychain-takeover', title: 'Maintainer takeover', topic: 'supplychain', definition: 'An attacker gains control of a trusted package (stolen account, abandoned project, social engineering).', whyItMatters: 'Everyone who trusts that package auto-installs the malicious update.', example: 'color-burst 3.1.1: new maintainer, no code changes, just an obfuscated postinstall.', bestPractice: 'Pin versions, review diffs of updates, prefer packages with 2FA-enforced maintainers and signed releases.' },
    { id: 'supplychain-provenance', title: 'Signatures, hashes & provenance', topic: 'supplychain', definition: 'Cryptographic proof of who built an artifact, from which source, and that its bytes haven’t changed.', whyItMatters: 'Without it, you can’t tell a real release from a tampered one.', example: 'Lockfile hash mismatch on http-tiny; unsigned laptop-built release.', bestPractice: 'Verify hashes and signatures in CI, build in hardened pipelines, publish SLSA-style provenance.' },
    { id: 'supplychain-sbom', title: 'SBOM (Software Bill of Materials)', topic: 'supplychain', definition: 'A machine-readable inventory of every component in a piece of software.', whyItMatters: 'When a new compromise is announced, an SBOM tells you in minutes whether you’re affected.', example: 'Searching all builds for color-burst 3.1.1.', bestPractice: 'Generate an SBOM per build and monitor it against vulnerability and malware feeds.' },
    { id: 'supplychain-disclosure', title: 'Coordinated disclosure', topic: 'supplychain', definition: 'Reporting a security problem privately to those who can fix it, then publishing once users are protected.', whyItMatters: 'It protects every other victim without giving attackers a head start.', example: 'Reporting left-padd and color-burst to the registry security team and the original maintainer.', bestPractice: 'Use official security contacts, share indicators privately, agree a publication timeline.' },
  ],
  mount: mountSupply,
};
