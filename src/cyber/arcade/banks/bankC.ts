import type { BankSource } from '../types';

// Banks: pentest, webapp, cloud, ransomware, iot.

export const pentest: BankSource = {
  id: 'pentest',
  card: {
    title: 'Ethical, authorized testing',
    definition: 'Simulating attacks only with written permission, a defined scope and rules of engagement, to find and fix weaknesses.',
    whyItMatters: 'The same action is a crime without authorization; with it, it makes systems safer.',
    example: 'Sunset Shield tests only the Coral Café web app listed in the signed scope, during agreed hours.',
    bestPractice: 'Get written authorization, stay in scope, avoid harm, protect findings, and report responsibly.',
  },
  classify: [
    ['Testing a system listed in a signed scope document during agreed hours', false, 'Authorized and scoped — ethical testing.'],
    ['Scanning a neighbor company\'s servers "to show them they\'re vulnerable"', true, 'No authorization — illegal regardless of intent.'],
    ['Reporting a found vulnerability privately to the vendor\'s security contact', false, 'Responsible disclosure.'],
    ['Copying customer data you found during a test to your laptop "as proof"', true, 'Collect the minimum evidence; never exfiltrate real data.'],
    ['Stopping and contacting the client when a test may cause an outage', false, 'Rules of engagement prioritize safety.'],
    ['Publishing an unpatched vulnerability publicly before the vendor responds', true, 'Puts users at risk; coordinate disclosure.'],
  ],
  pairs: [
    ['Scope', 'The exact systems and activities a tester is allowed to touch'],
    ['Rules of engagement', 'Agreed limits: timing, methods, contacts and stop conditions'],
    ['Responsible disclosure', 'Privately reporting a flaw and giving time to fix before going public'],
    ['Red team', 'Testers emulating realistic adversaries'],
    ['Blue team', 'Defenders who detect and respond'],
    ['Purple team', 'Red and blue working together to improve detections'],
  ],
  order: [{ title: 'Authorized assessment workflow', steps: ['Agree scope and rules of engagement in writing', 'Perform passive reconnaissance on in-scope assets', 'Identify vulnerabilities with approved tools', 'Validate findings safely without causing harm', 'Write a report with risk ratings and fixes', 'Retest after the client remediates'], why: 'Permission first; the goal is fixing, verified by retesting.' }],
  configs: [
    ['Test authorization', 'Verbal OK from a friend who works there', 'Signed authorization from the system owner', 'Only the owner can grant permission, in writing.'],
    ['Handling sensitive findings', 'Shared in a public chat', 'Encrypted report to named client contacts', 'Findings are a roadmap for attackers.'],
  ],
  quiz: [
    ['During an in-scope test you discover a server outside scope. What do you do?', ['Test it anyway', 'Note it and ask the client before touching it', 'Ignore everything', 'Post about it'], 1, 'Out-of-scope means no testing without new authorization.'],
    ['A bug bounty program forbids testing payment pages. You find a bug there by accident. Best action?', ['Exploit it to prove impact', 'Stop and report what you observed through the program', 'Sell it', 'Keep it secret'], 1, 'Respect the rules and report through the official channel.'],
  ],
  triage: [
    ['Critical SQL injection finding on internet-facing login', 1, 'High impact, easy to exploit — fix first.'],
    ['Outdated copyright year in footer', 4, 'Cosmetic.'],
    ['Verbose error messages revealing framework version', 3, 'Information disclosure; fix in normal cycle.'],
  ],
  spot: [{
    title: 'Engagement plan review',
    fields: [['Authorization', 'Verbal approval from a contractor'], ['Scope', '"Everything with coralcafe in the name"'], ['Timing', 'Any time'], ['Data handling', 'Download customer DB as proof'], ['Report', 'Encrypted, to café owner']],
    flags: [['No written authorization from the owner', 'Not legally authorized.'], ['Vague scope', 'Must list exact assets.'], ['No time window', 'Rules of engagement need limits.'], ['Exfiltrating customer data', 'Never take real data.']],
    decoys: [['Encrypted report to the owner', 'Correct handling.']],
  }],
  words: ['SCOPE', 'RECON', 'REPORT', 'RETEST', 'BOUNTY', 'PATCH'],
};

