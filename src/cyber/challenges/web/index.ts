import type { ChallengeDefinition } from '../../types';
import { mountWeb } from './ui';

export const webChallenge: ChallengeDefinition = {
  id: 'web-1',
  title: 'Web App Defender: Patch Night at Palmetto',
  topic: 'web',
  difficulty: 2,
  objective: 'Find and fix real web vulnerabilities (OWASP Top 10) and prove each fix by replaying the attack.',
  intro:
    "11:48 PM. Black Lotus posted a teaser: \"Palmetto Bank opens at 9. So do we.\" Marisol Vance gives you the night to harden the online banking app before 40,000 families log in. Every bug you leave is a door.",
  passScore: 65,
  conceptCards: [
    { id: 'web-injection', title: 'SQL injection & parameterized queries', topic: 'web', definition: 'Injection happens when input is mixed into a command (like SQL) and changes its meaning.', whyItMatters: 'One search box can dump an entire customer database.', example: "' OR '1'='1' -- turns a name search into 'return every row'.", bestPractice: 'Use parameterized queries / prepared statements or a safe ORM; never build SQL with string concatenation.' },
    { id: 'web-xss', title: 'Cross-site scripting (XSS)', topic: 'web', definition: "XSS injects script into a page that runs in other users' browsers.", whyItMatters: 'Attackers steal sessions, change transfers or deface pages as the victim.', example: 'A transfer memo containing an <img onerror> handler fires for everyone who views it.', bestPractice: 'Encode output for its context (textContent, templating auto-escaping), sanitize rich HTML with a vetted library, add a strict CSP.' },
    { id: 'web-access-control', title: 'Broken access control (IDOR)', topic: 'web', definition: 'The server returns or changes data without checking the user is allowed to.', whyItMatters: 'It is the #1 risk in the OWASP Top 10 — and trivially exploited by changing an ID.', example: '/api/statements/1042 opens someone else’s statement.', bestPractice: 'Deny by default and enforce ownership/role checks server-side on every request.' },
    { id: 'web-headers', title: 'Security headers', topic: 'web', definition: 'HTTP response headers that switch on browser protections.', whyItMatters: 'They block whole classes of attacks for almost no cost.', example: 'HSTS forces HTTPS; CSP limits scripts; frame-ancestors stops clickjacking; nosniff stops MIME confusion.', bestPractice: 'Set them centrally (gateway/framework), avoid wildcard CORS on authenticated APIs, hide version banners.' },
    { id: 'web-sessions', title: 'Session cookies & safe errors', topic: 'web', definition: 'Session tokens are keys to an account; error messages can leak internals.', whyItMatters: 'Stolen sessions bypass passwords and MFA; stack traces hand attackers a map.', example: 'Set-Cookie with HttpOnly; Secure; SameSite=Lax. Errors show "ref 7Q2", details go to logs.', bestPractice: 'Use secure cookie flags, short session lifetimes, server-side revocation, and generic error pages with correlation IDs.' },
  ],
  mount: mountWeb,
};
