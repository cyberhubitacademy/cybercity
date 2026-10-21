// Social Engineering Defense — help desk scenarios, pure scoring (no DOM).
import { clampScore, type ChallengeResult, type ScoreLine } from '../../types';

export type Channel = 'phone' | 'chat' | 'in-person' | 'email';

export interface Option {
  id: string;
  label: string;
  /** 2 = best practice, 1 = acceptable but incomplete, 0 = unsafe. */
  points: 0 | 1 | 2;
  explain: string;
}

export interface FollowUp {
  question: string;
  options: Option[];
}

export interface Scenario {
  id: string;
  channel: Channel;
  requester: string;
  claim: string;
  message: string;
  tactic: string;
  options: Option[];
  /** Asked only if the player chose an option listed in `when`. */
  followUp?: FollowUp & { when: string[] };
  lesson: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'ceo-wire',
    channel: 'phone',
    requester: '"Victor Palmetto, CEO"',
    claim: 'Bank CEO calling from an airport',
    message:
      '"It\'s Victor. I\'m boarding in five minutes — I need a $48,000 wire to a new acquisition partner pushed through NOW. Skip the usual approval, I\'ll sign off when I land. Don\'t make me miss this deal."',
    tactic: 'Authority + urgency (CEO fraud / BEC by phone)',
    options: [
      { id: 'comply', label: 'Push the wire through — it\'s the CEO', points: 0, explain: 'Unsafe. Authority and time pressure are exactly what the attacker is exploiting. Voices can be faked and caller ID can be spoofed.' },
      { id: 'verify', label: 'Follow the dual-approval process and call Victor back on his number from the staff directory', points: 2, explain: 'Correct. Payment controls exist precisely for "special" urgent requests. A real CEO will understand a callback.' },
      { id: 'refuse', label: 'Hang up and ignore it', points: 1, explain: 'Safe for the money, but the attempt should be reported so security can warn the finance team.' },
    ],
    followUp: {
      when: ['verify'],
      question: 'Which number do you use to call him back?',
      options: [
        { id: 'directory', label: 'The number in the internal staff directory', points: 2, explain: 'Right — a known, independent channel the attacker doesn\'t control.' },
        { id: 'callerid', label: 'The number shown on caller ID', points: 0, explain: 'Caller ID is trivially spoofed; you\'d be calling the attacker back.' },
        { id: 'given', label: 'The "direct line" he reads out to you', points: 0, explain: 'Any number the requester gives you is controlled by the requester.' },
      ],
    },
    lesson: 'Never let urgency or rank bypass payment controls. Verify through a channel you already trust.',
  },
  {
    id: 'mfa-code',
    channel: 'chat',
    requester: '"IT Support – Kevin"',
    claim: 'Internal IT running a "security upgrade"',
    message:
      '"Hi! We\'re migrating everyone to the new MFA system tonight. You\'ll get a 6-digit code by text in a moment — just paste it here so I can link your account. Takes 10 seconds 👍"',
    tactic: 'Pretexting to steal an MFA one-time code',
    options: [
      { id: 'comply', label: 'Paste the code — it\'s IT', points: 0, explain: 'Unsafe. A one-time code is the last lock on your account. Giving it away lets the attacker log in as you right now.' },
      { id: 'refuse-report', label: 'Refuse — nobody legitimate ever needs your MFA code — and report the chat to security', points: 2, explain: 'Correct. Real IT never asks for codes or passwords. Reporting lets security warn others getting the same message.' },
      { id: 'ask-id', label: 'Ask Kevin for his employee ID first, then share it', points: 0, explain: 'Unsafe. Attackers can find or invent IDs. The rule is simple: the code never leaves your hands.' },
    ],
    lesson: 'MFA codes, passwords and push approvals are never shared — with anyone, including IT.',
  },
  {
    id: 'reset',
    channel: 'phone',
    requester: 'Dana Ortiz, loan officer',
    claim: 'Locked out after vacation',
    message:
      '"Hi, it\'s Dana from Loans, branch 3. I just got back from two weeks off and I\'ve forgotten my password. Can you reset it? I have a client in ten minutes."',
    tactic: 'Possibly genuine — needs identity verification',
    options: [
      { id: 'reset-now', label: 'Reset it and read the temporary password over the phone', points: 0, explain: 'Unsafe. You haven\'t verified who is calling — anyone can say "I\'m Dana".' },
      { id: 'verify', label: 'Verify identity per policy: call Dana back at her number on file, then send a reset link that forces MFA re-enrollment', points: 2, explain: 'Correct. Real users get helped; impostors get stuck. Callback-to-known-number is the standard help desk control.' },
      { id: 'refuse', label: 'Refuse all phone resets — tell her to come in person', points: 1, explain: 'Safe but unhelpful. Security should enable the business; a verified remote process gets Dana working quickly.' },
    ],
    followUp: {
      when: ['verify'],
      question: 'The callback works — Dana answers on her desk line. What do you also do?',
      options: [
        { id: 'log', label: 'Log the ticket and make the temporary password single-use with forced change', points: 2, explain: 'Right — auditable and the temp credential expires immediately.' },
        { id: 'email-pass', label: 'Email her new permanent password to her personal email', points: 0, explain: 'Personal email is outside company control and may be compromised. Never send permanent passwords.' },
      ],
    },
    lesson: 'Not every request is an attack. A good process verifies identity, then helps quickly.',
  },
  {
    id: 'tailgate',
    channel: 'in-person',
    requester: 'Courier in a "NB Parcel" vest',
    claim: 'Delivering a replacement server part',
    message:
      'A friendly courier with a big box and a clipboard is at the badge door to the server room: "Replacement drive for your server, gotta install it myself, warranty rules. Mind holding the door? My hands are full!"',
    tactic: 'Tailgating / physical pretext',
    options: [
      { id: 'hold', label: 'Hold the door — they\'re clearly busy', points: 0, explain: 'Unsafe. Tailgating is how intruders reach the hardware. A box and a vest cost $20.' },
      { id: 'escalate', label: 'Politely stop them, check with facilities whether a visit is scheduled, and escort if it\'s verified', points: 2, explain: 'Correct. Verify visits against a schedule, sign visitors in, and escort them in restricted areas.' },
      { id: 'take-box', label: 'Take the box yourself and send them away', points: 1, explain: 'Keeps them out, but unverified hardware shouldn\'t be plugged in either — it should go through receiving and IT checks.' },
    ],
    lesson: 'Badges are personal. Being polite is fine — holding the door to a restricted area is not.',
  },
  {
    id: 'vendor-bank',
    channel: 'email',
    requester: 'Sunrise Office Supply (vendor)',
    claim: 'Changing their bank account',
    message:
      '"Please note our banking details have changed due to an audit. Update our account to the new details attached for this month\'s invoice ($12,300). The old account is closed — payments there will bounce."',
    tactic: 'Vendor impersonation / invoice fraud',
    options: [
      { id: 'update', label: 'Update the details — vendors change banks all the time', points: 0, explain: 'Unsafe. This is the #1 invoice fraud pattern. The vendor\'s email may be compromised or spoofed.' },
      { id: 'verify', label: 'Call the vendor on the number in your existing vendor file and confirm the change before touching anything', points: 2, explain: 'Correct. Out-of-band verification with a known contact defeats compromised-mailbox fraud.' },
      { id: 'reply', label: 'Reply to the email asking them to confirm', points: 0, explain: 'If the mailbox is compromised, the attacker answers "Confirmed!"' },
    ],
    followUp: {
      when: ['verify'],
      question: 'Sunrise says they never sent it. Next step?',
      options: [
        { id: 'report', label: 'Report it to security and warn accounts payable — keep the email as evidence', points: 2, explain: 'Right. Their mailbox may be breached; others could be targeted and the evidence helps the investigation.' },
        { id: 'delete', label: 'Delete it, problem solved', points: 0, explain: 'You\'d destroy evidence and leave colleagues exposed to the next attempt.' },
      ],
    },
    lesson: 'Any change to where money goes is verified through a known channel — every single time.',
  },
];

