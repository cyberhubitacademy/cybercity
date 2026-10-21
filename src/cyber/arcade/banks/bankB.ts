import type { BankSource } from '../types';

// Banks: incident, crypto, forensics, malware, soc.

export const incident: BankSource = {
  id: 'incident',
  card: {
    title: 'Incident response lifecycle',
    definition: 'Preparation → detection & analysis → containment → eradication → recovery → lessons learned.',
    whyItMatters: 'A practiced, ordered response limits damage and preserves evidence.',
    example: 'Isolating an infected host from the network while keeping it powered on preserves memory evidence.',
    bestPractice: 'Follow a written playbook, communicate through the agreed channels, and record every action.',
  },
  classify: [
    ['Paying the ransom immediately before assessing backups', true, 'Payment doesn\'t guarantee recovery and funds criminals; assess and follow the plan first.'],
    ['Isolating an infected host with EDR network containment', false, 'Stops spread while preserving the machine for analysis.'],
    ['Wiping a compromised server before collecting any evidence', true, 'Destroys the information needed to find root cause and scope.'],
    ['Notifying leadership and legal per the incident plan', false, 'Required communication and possibly regulatory duties.'],
    ['Posting details of the breach on social media during the response', true, 'Uncoordinated disclosure can tip off attackers and create legal problems.'],
    ['Restoring from backups verified as clean and offline', false, 'Safe recovery source.'],
  ],
  pairs: [
    ['Containment', 'Stopping the incident from spreading while keeping evidence'],
    ['Eradication', 'Removing the attacker\'s access, malware and persistence'],
    ['Recovery', 'Returning systems to normal operation safely'],
    ['Lessons learned', 'A post-incident review to improve defenses'],
    ['Playbook', 'Pre-written steps for responding to a specific incident type'],
    ['Severity', 'How much impact an incident has, driving response urgency'],
  ],
  order: [{ title: 'Ransomware response', steps: ['Detect and confirm the incident', 'Isolate affected hosts from the network', 'Preserve evidence (memory, logs, disk images)', 'Remove persistence and reset compromised credentials', 'Restore from clean, verified backups', 'Hold a lessons-learned review'], why: 'Confirm, contain, preserve, eradicate, recover, improve.' }],
  configs: [
    ['Incident contact list', 'Kept only in the email system', 'Stored offline and printed', 'If email is down or compromised you still need to reach responders.'],
    ['Backup strategy', 'One copy on the same file server', '3-2-1: 3 copies, 2 media, 1 offline/immutable', 'Ransomware targets online backups first.'],
  ],
  quiz: [
    ['Malware is spreading between servers. What comes first?', ['Write the final report', 'Contain: isolate affected systems', 'Reimage everything immediately', 'Wait for more data'], 1, 'Containment limits damage before eradication and recovery.'],
    ['Why keep a compromised machine powered on (but isolated)?', ['To keep users working', 'Memory holds volatile evidence like running processes and keys', 'Shutting down is illegal', 'It speeds up recovery'], 1, 'Pulling the plug loses volatile evidence.'],
  ],
  triage: [
    ['Ransom note found on three file servers', 1, 'Active destructive incident.'],
    ['Scheduled backup job raised a high-CPU alert', 4, 'Expected load from a known job.'],
    ['EDR quarantined a known adware installer on one laptop', 3, 'Contained automatically; follow up normally.'],
  ],
  spot: [{
    title: 'Response plan draft: Palmetto Bank',
    fields: [['Step 1', 'Pay ransom to restore fast'], ['Step 2', 'Power off all servers at the breaker'], ['Step 3', 'Isolate infected hosts via EDR'], ['Step 4', 'Restore from verified offline backups'], ['Comms', 'Post updates on public social media'], ['Review', 'Lessons-learned meeting in 2 weeks']],
    flags: [['Paying the ransom first', 'Not a plan; assess options and legal guidance.'], ['Powering everything off', 'Destroys volatile evidence and may corrupt data.'], ['Public social media updates', 'Use coordinated, approved communications.']],
    decoys: [['EDR isolation', 'Correct containment.'], ['Restore from verified offline backups', 'Correct recovery.'], ['Lessons-learned review', 'Correct final step.']],
  }],
  words: ['CONTAIN', 'RECOVER', 'ISOLATE', 'RESTORE', 'TRIAGE', 'RESPOND'],
};

