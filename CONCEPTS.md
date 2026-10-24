# Cyber City — What Players Learn

Generated from the game's content. Not shown in the game.

## Concepts by domain (from the hand-built mini-games)

### Phishing & Email

*Mini-game: Catch of the Day*

- **Lookalike Domains** — Domains registered to resemble a trusted brand by swapping, adding or removing characters (palmett0-bank vs palmettobank) or burying the real name inside a longer host. *Do this:* Read the domain right-to-left from the last dot; use bookmarks or type the address yourself instead of clicking email links.
- **Link Text vs. Destination** — The visible text of a link can say anything; the href is where the browser actually goes. *Do this:* Hover or long-press to preview the real URL before clicking, and be wary of raw IP addresses and odd subdomains.
- **SPF, DKIM and DMARC** — SPF lists which servers may send mail for a domain; DKIM cryptographically signs messages; DMARC tells receivers what to do when they fail. *Do this:* Treat auth results as one clue among many; organizations should publish SPF, DKIM and an enforcing DMARC policy.
- **Business Email Compromise (BEC)** — Fraud where attackers impersonate an executive, colleague or vendor to get payments, gift cards or sensitive data. *Do this:* Verify any money or secrecy request through a separate, known channel — call the number you already have on file.
- **Report, Don't Reply** — Sending suspicious messages to the security team (often via a "Report Phish" button) instead of interacting with them. *Do this:* Never reply, click or forward to "check". Report it, then delete it. If you already clicked, report immediately — speed matters more than embarrassment.

### Networking & Traffic

*Mini-game: Something on the Wire*

- **IP addresses, ports & protocols** — An IP address identifies a device on a network; a port identifies a service on that device. TCP gives reliable, connection-based delivery; UDP sends independent datagrams without a handshake. *Do this:* Learn the common well-known ports (22, 53, 80, 123, 443, 587) so unusual ones stand out immediately.
- **Traffic baselines** — A baseline is the documented "normal" pattern of who talks to whom, when, on which ports and how much. *Do this:* Collect flow logs continuously and alert on deviations in destination, volume and timing — not just on known-bad signatures.
- **Beaconing & command-and-control** — Beaconing is periodic outbound check-in traffic from malware to an attacker-controlled server (C2). *Do this:* Isolate the host (keep it powered for forensics) and block the C2 address at egress; then hunt for the same indicator elsewhere.
- **DNS tunneling** — Hiding data inside DNS queries or responses, often as long encoded subdomain labels, to sneak it past controls. *Do this:* Force all clients to use internal resolvers, block outbound port 53 elsewhere, and alert on unusually long or high-entropy query names.

### Network Defense

*Mini-game: Walls of the Harbor*

- **First-match rule evaluation** — Most firewalls check rules from top to bottom and apply the first rule that matches a packet; later rules are never consulted for that packet. *Do this:* Put specific rules before general ones, and audit for shadowed rules that can never fire.
- **Default deny** — A policy where any traffic not explicitly allowed is blocked. *Do this:* End every ruleset with an explicit or implicit deny-all and log what it drops.
- **Least privilege for network access** — Each system gets only the network access it strictly needs — specific source, destination, port and protocol. *Do this:* Avoid "any" in ALLOW rules; restrict admin protocols such as SSH to a VPN or bastion host.
- **Network segmentation** — Splitting a network into zones (e.g., DMZ, application, database, admin) with controlled paths between them. *Do this:* Design tiered zones, enforce them with firewalls, and test that blocked paths really are blocked.

### Identity & Passwords

*Mini-game: Locked Out*

- **Password Strength = Unpredictability** — Strength is how many guesses an attacker needs, measured in bits of entropy. Each bit doubles the guesses. *Do this:* Use long random passphrases or manager-generated passwords; never base them on names, dates or the site name.
- **Credential Stuffing** — Automated logins using username/password pairs leaked from other breaches, spread across many accounts. *Do this:* Unique passwords per site (password manager), MFA, rate limiting per IP and account, and checking new passwords against breach lists.
- **Multi-Factor Authentication** — Requiring two or more kinds of proof: something you know (password), have (phone, security key) or are (biometric). *Do this:* Prefer phishing-resistant factors (security keys, passkeys) or authenticator apps over SMS; never share codes.
- **Hashing & Salting Passwords** — Servers store a one-way hash of each password plus a unique random salt, then hash login attempts and compare. *Do this:* Use slow, salted password hashes (Argon2id, bcrypt, scrypt) — never plain fast hashes like MD5, reversible encryption or encoding.

