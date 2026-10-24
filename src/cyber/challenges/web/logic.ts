// Web App Defender — pure data, simulation and scoring (no DOM).
// All payloads are inert strings shown for teaching; nothing is executed.

import { setFraction, weigh, type Explained, type Graded } from './s2score';

export interface Patch {
  id: string;
  label: string;
  code: string;
  why: string;
  /** What the replayed attack does if this patch is applied. */
  outcome: string;
}

export interface Finding {
  id: string;
  title: string;
  owasp: string;
  vulnerable: boolean;
  endpoint: string;
  request: string;
  response: string;
  code: string;
  patches: Patch[];
  correct: string[];
  multi: boolean;
  attack: string;
  before: string;
  explain: string;
}

export const FINDINGS: Finding[] = [
  {
    id: 'sqli',
    title: 'Account search box',
    owasp: 'A03:2021 Injection',
    vulnerable: true,
    endpoint: 'GET /accounts/search?q=…',
    request: "GET /accounts/search?q=' OR '1'='1' -- (simulated payload)",
    response: '200 OK — 48,112 rows returned (every customer account)',
    code: 'db.query("SELECT id, name, balance FROM accounts WHERE name LIKE \'%" + q + "%\'")',
    patches: [
      { id: 'param', label: 'Parameterized query (bind q as data)', code: "db.query('SELECT id, name, balance FROM accounts WHERE name LIKE ?', ['%' + q + '%'])", why: 'The database receives the query and the value separately, so input can never change the SQL structure.', outcome: 'Payload treated as a literal name → 0 rows. Attack blocked.' },
      { id: 'escape', label: 'Replace single quotes with two quotes', code: "q = q.replace(/'/g, \"''\")", why: 'Hand-rolled escaping misses encodings, numeric contexts and backslash tricks.', outcome: 'A numeric/encoding variant still slips through (simulated). Partially vulnerable.' },
      { id: 'clientregex', label: 'Block quotes with JavaScript in the browser', code: '<input pattern="[A-Za-z ]+">', why: 'Attackers send requests directly; client-side checks are only UX.', outcome: 'Request sent with curl bypasses the form → all rows returned.' },
      { id: 'waf', label: 'Rely on a WAF rule for "OR 1=1"', code: 'waf.block(/or\\s+1=1/i)', why: 'Signature filters are easy to evade; fix the code, use a WAF only as an extra layer.', outcome: "Payload rewritten as OR 'a'='a' → bypass. Still vulnerable." },
    ],
    correct: ['param'],
    multi: false,
    attack: "' OR '1'='1' --",
    before: '48,112 customer rows dumped to the attacker.',
    explain: 'String-concatenated SQL lets input rewrite the query. Parameterized queries (prepared statements) separate code from data.',
  },
  {
    id: 'xss',
    title: 'Transfer memo field',
    owasp: 'A03:2021 Injection (XSS)',
    vulnerable: true,
    endpoint: 'POST /transfers  →  memo shown on GET /history',
    request: 'memo = "<img src=x onerror=steal(document.cookie)>"  (inert, simulated)',
    response: 'History page renders the memo as raw HTML for every viewer',
    code: 'historyRow.innerHTML = "<td>" + transfer.memo + "</td>"',
    patches: [
      { id: 'encode', label: 'Encode output (textContent) + add a strict Content-Security-Policy', code: "cell.textContent = transfer.memo;\nres.setHeader('Content-Security-Policy', \"default-src 'self'; script-src 'self'\")", why: 'Encoding makes the browser show the text instead of running it; CSP blocks injected scripts as a second layer.', outcome: 'Memo shows as harmless text; no script runs. Attack blocked.' },
      { id: 'striptag', label: 'Delete the word "<script>" from memos', code: "memo = memo.replace(/<script>/gi, '')", why: 'Blocklists miss event handlers like onerror, SVG, and nested tricks.', outcome: '<img onerror=…> has no <script> tag → still executes. Vulnerable.' },
      { id: 'length', label: 'Limit memo length to 40 characters', code: 'if (memo.length > 40) reject()', why: 'Short payloads still work.', outcome: 'A 34-character payload still fires. Vulnerable.' },
    ],
    correct: ['encode'],
    multi: false,
    attack: '<img src=x onerror=…>',
    before: "Script runs in every viewer's browser and sends their session cookie away.",
    explain: 'Stored XSS happens when user input is rendered as HTML. Encode on output for the right context and add CSP.',
  },
  {
    id: 'idor',
    title: 'Monthly statement download',
    owasp: 'A01:2021 Broken Access Control',
    vulnerable: true,
    endpoint: 'GET /api/statements/:id',
    request: 'Logged in as customer 1041 → GET /api/statements/1042',
    response: "200 OK — Mrs. Ortega's statement (customer 1042)",
    code: 'const st = await Statements.find(req.params.id);\nres.json(st);',
    patches: [
      { id: 'authz', label: 'Check on the server that the statement belongs to the logged-in user', code: 'if (st.ownerId !== req.session.userId) return res.status(403).end();', why: 'Authorization must be enforced server-side on every request for every object.', outcome: '403 Forbidden for someone else’s statement. Attack blocked.' },
      { id: 'uuid', label: 'Switch to random UUIDs so IDs are hard to guess', code: 'GET /api/statements/7f3c…', why: 'Unguessable IDs reduce enumeration but leaked links still work — it is not access control.', outcome: 'A leaked link still opens another customer’s statement. Still vulnerable.' },
      { id: 'hidebutton', label: 'Hide the download button for other accounts', code: '{isOwner && <DownloadButton/>}', why: 'The API is still open; attackers don’t need your buttons.', outcome: 'Direct API call still returns the statement. Vulnerable.' },
    ],
    correct: ['authz'],
    multi: false,
    attack: 'change :id from 1041 to 1042',
    before: 'Any customer can download any other customer’s bank statement.',
    explain: 'Insecure Direct Object Reference: the server trusted the ID without checking ownership. Deny by default and check every object.',
  },
  {
    id: 'headers',
    title: 'Response security headers',
    owasp: 'A05:2021 Security Misconfiguration',
    vulnerable: true,
    endpoint: 'All pages',
    request: 'GET / (inspecting response headers)',
    response: 'Server: PalmettoCore/2.3.1  ·  no HSTS, no CSP, no nosniff, framing allowed',
    code: '// no security headers configured',
    patches: [
      { id: 'hsts', label: 'Strict-Transport-Security: max-age=31536000; includeSubDomains', code: 'Strict-Transport-Security: max-age=31536000; includeSubDomains', why: 'Forces HTTPS so cookies can’t be stripped on café Wi-Fi.', outcome: 'Browsers refuse plain HTTP.' },
      { id: 'csp', label: "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'", code: "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'", why: 'Limits where scripts load from and blocks clickjacking frames.', outcome: 'Injected scripts and framing blocked.' },
      { id: 'nosniff', label: 'X-Content-Type-Options: nosniff', code: 'X-Content-Type-Options: nosniff', why: 'Stops browsers guessing a file is script.', outcome: 'Uploaded files can’t be run as script.' },
      { id: 'cors', label: 'Access-Control-Allow-Origin: *', code: 'Access-Control-Allow-Origin: *', why: 'Wildcard CORS lets any website read API responses — the opposite of what you want.', outcome: 'Any site can read account data. Worse!' },
      { id: 'banner', label: 'Server: PalmettoCore/2.3.1 (keep version banner)', code: 'Server: PalmettoCore/2.3.1', why: 'Version banners help attackers pick exploits; hide them.', outcome: 'Attackers see the exact vulnerable version.' },
    ],
    correct: ['hsts', 'csp', 'nosniff'],
    multi: true,
    attack: 'clickjacking frame + HTTP downgrade (simulated)',
    before: 'Login page framed by a fake site; first visit over HTTP can be intercepted.',
    explain: 'Security headers are cheap, powerful defaults. Never add wildcard CORS to authenticated APIs, and hide version banners.',
  },
  {
    id: 'errors',
    title: 'Error pages',
    owasp: 'A05:2021 Security Misconfiguration / A09 Logging',
    vulnerable: true,
    endpoint: 'Any failing request',
    request: 'GET /accounts/search?q=%ff (simulated malformed input)',
    response: 'Stack trace: db01.palmetto.nb:5432 · PostgreSQL 9.4 · /srv/core/search.js:88',
    code: 'app.use((err, req, res) => res.status(500).send(err.stack))',
    patches: [
      { id: 'generic', label: 'Generic message + incident ID to user; full details to server logs', code: "log.error({ id, err });\nres.status(500).send(`Something went wrong (ref ${id})`)", why: 'Users get a reference to quote; attackers learn nothing; defenders keep full logs.', outcome: 'Attacker sees “Something went wrong (ref 7Q2)”. Recon blocked.' },
      { id: 'loggedin', label: 'Show stack traces only to logged-in users', code: 'if (req.user) res.send(err.stack)', why: 'Attackers can open accounts too.', outcome: 'Attacker signs up and reads the stack trace. Vulnerable.' },
      { id: 'nolog', label: 'Turn off error logging entirely', code: 'app.use((e, q, r) => r.end())', why: 'Hides the leak but blinds your SOC.', outcome: 'No leak, but attacks become invisible. Bad trade.' },
    ],
    correct: ['generic'],
    multi: false,
    attack: 'malformed input to trigger an exception',
    before: 'Database host, version and file paths revealed for free.',
    explain: 'Never show internals to users. Log details server-side with a correlation ID so support and the SOC can still investigate.',
  },
  {
    id: 'cookies',
    title: 'Session cookie',
    owasp: 'A07:2021 Identification & Authentication Failures',
    vulnerable: true,
    endpoint: 'POST /login',
    request: 'Successful login',
    response: 'Set-Cookie: session=7c1e…; Path=/',
    code: "res.cookie('session', token)",
    patches: [
      { id: 'httponly', label: 'HttpOnly', code: 'HttpOnly', why: 'JavaScript can’t read the cookie, so XSS can’t steal it.', outcome: 'document.cookie no longer shows the session.' },
      { id: 'secure', label: 'Secure', code: 'Secure', why: 'Sent only over HTTPS.', outcome: 'Cookie never travels in clear text.' },
      { id: 'samesite', label: 'SameSite=Lax', code: 'SameSite=Lax', why: 'Blocks most cross-site request forgery.', outcome: 'Cross-site POSTs no longer carry the session.' },
      { id: 'expires', label: 'Expires=2099 (remember forever)', code: 'Expires=Thu, 01 Jan 2099', why: 'Long-lived sessions extend the damage of any theft.', outcome: 'A stolen cookie works for decades.' },
    ],
    correct: ['httponly', 'secure', 'samesite'],
    multi: true,
    attack: 'steal cookie via XSS / sniff on open Wi-Fi / CSRF (simulated)',
    before: 'Session cookie readable by scripts and sent over HTTP.',
    explain: 'Session cookies need HttpOnly, Secure and SameSite, plus short lifetimes and server-side revocation.',
  },
  {
    id: 'reset',
    title: 'Password reset',
    owasp: '—',
    vulnerable: false,
    endpoint: 'POST /password/reset',
    request: 'Reset link requested for a customer',
    response: 'Single-use 15-minute token sent to the verified email; 5 attempts/hour limit; same message whether or not the account exists',
    code: 'issueResetToken(user, { ttl: 900, singleUse: true }); rateLimit(ip, 5, "1h")',
    patches: [],
    correct: [],
    multi: false,
    attack: 'enumerate accounts / brute-force tokens',
    before: 'Generic responses and rate limits stop enumeration and guessing.',
    explain: 'This one is already done right. Calling it vulnerable would waste the night shift — false positives have a cost.',
  },
];