export const crypto: BankSource = {
  id: 'crypto',
  card: {
    title: 'Encoding vs encryption vs hashing',
    definition: 'Encoding changes format (reversible, no key); encryption needs a key to reverse; hashing is one-way.',
    whyItMatters: 'Treating Base64 as "encryption" exposes data; using encryption where hashing belongs exposes passwords.',
    example: 'Base64 "TkJ7SEVMTE99" decodes to NB{HELLO} with no key at all.',
    bestPractice: 'Use vetted algorithms (AES-GCM, RSA/ECC, SHA-256, Argon2) through well-known libraries; never invent your own.',
  },
  classify: [
    ['Storing credit card numbers Base64-encoded and calling it encrypted', true, 'Base64 is encoding — anyone can reverse it.'],
    ['TLS 1.3 protecting a login page', false, 'Modern transport encryption.'],
    ['A homemade cipher designed by the dev team for customer data', true, 'Custom crypto is almost always broken; use standards.'],
    ['Verifying a download with its published SHA-256 hash', false, 'Integrity check against a trusted value.'],
    ['Hard-coding the AES key in the mobile app', true, 'Anyone who unpacks the app gets the key.'],
    ['Signing software updates with a private key kept in an HSM', false, 'Protected signing key, verifiable signatures.'],
  ],
  pairs: [
    ['Symmetric encryption (AES)', 'The same secret key encrypts and decrypts'],
    ['Asymmetric encryption (RSA/ECC)', 'A public key encrypts or verifies; a private key decrypts or signs'],
    ['Hash (SHA-256)', 'A fixed-size one-way fingerprint of data'],
    ['Digital signature', 'Proof made with a private key that anyone can verify with the public key'],
    ['Base64', 'An encoding that represents bytes as text; not secret'],
    ['Certificate', 'A signed statement binding a public key to an identity'],
  ],
  order: [{ title: 'TLS handshake (simplified)', steps: ['Client says hello with supported options', 'Server sends its certificate', 'Client verifies the certificate chain', 'Both sides agree on a shared secret (key exchange)', 'Session keys are derived', 'Encrypted application data flows'], why: 'Identity is verified before keys are agreed and data is encrypted.' }],
  configs: [
    ['TLS versions', 'TLS 1.0 and 1.1 enabled', 'TLS 1.2+ only (prefer 1.3)', 'Old versions have known weaknesses.'],
    ['Key storage', 'Keys committed to the git repository', 'Keys in a secrets manager / HSM with rotation', 'Repositories leak; managed key storage limits exposure.'],
  ],
  quiz: [
    ['Which provides integrity but not confidentiality?', ['AES encryption', 'A SHA-256 hash', 'Base64', 'TLS'], 1, 'A hash detects changes but hides nothing by itself.'],
    ['To verify a message signed by The Flamingo, you need…', ['The Flamingo\'s private key', 'The Flamingo\'s public key', 'A Base64 decoder', 'Your own private key'], 1, 'Signatures are verified with the signer\'s public key.'],
  ],
  triage: [
    ['Private signing key found in a public repository', 1, 'Anyone can now sign malicious updates; revoke and rotate immediately.'],
    ['Certificate expiring in 25 days', 3, 'Schedule renewal.'],
    ['Server negotiating TLS 1.3 with a modern cipher', 4, 'Healthy configuration.'],
  ],
  spot: [{
    title: 'Crypto audit: Byte Bazaar app',
    fields: [['Passwords', 'AES-encrypted, key in app.config'], ['Transport', 'TLS 1.0 allowed'], ['Tokens', 'Base64 of "user:role"'], ['Updates', 'Signed with RSA-3072'], ['Random', 'Math.random() for reset tokens']],
    flags: [['Reversible password storage with key in config', 'Passwords should be hashed (Argon2/bcrypt).'], ['TLS 1.0 allowed', 'Deprecated protocol.'], ['Tokens are just Base64', 'Anyone can forge "user:admin".'], ['Math.random() for secrets', 'Not cryptographically secure; use crypto.getRandomValues.']],
    decoys: [['Updates signed with RSA-3072', 'A sound choice.']],
  }],
  words: ['CIPHER', 'KEY', 'SIGNAL', 'SECRET', 'HASH', 'NONCE'],
};

