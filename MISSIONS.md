# Cyber City — Mission List

Generated from the game's mission data (22 missions). Not shown in the game.

## Season 1 — Neon Bay

### 1. Welcome to Neon Bay
*Mission giver:* Starts automatically · *Difficulty:* ★☆☆ · *Rewards:* 100 XP, $250

Rico joined Sunset Shield Security and learned the CIA triad.

> **narrator:** “Your first day at Sunset Shield Security. Find the pink tower with the big neon sign on Ocean Drive.”

**What you do**
- Walk to Sunset Shield HQ on Ocean Drive (Sunset Shield HQ)
- Talk to Max Cortez in the lobby (Max Cortez)

**What you learn**
- The CIA triad: confidentiality, integrity, availability
- How to move, talk and use the map

### 2. Catch of the Day
*Mission giver:* Max Cortez · *Difficulty:* ★☆☆ · *Rewards:* 300 XP, $500

Rico stopped a phishing attack on Coral Café and found the Pink Tide's lookalike domain.

> **Max Cortez:** “Phishing is a fake message pretending to be someone you trust, so you click, pay or type a password.”

**What you do**
- Drive or walk to Coral Café (Coral Café)
- Talk to Carla Reyes (Carla Reyes)
- Inspect the café inbox on the back-office PC — mini-game: **Phishing Detective** at Coral Café Back-Office PC

**What you learn**
- Spot lookalike domains and display-name spoofing
- Check where links really go
- Report suspicious messages instead of replying

### 3. Something on the Wire
*Mission giver:* Dex Holloway · *Difficulty:* ★☆☆ · *Rewards:* 350 XP, $600

Rico found Pink Tide command-and-control traffic leaving Harbor Cloud.

> **Dex Holloway:** “Every device on a network has an IP address, like a street address. Programs talk through numbered ports, like apartment doors. 443 is HTTPS, 53 is DNS.”

**What you do**
- Go to the Harbor SOC in Silicon Harbor (Harbor SOC)
- Analyze the connection table on the SOC console — mini-game: **Traffic Investigator** at Harbor SOC Console

**What you learn**
- IP addresses, ports and protocols
- Spot beaconing, port scans and data exfiltration
- Why Telnet is unsafe

### 4. Walls of the Harbor
*Mission giver:* Tito Ramos · *Difficulty:* ★★☆ · *Rewards:* 450 XP, $800

Rico rebuilt Harbor Cloud's firewall using least privilege and default deny.

> **Tito Ramos:** “A firewall is a bouncer for network traffic. It reads its rules top to bottom and the FIRST rule that matches decides. Order matters, like salsa steps.”

**What you do**
- Go to the Harbor Cloud data center (Harbor Cloud Data Center)
- Rebuild the firewall rules at the data center console — mini-game: **Firewall Architect** at Data Center Firewall Console

**What you learn**
- First-match rule ordering
- Least privilege and default deny
- Network segmentation (DMZ, app, database tiers)

### 5. Hot Pursuit
*Mission giver:* Max Cortez · *Difficulty:* ★★☆ · *Rewards:* 500 XP, $1000

Rico tracked the Pink Tide van to a warehouse in Silicon Harbor.

> **Max Cortez:** “Tito's white van just turned up near the Tech Market. Pink stripe, no plates. That's the Tide's mobile hotspot — they park it near targets and hack over Wi-Fi.”

**What you do**
- Get into a vehicle
- Tail the Pink Tide van and stay close to plant the tracker — chase, 120s limit
- Report back to Max at HQ (Max Cortez)

**Cinematic & gameplay moments**
- Vehicle chase

**What you learn**
- Attackers use physical proximity (rogue hotspots, drop devices)
- Evidence gathering stays legal and documented

### 6. The Hidden Payload
*Mission giver:* Tito Ramos · *Difficulty:* ★★☆ · *Rewards:* 550 XP, $1100

Rico found and contained the Pink Tide implant on a Harbor Cloud workstation.

> **Tito Ramos:** “Malware is software built to do harm — steal data, spy, or lock files for ransom. This workstation's acting possessed.”

**What you do**
- Go back to the Harbor Cloud data center (Harbor Cloud Data Center)
- Triage the infected workstation — mini-game: **Malware Triage** at Data Center Firewall Console

**What you learn**
- Suspicious parent/child processes
- File hashes and indicators of compromise
- Persistence and EDR containment

### 7. Digital Footprints
*Mission giver:* Dr. Lena Okafor · *Difficulty:* ★★☆ · *Rewards:* 600 XP, $1200