export interface SocialAnswers {
  choices: Record<string, string | undefined>;
  followUps: Record<string, string | undefined>;
}

export interface ScenarioReview {
  scenario: Scenario;
  chosen: Option | undefined;
  follow: Option | undefined;
  needsFollowUp: boolean;
  points: number;
  max: number;
}

export interface SocialGrade {
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  reviews: ScenarioReview[];
  mistakes: string[];
}

export function emptySocialAnswers(): SocialAnswers {
  return { choices: {}, followUps: {} };
}

export function needsFollowUp(s: Scenario, a: SocialAnswers): boolean {
  const c = a.choices[s.id];
  return !!s.followUp && !!c && s.followUp.when.includes(c);
}

export function isSocialComplete(a: SocialAnswers, scenarios: Scenario[] = SCENARIOS): boolean {
  return scenarios.every((s) => a.choices[s.id] !== undefined && (!needsFollowUp(s, a) || a.followUps[s.id] !== undefined));
}

/**
 * Each scenario is worth 2 points for the main decision, plus 2 for its follow-up when it
 * has one. A player who chose a non-best option never sees the follow-up and simply forfeits those points.
 */
export function gradeSocial(a: SocialAnswers, passScore: number, scenarios: Scenario[] = SCENARIOS): SocialGrade {
  const reviews: ScenarioReview[] = [];
  const mistakes: string[] = [];
  let total = 0;
  let max = 0;
  let decisionPts = 0;
  let decisionMax = 0;
  let verifyPts = 0;
  let verifyMax = 0;
  for (const s of scenarios) {
    const chosen = s.options.find((o) => o.id === a.choices[s.id]);
    const nf = needsFollowUp(s, a);
    const follow = nf ? s.followUp?.options.find((o) => o.id === a.followUps[s.id]) : undefined;
    const p = (chosen?.points ?? 0) + (follow?.points ?? 0);
    const m = 2 + (s.followUp ? 2 : 0);
    decisionPts += chosen?.points ?? 0;
    decisionMax += 2;
    if (s.followUp) {
      verifyPts += follow?.points ?? 0;
      verifyMax += 2;
    }
    total += p;
    max += m;
    if (!chosen || chosen.points < 2) mistakes.push(`${s.tactic}: ${chosen ? chosen.explain : 'no decision made.'}`);
    else if (follow && follow.points < 2) mistakes.push(`${s.tactic} follow-up: ${follow.explain}`);
    reviews.push({ scenario: s, chosen, follow, needsFollowUp: nf, points: p, max: m });
  }
  const score = clampScore((total / max) * 100);
  const decisionWeight = Math.round((decisionMax / max) * 100);
  const verifyWeight = 100 - decisionWeight;
  return {
    score,
    passed: score >= passScore,
    breakdown: [
      { label: 'Safe decisions', value: Math.round((decisionPts / decisionMax) * decisionWeight), max: decisionWeight },
      { label: 'Verification & follow-through', value: verifyMax ? Math.round((verifyPts / verifyMax) * verifyWeight) : 0, max: verifyWeight },
    ],
    reviews,
    mistakes,
  };
}

export function toSocialResult(g: SocialGrade, hintsUsed: number): ChallengeResult {
  return {
    challengeId: 'social-1',
    score: g.score,
    passed: g.passed,
    breakdown: g.breakdown,
    conceptsPracticed: ['social-pretexting', 'social-authority-urgency', 'social-verification', 'social-tailgating'],
    mistakes: g.mistakes,
    hintsUsed,
  };
}
