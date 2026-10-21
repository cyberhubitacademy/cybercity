// "Something on the Wire" — synthetic Harbor Cloud SOC connection log.
// Every row is generated deterministically from a seed; anomalies are fixed
// patterns so the lesson is the same for every player.

import { clampScore, type ScoreLine } from '../../types';

export type Proto = 'TCP' | 'UDP' | 'ICMP';
export type AnomalyLabel = 'beacon' | 'scan' | 'exfil' | 'insecure' | 'dnstunnel';

export const LABEL_NAMES: Record<AnomalyLabel, string> = {
  beacon: 'Beaconing / C2',
  scan: 'Port scan',
  exfil: 'Data exfiltration',
  insecure: 'Insecure protocol',
  dnstunnel: 'DNS tunneling',
};

export const ALL_LABELS: AnomalyLabel[] = ['beacon', 'scan', 'exfil', 'insecure', 'dnstunnel'];

export interface ConnRow {
  id: number;
  /** HH:MM:SS, all on the same night. */
  time: string;
  src: string;
  dst: string;
  sport: number;
  dport: number;
  proto: Proto;
  /** Zeek-style connection state: SF (normal close), S0 (no reply), REJ (rejected), RSTO, EST. */
  state: string;
  bytes: number;
  service: string;
  info: string;
  /** Ground truth — never shown in the UI. */
  truth: AnomalyLabel | null;
}

const SERVICES: Record<string, string> = {
  'TCP/22': 'ssh',
  'TCP/23': 'telnet',
  'TCP/25': 'smtp',
  'TCP/80': 'http',
  'TCP/443': 'https',
  'TCP/587': 'smtp-submission',
  'TCP/3306': 'mysql',
  'TCP/3389': 'rdp',
  'TCP/4444': 'unknown',
  'TCP/8000': 'http-alt',
  'TCP/8080': 'http-proxy',
  'UDP/53': 'dns',
  'TCP/53': 'dns',
  'UDP/123': 'ntp',
};

/** Service name derived from destination port + protocol (consistent across the table). */
export function serviceFor(port: number, proto: Proto): string {
  if (proto === 'ICMP') return 'icmp';
  return SERVICES[`${proto}/${port}`] ?? 'unknown';
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

const T0 = 2 * 3600; // 02:00:00

export function generateTraffic(seed = 1985): ConnRow[] {
  const r = rng(seed);
  const eph = () => 49152 + Math.floor(r() * 16000);
  const between = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo));
  type Draft = Omit<ConnRow, 'id' | 'service' | 'time'> & { t: number };
  const d: Draft[] = [];

  // ---- Normal background traffic ----
  const workstations = ['10.20.5.21', '10.20.5.33', '10.20.6.8', '10.20.6.12'];
  for (let i = 0; i < 5; i++) {
    d.push({
      t: T0 + between(60, 3800), src: workstations[i % workstations.length], dst: '10.20.0.2',
      sport: eph(), dport: 53, proto: 'UDP', state: 'SF', bytes: between(90, 260),
      info: `query A ${['portal.harborcloud.nb', 'mail.sunsetshield.nb', 'cdn.harborcloud.nb', 'intranet.harborcloud.nb', 'time.harborcloud.nb'][i]}`,
      truth: null,
    });
  }
  for (let i = 0; i < 4; i++) {
    d.push({
      t: T0 + between(60, 3800), src: workstations[(i + 1) % workstations.length], dst: '10.40.1.10',
      sport: eph(), dport: 443, proto: 'TCP', state: 'SF', bytes: between(4000, 180000),
      info: 'TLS 1.3 → storage.harborcloud.nb', truth: null,
    });
  }
  d.push({
    t: T0 + between(60, 3800), src: '10.20.0.5', dst: '10.20.0.3', sport: 123, dport: 123, proto: 'UDP',
    state: 'SF', bytes: 96, info: 'time sync with internal NTP', truth: null,
  });
  d.push({
    t: T0 + between(60, 3800), src: '10.20.0.25', dst: '10.40.1.25', sport: eph(), dport: 587, proto: 'TCP',
    state: 'SF', bytes: between(8000, 40000), info: 'mail relay (STARTTLS)', truth: null,
  });
  d.push({
    t: T0 + between(60, 3800), src: '10.20.6.8', dst: '10.40.1.10', sport: eph(), dport: 443, proto: 'TCP',
    state: 'SF', bytes: between(2000, 9000), info: 'TLS 1.3 → api.harborcloud.nb', truth: null,
  });

  // ---- Anomaly: beaconing every 60s to an odd high port ----
  const beaconStart = T0 + 10 * 60 + between(0, 20);
  for (let i = 0; i < 4; i++) {
    d.push({
      t: beaconStart + i * 60, src: '10.20.5.14', dst: '203.0.113.66', sport: eph(), dport: 4444, proto: 'TCP',
      state: 'SF', bytes: 312 + (i % 2) * 8, info: 'small, identical-size session', truth: 'beacon',
    });
  }

  // ---- Anomaly: port scan — one source walking sequential ports ----
  const scanStart = T0 + 25 * 60 + between(0, 30);
  for (let i = 0; i < 4; i++) {
    d.push({
      t: scanStart + i, src: '198.51.100.9', dst: '10.20.1.5', sport: 41000, dport: 8000 + i, proto: 'TCP',
      state: 'REJ', bytes: 0, info: 'SYN → RST', truth: 'scan',
    });
  }

  // ---- Anomaly: huge outbound transfer at 03:00 ----
  d.push({
    t: 3 * 3600 + 12, src: '10.20.7.40', dst: '198.51.100.23', sport: eph(), dport: 443, proto: 'TCP',
    state: 'SF', bytes: 4_812_334_112, info: 'TLS → unknown host, 4.8 GB out', truth: 'exfil',
  });

  // ---- Anomaly: inbound Telnet from the internet ----
  for (let i = 0; i < 2; i++) {
    d.push({
      t: T0 + 40 * 60 + i * 95, src: '198.51.100.77', dst: '10.20.1.23', sport: eph(), dport: 23, proto: 'TCP',
      state: 'EST', bytes: between(600, 2400), info: 'cleartext login prompt', truth: 'insecure',
    });
  }

  // ---- Anomaly: DNS tunneling — long random subdomains, external resolver ----
  const chunks = ['a9f3c0d1e7b24f6a8c', '77b0e1fe93a4c5d2b1', '0c4d8e2f6a1b3c5d7e'];
  for (let i = 0; i < 3; i++) {
    d.push({
      t: T0 + 48 * 60 + i * 7, src: '10.20.5.31', dst: '192.0.2.53', sport: eph(), dport: 53, proto: 'UDP',
      state: 'SF', bytes: 410 + i * 3, info: `query TXT ${chunks[i]}.x.pinktide.nb`, truth: 'dnstunnel',
    });
  }

  d.sort((a, b) => a.t - b.t);
  return d.map((row, i) => {
    const { t, ...rest } = row;
    return { ...rest, id: i + 1, time: hms(t), service: serviceFor(rest.dport, rest.proto) };
  });
}