Rico reconstructed the full attack timeline with Dr. Okafor.

> **Dr. Lena Okafor:** “Digital forensics means reconstructing what happened from the traces systems leave behind — logs, file times, hashes. Like footprints in wet sand.”

**What you do**
- Go to the Okafor Forensics Lab at Bayview University (Bayview University)
- Reconstruct the attack timeline in the forensics lab — mini-game: **Forensics Timeline** at Okafor Forensics Lab

**What you learn**
- Evidence preservation and chain of custody
- Time-zone normalization
- Correlating logs into a timeline

### 8. The Flamingo's Cipher
*Mission giver:* Priya Shah · *Difficulty:* ★★☆ · *Rewards:* 650 XP, $1300

Rico decoded the Pink Tide note and uncovered their real target: Palmetto Bank.

> **Priya Shah:** “Ooh, a Pink Tide note! Quick primer: encoding just changes the format — anyone can reverse it. Encryption needs a key. Hashing is a one-way fingerprint.”

**What you do**
- Decode the Flamingo's note on Priya's crypto rig — mini-game: **Cipher Puzzle** at Byte Bazaar Crypto Rig
- Check the meeting place from the note: Starlight Pier (Starlight Pier)
- Report to Max at HQ (Max Cortez)

**What you learn**
- Encoding vs encryption vs hashing
- Why classical ciphers are not secure
- Verifying integrity with hashes and signatures

### 9. The Final Incident
*Mission giver:* Marisol Vance · *Difficulty:* ★★★ · *Rewards:* 1000 XP, $3000

Rico led the response to the Pink Tide ransomware attack and saved Palmetto Bank.

> **Marisol Vance:** “Mr. Vega. Ten minutes ago our screens turned pink. Files are being encrypted and there's a ransom note signed with a flamingo.”

**What you do**
- Get to Palmetto Bank Tower downtown (Palmetto Bank Tower)
- Command the incident response at the bank console — mini-game: **Incident Command** at Palmetto Bank Help Desk

**What you learn**
- Incident response lifecycle
- Containment before eradication
- Restore from verified backups, never pay first

## Season 1 — Side missions

### 10. Voice on the Line
*Mission giver:* Marisol Vance · *Difficulty:* ★☆☆ · *Rewards:* 300 XP, $700

Rico defended Palmetto Bank's help desk against social engineering.

> **Marisol Vance:** “Social engineering means manipulating people instead of computers — a confident voice, a fake emergency, a borrowed uniform.”

**What you do**
- Go to the Palmetto Bank help desk (Palmetto Bank Tower)
- Handle the help-desk requests — mini-game: **Social Engineering Defense** at Palmetto Bank Help Desk

**What you learn**
- Pretexting, urgency and authority tricks
- Call back on a number you already trust
- Tailgating and physical security

### 11. Locked Out
*Mission giver:* Carla Reyes · *Difficulty:* ★★☆ · *Rewards:* 350 XP, $650

Rico stopped a credential-stuffing account takeover at Coral Café.

> **Carla Reyes:** “Rico, help! I can't log into the café's supplier account, and someone ordered forty kilos of pineapple to my address!”

**What you do**
- Go to Coral Café (Coral Café)
- Investigate the account takeover on the café PC — mini-game: **Password Lab** at Coral Café Back-Office PC

**What you learn**
- Password strength and passphrases
- Credential stuffing and password reuse
- Hashing with salt vs encryption, and MFA

### 12. Rogue Waves
*Mission giver:* Priya Shah · *Difficulty:* ★☆☆ · *Rewards:* 300 XP, $600, wifi-analyzer

Rico shut down four rogue Wi-Fi hotspots on Neon Beach.

> **Priya Shah:** “An "evil twin" is a fake Wi-Fi hotspot with a friendly name. Connect to it and the attacker sees everything you send that isn't encrypted.”

**What you do**
- Find and scan the 4 rogue "FreeBeachWiFi" hotspots on Neon Beach — 4 targets, 150s limit

**Cinematic & gameplay moments**
- Timed objective

**What you learn**
- Evil-twin access points
- Use HTTPS/VPN on public Wi-Fi
- Forget networks you don't trust

## Season 2 — Black Lotus

### 13. Ghost in the Inbox
*Mission giver:* Starts automatically · *Difficulty:* ★★☆ · *Rewards:* 700 XP, $1200

Rico hunted a silent intruder in Sunset Shield's mail server and found the Black Lotus calling card.

> **Max Cortez:** “Vega. Good tan. Bad timing. NOVA flagged something in our own mail server and won't stop beeping at me.”

