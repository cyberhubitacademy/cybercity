import type { ChallengeDefinition } from '../../types';
import { mountGrid } from './ui';

export const gridChallenge: ChallengeDefinition = {
  id: 'grid-1',
  title: 'Blackout Protocol',
  topic: 'ics',
  difficulty: 3,
  objective: 'Defend a power station: segment OT with the Purdue model, respond safely to live industrial alerts, and run the incident in a safety-first order.',
  intro:
    "2:14 AM. Kai Mendes calls from the control room, voice shaking: \"Turbine 3 is spinning up on its own.\" If the grid trips, Neon Bay General loses power — 112 patients on life support, backup generators for 40 minutes. Black Lotus is inside the plant. Keep the lights on.",
  passScore: 65,
  conceptCards: [
    { id: 'ics-purdue', title: 'Purdue model & OT segmentation', topic: 'ics', definition: 'A layered reference model separating enterprise IT, an industrial DMZ, supervisory control and field devices.', whyItMatters: 'Most OT attacks start in IT. Layers stop an office compromise from reaching physical equipment.', example: 'Office users read plant data from a DMZ mirror instead of connecting to SCADA.', bestPractice: 'No direct IT→OT paths; broker access through the industrial DMZ; allow only required industrial protocols.' },
    { id: 'ics-safety-first', title: 'Safety first in OT incidents', topic: 'ics', definition: 'In industrial systems, protecting people and the physical process outranks other goals.', whyItMatters: 'IT reflexes like rebooting or patching immediately can cause explosions, blackouts or injuries in OT.', example: 'Operators take Turbine 3 to manual control before anyone touches the PLC.', bestPractice: 'Plan responses with operations, use manual fallback, test changes, and patch in maintenance windows.' },
    { id: 'ics-remote-access', title: 'Third-party remote access', topic: 'ics', definition: 'Vendors and integrators connecting to industrial systems for support.', whyItMatters: 'Always-on vendor VPNs without MFA are a leading cause of OT intrusions.', example: '"turbinecare-support" logging in at 4 AM with only a password.', bestPractice: 'On-demand, time-boxed access through a monitored jump host with MFA and session recording.' },
    { id: 'ics-data-diode', title: 'One-way data transfer (data diode)', topic: 'ics', definition: 'Hardware that physically allows data to flow in only one direction.', whyItMatters: 'Business teams get plant data without opening any path back into control systems.', example: 'The historian replicates to the DMZ mirror through a diode.', bestPractice: 'Use one-way transfers for monitoring/reporting data leaving critical zones.' },
  ],
  mount: mountGrid,
};
