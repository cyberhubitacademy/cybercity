import type { ChallengeDefinition } from '../../types';
import { mountPhishing } from './ui';

const PASS = 60;

export const phishingChallenge: ChallengeDefinition = {
  id: 'phishing-1',
  title: 'Catch of the Day',
  topic: 'phishing',
  difficulty: 1,
  objective: 'Tell phishing from legitimate email by reading senders, links, authentication results and attachments — then respond safely.',
  intro:
    'Carla Reyes just forwarded you the Coral Café inbox: "Something smells fishy, and it ain\'t the ceviche." The Pink Tide has been spraying Neon Bay businesses with bait. Open every email, decide Legit or Phishing, tag the red flags, and tell Carla what to do.',
  passScore: PASS,
  conceptCards: [
    {
      id: 'phishing-lookalike-domains',
      title: 'Lookalike Domains',
      topic: 'phishing',
      definition: 'Domains registered to resemble a trusted brand by swapping, adding or removing characters (palmett0-bank vs palmettobank) or burying the real name inside a longer host.',
      whyItMatters: 'People read words by shape, not letter by letter. One swapped character is enough to send a victim to an attacker-controlled login page.',
      example: 'security@palmett0-bank.nb uses a zero instead of the letter o.',
      bestPractice: 'Read the domain right-to-left from the last dot; use bookmarks or type the address yourself instead of clicking email links.',
    },
    {
      id: 'phishing-link-inspection',
      title: 'Link Text vs. Destination',
      topic: 'phishing',
      definition: 'The visible text of a link can say anything; the href is where the browser actually goes.',
      whyItMatters: 'Attackers show a trusted URL as text while the link points to their own server or a raw IP address.',
      example: 'Text "https://palmettobank.nb/secure-login" → href "http://palmett0-bank.nb.login-verify.pinktide.nb/…" whose real domain is pinktide.nb.',
      bestPractice: 'Hover or long-press to preview the real URL before clicking, and be wary of raw IP addresses and odd subdomains.',
    },
    {
      id: 'phishing-email-auth',
      title: 'SPF, DKIM and DMARC',
      topic: 'phishing',
      definition: 'SPF lists which servers may send mail for a domain; DKIM cryptographically signs messages; DMARC tells receivers what to do when they fail.',
      whyItMatters: 'A failure is a strong warning sign — but a pass only proves the mail came from the domain shown, which may itself be an attacker\'s lookalike or free webmail.',
      example: 'The fake Max email passes SPF/DKIM because it truly came from freemail.nb.',
      bestPractice: 'Treat auth results as one clue among many; organizations should publish SPF, DKIM and an enforcing DMARC policy.',
    },
    {
      id: 'phishing-bec',
      title: 'Business Email Compromise (BEC)',
      topic: 'phishing',
      definition: 'Fraud where attackers impersonate an executive, colleague or vendor to get payments, gift cards or sensitive data.',
      whyItMatters: 'BEC rarely uses malware, so filters miss it; it causes some of the largest financial losses of any cybercrime.',
      example: '"Max" urgently asks Carla to buy gift cards and keep it secret, with replies routed to flamingo.ops.',
      bestPractice: 'Verify any money or secrecy request through a separate, known channel — call the number you already have on file.',
    },
    {
      id: 'phishing-reporting',
      title: 'Report, Don\'t Reply',
      topic: 'phishing',
      definition: 'Sending suspicious messages to the security team (often via a "Report Phish" button) instead of interacting with them.',
      whyItMatters: 'One report lets defenders block the sender, purge the same email from every inbox and warn others.',
      example: 'Carla reports the fake bank alert; Sunset Shield blocks palmett0-bank.nb citywide.',
      bestPractice: 'Never reply, click or forward to "check". Report it, then delete it. If you already clicked, report immediately — speed matters more than embarrassment.',
    },
  ],
  mount: (ctx) => mountPhishing(ctx, PASS),
};