export const forensics: BankSource = {
  id: 'forensics',
  card: {
    title: 'Digital forensics',
    definition: 'Collecting and analyzing digital evidence in a way that preserves its integrity and admissibility.',
    whyItMatters: 'Mishandled evidence can be useless in court and misleading in analysis.',
    example: 'Imaging a drive through a write-blocker and recording its SHA-256 hash before analysis.',
    bestPractice: 'Work on verified copies, document chain of custody, and normalize timestamps to UTC.',
  },
  classify: [
    ['Opening files directly on the suspect\'s original drive', true, 'Changes access times and can alter evidence; work on a verified image.'],
    ['Recording who handled the evidence bag and when', false, 'Chain of custody.'],
    ['Hashing the disk image before and after analysis', false, 'Proves the evidence wasn\'t altered.'],
    ['Building a timeline mixing UTC and local times without converting', true, 'Produces a wrong order of events.'],
    ['Capturing RAM before shutting down a live system', false, 'Volatile evidence first (order of volatility).'],
    ['Running antivirus "cleanup" on the evidence image', true, 'Modifies the evidence; analyze, don\'t clean.'],
  ],
  pairs: [
    ['Chain of custody', 'Documented record of who handled evidence, when and why'],
    ['Write-blocker', 'Hardware/software that prevents writes to an evidence drive'],
    ['Order of volatility', 'Collect the most short-lived evidence (RAM) first'],
    ['File carving', 'Recovering files from raw data using known headers/footers'],
    ['MAC times', 'Modified, accessed and created/changed timestamps of a file'],
    ['Disk image', 'A bit-for-bit copy of a storage device'],
  ],
  order: [{ title: 'Collect evidence from a live machine', steps: ['Photograph and document the scene', 'Capture volatile memory (RAM)', 'Record network connections and running processes', 'Image the disk with a write-blocker', 'Hash the image and record the value', 'Seal and log the evidence in chain of custody'], why: 'Document, then volatile first, then disk; hash and log so integrity can be proven.' }],
  configs: [
    ['Analysis target', 'Original evidence drive', 'Hash-verified forensic copy', 'Never risk altering the original.'],
    ['Timestamp handling', 'Mixed local time zones', 'Normalize all times to UTC', 'Consistent ordering across systems.'],
  ],
  quiz: [
    ['A file\'s header says JPEG but it\'s named report.pdf. What does this suggest?', ['Nothing', 'Extension was changed — check the file signature', 'The PDF is corrupt', 'It\'s a virus for sure'], 1, 'File signatures (magic bytes) reveal the true type regardless of extension.'],
    ['Why record a hash of the disk image?', ['To compress it', 'To prove later that it hasn\'t changed', 'To encrypt it', 'To find malware'], 1, 'Matching hashes show integrity over time.'],
  ],
  triage: [
    ['Evidence drive left unlogged in an unlocked room', 2, 'Chain of custody at risk — secure and document now.'],
    ['Analyst requests a second copy of an image for parallel work', 4, 'Normal practice with verified copies.'],
    ['Image hash no longer matches the recorded value', 1, 'Integrity compromised — investigate before relying on it.'],
  ],
  spot: [{
    title: 'Evidence log: WS-114',
    fields: [['Acquired', 'Drive imaged directly, no write-blocker'], ['Hash', 'Not recorded'], ['RAM', 'Not captured — machine shut down first'], ['Custody', 'Bag sealed and signed by Dr. Okafor'], ['Timeline', 'Logs merged: VPN (UTC) + workstation (UTC−5) unconverted']],
    flags: [['No write-blocker', 'Original could be modified.'], ['No hash recorded', 'Can\'t prove integrity.'], ['Shut down before RAM capture', 'Volatile evidence lost.'], ['Unconverted time zones', 'Timeline order will be wrong.']],
    decoys: [['Bag sealed and signed', 'Correct custody step.']],
  }],
  words: ['ARTIFACT', 'CUSTODY', 'IMAGE', 'TIMELINE', 'CARVE', 'METADATA'],
};

