import type { ChallengeDefinition } from '../../types';
import { mountPassword } from './ui';

const PASS = 60;

export const passwordChallenge: ChallengeDefinition = {
  id: 'password-1',
  title: 'Locked Out',
  topic: 'identity',
  difficulty: 2,
  objective: 'Judge password strength, spot credential stuffing in login logs, choose the right defenses, and explain hashing vs encryption.',
  intro:
    'Carla is locked out of the Coral Café staff portal — and someone changed the daily specials to "PINK TIDE WAS HERE 🦩". She swears nobody guessed her password... she just used it "on a couple of other sites." Rank password strength, dig through the login log, lock the door, and pick a safe way to store passwords going forward.',
  passScore: PASS,
  conceptCards: [
    {
      id: 'identity-password-strength',
      title: 'Password Strength = Unpredictability',
      topic: 'identity',
      definition: 'Strength is how many guesses an attacker needs, measured in bits of entropy. Each bit doubles the guesses.',
      whyItMatters: 'Crackers try leaked lists, dictionary words, names, years and leetspeak first, so "complex-looking" passwords like Summer1985! fall fast.',
      example: 'A random 4-word passphrase (~52 bits) beats Summer1985! (~26 bits) and is easier to remember.',
      bestPractice: 'Use long random passphrases or manager-generated passwords; never base them on names, dates or the site name.',
    },
    {
      id: 'identity-credential-stuffing',
      title: 'Credential Stuffing',
      topic: 'identity',
      definition: 'Automated logins using username/password pairs leaked from other breaches, spread across many accounts.',
      whyItMatters: 'It only needs one reused password to succeed, and its low per-account attempt count dodges simple lockouts.',
      example: '198.51.100.x tried 12 usernames in minutes; Carla\'s reused password succeeded at 03:12.',
      bestPractice: 'Unique passwords per site (password manager), MFA, rate limiting per IP and account, and checking new passwords against breach lists.',
    },
    {
      id: 'identity-mfa',
      title: 'Multi-Factor Authentication',
      topic: 'identity',
      definition: 'Requiring two or more kinds of proof: something you know (password), have (phone, security key) or are (biometric).',
      whyItMatters: 'A stolen or reused password alone is no longer enough to log in.',
      example: 'With an authenticator app on Carla\'s account, the 03:12 login would have stopped at the second factor.',
      bestPractice: 'Prefer phishing-resistant factors (security keys, passkeys) or authenticator apps over SMS; never share codes.',
    },
    {
      id: 'identity-hashing-salting',
      title: 'Hashing & Salting Passwords',
      topic: 'identity',
      definition: 'Servers store a one-way hash of each password plus a unique random salt, then hash login attempts and compare.',
      whyItMatters: 'If the database leaks, attackers still must guess each password; salts stop precomputed tables and hide shared passwords.',
      example: 'The same practice password with salts a91f and 7c2e produces two unrelated hashes.',
      bestPractice: 'Use slow, salted password hashes (Argon2id, bcrypt, scrypt) — never plain fast hashes like MD5, reversible encryption or encoding.',
    },
  ],
  mount: (ctx) => mountPassword(ctx, PASS),
};
