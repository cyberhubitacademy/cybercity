import type { BankSource } from '../types';

// Banks: investigation, phishing, passwords, network, firewall.
// All names, domains (.nb) and IPs (documentation ranges) are fictional.

export const investigation: BankSource = {
  id: 'investigation',
  card: {
    title: 'Evidence-led investigation',
    definition: 'Reaching conclusions from verifiable artifacts (logs, hashes, timestamps) instead of hunches.',
    whyItMatters: 'Wrong conclusions waste response time and can blame the wrong person or system.',
    example: 'A login from 198.51.100.7 at 03:12 matches a VPN log entry and a new mailbox rule created two minutes later.',
    bestPractice: 'Corroborate every finding with at least two independent sources before acting.',
  },
  classify: [
    ['Mailbox rule auto-forwarding all mail to an external .nb address, created at 03:14 by a user who never works nights', true, 'Off-hours forwarding rules are a classic sign of account takeover used to quietly exfiltrate mail.'],
    ['Weekly backup job writing 40 GB to the backup server every Sunday at 02:00', false, 'Regular, scheduled, documented and going to an internal backup target — expected behavior.'],
    ['Same account logging in from Neon Bay and from 203.0.113.90 overseas within 10 minutes', true, '"Impossible travel" — no person can move that fast, so one session is likely stolen credentials.'],
    ['Security tool updating its signature database from the vendor\'s update server', false, 'Routine update traffic to a known vendor endpoint.'],
    ['Audit log shows log collection on a server stopped right before a burst of admin logins', true, 'Attackers often disable logging to hide activity — gaps in telemetry are evidence too.'],
    ['Help-desk ticket opened by the user to reset their own password, verified by callback', false, 'Verified, documented self-service — normal process.'],
  ],
  pairs: [
    ['Indicator of compromise (IOC)', 'An observable artifact, like a hash, IP or domain, that suggests an intrusion'],
    ['Impossible travel', 'Logins from places too far apart to reach in the time between them'],
    ['Pivot', 'Using one finding (an IP, a user) to search for related activity elsewhere'],
    ['Root cause', 'The underlying weakness that allowed the incident to happen'],
    ['Telemetry gap', 'A period where expected logs are missing, possibly due to tampering'],
  ],
  order: [{ title: 'Run an investigation', steps: ['Scope the question you need to answer', 'Preserve the relevant evidence', 'Collect logs from every involved system', 'Build a timeline of events', 'Correlate and test hypotheses', 'Report findings with supporting evidence'], why: 'Scope first, preserve before you touch, then analyze — reporting comes last, backed by evidence.' }],
  configs: [
    ['Log retention for authentication logs', '7 days', '90+ days, centrally stored', 'Many intrusions are discovered weeks later; short retention destroys the trail.'],
    ['Clock synchronization on servers', 'Each server sets its own time', 'All systems use NTP to a trusted source', 'Without synced clocks, cross-system timelines are unreliable.'],
  ],
  quiz: [
    ['You find a suspicious IP in one firewall log. What is the best next step?', ['Block it and close the ticket', 'Pivot: search all logs for that IP and related accounts', 'Email the IP owner', 'Ignore it unless it repeats'], 1, 'Pivoting reveals the full scope; blocking alone may leave other footholds unnoticed.'],
    ['Two logs disagree on when an event happened by exactly 5 hours. What is the most likely reason?', ['One log was forged', 'Time-zone difference (UTC vs local)', 'The event happened twice', 'A disk error'], 1, 'Always normalize timestamps to one time zone (usually UTC) before building a timeline.'],
  ],
  triage: [
    ['Admin account created outside change window, then used immediately', 1, 'Unapproved privileged account plus immediate use strongly suggests compromise.'],
    ['Single failed login for a user who then logged in successfully', 4, 'A typo followed by success is normal.'],
    ['Logging agent stopped on a domain controller', 2, 'Loss of visibility on a critical server needs prompt follow-up.'],
  ],
  spot: [{
    title: 'Case file: after-hours account activity',
    fields: [['User', 'j.morales@palmettobank.nb'], ['Login', '03:12 from 198.51.100.7 (new country)'], ['Action', 'Created inbox rule: forward all to outbox-sync@mail-relay.nb'], ['MFA', 'Not enrolled'], ['Device', 'Unrecognized browser']],
    flags: [['Login from a new country at 03:12', 'Unusual location and time for this user.'], ['External auto-forward rule', 'Classic exfiltration persistence after takeover.'], ['No MFA enrolled', 'Password alone was enough to get in.']],
    decoys: [['User has a long email address', 'Length of an address is not a security signal.'], ['Login used HTTPS', 'HTTPS protects transport; it says nothing about who logged in.'], ['Account belongs to the bank', 'Ownership is expected, not suspicious.']],
  }],
  words: ['EVIDENCE', 'TIMELINE', 'PIVOT', 'CLUE', 'TRACE', 'CASE'],
};