export const HINTS = [
  'One of the seven endpoints is already secure. Look for rate limits, single-use tokens and generic messages.',
  'For code bugs, the right fix changes how the server handles data (parameters, encoding, authorization) — not the UI or a blocklist.',
  'Headers and cookie flags are multi-select: pick every protective option, and avoid anything that loosens security.',
];

export interface WebInput {
  /** finding id → player's verdict */
  verdict: Record<string, 'vulnerable' | 'secure' | undefined>;
  /** finding id → chosen patch ids */
  patches: Record<string, string[]>;
  /** findings whose attack was replayed after a patch was chosen */
  replayed: string[];
}

export function freshWeb(): WebInput {
  return { verdict: {}, patches: {}, replayed: [] };
}

/** Simulated replay: what the attack does given the chosen patch(es). */
export function replay(f: Finding, chosen: string[]): { blocked: boolean; text: string } {
  if (!f.vulnerable) return { blocked: true, text: 'Attack fails: ' + f.before };
  if (!chosen.length) return { blocked: false, text: `UNPATCHED → ${f.before}` };
  const frac = setFraction(chosen, f.correct);
  const outcomes = chosen.map((id) => f.patches.find((p) => p.id === id)?.outcome ?? '').filter(Boolean);
  return { blocked: frac === 1, text: outcomes.join(' ') };
}

