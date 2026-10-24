// Blackout Protocol — power station OT defense (pure data and scoring, no DOM).

import { pairwiseOrder, weigh, type Explained, type Graded } from '../web/s2score';

export type LinkMode = 'allow' | 'deny' | 'oneway';

export interface Zone { id: string; name: string; level: string }
export const ZONES: Zone[] = [
  { id: 'it', name: 'Enterprise IT (email, office PCs)', level: 'Level 4–5' },
  { id: 'vendor', name: 'Vendor remote access', level: 'External' },
  { id: 'dmz', name: 'Industrial DMZ (jump host, historian mirror)', level: 'Level 3.5' },
  { id: 'scada', name: 'SCADA / HMI / engineering workstation', level: 'Level 2–3' },
  { id: 'plc', name: 'PLCs & field devices (breakers, turbines)', level: 'Level 0–1' },
];

export interface Link { id: string; from: string; to: string; label: string; correct: LinkMode; why: string }
export const LINKS: Link[] = [
  { id: 'it-scada', from: 'it', to: 'scada', label: 'IT → SCADA (direct RDP)', correct: 'deny', why: 'Office networks get phished. Never let them reach control systems directly.' },
  { id: 'it-dmz', from: 'it', to: 'dmz', label: 'IT → Industrial DMZ (read historian reports)', correct: 'allow', why: 'Business users read data from the DMZ mirror, not from the plant.' },
  { id: 'dmz-scada', from: 'dmz', to: 'scada', label: 'DMZ jump host → SCADA (MFA, logged)', correct: 'allow', why: 'Brokered, authenticated and recorded access is the only path into control.' },
  { id: 'scada-dmz', from: 'scada', to: 'dmz', label: 'SCADA historian → DMZ mirror', correct: 'oneway', why: 'A one-way data diode lets data out physically without letting anything in.' },
  { id: 'vendor-scada', from: 'vendor', to: 'scada', label: 'Vendor → SCADA (always-on VPN)', correct: 'deny', why: 'Vendors connect through the DMZ jump host, time-limited and with MFA — never straight into control.' },
  { id: 'scada-plc', from: 'scada', to: 'plc', label: 'SCADA → PLCs (control traffic)', correct: 'allow', why: 'Operators must control the plant; restrict to known HMIs and protocols.' },
  { id: 'it-plc', from: 'it', to: 'plc', label: 'IT → PLCs', correct: 'deny', why: 'No business reason exists for office systems to talk to field devices.' },
];

export interface Alert { id: string; title: string; detail: string; options: { id: string; label: string; ok: boolean; why: string }[] }
export const ALERTS: Alert[] = [
  {
    id: 'rdp', title: 'RDP session from an office PC to the engineering workstation', detail: 'Source 10.10.7.44 (finance laptop) → EWS-02 at 02:10, user "kmendes", Kai is asleep at home.',
    options: [
      { id: 'kill', label: 'Terminate the session, disable the account, isolate the finance laptop, preserve logs', ok: true, why: 'Stop the intruder’s foothold while keeping evidence.' },
      { id: 'rebootall', label: 'Reboot every PLC to "clear" the attack', ok: false, why: 'Rebooting live controllers can trip turbines and black out the city — and destroys evidence.' },
      { id: 'ignore', label: 'Ignore it: Kai sometimes works late', ok: false, why: 'Kai is asleep and the source is a finance laptop. Verify, don’t assume.' },
    ],
  },
  {
    id: 'modbus', title: 'Unexpected Modbus write commands to Turbine PLC-3', detail: 'New host 10.40.2.99 writing setpoints to PLC-3 every 4 seconds. Turbine RPM creeping up.',
    options: [
      { id: 'manual', label: 'Operators switch Turbine 3 to manual/local control; block 10.40.2.99 at the OT firewall', ok: true, why: 'Safety first: take the process out of the attacker’s hands, then cut their access.' },
      { id: 'firmware', label: 'Push an emergency firmware update to PLC-3 right now', ok: false, why: 'Untested changes to a running safety-critical controller can cause the very failure you fear.' },
      { id: 'unplug', label: 'Pull the power cord on PLC-3', ok: false, why: 'An uncontrolled stop of a spinning turbine is dangerous. Coordinate a safe shutdown with operations.' },
    ],
  },
  {
    id: 'vendor', title: 'Vendor remote-access account without MFA', detail: 'Account "turbinecare-support" logged in 3× this week at 4 AM from 198.51.100.40.',
    options: [
      { id: 'disable', label: 'Disable it; re-enable only via the DMZ jump host with MFA and time-boxed approval', ok: true, why: 'Third-party access is a top OT entry point. Make it on-demand, monitored and multi-factor.' },
      { id: 'keep', label: 'Keep it enabled — the vendor needs 24/7 access', ok: false, why: 'Always-on, single-factor vendor access is exactly what attackers look for.' },
      { id: 'pw', label: 'Email the vendor a new password', ok: false, why: 'Changing a password over email doesn’t fix the missing MFA or the open path.' },
    ],
  },
];