export const webapp: BankSource = {
  id: 'webapp',
  card: {
    title: 'Web application security (OWASP Top 10)',
    definition: 'Common web flaws like broken access control, injection, XSS and misconfiguration — and their fixes.',
    whyItMatters: 'Web apps are internet-facing and handle sensitive data.',
    example: 'Changing /invoice?id=1001 to 1002 shows another customer\'s invoice — broken access control (IDOR).',
    bestPractice: 'Server-side authorization on every request, parameterized queries, output encoding, and secure headers.',
  },
  classify: [
    ['Query built as "SELECT * FROM users WHERE name = \'" + input + "\'"', true, 'String concatenation enables SQL injection; use parameterized queries.'],
    ['Session cookie set with HttpOnly; Secure; SameSite=Lax', false, 'Good cookie hardening.'],
    ['User comments rendered with innerHTML without encoding', true, 'Stored XSS risk.'],
    ['Server checks that the logged-in user owns the invoice before returning it', false, 'Proper object-level authorization.'],
    ['CORS: Access-Control-Allow-Origin: * with credentials on an API', true, 'Lets any site make authenticated requests (and browsers reject the combo for good reason).'],
    ['Content-Security-Policy restricting scripts to the site\'s own origin', false, 'Limits XSS impact.'],
  ],
  pairs: [
    ['SQL injection', 'Untrusted input changing the meaning of a database query'],
    ['XSS', 'Injecting script that runs in other users\' browsers'],
    ['CSRF', 'Tricking a logged-in browser into sending an unwanted request'],
    ['IDOR', 'Accessing another user\'s object by changing an identifier'],
    ['SSRF', 'Making the server fetch an attacker-chosen URL, often internal'],
    ['CSP', 'A header limiting where scripts and content may load from'],
  ],
  order: [{ title: 'Handle a request securely', steps: ['Authenticate the user (valid session)', 'Validate and normalize input', 'Authorize: does this user own this resource?', 'Query with parameterized statements', 'Encode output for its context', 'Return safe errors without stack traces'], why: 'Who are you, is input sane, are you allowed, then safe data access and safe output.' }],
  configs: [
    ['Session cookie flags', 'No flags', 'HttpOnly, Secure, SameSite', 'Blocks script access, plaintext transport and many CSRF cases.'],
    ['Error pages', 'Show full stack traces', 'Generic message, details only in server logs', 'Stack traces leak internals.'],
  ],
  quiz: [
    ['Best fix for SQL injection?', ['Blocklist the word SELECT', 'Parameterized queries / prepared statements', 'Hide the error message', 'Use POST instead of GET'], 1, 'Parameters keep data separate from code.'],
    ['A file upload accepts .php files into a web folder. Main risk?', ['Disk space', 'Remote code execution if the server runs the file', 'Slower uploads', 'None'], 1, 'Restrict types, store outside web root and rename uploads.'],
  ],
  triage: [
    ['Confirmed SQL injection on public checkout page', 1, 'Data breach risk now.'],
    ['Missing X-Content-Type-Options header', 3, 'Hardening item.'],
    ['Robots.txt lists /images', 4, 'Harmless.'],
  ],
  spot: [{
    title: 'HTTP response review: portal.coralcafe.nb',
    fields: [['Set-Cookie', 'session=ab12…; Path=/'], ['Access-Control-Allow-Origin', '*'], ['Server', 'NeonHTTPd 2.1.0 (debug)'], ['Body', 'Stack trace: at Db.query("SELECT … \'" + q + "\'")'], ['Strict-Transport-Security', 'max-age=31536000']],
    flags: [['Cookie missing HttpOnly/Secure/SameSite', 'Session theft risk.'], ['Wildcard CORS', 'Overly permissive.'], ['Debug server banner', 'Information disclosure.'], ['Stack trace showing concatenated SQL', 'Leaks internals and hints at injection.']],
    decoys: [['HSTS enabled', 'Good practice.']],
  }],
  words: ['COOKIE', 'HEADER', 'INJECT', 'ENCODE', 'SESSION', 'ORIGIN'],
};