export const malware: BankSource = {
  id: 'malware',
  card: {
    title: 'Malware triage',
    definition: 'Quickly deciding whether a file or process is malicious using hashes, behavior and context — safely.',
    whyItMatters: 'Fast, safe triage lets you contain infections before they spread.',
    example: 'outlook.exe → invoice_view.exe → powershell.exe -enc … → svch0st.exe connecting to 203.0.113.66:4444.',
    bestPractice: 'Analyze only in isolated sandboxes, compare hashes to threat intel, and contain via EDR.',
  },
  classify: [
    ['powershell.exe started by an Office document with an encoded command', true, 'Office spawning encoded PowerShell is a common malware chain.'],
    ['explorer.exe launching the user\'s browser', false, 'Normal parent-child relationship.'],
    ['svch0st.exe running from a user Downloads folder', true, 'Lookalike name in an unusual path.'],
    ['Signed antivirus updater writing to its own program folder', false, 'Expected vendor behavior.'],
    ['New Run key launching a random-named EXE from AppData at every login', true, 'Persistence mechanism.'],
    ['File hash matches a known-bad IOC on the threat feed', true, 'Confirmed match with intelligence.'],
  ],
  pairs: [
    ['Sandbox', 'An isolated environment for safely observing suspicious files'],
    ['Persistence', 'How malware survives reboots (Run keys, scheduled tasks, services)'],
    ['Static analysis', 'Examining a file without running it'],
    ['Dynamic analysis', 'Observing behavior while the sample runs in isolation'],
    ['Command and control (C2)', 'The channel malware uses to receive instructions'],
    ['YARA rule', 'A pattern description used to identify malware families'],
  ],
  order: [{ title: 'Triage a suspicious executable', steps: ['Isolate the endpoint via EDR', 'Collect the file and compute its hash', 'Check the hash against threat intelligence', 'Detonate a copy only in an isolated sandbox', 'Identify persistence and network indicators', 'Remove persistence and reimage if needed'], why: 'Contain first, identify by hash, analyze safely, then eradicate.' }],
  configs: [
    ['Where to run unknown samples', 'On your own work laptop', 'In an isolated, disposable sandbox VM', 'Never risk a production or personal machine.'],
    ['Macro policy', 'Macros enabled for all documents', 'Block macros from internet-origin files', 'Stops a major malware delivery path.'],
  ],
  quiz: [
    ['A renamed file has the same SHA-256 as known malware. Conclusion?', ['It\'s safe because the name differs', 'It\'s the same file — treat as malicious', 'Hashes don\'t matter', 'Rename it back'], 1, 'Names are easy to change; identical hashes mean identical content.'],
    ['Best containment for a live infected workstation?', ['Pull the power cable', 'EDR network isolation, keep it powered on', 'Delete the file and move on', 'Email the user'], 1, 'Isolation stops spread and keeps memory evidence.'],
  ],
  triage: [
    ['EDR: encoded PowerShell from Word, network connection to unknown IP', 1, 'Active malicious chain.'],
    ['Browser toolbar flagged as potentially unwanted', 3, 'Low risk, clean up normally.'],
    ['Signed driver update installed by IT tool', 4, 'Authorized change.'],
  ],
  spot: [{
    title: 'Process tree: HC-WS-22',
    fields: [['explorer.exe', '→ outlook.exe'], ['outlook.exe', '→ invoice_view.exe (Downloads)'], ['invoice_view.exe', '→ powershell.exe -nop -w hidden -enc … (truncated, inert sample)'], ['powershell.exe', '→ svch0st.exe → 203.0.113.66:4444'], ['Autorun', 'HKCU Run: "updater" → AppData\\svch0st.exe']],
    flags: [['Executable launched from an email download', 'Common delivery path.'], ['Hidden encoded PowerShell', 'Obfuscation to evade review.'], ['Lookalike svch0st.exe', 'Masquerading.'], ['Outbound to port 4444', 'Likely C2.'], ['Run key persistence', 'Survives reboot.']],
    decoys: [['explorer.exe → outlook.exe', 'Normal user activity.']],
  }],
  words: ['PAYLOAD', 'SANDBOX', 'TROJAN', 'IOC', 'YARA', 'QUARANTINE'],
};