export const phishing: BankSource = {
  id: 'phishing',
  card: {
    title: 'Phishing and social engineering',
    definition: 'Tricking people into revealing secrets, paying, or running malware by impersonating someone trusted.',
    whyItMatters: 'Most breaches start with a human being persuaded, not a firewall being broken.',
    example: 'An "invoice overdue" email from palmett0-bank.nb with a .html attachment that opens a fake login page.',
    bestPractice: 'Verify requests through a known, separate channel and report suspicious messages instead of engaging.',
  },
  classify: [
    ['"Your mailbox is full — log in within 1 hour at palmettobank-secure-login.nb or lose access"', true, 'Urgency plus a lookalike login link is a credential-phishing pattern.'],
    ['Monthly newsletter from news@coralcafe.nb with an unsubscribe link and no attachments', false, 'Expected sender, no requests for secrets or urgent action.'],
    ['Text: "Package held. Pay $1.99 customs fee: nb-parcel.top/pay"', true, 'Smishing: small fee, unknown short domain, pressure to pay.'],
    ['Calendar invite from your manager for the weekly team meeting you always attend', false, 'Routine, expected, verifiable.'],
    ['CEO email from a personal address asking you to buy gift cards urgently and keep it secret', true, 'Authority + urgency + secrecy + gift cards = classic CEO fraud.'],
    ['IT notice on the intranet announcing planned maintenance, no links to log in', false, 'Internal channel, informational, asks for nothing.'],
    ['QR code sticker on a parking meter pointing to pay-parking-nb.click', true, 'Quishing: QR codes hide the destination; stickers can be swapped by scammers.'],
  ],
  pairs: [
    ['Spear phishing', 'A phishing message tailored to a specific person using personal details'],
    ['Smishing', 'Phishing delivered by SMS text message'],
    ['Vishing', 'Phishing by voice call, sometimes with cloned voices'],
    ['Pretexting', 'Inventing a believable scenario to justify an unusual request'],
    ['Business email compromise (BEC)', 'Fraud using a real or spoofed business mailbox to redirect payments'],
    ['DMARC', 'Email policy telling receivers what to do when SPF/DKIM checks fail'],
  ],
  order: [{ title: 'Handle a suspicious email', steps: ['Pause — do not click links or open attachments', 'Check the real sender address and reply-to', 'Hover to inspect where links really go', 'Verify the request using a known phone number or channel', 'Report the message with the phishing button', 'Delete it after the security team confirms'], why: 'Stop, inspect, verify out-of-band, then report so others are protected too.' }],
  configs: [
    ['Inbound email authentication policy', 'DMARC p=none (monitor only)', 'DMARC p=reject with SPF and DKIM aligned', 'p=reject tells receivers to drop spoofed mail claiming to be your domain.'],
    ['External email banner', 'Disabled', '"External sender" banner on outside mail', 'A visible tag helps people notice an impostor posing as a colleague.'],
  ],
  quiz: [
    ['A vendor emails new bank details for next month\'s invoice. What should you do?', ['Update the details — the email looks real', 'Reply to the email to confirm', 'Call the vendor on the number already on file', 'Forward it to a coworker for a second look'], 2, 'Replying goes to the attacker; only a known, independent channel verifies a payment change.'],
    ['You clicked a phishing link and typed your password. Best immediate action?', ['Wait and see', 'Change the password, report to security, check for MFA prompts', 'Delete the email so nobody knows', 'Clear browser history'], 1, 'Fast reporting and a password reset limit the damage; hiding it helps the attacker.'],
  ],
  triage: [
    ['20 employees reported the same fake payroll email; 3 clicked the link', 1, 'Active campaign with confirmed clicks — credentials may be compromised.'],
    ['One user reported a marketing newsletter as phishing', 4, 'Benign report; thank the user and move on.'],
    ['DMARC report shows spoofed mail using your domain sent from 203.0.113.44', 2, 'Someone impersonates you — tighten DMARC and warn partners.'],
  ],
  spot: [{
    title: 'Email: "URGENT: Account suspended"',
    fields: [['From', 'Palmetto Bank Security <alerts@palmett0-bank.nb>'], ['Reply-To', 'support-desk@freemail-nb.example'], ['SPF / DKIM', 'fail / none'], ['Link text', 'https://palmettobank.nb/verify'], ['Link target', 'http://palmett0-bank.nb.verify-id.top/login'], ['Attachment', 'Statement_Oct.html']],
    flags: [['Lookalike domain (0 instead of o)', 'palmett0 is not palmetto.'], ['Reply-To differs from sender', 'Replies go to the attacker\'s mailbox.'], ['SPF fail / no DKIM', 'The sending server isn\'t authorized for that domain.'], ['Link text ≠ real target', 'The visible URL hides a different destination.'], ['HTML attachment', 'HTML files can open fake login forms locally.']],
    decoys: [['Uses the bank\'s logo colors', 'Branding is easy to copy; not a reliable signal either way.'], ['Sent on a weekday', 'Timing alone is not evidence.'], ['Subject is in capitals', 'Style is weak evidence compared with the technical red flags.']],
  }],
  words: ['PHISH', 'LURE', 'BAIT', 'SPOOF', 'REPORT', 'VERIFY'],
};

