// Phishing Detective — pure data, validation and scoring (no DOM).
import { clampScore, type ChallengeResult, type ScoreLine } from '../../types';

export type FlagId =
  | 'lookalike'
  | 'urgency'
  | 'link-mismatch'
  | 'attachment'
  | 'reply-to'
  | 'auth-fail'
  | 'requests-secrets';

export const FLAG_LABELS: Record<FlagId, string> = {
  lookalike: 'Lookalike domain',
  urgency: 'Urgency / pressure',
  'link-mismatch': 'Link text ≠ destination',
  attachment: 'Unexpected attachment',
  'reply-to': 'Reply-To mismatch',
  'auth-fail': 'Failed SPF/DKIM',
  'requests-secrets': 'Requests credentials / payment',
};

export const ALL_FLAGS = Object.keys(FLAG_LABELS) as FlagId[];

export interface EmailLink {
  text: string;
  href: string;
}

export interface Email {
  id: string;
  fromName: string;
  fromAddress: string;
  replyTo?: string;
  to: string;
  subject: string;
  time: string;
  spf: 'pass' | 'fail' | 'softfail' | 'none';
  dkim: 'pass' | 'fail' | 'none';
  body: string[];
  links: EmailLink[];
  attachments: string[];
  phishing: boolean;
  /** Flags a careful analyst should tag. */
  flags: FlagId[];
  /** Danger rank: higher = worse. Used to pick the "worst" email. */
  danger: number;
  explanation: string;
}