export function scoreWeb(input: WebInput): Graded {
  const items: Explained[] = [];
  const mistakes: string[] = [];
  let idHits = 0;
  let patchFrac = 0;
  const vulns = FINDINGS.filter((f) => f.vulnerable);
  for (const f of FINDINGS) {
    const v = input.verdict[f.id];
    const rightVerdict = (v === 'vulnerable') === f.vulnerable && v !== undefined;
    if (rightVerdict) idHits++;
    else mistakes.push(`${f.title}: ${f.vulnerable ? 'missed a real vulnerability' : 'flagged a secure endpoint'}`);
    if (f.vulnerable) {
      const frac = setFraction(input.patches[f.id] ?? [], f.correct);
      patchFrac += frac;
      if (frac < 1) mistakes.push(`${f.title}: weak or missing patch`);
      const best = f.correct.map((c) => f.patches.find((p) => p.id === c)?.label).join(' + ');
      items.push({ title: `${f.title} (${f.owasp})`, ok: rightVerdict && frac === 1, text: `${f.explain} Best fix: ${best}.` });
    } else {
      items.push({ title: `${f.title} (secure)`, ok: rightVerdict, text: f.explain });
    }
  }
  const verified = vulns.filter((f) => input.replayed.includes(f.id)).length;
  const { score, breakdown } = weigh([
    { label: 'Vulnerabilities identified', frac: idHits / FINDINGS.length, max: 30 },
    { label: 'Correct patches', frac: patchFrac / vulns.length, max: 60 },
    { label: 'Fixes verified by replaying attacks', frac: Math.min(1, verified / 3), max: 10 },
  ]);
  return { score, breakdown, items, mistakes };
}

/** Perfect answers (used by tests). */
export function perfectWeb(): WebInput {
  const verdict: WebInput['verdict'] = {};
  const patches: WebInput['patches'] = {};
  for (const f of FINDINGS) {
    verdict[f.id] = f.vulnerable ? 'vulnerable' : 'secure';
    if (f.vulnerable) patches[f.id] = [...f.correct];
  }
  return { verdict, patches, replayed: FINDINGS.filter((f) => f.vulnerable).map((f) => f.id) };
}
