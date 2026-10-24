import type { ChallengeDefinition } from '../../types';
import { mountCloud } from './ui';

export const cloudChallenge: ChallengeDefinition = {
  id: 'cloud-1',
  title: 'Cloud Breach at Harbor Cloud',
  topic: 'cloud',
  difficulty: 2,
  objective: 'Fix cloud misconfigurations with least privilege, then use audit logs to trace the stolen key, the attacker’s IP and their backdoor.',
  intro:
    "Dr. Amara Singh's voice cracks on the call: \"18,000 discharge summaries are on a paste site. Names. Diagnoses. Kids.\" The files came from Harbor Cloud. Close every door, then find out whose key opened them.",
  passScore: 65,
  conceptCards: [
    { id: 'cloud-shared-responsibility', title: 'Shared responsibility model', topic: 'cloud', definition: 'The provider secures the cloud infrastructure; the customer secures their configuration, identities, network rules and data.', whyItMatters: 'Most cloud breaches are customer misconfigurations, not provider failures.', example: 'A public bucket is the tenant’s setting, not the provider’s bug.', bestPractice: 'Know which layer you own for each service (IaaS vs PaaS vs SaaS) and secure it deliberately.' },
    { id: 'cloud-public-storage', title: 'Public storage exposure', topic: 'cloud', definition: 'Object storage readable by anyone on the internet.', whyItMatters: 'Automated scanners find open buckets within hours.', example: 'nbg-patient-exports with AllUsers:READ.', bestPractice: 'Turn on account-wide "block public access"; share with short-lived pre-signed URLs.' },
    { id: 'cloud-least-privilege', title: 'Least privilege & short-lived credentials', topic: 'cloud', definition: 'Identities get only the permissions they need, preferably through temporary credentials.', whyItMatters: 'A compromised identity can only do what it is allowed to do.', example: 'ci-deployer limited to deploying one app instead of "*:*"; no 400-day-old access keys.', bestPractice: 'Use roles, SSO and workload identity federation; review and remove unused permissions and keys.' },
    { id: 'cloud-logging', title: 'Cloud audit logging', topic: 'cloud', definition: 'Recording every API call (who, what, when, from where).', whyItMatters: 'Without logs you can’t scope a breach or prove what was taken.', example: 'The attacker worked in nb-south-2 because nobody was logging there.', bestPractice: 'Organization-wide trails in all regions, immutable storage, and alerts on sensitive actions like CreateUser.' },
    { id: 'cloud-secrets', title: 'Secrets management', topic: 'cloud', definition: 'Storing passwords, keys and tokens in a dedicated vault with access control and rotation.', whyItMatters: 'Secrets in env vars, code or chat leak easily and are rarely rotated.', example: 'DB_PASSWORD moved from an environment variable to a secrets manager.', bestPractice: 'Use a secrets manager, rotate automatically, grant read access narrowly, and scan repos for leaked secrets.' },
  ],
  mount: mountCloud,
};