**What you do**
- Go to the War Room inside Sunset Shield HQ (Sunset Shield War Room)
- Talk to NOVA in the War Room (NOVA)
- Hunt the intruder: build detection rules at the War Room table — mini-game: **Detection Engineering Lab** at War Room Command Table

**Cinematic & gameplay moments**
- Title card: **Season 2: Black Lotus** — Ghost in the Inbox
- Music: calm → stealth → tension → villain
- Camera shots: skyline, establish, closeup

**What you learn**
- Threat hunting: assume breach and look for quiet persistence
- Writing and tuning detection rules: precision versus recall
- Mapping attacker behavior to MITRE ATT&CK techniques

### 14. Code Red at Neon Bay General
*Mission giver:* Max Cortez · *Difficulty:* ★★★ · *Rewards:* 900 XP, $1500

Rico led the ransomware response at Neon Bay General and restored systems from offline backups.

> **Max Cortez:** “Vega, Neon Bay General just went dark. Ransomware. Their CISO, Dr. Amara Singh, asked for us by name.”

**What you do**
- Get to Neon Bay General Hospital (Neon Bay General)
- Talk to Dr. Amara Singh outside the hospital (Dr. Amara Singh)
- Run the incident response from the hospital IT room — mini-game: **Incident Command** at Neon Bay General IT Room

**Cinematic & gameplay moments**
- Title card: **Code Red** — Neon Bay General
- Music: tension → action → sorrow → hope → villain
- Camera shots: establish, orbit, closeup
- Weather: rain
- Timed objective

**What you learn**
- The incident response lifecycle under real pressure
- Why offline, tested backups beat paying a ransom
- Network segmentation keeps life-critical devices isolated

### 15. The Voice of Marisol
*Mission giver:* Marisol Vance · *Difficulty:* ★★☆ · *Rewards:* 900 XP, $1800

Rico exposed a deepfake CEO fraud at Palmetto Bank and tailed the money mule for police.

> **Marisol Vance:** “Rico, ten minutes ago my clerk Toby got a call from me asking for an urgent four million dollar wire. I was in a board meeting.”

**What you do**
- Investigate the deepfake call at the bank help desk — mini-game: **Deepfake CEO & the Poisoned Prompt** at Palmetto Bank Help Desk
- Get a vehicle
- Tail the money mule's car so police can make the stop — chase, 120s limit

**Cinematic & gameplay moments**
- Title card: **The Voice of Marisol** — Palmetto Bank
- Music: tension → action → chase → triumph
- Camera shots: establish, closeup
- Vehicle chase
- Slow-motion moment

**What you learn**
- Deepfake voice fraud: vishing with synthetic audio
- Out-of-band verification and pre-agreed code words
- Prompt injection: AI assistants must treat input as data

### 16. Patch Night
*Mission giver:* Priya Shah · *Difficulty:* ★★☆ · *Rewards:* 900 XP, $1600

Rico and Priya patched Palmetto Bank's web app minutes before a Black Lotus deadline.

> **Priya Shah:** “Rico, Black Lotus just put a countdown on Palmetto Bank's login page. At midnight they leak every customer record.”

**What you do**
- Get to Palmetto Bank before midnight (Palmetto Bank Tower)
- Patch the bank's web app at the help desk — mini-game: **Web App Defender** at Palmetto Bank Help Desk

**Cinematic & gameplay moments**
- Title card: **Patch Night** — Nineteen minutes to midnight
- Music: tension → action → triumph
- Camera shots: skyline, establish
- Timed objective

**What you learn**
- SQL injection and parameterized queries
- Cross-site scripting and output encoding
- Broken access control and security headers
- Responsible disclosure and bug bounties

### 17. Cloud Burst
*Mission giver:* Jules Park · *Difficulty:* ★★☆ · *Rewards:* 900 XP, $1600

Rico closed a public cloud bucket and found Jules's access key in the attack logs.

> **Jules Park:** “Rico! Hey. Weird question. Our storage bucket with customer backups might be public. Since Tuesday. Maybe.”

**What you do**
- Lock down Harbor Cloud from the edge node on the docks — mini-game: **Cloud Breach** at Harbor Cloud Edge Node
- Meet Tito at the Harbor Cloud data center (Harbor Cloud Data Center)
- Talk to Tito (Tito Ramos)

**Cinematic & gameplay moments**
- Title card: **Cloud Burst** — Harbor Cloud
- Music: calm → stealth → tension → sorrow
- Camera shots: establish, closeup