export const passwords: BankSource = {
  id: 'passwords',
  card: {
    title: 'Authentication and passwords',
    definition: 'Proving identity with something you know, have, or are — ideally more than one.',
    whyItMatters: 'Stolen or reused passwords are the most common way into accounts.',
    example: 'Credential stuffing: passwords leaked from one site are tried automatically on Palmetto Bank logins.',
    bestPractice: 'Unique passphrases in a password manager, MFA everywhere (phishing-resistant where possible), and slow salted hashing on the server.',
  },
  classify: [
    ['Password "Summer2025!" used for both email and banking', true, 'Predictable pattern and reuse — one leak opens both accounts.'],
    ['A 20-character random password generated and stored by a password manager', false, 'Long, unique and random — exactly what a manager is for.'],
    ['Server storing passwords with unsalted MD5', true, 'MD5 is fast and unsalted hashes fall to precomputed tables; use bcrypt/scrypt/Argon2.'],
    ['Passphrase "coral-lantern-midnight-orbit" protected by MFA', false, 'Long multi-word passphrase plus a second factor.'],
    ['Login page that allows unlimited attempts with no delay', true, 'Without rate limiting, attackers can guess or stuff credentials at scale.'],
    ['Hardware security key used for admin logins', false, 'Phishing-resistant MFA (FIDO2/WebAuthn).'],
    ['Recovery question "What is your favorite color?"', true, 'Guessable and often public — weak account recovery.'],
  ],
  pairs: [
    ['Salt', 'Random per-user value added before hashing so identical passwords hash differently'],
    ['Credential stuffing', 'Trying leaked username/password pairs on other sites'],
    ['MFA', 'Requiring two or more independent factors to log in'],
    ['Password hashing (bcrypt/Argon2)', 'A deliberately slow one-way function for storing passwords'],
    ['Session token', 'A secret issued after login that proves the session; must be protected like a password'],
    ['Least privilege', 'Giving each account only the access it needs'],
  ],
  order: [{ title: 'Secure an account after a leak', steps: ['Confirm which account and credentials leaked', 'Reset the password to a new unique passphrase', 'Sign out all active sessions and revoke tokens', 'Enroll or re-enroll MFA', 'Review recent activity and recovery settings', 'Change the same password anywhere else it was reused'], why: 'Reset, kill existing sessions, add MFA, then hunt for anything the attacker changed.' }],
  configs: [
    ['Password storage', 'Reversible encryption with a key in the app config', 'Argon2id with unique salts', 'Passwords should be one-way hashed with a slow, salted algorithm.'],
    ['Failed login handling', 'Unlimited attempts', 'Rate limiting + temporary lockout + alerting', 'Slows guessing and credential stuffing, and tells defenders it is happening.'],
  ],
  quiz: [
    ['Which is the strongest MFA against phishing?', ['SMS code', 'Email code', 'Hardware security key (FIDO2)', 'Security questions'], 2, 'FIDO2 keys check the website origin, so a fake site cannot capture a usable code.'],
    ['Why is hashing preferred over encryption for stored passwords?', ['Hashing is reversible', 'Hashes cannot be decrypted, so a stolen database does not reveal passwords directly', 'Encryption is too slow', 'Hashing makes passwords shorter'], 1, 'Systems only need to compare hashes; nothing should be able to recover the original password.'],
  ],
  triage: [
    ['5,000 failed logins across 900 usernames from 198.51.100.0/24, then 4 successes', 1, 'Credential stuffing with confirmed successful logins.'],
    ['User locked out after 5 wrong attempts on Monday morning', 4, 'Typical post-weekend forgotten password.'],
    ['MFA push approved at 02:40 for a user who reports being asleep', 1, 'MFA fatigue / push bombing — the attacker has the password.'],
  ],
  spot: [{
    title: 'Login policy review: Coral Café POS',
    fields: [['Admin user', 'admin'], ['Password', 'coralcafe123'], ['MFA', 'Disabled'], ['Lockout', 'None'], ['Hash', 'MD5, no salt'], ['Password manager', 'Allowed']],
    flags: [['Default-style admin username', 'Attackers try "admin" first.'], ['Guessable password with business name', 'Appears in every wordlist.'], ['MFA disabled', 'One stolen password = full access.'], ['No lockout', 'Unlimited guessing.'], ['Unsalted MD5', 'Fast to crack.']],
    decoys: [['Password manager allowed', 'That is a good thing.'], ['Account is for the café', 'Ownership isn\'t a weakness.']],
  }],
  words: ['SALT', 'HASH', 'TOKEN', 'PASSKEY', 'FACTOR', 'VAULT'],
};

