// "Walls of the Harbor" — ordered, first-match firewall simulation.

import { clampScore, type ScoreLine } from '../../types';

export type Zone = 'internet' | 'dmz' | 'app' | 'db' | 'admin-vpn';
export type Endpoint = 'any' | Zone;
export type Port = 'any' | 22 | 23 | 80 | 443 | 3306 | 3389 | 8080;
export type RuleProto = 'any' | 'tcp' | 'udp';
export type FwAction = 'ALLOW' | 'DENY';

export const ZONES: Zone[] = ['internet', 'dmz', 'app', 'db', 'admin-vpn'];
export const ENDPOINTS: Endpoint[] = ['any', ...ZONES];
export const PORTS: Port[] = ['any', 22, 23, 80, 443, 3306, 3389, 8080];
export const PROTOS: RuleProto[] = ['any', 'tcp', 'udp'];

export const ZONE_INFO: Record<Zone, { name: string; addr: string }> = {
  internet: { name: 'Internet', addr: '0.0.0.0/0' },
  dmz: { name: 'DMZ web server', addr: '192.0.2.10' },
  app: { name: 'App server', addr: '10.0.1.20' },
  db: { name: 'Database', addr: '10.0.2.30' },
  'admin-vpn': { name: 'Admin VPN', addr: '10.9.0.0/24' },
};

export const PORT_NAMES: Record<string, string> = {
  any: 'any', 22: 'SSH', 23: 'Telnet', 80: 'HTTP', 443: 'HTTPS', 3306: 'MySQL', 3389: 'RDP', 8080: 'App API',
};

export interface Rule {
  id: string;
  action: FwAction;
  src: Endpoint;
  dst: Endpoint;
  port: Port;
  proto: RuleProto;
}

export interface Flow {
  id: string;
  label: string;
  src: Zone;
  dst: Zone;
  port: number;
  proto: 'tcp' | 'udp';
  /** Should this flow be allowed? */
  legit: boolean;
  why: string;
}

export function ruleMatches(rule: Rule, flow: Flow): boolean {
  return (
    (rule.src === 'any' || rule.src === flow.src) &&
    (rule.dst === 'any' || rule.dst === flow.dst) &&
    (rule.port === 'any' || rule.port === flow.port) &&
    (rule.proto === 'any' || rule.proto === flow.proto)
  );
}

/** First matching rule wins; if nothing matches, the default action applies (ruleIndex -1). */
export function evaluate(rules: Rule[], flow: Flow, defaultAction: FwAction): { action: FwAction; ruleIndex: number } {
  for (let i = 0; i < rules.length; i++) {
    if (ruleMatches(rules[i], flow)) return { action: rules[i].action, ruleIndex: i };
  }
  return { action: defaultAction, ruleIndex: -1 };
}

/** True if `outer` matches every flow `inner` could match. */
function covers(outer: Rule, inner: Rule): boolean {
  const f = <T>(o: T | 'any', i: T | 'any') => o === 'any' || o === i;
  return f(outer.src, inner.src) && f(outer.dst, inner.dst) && f(outer.port, inner.port) && f(outer.proto, inner.proto);
}

/** Indices of rules that can never fire because an earlier rule already matches all their traffic. */
export function findShadowed(rules: Rule[]): number[] {
  const out: number[] = [];
  for (let j = 0; j < rules.length; j++) {
    for (let i = 0; i < j; i++) {
      if (covers(rules[i], rules[j])) { out.push(j); break; }
    }
  }
  return out;
}

/** An ALLOW that opens any port, or accepts any source, violates least privilege. */
export function isOverlyBroad(rule: Rule): boolean {
  return rule.action === 'ALLOW' && (rule.port === 'any' || rule.src === 'any');
}