export interface AnomalyInfo {
  title: string;
  clue: string;
  explanation: string;
}

export const ANOMALY_INFO: Record<AnomalyLabel, AnomalyInfo> = {
  beacon: {
    title: 'Beaconing / command-and-control',
    clue: '10.20.5.14 → 203.0.113.66:4444 exactly every 60 seconds, same tiny size.',
    explanation:
      'Malware "phones home" on a timer to ask its controller for orders. Humans are irregular — perfectly periodic, same-sized sessions to an unusual high port are a classic C2 heartbeat.',
  },
  scan: {
    title: 'Port scan',
    clue: '198.51.100.9 hits ports 8000, 8001, 8002, 8003 within seconds; every attempt is rejected (REJ).',
    explanation:
      'A scanner knocks on door after door to see which services answer. One source + sequential ports + failed/reset connections = reconnaissance.',
  },
  exfil: {
    title: 'Data exfiltration',
    clue: '10.20.7.40 sends 4.8 GB to an unknown external host at 03:00.',
    explanation:
      'Port 443 looks innocent, but a multi-gigabyte upload to an unfamiliar address in the middle of the night is way off baseline. Attackers hide stolen data inside "normal" HTTPS.',
  },
  insecure: {
    title: 'Insecure protocol exposed',
    clue: 'Inbound TCP/23 (Telnet) from the internet to 10.20.1.23, connection established.',
    explanation:
      'Telnet sends usernames and passwords in cleartext and should never face the internet. Replace it with SSH and block port 23 at the perimeter.',
  },
  dnstunnel: {
    title: 'DNS tunneling',
    clue: '10.20.5.31 queries long random-looking TXT subdomains at an external resolver (192.0.2.53).',
    explanation:
      'Workstations should use the internal resolver (10.20.0.2). Long encoded subdomains sent to an outside DNS server can smuggle data out in the query names themselves.',
  },
};

export interface ActionOption {
  id: string;
  text: string;
  correct: boolean;
  explain: string;
}

export const ACTIONS: ActionOption[] = [
  {
    id: 'isolate-block',
    text: 'Isolate host 10.20.5.14 from the network and block 203.0.113.66 at the egress firewall',
    correct: true,
    explain: 'Cutting the infected host off and blocking the C2 server stops the attacker from steering the malware, while keeping the machine powered on for forensics.',
  },
  {
    id: 'reboot',
    text: 'Reboot every workstation in the building',
    correct: false,
    explain: 'Rebooting wipes volatile evidence (memory, live connections) and usually does not remove persistent malware.',
  },
  {
    id: 'block-443',
    text: 'Block all outbound port 443 traffic company-wide',
    correct: false,
    explain: 'That would break every legitimate HTTPS service — a self-inflicted outage. Block the specific bad destination instead.',
  },
  {
    id: 'ignore',
    text: 'Do nothing — it is probably a false positive',
    correct: false,
    explain: 'Multiple independent anomalies point to an active intrusion. Ignoring them lets the attacker keep working.',
  },
];

