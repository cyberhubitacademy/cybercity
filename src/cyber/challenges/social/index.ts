import type { ChallengeDefinition } from '../../types';
import { mountSocial } from './ui';

const PASS = 60;

export const socialChallenge: ChallengeDefinition = {
  id: 'social-1',
  title: 'Voice on the Line',
  topic: 'social',
  difficulty: 1,
  objective: 'Recognize pretexting, authority and urgency tactics, and respond with verification procedures instead of trust.',
  intro:
    'Palmetto Bank\'s help desk agent called in sick — and the Pink Tide knows it. You\'re covering Line 1 for the afternoon. Five requests are queued: phone calls, a chat, an email and someone at the server room door. Some are real. Some are the Flamingo\'s smooth talkers. Keep the vault shut without stonewalling honest staff.',
  passScore: PASS,
  conceptCards: [
    {
      id: 'social-pretexting',
      title: 'Pretexting',
      topic: 'social',
      definition: 'Inventing a believable scenario (IT upgrade, vendor audit, stranded executive) to persuade someone to hand over access, data or money.',
      whyItMatters: 'A good story bypasses technical controls entirely — the victim opens the door for the attacker.',
      example: '"IT Kevin" says he\'s migrating MFA and needs the code you just received.',
      bestPractice: 'Judge the request, not the story: does this action ever require that information? If not, refuse and report.',
    },
    {
      id: 'social-authority-urgency',
      title: 'Authority & Urgency Levers',
      topic: 'social',
      definition: 'Psychological pressure techniques: claiming rank, threatening consequences, imposing deadlines or demanding secrecy.',
      whyItMatters: 'Pressure short-circuits careful thinking; most social engineering uses at least one of these levers.',
      example: 'A "CEO" boarding a plane demands a wire that skips approval.',
      bestPractice: 'Treat pressure itself as a red flag. Policies should explicitly empower staff to slow down and verify any executive request.',
    },
    {
      id: 'social-verification',
      title: 'Out-of-Band Verification',
      topic: 'social',
      definition: 'Confirming a request through a separate, independently known channel — e.g. calling back a number from the directory or vendor file.',
      whyItMatters: 'If the email or phone channel is spoofed or compromised, replying on the same channel just reaches the attacker.',
      example: 'Calling Sunrise Office Supply on the number in the vendor file reveals they never changed bank accounts.',
      bestPractice: 'Never use contact details supplied in the suspicious request. Use dual approval for payments and bank-detail changes.',
    },
    {
      id: 'social-tailgating',
      title: 'Tailgating & Physical Access',
      topic: 'social',
      definition: 'Following an authorized person through a secured door without badging in, often while carrying something to look busy.',
      whyItMatters: 'Physical access to servers or network ports can defeat many digital defenses.',
      example: 'A "courier" with a box asks you to hold the server-room door.',
      bestPractice: 'One badge, one person. Verify visits against a schedule, sign in visitors and escort them in restricted areas.',
    },
  ],
  mount: (ctx) => mountSocial(ctx, PASS),
};