export const network: BankSource = {
  id: 'network',
  card: {
    title: 'Network traffic analysis',
    definition: 'Reading connection records (IPs, ports, protocols, volumes, timing) to separate normal traffic from attacks.',
    whyItMatters: 'Malware has to talk to its operators; that communication leaves patterns on the wire.',
    example: 'A workstation contacting 203.0.113.66:4444 every 60 seconds is beaconing to a command server.',
    bestPractice: 'Baseline normal traffic, alert on deviations, and restrict outbound connections to what is needed.',
  },
  classify: [
    ['Connections every 60 seconds exactly from one workstation to 203.0.113.66:4444', true, 'Fixed-interval beaconing to an unusual port suggests command-and-control.'],
    ['DNS queries from laptops to the internal resolver on UDP 53', false, 'Normal name resolution to the expected server.'],
    ['One host sending 30 GB to an unknown external IP at 03:00', true, 'Large off-hours transfer to an unknown destination — possible exfiltration.'],
    ['HTTPS traffic from staff browsers to the company\'s cloud email', false, 'Expected business traffic.'],
    ['A single IP touching ports 1–1024 on every server within two minutes', true, 'Port scan — reconnaissance.'],
    ['Telnet (TCP 23) open to the internet on a router', true, 'Telnet sends credentials in clear text and should never be internet-facing.'],
    ['NTP (UDP 123) from servers to the internal time server', false, 'Expected time synchronization.'],
  ],
  pairs: [
    ['TCP', 'Connection-oriented protocol with a handshake and reliable delivery'],
    ['UDP', 'Connectionless protocol; fast, no delivery guarantee'],
    ['Port 443', 'HTTPS — web traffic encrypted with TLS'],
    ['Port 53', 'DNS — translating names into IP addresses'],
    ['Beaconing', 'Regular, repeating check-ins from malware to its controller'],
    ['Subnet', 'A range of IP addresses grouped into one network segment'],
  ],
  order: [{ title: 'Investigate a suspicious connection', steps: ['Note source, destination, port and protocol', 'Check the destination against threat intel', 'Look for repetition or beacon timing', 'Identify the process that opened the connection', 'Contain the host if malicious', 'Block the destination at the egress firewall'], why: 'Describe it, enrich it, find the process, then contain and block.' }],
  configs: [
    ['Outbound (egress) firewall policy', 'Allow all outbound traffic', 'Allow only required destinations and ports', 'Egress filtering stops many malware callbacks and exfiltration routes.'],
    ['Remote admin protocol', 'Telnet on port 23', 'SSH with keys on a management network only', 'Telnet is unencrypted; SSH is encrypted and should not face the internet.'],
  ],
  quiz: [
    ['Which pattern most strongly suggests DNS tunneling?', ['Short queries to the internal resolver', 'Very long random-looking subdomains sent to one external domain', 'Queries for the company website', 'Reverse lookups by the mail server'], 1, 'Data can be smuggled inside long encoded subdomain labels.'],
    ['Many REJ/RST responses from one source across sequential ports means…', ['A backup job', 'A port scan', 'A DNS outage', 'Normal browsing'], 1, 'Scans probe many ports; closed ones reply with resets.'],
  ],
  triage: [
    ['Beaconing from a finance laptop to a known malicious IP', 1, 'Likely active compromise with command-and-control.'],
    ['Port scan from an external IP blocked at the firewall', 3, 'Common internet noise; monitor but low urgency.'],
    ['Vulnerability scanner traffic from the security team\'s scheduled scan', 4, 'Authorized and expected.'],
  ],
  spot: [{
    title: 'Flow record: WS-114',
    fields: [['Source', '10.20.5.14:51220'], ['Destination', '203.0.113.66:4444'], ['Protocol', 'TCP'], ['Interval', 'every 60 s, 1,440 times today'], ['Bytes', '~300 out / ~200 in per session'], ['Process', 'svch0st.exe']],
    flags: [['Unusual destination port 4444', 'Not a standard business service.'], ['Perfectly regular interval', 'Humans are irregular; malware timers are not.'], ['Lookalike process name svch0st.exe', 'Mimics the real svchost.exe.']],
    decoys: [['Source is a private IP', 'Every internal host has one.'], ['Uses TCP', 'Most traffic uses TCP.'], ['Small packet sizes', 'Small sizes alone are common and not decisive.']],
  }],
  words: ['PACKET', 'PORT', 'BEACON', 'SUBNET', 'ROUTE', 'SOCKET'],
};