export const soc: BankSource = {
  id: 'soc',
  card: {
    title: 'SOC operations and detection engineering',
    definition: 'Monitoring telemetry, triaging alerts, and writing/tuning detection rules that find real attacks.',
    whyItMatters: 'Too many false positives cause alert fatigue; too few rules leave blind spots.',
    example: 'A rule alerting when one account fails login on 20+ hosts in 5 minutes catches password spraying.',
    bestPractice: 'Map detections to attacker techniques, measure true/false positive rates, and tune continuously.',
  },
  classify: [
    ['Alert: 1 failed login for one user', false, 'Too common to be useful alone — likely noise.'],
    ['Alert: same password tried against 300 accounts in 10 minutes', true, 'Password spraying.'],
    ['Alert: admin group membership changed outside change window', true, 'Possible privilege escalation.'],
    ['Alert: antivirus definitions updated', false, 'Routine.'],
    ['Alert: security log cleared on a domain controller', true, 'Anti-forensics; very high signal.'],
    ['Alert: user accessed the HR portal during work hours', false, 'Normal business activity.'],
  ],
  pairs: [
    ['SIEM', 'A platform that collects, correlates and alerts on security logs'],
    ['False positive', 'An alert that fires on benign activity'],
    ['True positive', 'An alert that correctly flags malicious activity'],
    ['Detection coverage', 'Which attacker techniques your rules can actually see'],
    ['Correlation rule', 'Logic combining several events into one meaningful alert'],
    ['Alert fatigue', 'Analysts missing real threats because of too many noisy alerts'],
  ],
  order: [{ title: 'Ship a detection rule', steps: ['Pick an attacker technique to detect', 'Confirm the needed log source is collected', 'Write the rule logic', 'Test it against benign and simulated attack data', 'Tune thresholds to reduce false positives', 'Deploy and monitor its alert quality'], why: 'Technique → data → logic → test → tune → monitor.' }],
  configs: [
    ['Failed-login alert threshold', 'Alert on every single failure', 'Alert on bursts across many accounts or hosts', 'Single failures are noise; bursts indicate attacks.'],
    ['Log sources', 'Only firewall logs', 'Endpoint, identity, DNS, proxy and cloud logs centralized', 'Correlation needs multiple viewpoints.'],
  ],
  quiz: [
    ['A rule fires 500 times a day, all benign. Best action?', ['Delete the rule', 'Tune it with better conditions or allow-lists and keep testing', 'Ignore the alerts', 'Make it email the CEO'], 1, 'Tuning keeps coverage while cutting noise.'],
    ['What turns an alert into an incident?', ['Any alert at all', 'Confirmed malicious activity with impact after triage', 'Alerts after midnight', 'A manager\'s approval'], 1, 'Triage confirms real impact before escalation.'],
  ],
  triage: [
    ['Security log cleared on DC-01', 1, 'Likely active intrusion hiding tracks.'],
    ['Password spray detected, no successes yet', 2, 'Block source and watch for success.'],
    ['VPN login from known travel location already approved', 4, 'Expected.'],
  ],
  spot: [{
    title: 'SOC dashboard snapshot',
    fields: [['Alert A', '1,200 "single failed login" alerts today'], ['Alert B', 'Mailbox forwarding rule to external domain'], ['Alert C', 'Event log cleared on HC-DC-01'], ['Alert D', 'Antivirus definition update'], ['Coverage', 'No DNS logs collected']],
    flags: [['Noisy rule causing alert fatigue', 'Needs tuning.'], ['External forwarding rule', 'Possible exfiltration.'], ['Log clearing on a DC', 'Anti-forensics.'], ['Missing DNS logs', 'Detection gap.']],
    decoys: [['AV definition update', 'Routine.']],
  }],
  words: ['SIEM', 'ALERT', 'SIGNAL', 'NOISE', 'TUNE', 'DETECT'],
};