export const cloud: BankSource = {
  id: 'cloud',
  card: {
    title: 'Cloud and DevSecOps security',
    definition: 'Securing cloud identities, storage, workloads and the pipelines that deploy them.',
    whyItMatters: 'Most cloud breaches come from misconfiguration and over-privileged identities, not exotic exploits.',
    example: 'A storage bucket set to public-read exposes Harbor Cloud customer backups.',
    bestPractice: 'Least-privilege IAM, no long-lived keys, secrets in a manager, scanning in CI, and logging enabled everywhere.',
  },
  classify: [
    ['Storage bucket policy grants public read to "*"', true, 'Anyone on the internet can read the data.'],
    ['CI pipeline scans dependencies and container images before deploy', false, 'Shift-left security.'],
    ['API key committed to a public repository', true, 'Leaked secrets are harvested by bots within minutes.'],
    ['Workloads use short-lived role credentials instead of static keys', false, 'Reduces credential theft impact.'],
    ['IAM role with "Action: *" on "Resource: *" for a web app', true, 'Massively over-privileged.'],
    ['Audit logging enabled in every region and sent to a locked account', false, 'Tamper-resistant visibility.'],
  ],
  pairs: [
    ['Shared responsibility', 'The provider secures the cloud; you secure what you put in it'],
    ['IAM policy', 'Rules defining which identity can do which actions on which resources'],
    ['Secrets manager', 'A service that stores and rotates credentials securely'],
    ['Infrastructure as code', 'Defining cloud resources in version-controlled files'],
    ['Container image scanning', 'Checking images for known vulnerable packages'],
    ['Drift', 'Live configuration differing from the approved code'],
  ],
  order: [{ title: 'Respond to a leaked cloud key', steps: ['Revoke or disable the leaked key', 'Review audit logs for actions taken with it', 'Remove any resources or access the attacker created', 'Rotate related secrets', 'Remove the key from the repository history', 'Add secret scanning to CI to prevent repeats'], why: 'Kill the credential, investigate, clean up, rotate, then prevent.' }],
  configs: [
    ['Storage bucket access', 'Public read', 'Private with block-public-access enabled', 'Default private prevents accidental exposure.'],
    ['Pipeline credentials', 'Long-lived admin key in CI variables', 'Short-lived, scoped identity via workload federation', 'Less to steal, less it can do.'],
  ],
  quiz: [
    ['Who patches the guest OS on a cloud virtual machine (IaaS)?', ['Always the provider', 'The customer', 'Nobody', 'The browser'], 1, 'In IaaS the customer manages the OS and above.'],
    ['Best way to keep secrets out of code?', ['Base64-encode them', 'Load them at runtime from a secrets manager', 'Put them in comments', 'Use a private repo'], 1, 'Secrets managers control access and rotation.'],
  ],
  triage: [
    ['Bucket with customer data became public 10 minutes ago', 1, 'Active exposure.'],
    ['Container image has a medium CVE in an unused package', 3, 'Patch in next build.'],
    ['New dev environment created through the approved pipeline', 4, 'Expected change.'],
  ],
  spot: [{
    title: 'IaC review: harbor-cloud/main.tf',
    fields: [['bucket.acl', '"public-read"'], ['role.policy', 'Action "*" Resource "*"'], ['db.publicly_accessible', 'true'], ['logging', 'disabled'], ['kms.rotation', 'enabled']],
    flags: [['Public bucket', 'Data exposure.'], ['Wildcard IAM permissions', 'Over-privileged.'], ['Public database', 'Should be private.'], ['Logging disabled', 'No visibility.']],
    decoys: [['Key rotation enabled', 'Good practice.']],
  }],
  words: ['BUCKET', 'ROLE', 'PIPELINE', 'SECRET', 'CLUSTER', 'DRIFT'],
};

