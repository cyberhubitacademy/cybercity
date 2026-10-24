# Season 2: Black Lotus

Six months after the Pink Tide, Neon Bay is patched, proud and still fragile. A new group, **Black Lotus**,
starts proving it. Their leader, **Lotus**, is a former security researcher whose reports were ignored for years
and who now believes only disaster makes a city fix itself. Season 2 is about the people behind the systems:
a child in an ICU, a bank clerk, a coerced friend, an AI learning what trust means, and a villain who was right
about the problem and wrong about the cure.

## Cast

| Id | Character | Role and arc |
| --- | --- | --- |
| `nova` | NOVA | Sunset Shield's defensive AI. Witty and earnest; nearly obeys a prompt injection hidden in a README (s2-06) and learns that data is never a command. Asks Rico in the epilogue if it was a good teammate. |
| `amara` | Dr. Amara Singh | CISO of Neon Bay General, a former ICU doctor. Calm under pressure; runs ransomware response like triage (s2-02). |
| `kai` | Kai Mendes | Power-station control engineer. Gruff, protective of his crew, distrusts IT; ends up an ally (s2-07). |
| `jules` | Jules Park | Harbor Cloud SRE and Rico's first friend in the city. Coerced by Black Lotus through threats to his sister; leaks keys (s2-05), confesses and testifies (s2-07). Redemption, not punishment. |
| `lotus` | Lotus | Leader of Black Lotus. Cold, philosophical, right about the unpatched city; surrenders on Starlight Pier when Rico offers coordinated disclosure instead of destruction (s2-08). |
| `flamingo` | The Flamingo | Season 1 villain, now a reluctant informant calling from prison (s2-05, s2-08). |

Returning: Max (his old supply-chain guilt surfaces in s2-06), Marisol (her voice is deepfaked in s2-03),
Priya (her ignored bug report sets up Patch Night), Tito, Dex, Carla.

## Missions

| Id | Title | Giver | Gameplay | Challenge (terminal) | Emotional beat |
| --- | --- | --- | --- | --- | --- |
| s2-01 | Ghost in the Inbox | auto after m09 | War Room, talk to NOVA, hunt | `detection-1` (warroom-terminal) | Reunion; the calling card arrives from inside Sunset Shield. |
| s2-02 | Code Red at Neon Bay General | Max | Timed drive in the rain, talk to Amara | `incident-1` (hospital-terminal) | Lucia on a ventilator; six hours of notes lost; "we were ready." |
| s2-03 | The Voice of Marisol | Marisol | Investigate, then tail the money mule | `ai-1` (bank-terminal) + chase | Marisol shaken by a machine using her voice; Toby's callback saves $4M. |
| s2-04 | Patch Night | Priya | Midnight countdown drive | `web-1` (bank-terminal) | Priya's ignored report; disclosure finally works. |
| s2-05 | Cloud Burst | Jules | Lock down, then meet Tito | `cloud-1` (docks-terminal) | Jules's key in the logs; a friend's strange question at dusk. |
| s2-06 | Poisoned Package | Max | War Room, NOVA's confession | `supplychain-1` (hq-lab) | NOVA's embarrassment; Max's old mistake. |
| s2-07 | Blackout Protocol | Kai | Storm, dark city, find Jules at the docks | `grid-1` (grid-terminal) | The lights come back; Jules confesses and chooses to help. |
| s2-08 | Lotus Bloom | Max | War Room triage, van chase, pier conversation | `soc-1` (warroom-terminal) + chase | Rico talks Lotus down; epilogue one month later. |
| s2-side-1 | Night Shift | Dex | SOC at 3 AM | `soc-1` (soc-terminal) | Comic relief, a perfect shift. |
| s2-side-2 | Zero Trust Tour | NOVA | Data center tour | `firewall-1` (dc-terminal) | NOVA's enthusiasm for verifying everything. |

Every main mission opens with a cinematic (letterbox, establishing shot, title card), changes music with the
story (tension, action, chase, sorrow, hope, triumph, villain), and ends with a cinematic debrief. Every
challenge loops on failure with a hint instead of failing the mission; chases loop with a new sighting.

## Curriculum map (Season 1 + Season 2 + Cyber Arcade)

| Domain | Season 1 | Season 2 | Arcade categories |
| --- | --- | --- | --- |
| Fundamentals, CIA triad | m01 | s2-02 (availability in a hospital), s2-07 (safety first) | Security Awareness |
| Networking and traffic | m03 `traffic-1` | s2-07 (OT traffic) | Network & Traffic |
| Network defense, zero trust | m04 `firewall-1` | s2-side-2 | Firewall & Infrastructure |
| Web application security | | s2-04 `web-1` | Web Application Security |
| Identity and passwords, MFA | side-password `password-1` | s2-05 (keys, IAM) | Password & Authentication |
| Cryptography | m08 `crypto-1` | s2-06 (signatures, hashes) | Cryptography & Ciphers |
| Malware and endpoints | m06 `malware-1` | s2-02 (ransomware) | Malware Analysis |
| Digital forensics | m07 `forensics-1` | s2-05 (log evidence) | Digital Forensics |
| SOC, detection engineering, threat hunting | `detection-1`, `soc-1` (Cyber Lab) | s2-01, s2-08, s2-side-1 | SOC, Threat Intelligence |
| Incident response, backups | m09 `incident-1` | s2-02 | Incident Response, Ransomware & Data Protection |
| Cloud security | | s2-05 `cloud-1` | Cloud Security & DevSecOps |
| AI security, deepfakes, prompt injection | | s2-03 `ai-1`, s2-06 | AI Security & Deepfake Detection |
| OT / industrial control systems | | s2-07 `grid-1` | Wireless, IoT & Hardware |
| Supply-chain security, SBOM | | s2-06 `supplychain-1` | Secure Coding, DevSecOps |
| Social engineering, phishing | m02 `phishing-1`, side-social `social-1` | s2-03 (vishing 2.0) | Phishing & Social Engineering |
| Wireless | side-wifi | | Wireless, IoT & Hardware |
| Insider threats | | s2-05, s2-07 | Security Awareness |
| GRC, ethics, responsible disclosure | | s2-04, s2-08 | Security Architecture & Risk |
| Privacy and data protection | m02 | s2-02, s2-05 | Digital Privacy & Identity |

## Engine notes

- Scripts live in `missions/<missionId>.scm` (`s2-01.scm` … `s2-side-2.scm`) and must be registered in
  `src/scripting/missionSources.ts`.
- `s2-01` has no giver, so `MissionManager` auto-starts it when `m09-final` completes; the game must then start its
  script (the same way it does on Continue).
- Extra beats are in `SCRIPT_LINES` under keys `s2e1_*` … `s2e8_*`; dialogue ids in scripts are `s2.<key>`.
- New characters with posts: `amara`, `kai`, `jules`, `nova`. `lotus` and `flamingo` only speak in cutscenes.