export const FLOWS: Flow[] = [
  { id: 'f1', label: 'Customers browse the site (HTTPS)', src: 'internet', dst: 'dmz', port: 443, proto: 'tcp', legit: true, why: 'The public website must be reachable over HTTPS.' },
  { id: 'f2', label: 'Customers hit http:// (redirect to HTTPS)', src: 'internet', dst: 'dmz', port: 80, proto: 'tcp', legit: true, why: 'Port 80 stays open only to redirect visitors to HTTPS.' },
  { id: 'f3', label: 'Web server calls the app API', src: 'dmz', dst: 'app', port: 8080, proto: 'tcp', legit: true, why: 'The web tier needs exactly one door into the app tier.' },
  { id: 'f4', label: 'App server queries the database', src: 'app', dst: 'db', port: 3306, proto: 'tcp', legit: true, why: 'Only the app tier should talk to the database.' },
  { id: 'f5', label: 'Tito SSHes into the web server', src: 'admin-vpn', dst: 'dmz', port: 22, proto: 'tcp', legit: true, why: 'Admins manage servers over SSH — only from the VPN.' },
  { id: 'f6', label: 'Tito SSHes into the app server', src: 'admin-vpn', dst: 'app', port: 22, proto: 'tcp', legit: true, why: 'Admin access via VPN.' },
  { id: 'f7', label: 'Tito SSHes into the database', src: 'admin-vpn', dst: 'db', port: 22, proto: 'tcp', legit: true, why: 'Admin access via VPN.' },
  { id: 'a1', label: 'Pink Tide connects straight to MySQL', src: 'internet', dst: 'db', port: 3306, proto: 'tcp', legit: false, why: 'A database must never be reachable from the internet.' },
  { id: 'a2', label: 'Bot brute-forces SSH on the web server', src: 'internet', dst: 'dmz', port: 22, proto: 'tcp', legit: false, why: 'SSH should only be reachable through the admin VPN.' },
  { id: 'a3', label: 'Attacker tries RDP on the app server', src: 'internet', dst: 'app', port: 3389, proto: 'tcp', legit: false, why: 'Remote desktop exposed to the internet is a top ransomware entry point.' },
  { id: 'a4', label: 'Attacker skips the web tier, hits the app API', src: 'internet', dst: 'app', port: 8080, proto: 'tcp', legit: false, why: 'Internal tiers must not be directly reachable from outside.' },
  { id: 'a5', label: 'Hacked web server queries the database', src: 'dmz', dst: 'db', port: 3306, proto: 'tcp', legit: false, why: 'Segmentation: if the DMZ falls, it must not reach the data directly.' },
  { id: 'a6', label: 'Scanner probes Telnet on the web server', src: 'internet', dst: 'dmz', port: 23, proto: 'tcp', legit: false, why: 'Cleartext Telnet has no business being exposed.' },
  { id: 'a7', label: 'Database uploads to an outside server', src: 'db', dst: 'internet', port: 443, proto: 'tcp', legit: false, why: 'Databases should not initiate outbound internet connections — classic exfiltration path.' },
];

let ruleSeq = 0;
export function newRule(partial: Partial<Rule> = {}): Rule {
  ruleSeq++;
  return { id: `r${ruleSeq}`, action: 'ALLOW', src: 'internet', dst: 'dmz', port: 443, proto: 'tcp', ...partial };
}

/** Deliberately broken starting point. */
export function starterRules(): Rule[] {
  return [
    newRule({ action: 'ALLOW', src: 'any', dst: 'any', port: 'any', proto: 'any' }),
    newRule({ action: 'ALLOW', src: 'internet', dst: 'db', port: 3306, proto: 'tcp' }),
    newRule({ action: 'ALLOW', src: 'internet', dst: 'dmz', port: 443, proto: 'tcp' }),
    newRule({ action: 'DENY', src: 'internet', dst: 'any', port: 23, proto: 'tcp' }),
  ];
}
export const STARTER_DEFAULT: FwAction = 'ALLOW';