export const ransomware: BankSource = {
  id: 'ransomware',
  card: {
    title: 'Backups and data protection',
    definition: 'Protecting data with classification, access control, DLP and backups that survive attacks.',
    whyItMatters: 'Ransomware and leaks hit the data itself; recovery depends on clean, tested backups.',
    example: 'Immutable, offline backups let Palmetto Bank restore without paying.',
    bestPractice: '3-2-1 backups with an immutable/offline copy, regular restore tests, and data classified by sensitivity.',
  },
  classify: [
    ['Backups stored on the same network share as the data, writable by all users', true, 'Ransomware encrypts them too.'],
    ['Immutable backup copy with 30-day retention lock', false, 'Can\'t be altered or deleted by attackers.'],
    ['Restore test performed quarterly with documented results', false, 'Proves backups actually work.'],
    ['Customer database exported to a personal USB drive', true, 'Data leak risk and policy violation.'],
    ['DLP blocking upload of files labeled "Confidential" to personal cloud storage', false, 'Data loss prevention working.'],
    ['Backups never tested since setup three years ago', true, 'Untested backups often fail when needed.'],
  ],
  pairs: [
    ['RPO', 'Maximum acceptable data loss, measured in time'],
    ['RTO', 'Maximum acceptable time to restore a service'],
    ['Immutable backup', 'A backup that cannot be changed or deleted for a set period'],
    ['DLP', 'Controls that detect and block sensitive data leaving the organization'],
    ['Data classification', 'Labeling data by sensitivity to apply the right protection'],
    ['Exfiltration', 'Unauthorized transfer of data out of an organization'],
  ],
  order: [{ title: 'Restore after ransomware', steps: ['Contain and confirm the attacker is out', 'Identify the last known-clean backup', 'Restore into an isolated environment first', 'Scan and verify restored data and systems', 'Reconnect services in priority order', 'Monitor closely for reinfection'], why: 'Never restore into a still-compromised network; verify before reconnecting.' }],
  configs: [
    ['Backup copies', 'One online copy', '3-2-1 with an offline/immutable copy', 'Attackers target reachable backups.'],
    ['Restore testing', 'Never', 'Scheduled restore tests with results recorded', 'Only tested backups count.'],
  ],
  quiz: [
    ['Your RPO is 4 hours. How often must you back up at minimum?', ['Daily', 'Every 4 hours', 'Weekly', 'Every 24 hours'], 1, 'RPO is the maximum data loss window.'],
    ['Signs of exfiltration before ransomware usually include…', ['Large outbound transfers to unknown hosts', 'Printer jams', 'Slow Wi-Fi only', 'Password expiry notices'], 0, 'Double-extortion gangs steal data before encrypting.'],
  ],
  triage: [
    ['Backup server deletion attempts from a domain admin at 02:00', 1, 'Pre-ransomware behavior.'],
    ['One restore test took 10% longer than last time', 3, 'Track trend.'],
    ['Scheduled backup completed successfully', 4, 'Normal.'],
  ],
  spot: [{
    title: 'Backup policy: Neon Bay Logistics',
    fields: [['Copies', '1 (same file server)'], ['Offline copy', 'None'], ['Last restore test', 'Never'], ['Encryption', 'AES-256 at rest'], ['Access', 'Everyone: Full control']],
    flags: [['Single online copy', 'No resilience.'], ['No offline/immutable copy', 'Ransomware can reach it.'], ['Never tested', 'Unknown if restorable.'], ['Everyone has full control', 'Anyone (or malware) can delete backups.']],
    decoys: [['Encrypted at rest', 'Good practice.']],
  }],
  words: ['BACKUP', 'RESTORE', 'SNAPSHOT', 'VAULT', 'ARCHIVE', 'IMMUTABLE'],
};

