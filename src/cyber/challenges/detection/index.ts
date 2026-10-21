import type { ChallengeDefinition } from '../../types';
import { mountDetection } from './ui';

export const detectionChallenge: ChallengeDefinition = {
  id: 'detection-1',
  title: 'Detection Engineering Lab: Catch the Tide',
  topic: 'malware',
  difficulty: 3,
  objective: 'Write and tune detection rules that catch attacker activity in logs without burying the SOC in false positives.',
  intro:
    "Dex Holloway drops a coffee and a problem on your desk: the SOC's old \"any PowerShell\" rule screams every night at harmless admin scripts, while the Pink Tide walked right past it. Build detections against last night's telemetry, tune the noisy one, and tag each rule with its MITRE ATT&CK technique.",
  passScore: 60,
  conceptCards: [
    {
      id: 'detection-signal-vs-noise',
      title: 'Signal vs. noise (alert fatigue)',
      topic: 'malware',
      definition: 'Alert fatigue happens when so many low-value alerts fire that analysts start ignoring them — including the real ones.',
      whyItMatters: 'A rule that is right 1 time in 50 trains people to click "close". Noisy detections are a security risk, not just an annoyance.',
      example: 'A rule on "any PowerShell" fired on nightly admin scripts for months, so nobody noticed the night it fired on encoded attacker PowerShell.',
      bestPractice: 'Measure false-positive rates per rule and tune, enrich or retire rules that do not lead to action.',
    },
    {
      id: 'detection-precision-recall',
      title: 'Precision and recall',
      topic: 'malware',
      definition: 'Precision = of the alerts fired, how many were real. Recall = of the real attacks, how many fired an alert. F1 balances both.',
      whyItMatters: 'Maximizing only recall floods the SOC; maximizing only precision misses attacks. Good detections are tuned for both.',
      example: 'Rules that fire 10 times with 9 real attacks out of 12 have 90% precision and 75% recall.',
      bestPractice: 'Track both metrics on labeled test data whenever a rule changes.',
    },
    {
      id: 'detection-as-code',
      title: 'Detection-as-code',
      topic: 'malware',
      definition: 'Managing detection rules like software: version control, peer review, automated tests and staged deployment.',
      whyItMatters: 'Rules change often; without tests a "small tweak" can silently blind the SOC.',
      example: 'Every pull request replays a known-bad attack sample and a day of known-good logs; the build fails if recall drops or false positives spike.',
      bestPractice: 'Keep a library of benign and malicious test events and run every rule change against it before production.',
    },
    {
      id: 'detection-attack-mapping',
      title: 'MITRE ATT&CK mapping',
      topic: 'malware',
      definition: 'MITRE ATT&CK is a public knowledge base of attacker tactics and techniques (e.g. T1059.001 PowerShell, T1078 Valid Accounts).',
      whyItMatters: 'Tagging rules with techniques shows which attacker behaviors you can detect — and which you cannot.',
      example: 'A coverage heat-map reveals strong execution detections but nothing for DNS-based command-and-control (T1071.004).',
      bestPractice: 'Map each detection to the technique it actually observes, then prioritize gaps used by threats relevant to you.',
    },
    {
      id: 'detection-tuning',
      title: 'Tuning a noisy rule',
      topic: 'malware',
      definition: 'Tuning narrows a rule with extra conditions (context such as arguments, parents, paths or accounts) so it keeps the attacks and drops the benign matches.',
      whyItMatters: 'Deleting a noisy rule removes coverage; tuning keeps the coverage and restores trust.',
      example: 'Keep "PowerShell" but require -enc / hidden window, so signed admin scripts using -File no longer alert.',
      bestPractice: 'Prefer behavior-based conditions over brittle allow-lists of usernames, and document why each exclusion exists.',
    },
  ],
  mount: mountDetection,
};