export const EMAILS: Email[] = [
  {
    id: 'bank-alert',
    fromName: 'Palmetto Bank Security',
    fromAddress: 'security@palmett0-bank.nb',
    to: 'carla@coralcafe.nb',
    subject: 'URGENT: Your business account will be SUSPENDED in 2 hours',
    time: '08:14',
    spf: 'fail',
    dkim: 'none',
    body: [
      'Dear Valued Customer,',
      'We detected unusual activity on your Palmetto Bank business account. To avoid permanent suspension you must verify your identity within 2 HOURS.',
      'Sign in below and confirm your password and the 6-digit code we text you.',
      'Palmetto Bank Security Team',
    ],
    links: [{ text: 'https://palmettobank.nb/secure-login', href: 'http://palmett0-bank.nb.login-verify.pinktide.nb/carla' }],
    attachments: [],
    phishing: true,
    flags: ['lookalike', 'urgency', 'link-mismatch', 'auth-fail', 'requests-secrets'],
    danger: 5,
    explanation:
      'Credential phish. "palmett0-bank.nb" swaps the letter o for a zero, the link text shows the real bank but the href goes to a Pink Tide host, SPF failed, and it demands your password and MFA code under a 2-hour deadline. Real banks never ask for your password or one-time codes by email.',
  },
  {
    id: 'max-giftcards',
    fromName: 'Max Cortez',
    fromAddress: 'max.cortez.sunsetshield@freemail.nb',
    replyTo: 'flamingo.ops@freemail.nb',
    to: 'carla@coralcafe.nb',
    subject: 'quick favor - are you at the café?',
    time: '09:02',
    spf: 'pass',
    dkim: 'pass',
    body: [
      'Hey Carla, I\'m stuck in a meeting and can\'t talk. I need 5 Sunset Mall gift cards ($200 each) for a client thank-you before noon.',
      'Buy them, scratch the backs and email me photos of the codes. I\'ll pay you back today. Keep this between us for now.',
      '- Max',
    ],
    links: [],
    attachments: [],
    phishing: true,
    flags: ['reply-to', 'urgency', 'requests-secrets'],
    danger: 4,
    explanation:
      'Display-name spoof / gift-card BEC. The name says Max Cortez but the address is a free webmail account and replies go to "flamingo.ops". SPF/DKIM "pass" only proves freemail.nb sent it — not that Max did. Secrecy + urgency + gift cards is a classic scam. Verify by calling Max on a number you already know.',
  },
  {
    id: 'invoice-zip',
    fromName: 'Tropic Produce Billing',
    fromAddress: 'billing@tropic-produce-invoices.nb',
    to: 'carla@coralcafe.nb',
    subject: 'OVERDUE invoice #88412 - final notice before collections',
    time: '10:37',
    spf: 'softfail',
    dkim: 'fail',
    body: [
      'Your account is 30 days overdue. Open the attached invoice IMMEDIATELY to avoid a collections fee.',
      'Password for the archive: 8841',
    ],
    links: [],
    attachments: ['Invoice_88412.pdf.zip', 'remittance_form.html'],
    phishing: true,
    flags: ['attachment', 'urgency', 'auth-fail'],
    danger: 3,
    explanation:
      'Malware delivery. A password-protected .zip (so mail scanners can\'t look inside) with a double extension ".pdf.zip" plus an .html "form" that usually harvests logins. Coral Café\'s real produce supplier is Bayside Farms, the SPF softfailed and DKIM failed. Never open unexpected archives — confirm with the vendor through your known contact.',
  },
  {
    id: 'newsletter',
    fromName: 'Bayview University Extension',
    fromAddress: 'news@bayview.edu.nb',
    to: 'carla@coralcafe.nb',
    subject: 'Free small-business cyber workshop this Saturday',
    time: '11:20',
    spf: 'pass',
    dkim: 'pass',
    body: [
      'Hi Carla, as a Neon Bay small-business partner you\'re invited to our free "Lock Down Your Shop" workshop this Saturday at 10:00 in Hall B.',
      'No sign-up required. Details are on our events page.',
      'You can unsubscribe from partner news at any time.',
    ],
    links: [{ text: 'bayview.edu.nb/events', href: 'https://bayview.edu.nb/events' }],
    attachments: [],
    phishing: false,
    flags: [],
    danger: 0,
    explanation:
      'Legitimate. Sender domain matches the university, SPF and DKIM pass, the link goes exactly where its text says, there\'s no pressure and nothing sensitive is requested.',
  },
  {
    id: 'internal-note',
    fromName: 'Luis (Coral Café shift lead)',
    fromAddress: 'luis@coralcafe.nb',
    to: 'carla@coralcafe.nb',
    subject: 'Ice machine fixed + Saturday schedule',
    time: '12:05',
    spf: 'pass',
    dkim: 'pass',
    body: [
      'Hey boss — the ice machine tech came by, it\'s working again. I put the receipt in the drawer.',
      'Saturday schedule is on the back-office board. Ana swapped with Jo for the late shift.',
    ],
    links: [],
    attachments: [],
    phishing: false,
    flags: [],
    danger: 0,
    explanation:
      'Legitimate. Internal sender on coralcafe.nb, authentication passes, routine content, no links, attachments or requests. Not every email is an attack — false alarms waste the security team\'s time too.',
  },
  {
    id: 'delivery-link',
    fromName: 'NB Parcel Express',
    fromAddress: 'notify@nbparcel-tracking.nb',
    to: 'carla@coralcafe.nb',
    subject: 'Delivery failed: confirm your address and $1.99 redelivery fee',
    time: '13:48',
    spf: 'pass',
    dkim: 'none',
    body: [
      'We attempted to deliver your package but the address was incomplete.',
      'Pay the $1.99 redelivery fee with your card within 24h or the package will be returned to sender.',
    ],
    links: [{ text: 'Track my package', href: 'http://203.0.113.77/nbpx/pay.php?id=carla' }],
    attachments: [],
    phishing: true,
    flags: ['link-mismatch', 'urgency', 'requests-secrets'],
    danger: 2,
    explanation:
      'Smishing-style payment phish. The "Track my package" button leads to a raw IP address, not a courier site, and it asks for card details for a tiny "fee" under a deadline. SPF pass just means the scammer controls their own lookalike domain.',
  },
];

export type ResponseAction = 'report' | 'reply' | 'click' | 'delete';

export const RESPONSE_OPTIONS: { id: ResponseAction; label: string; explain: string }[] = [
  { id: 'report', label: 'Report it to the security team (Phish button) and don\'t interact', explain: 'Correct. Reporting lets Sunset Shield block the sender, pull copies from other inboxes and warn staff.' },
  { id: 'reply', label: 'Reply to the sender and ask if it\'s real', explain: 'Unsafe. Replying goes straight to the attacker, confirms your address is live, and they will happily say "yes, it\'s real".' },
  { id: 'click', label: 'Click the link carefully, just to check', explain: 'Unsafe. Just visiting can trigger drive-by downloads or tracking, and the page is built to trick careful people too.' },
  { id: 'delete', label: 'Delete it quietly', explain: 'Partly safe for you, but the security team never learns about the campaign — your coworkers may still click it.' },
];

/** The email the response-action question is about. */
export const WORST_EMAIL_ID = [...EMAILS].sort((a, b) => b.danger - a.danger)[0].id;

export type Verdict = 'legit' | 'phishing';