export const iot: BankSource = {
  id: 'iot',
  card: {
    title: 'Wireless and IoT security',
    definition: 'Securing Wi-Fi, Bluetooth and connected devices with strong encryption, unique credentials, updates and segmentation.',
    whyItMatters: 'Cheap devices often ship with default passwords and old firmware — easy botnet recruits.',
    example: '"FreeBeachWiFi" on Neon Beach is an evil-twin access point harvesting logins.',
    bestPractice: 'WPA3, change default credentials, update firmware, and put IoT on its own network segment.',
  },
  classify: [
    ['Smart camera still using admin/admin', true, 'Default credentials are the first thing botnets try.'],
    ['Guest Wi-Fi separated from the corporate network', false, 'Segmentation.'],
    ['Open "Free_Airport_WiFi" with a login page asking for your email password', true, 'Evil twin / credential harvesting.'],
    ['Thermostat receiving signed firmware updates automatically', false, 'Secure update channel.'],
    ['Office Wi-Fi using WEP', true, 'WEP is broken; use WPA2/WPA3.'],
    ['Unknown USB drive found in the parking lot plugged into a PC', true, 'Classic malware delivery trick.'],
  ],
  pairs: [
    ['WPA3', 'Current Wi-Fi security standard with stronger protection against password guessing'],
    ['Evil twin', 'A fake access point imitating a legitimate network'],
    ['Firmware', 'Low-level software running on a device'],
    ['Botnet', 'Many compromised devices controlled together'],
    ['Network segmentation', 'Separating devices into zones to limit spread'],
    ['Secure boot', 'Only cryptographically signed code can start on the device'],
  ],
  order: [{ title: 'Set up a new smart device safely', steps: ['Buy from a vendor that publishes security updates', 'Change the default password', 'Update the firmware', 'Connect it to an isolated IoT network', 'Disable features you don\'t need (UPnP, remote access)', 'Review it periodically for updates'], why: 'Credentials and firmware first, then isolate and minimize.' }],
  configs: [
    ['Wi-Fi encryption', 'WEP / open', 'WPA3 (or WPA2-AES)', 'Modern encryption protects traffic and keys.'],
    ['IoT network placement', 'Same network as laptops', 'Separate VLAN/SSID for IoT', 'A hacked camera can\'t reach your laptop.'],
  ],
  quiz: [
    ['Two networks named "NeonBay_Guest" appear, one much stronger. Risk?', ['None', 'One may be an evil twin', 'Your phone is broken', 'Better coverage'], 1, 'Attackers clone names; verify with staff and use a VPN.'],
    ['Biggest reason IoT devices join botnets?', ['They\'re too fast', 'Default passwords and unpatched firmware', 'Bluetooth', 'Bright LEDs'], 1, 'Botnets scan for defaults and known bugs.'],
  ],
  triage: [
    ['500 cameras on the city network beaconing to the same external IP', 1, 'Likely botnet compromise.'],
    ['Rogue access point detected near the lobby', 2, 'Locate and remove; warn staff.'],
    ['Firmware update available for a printer', 3, 'Schedule patching.'],
  ],
  spot: [{
    title: 'Device audit: Smart Pier lighting controller',
    fields: [['Login', 'admin / admin'], ['Firmware', '2019 build, no updates'], ['Network', 'Same VLAN as POS terminals'], ['Remote access', 'Telnet open'], ['Wi-Fi', 'WPA3']],
    flags: [['Default credentials', 'Easily guessed.'], ['Outdated firmware', 'Known bugs.'], ['Shared VLAN with payments', 'No segmentation.'], ['Telnet enabled', 'Plain-text remote access.']],
    decoys: [['Uses WPA3', 'Good choice.']],
  }],
  words: ['WIFI', 'SIGNAL', 'FIRMWARE', 'SENSOR', 'PAIRING', 'ANTENNA'],
};
