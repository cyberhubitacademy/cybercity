import type { ChallengeDefinition } from '../../types';
import { mountFirewall } from './ui';

export const firewallChallenge: ChallengeDefinition = {
  id: 'firewall-1',
  title: 'Walls of the Harbor',
  topic: 'firewall',
  difficulty: 2,
  objective: 'Build an ordered, least-privilege firewall ruleset that keeps business services running and blocks every attack path.',
  intro:
    "Tito Ramos inherited Harbor Cloud's firewall from a contractor who \"just wanted things to work\". It shows. The Pink Tide is already probing the edge. Rewrite the ruleset, test it against live traffic, and deploy before they find the open doors.",
  passScore: 70,
  conceptCards: [
    {
      id: 'firewall-first-match',
      title: 'First-match rule evaluation',
      topic: 'firewall',
      definition: 'Most firewalls check rules from top to bottom and apply the first rule that matches a packet; later rules are never consulted for that packet.',
      whyItMatters: 'Order is security. A broad ALLOW placed above a specific DENY silently cancels the DENY.',
      example: '"ALLOW any → any" at line 1 makes every rule below it dead code.',
      bestPractice: 'Put specific rules before general ones, and audit for shadowed rules that can never fire.',
    },
    {
      id: 'firewall-default-deny',
      title: 'Default deny',
      topic: 'firewall',
      definition: 'A policy where any traffic not explicitly allowed is blocked.',
      whyItMatters: 'You cannot list every attack, but you can list what the business needs. Everything else stays closed automatically.',
      example: 'With default deny, forgetting to block port 3389 does not expose RDP — it was never allowed.',
      bestPractice: 'End every ruleset with an explicit or implicit deny-all and log what it drops.',
    },
    {
      id: 'firewall-least-privilege',
      title: 'Least privilege for network access',
      topic: 'firewall',
      definition: 'Each system gets only the network access it strictly needs — specific source, destination, port and protocol.',
      whyItMatters: 'Broad rules turn one compromised machine into access to everything.',
      example: 'Only the app server (10.0.1.20) may reach the database on 3306 — not the web server, not the internet.',
      bestPractice: 'Avoid "any" in ALLOW rules; restrict admin protocols such as SSH to a VPN or bastion host.',
    },
    {
      id: 'firewall-segmentation',
      title: 'Network segmentation',
      topic: 'firewall',
      definition: 'Splitting a network into zones (e.g., DMZ, application, database, admin) with controlled paths between them.',
      whyItMatters: 'Segmentation limits lateral movement: an attacker who breaks the web server still cannot touch the data directly.',
      example: 'Internet → DMZ:443 → App:8080 → DB:3306, with no shortcuts between non-adjacent tiers.',
      bestPractice: 'Design tiered zones, enforce them with firewalls, and test that blocked paths really are blocked.',
    },
  ],
  mount: mountFirewall,
};