export interface PhishingAnswers {
  verdicts: Record<string, Verdict | undefined>;
  flags: Record<string, FlagId[] | undefined>;
  response: ResponseAction | null;
}

export interface EmailReview {
  email: Email;
  verdict: Verdict | undefined;
  correctVerdict: boolean;
  flagsHit: FlagId[];
  flagsMissed: FlagId[];
  flagsWrong: FlagId[];
}

export interface PhishingGrade {
  score: number;
  passed: boolean;
  breakdown: ScoreLine[];
  reviews: EmailReview[];
  falsePositives: number;
  responseCorrect: boolean;
  mistakes: string[];
}

export function emptyAnswers(): PhishingAnswers {
  return { verdicts: {}, flags: {}, response: null };
}

export function isComplete(a: PhishingAnswers, emails: Email[] = EMAILS): boolean {
  return emails.every((e) => a.verdicts[e.id] !== undefined) && a.response !== null;
}

/**
 * Weights: classification 40, evidence 35 (F1 over flags on phishing emails),
 * response 15, false-positive discipline 10 (legit emails marked phishing + flags on legit mail).
 */
export function gradePhishing(a: PhishingAnswers, passScore: number, emails: Email[] = EMAILS): PhishingGrade {
  const reviews: EmailReview[] = [];
  let correct = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let falsePositives = 0;
  const mistakes: string[] = [];

  for (const e of emails) {
    const verdict = a.verdicts[e.id];
    const correctVerdict = verdict === (e.phishing ? 'phishing' : 'legit');
    if (correctVerdict) correct++;
    const chosen = verdict === 'phishing' ? a.flags[e.id] ?? [] : [];
    const hit = chosen.filter((f) => e.flags.includes(f));
    const wrong = chosen.filter((f) => !e.flags.includes(f));
    const missed = e.phishing ? e.flags.filter((f) => !chosen.includes(f)) : [];
    if (e.phishing) {
      tp += hit.length;
      fn += missed.length;
    }
    fp += wrong.length;
    if (!e.phishing && verdict === 'phishing') falsePositives++;
    if (!correctVerdict) {
      mistakes.push(
        e.phishing
          ? `Missed the phish "${e.subject}" — ${e.explanation.split('.')[0]}.`
          : `Flagged the legitimate email "${e.subject}" as phishing.`,
      );
    }
    reviews.push({ email: e, verdict, correctVerdict, flagsHit: hit, flagsMissed: missed, flagsWrong: wrong });
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const legitCount = emails.filter((e) => !e.phishing).length;
  const fpRatio = legitCount === 0 ? 0 : falsePositives / legitCount;
  const fpPenalty = Math.min(1, fpRatio + fp * 0.1);

  const responseCorrect = a.response === 'report';
  if (!responseCorrect) mistakes.push('Picked an unsafe response — suspicious mail should be reported, not answered, clicked or silently deleted.');

  const cls = Math.round((correct / emails.length) * 40);
  const ev = Math.round(f1 * 35);
  const resp = responseCorrect ? 15 : a.response === 'delete' ? 5 : 0;
  const disc = Math.round((1 - fpPenalty) * 10);
  const score = clampScore(cls + ev + resp + disc);

  return {
    score,
    passed: score >= passScore,
    breakdown: [
      { label: 'Classification accuracy', value: cls, max: 40 },
      { label: 'Evidence (red flags found)', value: ev, max: 35 },
      { label: 'Response action', value: resp, max: 15 },
      { label: 'No false alarms', value: disc, max: 10 },
    ],
    reviews,
    falsePositives,
    responseCorrect,
    mistakes,
  };
}

export function toResult(g: PhishingGrade, hintsUsed: number): ChallengeResult {
  return {
    challengeId: 'phishing-1',
    score: g.score,
    passed: g.passed,
    breakdown: g.breakdown,
    conceptsPracticed: ['phishing-lookalike-domains', 'phishing-link-inspection', 'phishing-email-auth', 'phishing-reporting', 'phishing-bec'],
    mistakes: g.mistakes,
    hintsUsed,
  };
}

/** Domain portion of an URL or address, for display. */
export function hostOf(urlOrAddress: string): string {
  const at = urlOrAddress.lastIndexOf('@');
  if (at >= 0 && !urlOrAddress.includes('://')) return urlOrAddress.slice(at + 1);
  const m = /^[a-z]+:\/\/([^/:?#]+)/i.exec(urlOrAddress);
  return m ? m[1] : urlOrAddress;
}