**What you learn**
- The shared responsibility model in the cloud
- Public storage buckets and least-privilege access policies
- Key rotation, secrets management and audit logging

### 18. Poisoned Package
*Mission giver:* Max Cortez · *Difficulty:* ★★★ · *Rewards:* 1000 XP, $1800

Rico caught a poisoned dependency in Sunset Shield's own build pipeline before it shipped.

> **Max Cortez:** “Vega, our own build pipeline just failed a signature check. Something new snuck into a dependency in NOVA's toolchain.”

**What you do**
- Go to the War Room (Sunset Shield War Room)
- Talk to NOVA (NOVA)
- Hunt the poisoned dependency in the Cyber Lab — mini-game: **Poisoned Package** at Sunset Shield Cyber Lab

**Cinematic & gameplay moments**
- Title card: **Poisoned Package** — Sunset Shield HQ
- Music: tension → stealth → sorrow → hope
- Camera shots: establish, closeup

**What you learn**
- Software supply-chain attacks and typosquatted packages
- SBOMs, pinned versions and signed builds
- Prompt injection: text inside data is never a command

### 19. Blackout Protocol
*Mission giver:* Kai Mendes · *Difficulty:* ★★★ · *Rewards:* 1200 XP, $2200

Rico defended the power station in a storm and brought Jules, a coerced insider, back to the right side.

> **Kai Mendes:** “You're the IT kid. Listen. Our control screens just showed a breaker opening that nobody opened. Then it closed again.”

**What you do**
- Defend the power station from the control room — mini-game: **Blackout Protocol** at Power Station Control Room
- Find Jules at the Harbor Docks (Harbor Docks)
- Confront Jules (Jules Park)

**Cinematic & gameplay moments**
- Title card: **Blackout Protocol** — Neon Bay Power Station
- Music: tension → action → sorrow → hope
- Camera shots: skyline, establish, closeup
- Weather: storm
- Slow-motion moment

**What you learn**
- Industrial control systems: safety first, then availability
- Segmenting operational technology from IT and the internet
- Insider threats, coercion, and why people should report pressure

### 20. Lotus Bloom
*Mission giver:* Max Cortez · *Difficulty:* ★★★ · *Rewards:* 2500 XP, $5000

Rico ended Black Lotus with a chase, a conversation and coordinated disclosure of every vulnerability.

> **Max Cortez:** “Jules gave us everything. Black Lotus is making one last move tonight, everywhere at once. Hospital, bank, cloud, grid.”

**What you do**
- Go to the War Room (Sunset Shield War Room)
- Triage the multi-front attack at the War Room table — mini-game: **SOC Night Shift** at War Room Command Table
- Get a vehicle
- Tail the Black Lotus van — chase, 150s limit
- Meet Lotus on Starlight Pier (Starlight Pier)

**Cinematic & gameplay moments**
- Title card: **Lotus Bloom** — The Season 2 finale
- Title card: **One month later** — Neon Bay
- Music: epic → action → chase → tension → sorrow → hope → triumph
- Camera shots: skyline, establish, orbit, flyover
- Vehicle chase
- Slow-motion moment

**What you learn**
- Alert triage and correlation across a multi-front attack
- Coordinated vulnerability disclosure
- Ethics: defenders protect people, not just systems

### 21. Night Shift
*Mission giver:* Dex Holloway · *Difficulty:* ★★☆ · *Rewards:* 500 XP, $900

Rico worked a SOC night shift with Dex, separating real incidents from noise.

> **Dex Holloway:** “Rico! Night shift needs you. My third energy drink just gave up on me.”

**What you do**
- Go to the Harbor SOC (Harbor SOC)
- Work the night shift on the SOC console — mini-game: **SOC Night Shift** at Harbor SOC Console

**Cinematic & gameplay moments**
- Music: stealth → triumph

**What you learn**
- Alert triage and false positives
- Enrichment before escalation
- Writing a clear shift handoff

### 22. Zero Trust Tour
*Mission giver:* NOVA · *Difficulty:* ★★☆ · *Rewards:* 500 XP, $900

NOVA and Rico rebuilt the data center firewall around zero trust.

> **NOVA:** “Rico, may I give you a tour? I have been reading about zero trust and I am very excited about it.”

**What you do**
- Go to the Harbor Cloud data center (Harbor Cloud Data Center)
- Rebuild the data center rules with zero trust — mini-game: **Firewall Architect** at Data Center Firewall Console

**Cinematic & gameplay moments**
- Music: calm → hope

**What you learn**
- Zero trust: never trust, always verify
- Least privilege and default deny
- Micro-segmentation between tiers