/** A model answer (one of several valid ones). */
export function referenceRules(): Rule[] {
  return [
    newRule({ action: 'ALLOW', src: 'internet', dst: 'dmz', port: 443, proto: 'tcp' }),
    newRule({ action: 'ALLOW', src: 'internet', dst: 'dmz', port: 80, proto: 'tcp' }),
    newRule({ action: 'ALLOW', src: 'dmz', dst: 'app', port: 8080, proto: 'tcp' }),
    newRule({ action: 'ALLOW', src: 'app', dst: 'db', port: 3306, proto: 'tcp' }),
    newRule({ action: 'ALLOW', src: 'admin-vpn', dst: 'any', port: 22, proto: 'tcp' }),
  ];
}

export interface FlowOutcome {
  flow: Flow;
  action: FwAction;
  ruleIndex: number;
  correct: boolean;
}

export function simulate(rules: Rule[], defaultAction: FwAction): FlowOutcome[] {
  return FLOWS.map((flow) => {
    const r = evaluate(rules, flow, defaultAction);
    return { flow, action: r.action, ruleIndex: r.ruleIndex, correct: (r.action === 'ALLOW') === flow.legit };
  });
}

export interface FirewallScore {
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  outcomes: FlowOutcome[];
  broadRules: number[];
  shadowed: number[];
  mistakes: string[];
}

/**
 * Legit services 35 · Attacks blocked 40 · Least privilege 15 · Tidy ruleset 10
 */
export function scoreFirewall(rules: Rule[], defaultAction: FwAction, passScore = 70): FirewallScore {
  const outcomes = simulate(rules, defaultAction);
  const legit = outcomes.filter((o) => o.flow.legit);
  const attacks = outcomes.filter((o) => !o.flow.legit);
  const legitOk = legit.filter((o) => o.correct).length;
  const attacksOk = attacks.filter((o) => o.correct).length;
  const broadRules = rules.map((r, i) => (isOverlyBroad(r) ? i : -1)).filter((i) => i >= 0);
  const shadowed = findShadowed(rules);

  const legitPts = (35 * legitOk) / legit.length;
  const attackPts = (40 * attacksOk) / attacks.length;
  let lp = 15 - 5 * broadRules.length;
  if (defaultAction === 'ALLOW') lp -= 10;
  lp = Math.max(0, lp);
  const n = rules.length;
  const tidy = n === 0 ? 0 : n <= 8 ? 10 : n <= 11 ? 5 : 0;
  const score = clampScore(legitPts + attackPts + lp + tidy);

  const mistakes: string[] = [];
  for (const o of outcomes) {
    if (!o.correct) {
      mistakes.push(o.flow.legit
        ? `Blocked a legitimate service: ${o.flow.label}.`
        : `Let an attack through: ${o.flow.label} — ${o.flow.why}`);
    }
  }
  if (broadRules.length) mistakes.push('Used overly broad ALLOW rules (any source or any port) — violates least privilege.');
  if (defaultAction === 'ALLOW') mistakes.push('Default policy was ALLOW — anything you forgot to block gets in. Use default deny.');

  return {
    score,
    passed: score >= passScore,
    breakdown: [
      { label: 'Business services working', value: Math.round(legitPts), max: 35 },
      { label: 'Attacks blocked', value: Math.round(attackPts), max: 40 },
      { label: 'Least privilege', value: lp, max: 15 },
      { label: 'Tidy ruleset', value: tidy, max: 10 },
    ],
    outcomes,
    broadRules,
    shadowed,
    mistakes,
  };
}

export const HINTS = [
  'Firewalls read rules top to bottom and stop at the FIRST match. That "ALLOW any → any" at the top means nothing below it ever runs.',
  'Flip the default policy to DENY. Then you only need ALLOW rules for the traffic the business actually needs — everything else is blocked automatically.',
  'You need just five ALLOW rules: internet→DMZ 443, internet→DMZ 80, DMZ→app 8080, app→DB 3306, admin-VPN→any 22.',
];
