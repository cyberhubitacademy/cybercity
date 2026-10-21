import type { ChallengeDefinition } from '../../types';
import { mountSoc } from './ui';

export const socChallenge: ChallengeDefinition = {
  id: 'soc-1',
  title: 'SOC Night Shift',
  topic: 'incident',
  difficulty: 2,
  objective: 'Triage a night of SIEM alerts: enrich, decide, calibrate priority, correlate related alerts into one incident, and hand over the shift.',
  intro:
    "01:50 at the Harbor SOC. Dex Holloway hands you the headset: \"Queue's yours, rookie. Most of tonight is noise. Some of it isn't. Don't trust the severity labels, check context before you close anything, and leave the day shift notes they can act on.\"",
  passScore: 60,
  conceptCards: [
    {
      id: 'soc-triage',
      title: 'Alert triage & escalation',
      topic: 'incident',
      definition: 'Triage decides, for each alert, whether it is a real threat, how urgent it is (priority), and who must act — following an escalation matrix.',
      whyItMatters: 'SOCs see thousands of alerts a day; fast, consistent triage gets real incidents to responders in minutes instead of days.',
      example: 'A VIP account approving an MFA push at 02:47 from a hostile IP is escalated as P1 even though the rule rated it "medium".',
      bestPractice: 'Judge impact (asset and account criticality) and confidence, not just the rule\'s severity label.',
    },
    {
      id: 'soc-false-positives',
      title: 'False positives vs. benign true positives',
      topic: 'incident',
      definition: 'A false positive means the rule was wrong. A benign true positive means the rule was right, but the activity is authorized or expected.',
      whyItMatters: 'Each needs a different fix: false positives need rule tuning; benign true positives need documentation, exclusions or routing.',
      example: 'An "impossible travel" alert caused by the corporate VPN is a false positive; the approved scanner\'s port scan is a benign true positive.',
      bestPractice: 'Record the reason when closing, and send tuning requests to detection engineering.',
    },
    {
      id: 'soc-enrichment',
      title: 'Enrichment',
      topic: 'incident',
      definition: 'Adding context to an alert: IP reputation, the user\'s normal behavior, asset criticality, change tickets and related alerts.',
      whyItMatters: 'Most mistakes in triage come from deciding on the raw alert alone.',
      example: 'Checking the change calendar shows the EICAR detection was a scheduled antivirus test in the lab.',
      bestPractice: 'Automate common enrichment so analysts see context in the alert itself.',
    },
    {
      id: 'soc-correlation',
      title: 'Correlation',
      topic: 'incident',
      definition: 'Linking separate alerts that belong to the same attack into one incident case.',
      whyItMatters: 'Attackers generate several small signals; alone each looks minor, together they reveal the kill chain.',
      example: 'Encoded PowerShell, a long DNS query, a new scheduled task and a 4.8 GB upload — all on WS-ACCT-07 — are one intrusion.',
      bestPractice: 'Pivot on shared entities (host, user, IP, time) and manage the incident as one case with one owner.',
    },
    {
      id: 'soc-handoff',
      title: 'Shift handoff & documentation',
      topic: 'incident',
      definition: 'Clear, factual notes passed to the next shift: open incidents, actions taken, pending questions and requested tuning.',
      whyItMatters: 'Incidents don\'t stop at 06:00. Without a good handoff, containment steps and open questions get lost.',
      example: '"WS-ACCT-07 compromised; IOCs to block; DLP alert waiting on data-owner reply."',
      bestPractice: 'Write handoffs in the ticketing system with timestamps, owners and next actions — not in someone\'s memory.',
    },
  ],
  mount: mountSoc,
};
