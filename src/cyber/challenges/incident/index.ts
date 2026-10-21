import type { ChallengeDefinition } from '../../types';
import { mountIncident } from './ui';

export const incidentChallenge: ChallengeDefinition = {
  id: 'incident-1',
  title: 'The Final Incident',
  topic: 'incident',
  difficulty: 3,
  objective: 'Triage live alerts, run an incident response playbook in the right order, and report the root cause.',
  intro:
    "2:31 AM. Palmetto Bank's loan files are turning into *.flamingo one by one and a pink-tinted ransom note just hit every share. This is the Pink Tide's endgame. Max Cortez is on the phone: \"Rico, you're incident commander. Don't panic — run the plan.\"",
  passScore: 65,
  conceptCards: [
    {
      id: 'incident-lifecycle',
      title: 'Incident response lifecycle',
      topic: 'incident',
      definition: 'The NIST lifecycle: Preparation → Detection & Analysis → Containment, Eradication & Recovery → Post-Incident Activity.',
      whyItMatters: 'Under pressure people improvise and make things worse. A rehearsed sequence keeps the response calm and effective.',
      example: 'Isolate infected hosts before reimaging them, and reimage before restoring data — otherwise the malware re-encrypts the restore.',
      bestPractice: 'Write the plan before the incident, assign roles, and run tabletop exercises regularly.',
    },
    {
      id: 'incident-triage',
      title: 'Alert triage & false positives',
      topic: 'incident',
      definition: 'Triage ranks alerts by severity and real impact, and weeds out false positives — alerts that look bad but reflect normal activity.',
      whyItMatters: 'Analysts have limited time. Chasing benign alerts while active damage continues is how small incidents become disasters.',
      example: 'A signed nightly backup job spiking CPU at 02:00 is expected; mass file renames on a file server are not.',
      bestPractice: 'Prioritize ongoing destruction, then attacker control channels, then entry points — and tune detections that repeatedly misfire.',
    },
    {
      id: 'incident-evidence',
      title: 'Preserving evidence',
      topic: 'incident',
      definition: 'Collecting volatile data (memory, connections) and logs before systems are changed, with a documented chain of custody.',
      whyItMatters: 'Evidence reveals the root cause and the full scope. Without it you cannot be sure the attacker is gone.',
      example: 'Isolate a machine from the network but keep it powered on so RAM can be captured.',
      bestPractice: 'Never pull the plug or wipe first; capture, hash and document evidence, then contain.',
    },
    {
      id: 'incident-backups',
      title: 'Ransomware recovery & backups',
      topic: 'incident',
      definition: 'Restoring encrypted data from backups that the attacker could not reach — offline, immutable or segregated copies.',
      whyItMatters: 'Good backups turn a ransomware disaster into an inconvenience and remove any reason to pay.',
      example: 'Palmetto Bank restores FS-02 from last night’s offline backup after reimaging the server.',
      bestPractice: 'Follow 3-2-1 (three copies, two media, one offsite/offline) and test restores regularly.',
    },
  ],
  mount: mountIncident,
};
