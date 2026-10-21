import type { ChallengeDefinition } from '../../types';
import { mountTraffic } from './ui';

export const trafficChallenge: ChallengeDefinition = {
  id: 'traffic-1',
  title: 'Something on the Wire',
  topic: 'networking',
  difficulty: 1,
  objective: 'Read a connection log, separate normal traffic from attacks, and recommend a containment action.',
  intro:
    "02:00 at Harbor Cloud. Dex Holloway's SOC lit up like Ocean Drive on a Saturday night. Somewhere in this connection log the Pink Tide is moving. Flag every suspicious connection, name the threat, and tell Dex what to do.",
  passScore: 60,
  conceptCards: [
    {
      id: 'networking-ip-ports',
      title: 'IP addresses, ports & protocols',
      topic: 'networking',
      definition:
        'An IP address identifies a device on a network; a port identifies a service on that device. TCP gives reliable, connection-based delivery; UDP sends independent datagrams without a handshake.',
      whyItMatters: 'Every log line, firewall rule and alert speaks in IP:port/protocol. Reading them fluently is step one for any defender.',
      example: '10.20.5.21:52011 → 10.20.0.2:53/UDP is a workstation asking the internal DNS server to resolve a name.',
      bestPractice: 'Learn the common well-known ports (22, 53, 80, 123, 443, 587) so unusual ones stand out immediately.',
    },
    {
      id: 'networking-baseline',
      title: 'Traffic baselines',
      topic: 'networking',
      definition: 'A baseline is the documented "normal" pattern of who talks to whom, when, on which ports and how much.',
      whyItMatters: 'Anomalies only make sense compared with normal. Without a baseline, every alert is a guess.',
      example: 'Workstations normally send a few KB of HTTPS to the company cloud; a 4.8 GB upload to an unknown host at 3 AM breaks the baseline.',
      bestPractice: 'Collect flow logs continuously and alert on deviations in destination, volume and timing — not just on known-bad signatures.',
    },
    {
      id: 'networking-beaconing',
      title: 'Beaconing & command-and-control',
      topic: 'networking',
      definition: 'Beaconing is periodic outbound check-in traffic from malware to an attacker-controlled server (C2).',
      whyItMatters: 'Spotting the beacon finds the infected machine and the attacker infrastructure in one move.',
      example: 'One host connecting to the same external IP on port 4444 every 60 seconds with near-identical session sizes.',
      bestPractice: 'Isolate the host (keep it powered for forensics) and block the C2 address at egress; then hunt for the same indicator elsewhere.',
    },
    {
      id: 'networking-dns-tunneling',
      title: 'DNS tunneling',
      topic: 'networking',
      definition: 'Hiding data inside DNS queries or responses, often as long encoded subdomain labels, to sneak it past controls.',
      whyItMatters: 'DNS is allowed almost everywhere, which makes it a favorite covert channel.',
      example: 'TXT queries for a9f3c0d1e7b24f6a8c.x.pinktide.nb sent directly to an external resolver.',
      bestPractice: 'Force all clients to use internal resolvers, block outbound port 53 elsewhere, and alert on unusually long or high-entropy query names.',
    },
  ],
  mount: mountTraffic,
};