### Cryptography

*Mini-game: The Flamingo's Cipher*

- **Encoding vs. Encryption** — Encoding (Base64, hex, URL-encoding) changes how data is represented and is reversible by anyone. Encryption transforms data with a secret key so only key holders can read it. *Do this:* Treat encoded secrets as plaintext. Encrypt sensitive data with a vetted algorithm and keep keys in a secrets manager.
- **Hashing & Integrity** — A cryptographic hash (e.g. SHA-256) maps any input to a fixed-length digest. It is one-way, and changing a single bit changes the digest completely (avalanche effect). *Do this:* Use SHA-256 or stronger for integrity. For passwords use slow, salted algorithms like Argon2id, bcrypt or scrypt — never a plain fast hash.
- **Symmetric vs. Asymmetric Encryption** — Symmetric encryption (AES) uses one shared key for both directions. Asymmetric encryption (RSA, ECC) uses a public key to encrypt and a matching private key to decrypt. *Do this:* Use well-reviewed libraries and modern modes (AES-GCM). Never invent your own cipher.
- **Digital Signatures** — A signature is created with the signer's private key and verified by anyone with the signer's public key. It proves who sent the data and that it was not changed. *Do this:* Protect private keys (hardware security modules, smart cards), verify signatures before trusting content, and obtain public keys from a trusted source.
- **Why Classical Ciphers Fail** — Substitution ciphers like Caesar keep the letter-frequency pattern of the language and have tiny key spaces. *Do this:* Rely on modern, standardized cryptography (Kerckhoffs's principle: security must rest only on the key).

### Digital Forensics

*Mini-game: Digital Footprints*

- **Evidence Preservation** — Collect digital evidence without changing it: use write-blockers, create bit-for-bit images, capture volatile data (memory) before powering down, and analyse copies — never the original. *Do this:* Image first, hash the original and the image, work only on verified copies.
- **Chain of Custody** — A documented record of who collected, handled, transferred and stored each piece of evidence, and when. *Do this:* Log every transfer, store evidence in sealed, access-controlled locations, and re-verify hashes.
- **Timeline Analysis & Time Zones** — Ordering events from many sources into one chronology. Sources record time differently (UTC vs local, clock drift), so timestamps must be normalised first. *Do this:* Synchronise clocks with NTP, log in UTC, and record the offset for every source you analyse.
- **Log Correlation & Red Herrings** — Linking events across email, endpoint, VPN, file server and network logs by user, host, IP and time to reveal the attack chain — while discarding routine activity. *Do this:* Centralise logs in a SIEM, baseline normal activity, and support every conclusion with evidence.

### Incident Response

*Mini-game: The Final Incident*

- **Incident response lifecycle** — The NIST lifecycle: Preparation → Detection & Analysis → Containment, Eradication & Recovery → Post-Incident Activity. *Do this:* Write the plan before the incident, assign roles, and run tabletop exercises regularly.
- **Alert triage & false positives** — Triage ranks alerts by severity and real impact, and weeds out false positives — alerts that look bad but reflect normal activity. *Do this:* Prioritize ongoing destruction, then attacker control channels, then entry points — and tune detections that repeatedly misfire.
- **Preserving evidence** — Collecting volatile data (memory, connections) and logs before systems are changed, with a documented chain of custody. *Do this:* Never pull the plug or wipe first; capture, hash and document evidence, then contain.
- **Ransomware recovery & backups** — Restoring encrypted data from backups that the attacker could not reach — offline, immutable or segregated copies. *Do this:* Follow 3-2-1 (three copies, two media, one offsite/offline) and test restores regularly.

*Mini-game: SOC Night Shift*

- **Alert triage & escalation** — Triage decides, for each alert, whether it is a real threat, how urgent it is (priority), and who must act — following an escalation matrix. *Do this:* Judge impact (asset and account criticality) and confidence, not just the rule's severity label.
- **False positives vs. benign true positives** — A false positive means the rule was wrong. A benign true positive means the rule was right, but the activity is authorized or expected. *Do this:* Record the reason when closing, and send tuning requests to detection engineering.
- **Enrichment** — Adding context to an alert: IP reputation, the user's normal behavior, asset criticality, change tickets and related alerts. *Do this:* Automate common enrichment so analysts see context in the alert itself.
- **Correlation** — Linking separate alerts that belong to the same attack into one incident case. *Do this:* Pivot on shared entities (host, user, IP, time) and manage the incident as one case with one owner.
- **Shift handoff & documentation** — Clear, factual notes passed to the next shift: open incidents, actions taken, pending questions and requested tuning. *Do this:* Write handoffs in the ticketing system with timestamps, owners and next actions — not in someone's memory.

### Social Engineering

*Mini-game: Voice on the Line*

- **Pretexting** — Inventing a believable scenario (IT upgrade, vendor audit, stranded executive) to persuade someone to hand over access, data or money. *Do this:* Judge the request, not the story: does this action ever require that information? If not, refuse and report.
- **Authority & Urgency Levers** — Psychological pressure techniques: claiming rank, threatening consequences, imposing deadlines or demanding secrecy. *Do this:* Treat pressure itself as a red flag. Policies should explicitly empower staff to slow down and verify any executive request.
- **Out-of-Band Verification** — Confirming a request through a separate, independently known channel — e.g. calling back a number from the directory or vendor file. *Do this:* Never use contact details supplied in the suspicious request. Use dual approval for payments and bank-detail changes.
- **Tailgating & Physical Access** — Following an authorized person through a secured door without badging in, often while carrying something to look busy. *Do this:* One badge, one person. Verify visits against a schedule, sign in visitors and escort them in restricted areas.

### Malware & Endpoints

*Mini-game: The Hidden Payload*

- **Process Trees & Parent-Child Anomalies** — Every process has a parent. Unusual relationships — an email client starting an executable, a document viewer launching a hidden shell — are strong signs of compromise. *Do this:* Log process creation with command lines (e.g. Sysmon, EDR) and alert on suspicious parent-child pairs.
- **Indicators of Compromise & File Hashes** — IOCs are artifacts tied to known attacks: file hashes, IPs, domains, registry keys. A file hash identifies the exact content regardless of the file name. *Do this:* Feed threat-intel IOCs into EDR/SIEM, but remember attackers can change hashes easily — combine with behaviour-based detection.
- **Persistence Mechanisms** — Techniques malware uses to survive reboots and logons: Run keys, scheduled tasks, services, startup folders and more. *Do this:* Baseline and regularly review autoruns; alert on new Run keys and scheduled tasks pointing to user-writable paths.
- **Containment, Isolation & Sandboxing** — Containment limits damage — e.g. EDR network isolation keeps a host on (preserving memory) while cutting it off from the network. Sandboxes are isolated environments for safely analysing samples. *Do this:* Have an isolation playbook, capture memory before shutdown, and analyse samples only in dedicated sandboxes.

*Mini-game: Detection Engineering Lab: Catch the Tide*

- **Signal vs. noise (alert fatigue)** — Alert fatigue happens when so many low-value alerts fire that analysts start ignoring them — including the real ones. *Do this:* Measure false-positive rates per rule and tune, enrich or retire rules that do not lead to action.
- **Precision and recall** — Precision = of the alerts fired, how many were real. Recall = of the real attacks, how many fired an alert. F1 balances both. *Do this:* Track both metrics on labeled test data whenever a rule changes.
- **Detection-as-code** — Managing detection rules like software: version control, peer review, automated tests and staged deployment. *Do this:* Keep a library of benign and malicious test events and run every rule change against it before production.
- **MITRE ATT&CK mapping** — MITRE ATT&CK is a public knowledge base of attacker tactics and techniques (e.g. T1059.001 PowerShell, T1078 Valid Accounts). *Do this:* Map each detection to the technique it actually observes, then prioritize gaps used by threats relevant to you.
- **Tuning a noisy rule** — Tuning narrows a rule with extra conditions (context such as arguments, parents, paths or accounts) so it keeps the attacks and drops the benign matches. *Do this:* Prefer behavior-based conditions over brittle allow-lists of usernames, and document why each exclusion exists.

### Web App Security

*Mini-game: Web App Defender: Patch Night at Palmetto*

- **SQL injection & parameterized queries** — Injection happens when input is mixed into a command (like SQL) and changes its meaning. *Do this:* Use parameterized queries / prepared statements or a safe ORM; never build SQL with string concatenation.
- **Cross-site scripting (XSS)** — XSS injects script into a page that runs in other users' browsers. *Do this:* Encode output for its context (textContent, templating auto-escaping), sanitize rich HTML with a vetted library, add a strict CSP.
- **Broken access control (IDOR)** — The server returns or changes data without checking the user is allowed to. *Do this:* Deny by default and enforce ownership/role checks server-side on every request.
- **Security headers** — HTTP response headers that switch on browser protections. *Do this:* Set them centrally (gateway/framework), avoid wildcard CORS on authenticated APIs, hide version banners.
- **Session cookies & safe errors** — Session tokens are keys to an account; error messages can leak internals. *Do this:* Use secure cookie flags, short session lifetimes, server-side revocation, and generic error pages with correlation IDs.

### Cloud Security

*Mini-game: Cloud Breach at Harbor Cloud*

- **Shared responsibility model** — The provider secures the cloud infrastructure; the customer secures their configuration, identities, network rules and data. *Do this:* Know which layer you own for each service (IaaS vs PaaS vs SaaS) and secure it deliberately.
- **Public storage exposure** — Object storage readable by anyone on the internet. *Do this:* Turn on account-wide "block public access"; share with short-lived pre-signed URLs.
- **Least privilege & short-lived credentials** — Identities get only the permissions they need, preferably through temporary credentials. *Do this:* Use roles, SSO and workload identity federation; review and remove unused permissions and keys.
- **Cloud audit logging** — Recording every API call (who, what, when, from where). *Do this:* Organization-wide trails in all regions, immutable storage, and alerts on sensitive actions like CreateUser.
- **Secrets management** — Storing passwords, keys and tokens in a dedicated vault with access control and rotation. *Do this:* Use a secrets manager, rotate automatically, grant read access narrowly, and scan repos for leaked secrets.

### AI & Deepfake Security

*Mini-game: Deepfake CEO & the Poisoned Prompt*

- **Deepfakes & synthetic media** — AI-generated or AI-altered audio, video or images that imitate real people. *Do this:* Watch for artifacts, but rely on process: verify through known channels and require dual approval.
- **Out-of-band verification** — Confirming a request through a separate channel you already trust. *Do this:* Make callbacks and dual approval mandatory for payments and data exports — no exceptions for "urgent".
- **Prompt injection** — Hidden or malicious instructions in content an AI reads, designed to hijack its behavior. *Do this:* Treat retrieved content as data, isolate it from instructions, and never let it trigger sensitive actions without checks.
- **Guardrails for AI agents** — Controls that limit what an AI system can access and do. *Do this:* Least-privilege data and tool scopes, tool allowlists, human-in-the-loop for sensitive steps, output filtering and full logging.
- **Content provenance (content credentials)** — Signed metadata (e.g. the C2PA standard) recording how media was captured or created and edited. *Do this:* Prefer sources with verifiable provenance; treat unverifiable media with caution; don’t act on it alone.

### Industrial Control Systems

*Mini-game: Blackout Protocol*

- **Purdue model & OT segmentation** — A layered reference model separating enterprise IT, an industrial DMZ, supervisory control and field devices. *Do this:* No direct IT→OT paths; broker access through the industrial DMZ; allow only required industrial protocols.
- **Safety first in OT incidents** — In industrial systems, protecting people and the physical process outranks other goals. *Do this:* Plan responses with operations, use manual fallback, test changes, and patch in maintenance windows.
- **Third-party remote access** — Vendors and integrators connecting to industrial systems for support. *Do this:* On-demand, time-boxed access through a monitored jump host with MFA and session recording.
- **One-way data transfer (data diode)** — Hardware that physically allows data to flow in only one direction. *Do this:* Use one-way transfers for monitoring/reporting data leaving critical zones.

### Supply-Chain Security

*Mini-game: Poisoned Package*

- **Typosquatting** — Publishing a malicious package with a name almost identical to a popular one. *Do this:* Use allowlisted registries, review new dependencies, and block install scripts by default.
- **Maintainer takeover** — An attacker gains control of a trusted package (stolen account, abandoned project, social engineering). *Do this:* Pin versions, review diffs of updates, prefer packages with 2FA-enforced maintainers and signed releases.
- **Signatures, hashes & provenance** — Cryptographic proof of who built an artifact, from which source, and that its bytes haven’t changed. *Do this:* Verify hashes and signatures in CI, build in hardened pipelines, publish SLSA-style provenance.
- **SBOM (Software Bill of Materials)** — A machine-readable inventory of every component in a piece of software. *Do this:* Generate an SBOM per build and monitor it against vulnerability and malware feeds.
- **Coordinated disclosure** — Reporting a security problem privately to those who can fix it, then publishing once users are protected. *Do this:* Use official security contacts, share indicators privately, agree a publication timeline.

**72 concept cards** across 14 domains.

## Lessons from the story missions

**Welcome to Neon Bay**
- The CIA triad: confidentiality, integrity, availability
- How to move, talk and use the map

**Catch of the Day**
- Spot lookalike domains and display-name spoofing
- Check where links really go
- Report suspicious messages instead of replying

**Something on the Wire**
- IP addresses, ports and protocols
- Spot beaconing, port scans and data exfiltration
- Why Telnet is unsafe

**Walls of the Harbor**
- First-match rule ordering
- Least privilege and default deny
- Network segmentation (DMZ, app, database tiers)

**Hot Pursuit**
- Attackers use physical proximity (rogue hotspots, drop devices)
- Evidence gathering stays legal and documented

**The Hidden Payload**
- Suspicious parent/child processes
- File hashes and indicators of compromise
- Persistence and EDR containment

**Digital Footprints**
- Evidence preservation and chain of custody
- Time-zone normalization
- Correlating logs into a timeline

**The Flamingo's Cipher**
- Encoding vs encryption vs hashing
- Why classical ciphers are not secure
- Verifying integrity with hashes and signatures

**The Final Incident**
- Incident response lifecycle
- Containment before eradication
- Restore from verified backups, never pay first

**Voice on the Line**
- Pretexting, urgency and authority tricks
- Call back on a number you already trust
- Tailgating and physical security

**Locked Out**
- Password strength and passphrases
- Credential stuffing and password reuse
- Hashing with salt vs encryption, and MFA

**Rogue Waves**
- Evil-twin access points
- Use HTTPS/VPN on public Wi-Fi
- Forget networks you don't trust

**Ghost in the Inbox**
- Threat hunting: assume breach and look for quiet persistence
- Writing and tuning detection rules: precision versus recall
- Mapping attacker behavior to MITRE ATT&CK techniques

**Code Red at Neon Bay General**
- The incident response lifecycle under real pressure
- Why offline, tested backups beat paying a ransom
- Network segmentation keeps life-critical devices isolated

**The Voice of Marisol**
- Deepfake voice fraud: vishing with synthetic audio
- Out-of-band verification and pre-agreed code words
- Prompt injection: AI assistants must treat input as data

**Patch Night**
- SQL injection and parameterized queries
- Cross-site scripting and output encoding
- Broken access control and security headers
- Responsible disclosure and bug bounties

**Cloud Burst**
- The shared responsibility model in the cloud
- Public storage buckets and least-privilege access policies
- Key rotation, secrets management and audit logging

**Poisoned Package**
- Software supply-chain attacks and typosquatted packages
- SBOMs, pinned versions and signed builds
- Prompt injection: text inside data is never a command

**Blackout Protocol**
- Industrial control systems: safety first, then availability
- Segmenting operational technology from IT and the internet
- Insider threats, coercion, and why people should report pressure

**Lotus Bloom**
- Alert triage and correlation across a multi-front attack
- Coordinated vulnerability disclosure
- Ethics: defenders protect people, not just systems

**Night Shift**
- Alert triage and false positives
- Enrichment before escalation
- Writing a clear shift handoff

**Zero Trust Tour**
- Zero trust: never trust, always verify
- Least privilege and default deny
- Micro-segmentation between tiers

## Cyber Arcade: 1291 extra challenges in 31 areas

- **Cyber Detective & Investigation Games** (40 challenges) — Follow the evidence: logs, logins and clues that reveal an intruder.
- **Phishing & Social Engineering** (45 challenges) — Spot lures, spoofs and scams across email, text, voice and QR codes.
- **Password & Authentication Games** (45 challenges) — Passwords, MFA, hashing, sessions and account recovery done right.
- **Network & Traffic Investigation** (45 challenges) — Read the wire: ports, protocols, beacons and anomalies.
- **Firewall & Infrastructure Defense** (40 challenges) — Rules, zones and least privilege at the network edge.
- **Incident Response & Crisis Management** (45 challenges) — Contain, eradicate, recover — in the right order, under pressure.
- **Cryptography & Cipher Puzzles** (45 challenges) — Encoding vs encryption vs hashing, keys, signatures and ciphers.
- **Digital Forensics & Evidence** (45 challenges) — Preserve, image, hash and rebuild the timeline.
- **Malware Analysis & Threat Research** (45 challenges) — Triage inert samples, process trees, persistence and IOCs — safely.
- **Security Operations Center (SOC)** (40 challenges) — SIEM, alert triage and detection engineering on the night shift.
- **Ethical Hacking & Penetration Testing** (40 challenges) — Authorized, scoped testing — find it, report it, fix it.
- **Web Application Security** (40 challenges) — OWASP-style flaws: injection, XSS, access control, headers and cookies.
- **Cloud Security & DevSecOps** (40 challenges) — IAM, buckets, containers, secrets and secure pipelines.
- **Ransomware & Data Protection** (40 challenges) — Backups that survive, data classification and leak prevention.
- **Wireless, IoT & Hardware Security** (40 challenges) — Wi-Fi, Bluetooth, firmware and the device fleet.
- **Security Awareness & Human Behavior** (40 challenges) — Everyday habits of the human firewall.
- **AI Security & Deepfake Detection** (40 challenges) — Prompt injection, deepfakes, poisoning and safe AI agents.
- **Programming, Secure Coding & Code Review** (40 challenges) — Secure coding, code review and dependency hygiene.
- **Digital Privacy & Identity Protection** (40 challenges) — Personal data, consent, metadata and trackers.
- **Threat Intelligence & Attack Analysis** (40 challenges) — TTPs, MITRE ATT&CK, the kill chain and evidence-based attribution.
- **Digital Escape Rooms & Puzzle Challenges** (40 challenges) — Locked terminals and vaults: peel the clues layer by layer.
- **Security Architecture & Risk Management** (40 challenges) — Risk, threat models, trust boundaries and governance.
- **Digital Payments, Fraud & Financial Security** (30 challenges) — Invoice fraud, account takeover, card testing and safe payments.
- **Blockchain & Web3 Security** (30 challenges) — Wallets, seed phrases, approvals and smart-contract bugs.
- **Digital Resilience & Disaster Recovery** (30 challenges) — RTO, RPO, failover and recovery drills.
- **Competition Modes & Multiplayer Cyber Games** (40 challenges) — CTF and arena modes — solo practice versions of competition formats.
- **Short, Catchy, One- or Two-Word Names** (60 challenges) — Quick, punchy rounds drawn from every discipline.
- **More Professional, Enterprise-Style Lab Names** (40 challenges) — Professional lab formats across the enterprise security program.
- **Mission-Based Names** (40 challenges) — Operations and projects with a clear objective.
- **Bonus: Names That Match Your Exact Existing Style** (71 challenges) — Core analyst skills: concept + action.
- **Bonus: 50 additional creative names** (50 challenges) — Cyber mysteries with a story twist.
