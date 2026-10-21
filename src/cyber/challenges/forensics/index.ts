import type { ChallengeDefinition, ConceptCard } from '../../types';
import { mountForensics } from './ui';

const conceptCards: ConceptCard[] = [
  {
    id: 'forensics-evidence-preservation', title: 'Evidence Preservation', topic: 'forensics',
    definition: 'Collect digital evidence without changing it: use write-blockers, create bit-for-bit images, capture volatile data (memory) before powering down, and analyse copies — never the original.',
    whyItMatters: 'Altered evidence can be thrown out of court and can hide what really happened.',
    example: 'Simply opening a file updates its "last accessed" time, destroying part of the story.',
    bestPractice: 'Image first, hash the original and the image, work only on verified copies.',
  },
  {
    id: 'forensics-chain-of-custody', title: 'Chain of Custody', topic: 'forensics',
    definition: 'A documented record of who collected, handled, transferred and stored each piece of evidence, and when.',
    whyItMatters: 'Without it, nobody can prove the evidence was not tampered with between seizure and analysis.',
    example: 'Each hand-off of a seized laptop is signed and dated on a custody form along with its hash.',
    bestPractice: 'Log every transfer, store evidence in sealed, access-controlled locations, and re-verify hashes.',
  },
  {
    id: 'forensics-timeline-analysis', title: 'Timeline Analysis & Time Zones', topic: 'forensics',
    definition: 'Ordering events from many sources into one chronology. Sources record time differently (UTC vs local, clock drift), so timestamps must be normalised first.',
    whyItMatters: 'A five-hour time-zone error can make the exfiltration appear to happen before the break-in.',
    example: 'A "Z" suffix (Zulu) means UTC; 14:02Z is 09:02 in a UTC−5 city.',
    bestPractice: 'Synchronise clocks with NTP, log in UTC, and record the offset for every source you analyse.',
  },
  {
    id: 'forensics-log-correlation', title: 'Log Correlation & Red Herrings', topic: 'forensics',
    definition: 'Linking events across email, endpoint, VPN, file server and network logs by user, host, IP and time to reveal the attack chain — while discarding routine activity.',
    whyItMatters: 'No single log tells the full story; noise like scheduled updates can mislead investigators.',
    example: "A phishing email → script execution → VPN login with the victim's credentials → payroll access → large outbound transfer.",
    bestPractice: 'Centralise logs in a SIEM, baseline normal activity, and support every conclusion with evidence.',
  },
];

export const forensicsChallenge: ChallengeDefinition = {
  id: 'forensics-1',
  title: 'Digital Footprints',
  topic: 'forensics',
  difficulty: 2,
  objective: 'Preserve evidence correctly and reconstruct an attack timeline from logs in different time zones.',
  intro:
    "Palmetto Bank's payroll file turned up on a Pink Tide leak site. Dr. Lena Okafor has the workstation and a stack of logs in her Bayview University lab. Secure the evidence, rebuild exactly what happened and when — and don't let the red herrings fool you.",
  passScore: 60,
  conceptCards,
  mount: (ctx) => mountForensics(ctx, 'forensics-1', conceptCards.map((c) => c.id)),
};