export const STEPS = [
  { id: 'safety', label: 'Confirm safety with the shift supervisor; protect people and equipment first' },
  { id: 'manual', label: 'Switch affected processes to manual control' },
  { id: 'isolate', label: 'Isolate the rogue host and the compromised accounts' },
  { id: 'evidence', label: 'Preserve evidence (network captures, controller logs, EWS image)' },
  { id: 'eradicate', label: 'Rebuild the engineering workstation from a known-good image' },
  { id: 'restore', label: 'Restore automation gradually, verifying every setpoint' },
  { id: 'lessons', label: 'Lessons learned with operations, IT and the vendor' },
];
export const IDEAL = STEPS.map((s) => s.id);
export const TRAPS = [
  { id: 'patchpeak', label: 'Patch all PLCs immediately during peak load' },
  { id: 'gridoff', label: 'Shut down the entire city grid "to be safe"' },
];

export const PRIORITY_Q = {
  question: 'In a power station, which goal usually comes first?',
  options: [
    { id: 'safety', label: 'Safety and availability of the physical process, then integrity, then confidentiality' },
    { id: 'conf', label: 'Confidentiality first, like an office network' },
    { id: 'speed', label: 'Patching speed above everything' },
  ],
  correct: 'safety',
};

export const HINTS = [
  'Think in layers: office ↔ DMZ ↔ control ↔ field. Nothing should skip a layer, and data should leave the plant one-way.',
  'In OT, a "fix" that stops a turbine suddenly can hurt people. Manual control and isolation come before patches and reboots.',
  'Order: people safe → process under control → attacker cut off → evidence → clean up → restore → learn.',
];

export interface GridInput {
  links: Record<string, LinkMode | undefined>;
  alerts: Record<string, string | undefined>;
  order: string[];
  priority: string | null;
}

export function freshGrid(): GridInput {
  return { links: {}, alerts: {}, order: [], priority: null };
}

export function scoreGrid(input: GridInput): Graded {
  const items: Explained[] = [];
  const mistakes: string[] = [];
  let linkHits = 0;
  for (const l of LINKS) {
    const ok = input.links[l.id] === l.correct;
    if (ok) linkHits++;
    else mistakes.push(`${l.label}: should be ${l.correct}`);
    items.push({ title: l.label, ok, text: `${l.correct.toUpperCase()}. ${l.why}` });
  }
  let alertHits = 0;
  for (const a of ALERTS) {
    const pick = a.options.find((o) => o.id === input.alerts[a.id]);
    const best = a.options.find((o) => o.ok)!;
    const ok = !!pick?.ok;
    if (ok) alertHits++;
    else mistakes.push(`${a.title}: unsafe or missing response`);
    items.push({ title: a.title, ok, text: ok ? best.why : `${pick ? pick.why + ' ' : ''}Do this: ${best.label}.` });
  }
  const trapsUsed = input.order.filter((id) => TRAPS.some((t) => t.id === id)).length;
  const orderFrac = Math.max(0, pairwiseOrder(input.order, IDEAL) * (input.order.filter((id) => IDEAL.includes(id)).length / IDEAL.length) - trapsUsed * 0.25);
  items.push({ title: 'Incident sequence', ok: orderFrac >= 0.95, text: 'Safety → manual control → isolate → preserve evidence → rebuild → restore gradually → lessons learned.' + (trapsUsed ? ' Never patch live controllers at peak or black out the city on purpose.' : '') });
  if (trapsUsed) mistakes.push('Included a dangerous step in the OT playbook');
  const prOk = input.priority === PRIORITY_Q.correct;
  items.push({ title: 'OT priorities', ok: prOk, text: 'In operational technology, safety and availability usually outrank confidentiality — the reverse of most office IT.' });
  const { score, breakdown } = weigh([
    { label: 'Network segmentation (Purdue model)', frac: linkHits / LINKS.length, max: 35 },
    { label: 'Safe alert responses', frac: alertHits / ALERTS.length, max: 30 },
    { label: 'Incident sequence', frac: orderFrac, max: 25 },
    { label: 'OT priorities', frac: prOk ? 1 : 0, max: 10 },
  ]);
  return { score, breakdown, items, mistakes };
}

export function perfectGrid(): GridInput {
  const links: GridInput['links'] = {};
  for (const l of LINKS) links[l.id] = l.correct;
  const alerts: GridInput['alerts'] = {};
  for (const a of ALERTS) alerts[a.id] = a.options.find((o) => o.ok)!.id;
  return { links, alerts, order: [...IDEAL], priority: 'safety' };
}