export const firewall: BankSource = {
  id: 'firewall',
  card: {
    title: 'Firewalls and least privilege',
    definition: 'Rules evaluated in order (first match wins) that allow only required traffic and deny the rest.',
    whyItMatters: 'Every unnecessary open port is attack surface.',
    example: 'An early "ALLOW any any" rule silently shadows every deny rule below it.',
    bestPractice: 'Default deny, specific allows, management access only from a VPN/admin subnet, and regular rule reviews.',
  },
  classify: [
    ['ALLOW any → any, port any, placed at the top of the rule list', true, 'Overly broad and shadows every rule below it.'],
    ['ALLOW internet → web server 443', false, 'Required, specific public service.'],
    ['ALLOW internet → database 3306', true, 'Databases should never be reachable from the internet.'],
    ['ALLOW admin VPN subnet → servers 22', false, 'Management access restricted to a trusted subnet.'],
    ['ALLOW internet → servers 3389 (RDP)', true, 'Exposed RDP is a top ransomware entry point.'],
    ['Default policy: DENY', false, 'Anything not explicitly allowed is blocked.'],
  ],
  pairs: [
    ['First-match evaluation', 'The firewall applies the first rule that matches and stops'],
    ['Default deny', 'Traffic not explicitly allowed is blocked'],
    ['DMZ', 'A buffer network for public-facing servers'],
    ['Shadowed rule', 'A rule that can never match because an earlier rule catches the traffic first'],
    ['WAF', 'A web application firewall inspecting HTTP requests'],
    ['Segmentation', 'Splitting a network into zones so a breach can\'t spread freely'],
  ],
  order: [{ title: 'Design a firewall policy', steps: ['Inventory the services that must be reachable', 'Group systems into zones (internet, DMZ, internal, admin)', 'Write specific allow rules per required flow', 'Place specific rules above broad ones', 'Set the default action to deny', 'Test legitimate and attack traffic against the rules'], why: 'Know what is needed, zone it, allow precisely, order correctly, deny the rest, then verify.' }],
  configs: [
    ['Default action', 'ALLOW', 'DENY', 'Default allow means every forgotten port is open.'],
    ['Database access rule', 'ALLOW any → db 3306', 'ALLOW app server → db 3306 only', 'Only the application tier needs to reach the database.'],
  ],
  quiz: [
    ['A DENY rule for port 23 isn\'t blocking Telnet. The most likely cause is…', ['Firewalls ignore port 23', 'An earlier ALLOW rule matches first (shadowing)', 'Telnet uses UDP', 'The default action is deny'], 1, 'With first-match rules, order decides the outcome.'],
    ['Where should a public website server live?', ['Same subnet as the database', 'In a DMZ separated from internal systems', 'On the admin network', 'Directly on the internet with no firewall'], 1, 'A DMZ limits what an attacker can reach if the web server is compromised.'],
  ],
  triage: [
    ['Change log: someone added ALLOW internet → db 3306 an hour ago', 1, 'Exposes the database right now; roll back immediately.'],
    ['WAF blocked a known SQL-injection pattern against the login page', 3, 'Control worked; review for persistence but not an emergency.'],
    ['Firewall CPU at 45% during business hours', 4, 'Normal load.'],
  ],
  spot: [{
    title: 'Rule set review: Harbor Cloud edge',
    fields: [['Rule 1', 'ALLOW any → any (any)'], ['Rule 2', 'ALLOW internet → 192.0.2.10:443'], ['Rule 3', 'ALLOW internet → 10.0.2.30:3306'], ['Rule 4', 'DENY internet → any:23'], ['Rule 5', 'ALLOW 10.9.0.0/24 → any:22'], ['Default', 'ALLOW']],
    flags: [['Rule 1 allows everything', 'Shadows every other rule.'], ['Rule 3 exposes the database', 'DBs must not face the internet.'], ['Default action ALLOW', 'Should be deny.'], ['Rule 4 can never match', 'Shadowed by rule 1.']],
    decoys: [['Rule 2 allows HTTPS to the web server', 'Required and specific.'], ['Rule 5 limits SSH to the admin VPN', 'Good practice.']],
  }],
  words: ['DENY', 'ALLOW', 'ZONE', 'GATEWAY', 'RULE', 'PERIMETER'],
};