export interface TrafficScore {
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  found: Record<AnomalyLabel, { found: number; total: number }>;
  falsePositives: number[];
  wrongLabels: number[];
  missed: number[];
  actionCorrect: boolean;
  mistakes: string[];
}

/**
 * Score the investigation.
 *   Detection 40 (recall) · Precision 20 (−5 per normal row flagged)
 *   Labels 25 (correctly labelled anomalies / all anomalies) · Action 15
 */
export function scoreTraffic(
  rows: ConnRow[],
  flags: Map<number, AnomalyLabel | null>,
  actionId: string | null,
  passScore = 60,
): TrafficScore {
  const anomalies = rows.filter((r) => r.truth !== null);
  const found = Object.fromEntries(ALL_LABELS.map((l) => [l, { found: 0, total: 0 }])) as TrafficScore['found'];
  const falsePositives: number[] = [];
  const wrongLabels: number[] = [];
  const missed: number[] = [];
  let hits = 0;
  let rightLabels = 0;

  for (const row of anomalies) {
    const truth = row.truth as AnomalyLabel;
    found[truth].total++;
    if (flags.has(row.id)) {
      hits++;
      found[truth].found++;
      if (flags.get(row.id) === truth) rightLabels++;
      else wrongLabels.push(row.id);
    } else missed.push(row.id);
  }
  for (const id of flags.keys()) {
    const row = rows.find((r) => r.id === id);
    if (row && row.truth === null) falsePositives.push(id);
  }

  const action = ACTIONS.find((a) => a.id === actionId);
  const actionCorrect = !!action?.correct;
  const detection = (40 * hits) / anomalies.length;
  const precision = Math.max(0, 20 - 5 * falsePositives.length);
  const labels = (25 * rightLabels) / anomalies.length;
  const actionPts = actionCorrect ? 15 : 0;
  const score = clampScore(detection + precision + labels + actionPts);

  const mistakes: string[] = [];
  for (const l of ALL_LABELS) {
    if (found[l].found < found[l].total) mistakes.push(`Missed ${LABEL_NAMES[l]} traffic (${ANOMALY_INFO[l].clue})`);
  }
  if (falsePositives.length) mistakes.push(`Flagged ${falsePositives.length} normal connection(s) as malicious — know your baseline.`);
  if (wrongLabels.length) mistakes.push(`Mislabelled ${wrongLabels.length} suspicious connection(s).`);
  if (!actionCorrect) mistakes.push('Chose an ineffective response — contain the infected host and block the C2 address.');

  return {
    score,
    passed: score >= passScore,
    breakdown: [
      { label: 'Threats detected', value: Math.round(detection), max: 40 },
      { label: 'Precision (no false alarms)', value: precision, max: 20 },
      { label: 'Correct classification', value: Math.round(labels), max: 25 },
      { label: 'Defensive action', value: actionPts, max: 15 },
    ],
    found,
    falsePositives,
    wrongLabels,
    missed,
    actionCorrect,
    mistakes,
  };
}

export const PORT_CHEATSHEET: { port: string; name: string; note: string }[] = [
  { port: '53/udp', name: 'DNS', note: 'Name → IP lookups. Should go to YOUR resolver.' },
  { port: '123/udp', name: 'NTP', note: 'Clock sync. Small, regular packets are normal.' },
  { port: '443/tcp', name: 'HTTPS', note: 'Encrypted web. Watch volume and destination.' },
  { port: '587/tcp', name: 'SMTP submit', note: 'Mail server sending email.' },
  { port: '22/tcp', name: 'SSH', note: 'Encrypted remote admin.' },
  { port: '23/tcp', name: 'Telnet', note: 'Cleartext remote login — legacy & unsafe.' },
  { port: '4444/tcp', name: '???', note: 'No standard service. Often seen with attack tooling.' },
];

export const HINTS = [
  'Normal traffic has a pattern: DNS goes to the internal resolver 10.20.0.2, HTTPS goes to Harbor Cloud (10.40.x.x). Start by finding rows that break that pattern.',
  'Sort by source in your head: one host talking to the same outside IP on a timer is a heartbeat. One outside IP touching many ports in a row is a scanner.',
  'Check the Bytes column for a monster upload, the Port column for 23, and the Info column for weirdly long DNS names. There are 14 suspicious rows in total.',
];
