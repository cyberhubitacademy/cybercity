# Cyber City: Hack the Future

An open-world cybersecurity adventure in the spirit of 1980s-neon crime games — except you're the defender.
Rico Vega arrives in **Neon Bay** to join **Sunset Shield Security**. The hacker crew **Pink Tide** is hitting cafés,
banks and data centers. Explore the city on foot, by car, motorbike or speedboat; take missions from the cast;
and stop the attacks by actually doing the security work — in playable, scored mini-games.

Everything — the city, characters, cars, textures and music — is generated in code. No third-party art or audio.

## Play

- **Online:** GitHub Pages (see the repository's *About* link once Pages is enabled).
- **Locally:**

```bash
npm install
npm run dev
```

Then open http://localhost:5199. Build a static version with `npm run build` (output in `dist/`).

Requires a desktop browser with WebGL2 (Chrome, Edge, Firefox, Safari 15+). Settings → Graphics lets you drop
quality to **Low** on older laptops.

## Controls

| Key | On foot | In a vehicle |
| --- | --- | --- |
| W A S D | Move | Accelerate / brake-reverse / steer |
| Mouse (click to lock) | Look | Look (camera swings back behind the car) |
| Shift | Sprint (stamina) | — |
| Space | Jump | Handbrake (drift) |
| E / F | Interact, enter vehicle | Exit vehicle |
| R | — | Next radio station |
| H | — | Horn |
| M | Map (click to set a waypoint) | Map |
| Tab | Missions & status | Missions & status |
| I / J | Inventory / Learning journal | — |
| Esc | Pause menu | Pause menu |
| Mouse wheel | Camera zoom | Camera zoom |

## What's in the city

- **7 districts:** Neon Beach (Ocean Drive, hotels, Starlight Pier and Ferris wheel), Downtown Cyber District,
  Silicon Harbor (data center, SOC, docks), Old Town, Industrial Zone, Bayview University, Underground Tech Market.
- **Day/night cycle** (12 real minutes per day), sunsets over the ocean, neon at night, reflective water, soft shadows.
- **Traffic and pedestrians** that react to you; cars, a motorbike and speedboats to drive.
- **Collectibles:** 12 hidden data shards. **Shop:** Byte Bazaar upgrades and shirts.

## Voices and comic dialogue

Every scripted line is voiced with [Piper TTS](https://github.com/rhasspy/piper) (offline neural TTS), pre-rendered into
`public/voices/` so voices also work on GitHub Pages. Each character has their own pitch and pace. Conversations and
cutscenes use comic-book speech bubbles and caption boxes; text is paced to the speech and auto-advances.

Regenerate after editing dialogue (needs Python with `piper-tts`, ffmpeg, and the `en_GB-alan-medium` /
`en_GB-alba-medium` models in `tools/voices/models/`):

```bash
npx vite-node tools/voices/extract-lines.ts
python tools/voices/gen_voices.py tools/voices/models
```

## Cybersecurity mini-games

Hand-built challenges with real validation, hints, scoring and explanations:

| Challenge | Skill |
| --- | --- |
| Phishing Detective — *Catch of the Day* | Email red flags, lookalike domains, SPF/DKIM, reporting |
| Traffic Investigator — *Something on the Wire* | Ports, protocols, beaconing, scans, exfiltration, DNS tunneling |
| Firewall Architect — *Walls of the Harbor* | First-match rules, least privilege, default deny, DMZ |
| Password Lab — *Locked Out* | Strength, reuse, credential stuffing, MFA, hashing vs encryption, salts |
| Social Engineering — *Voice on the Line* | Pretexting, BEC, tailgating, verification procedures |
| Malware Triage — *The Hidden Payload* | Process trees, IOCs, persistence, EDR containment |
| Forensics Timeline — *Digital Footprints* | Chain of custody, timezones, timeline reconstruction |
| Cipher Puzzle — *The Flamingo's Cipher* | Encoding vs encryption, Caesar, SHA-256, signatures |
| Incident Command — *The Final Incident* | Triage, NIST lifecycle, containment, recovery, reporting |
| Detection Engineering Lab | Writing and tuning detection rules, precision/recall, MITRE ATT&CK |
| SOC Analyst — *Night Shift* | Alert triage, enrichment, correlation, escalation, handoff |

Plus the **Cyber Arcade** (arcade cabinets at Bayview University and the Tiki Bytes beach bar, and in the pause menu):
over 1,000 named challenges across 31 categories — from *Phish or Finish* to *Prompt Injection Puzzle*.
Arcade entries are generated variations of shared game mechanics (classify, spot the red flags, order, match,
harden a configuration, decode, triage, scenario) drawing on per-category content banks.

All scenarios are fictional and run in a simulation inside the game: no real networks are scanned, nothing is executed,
and no real passwords are collected (the password lab only accepts made-up practice passwords and never stores them).

## Mission scripting (SCM-style)

Story missions are written in an original, GTA-SCM-inspired mission language (`missions/*.scm`), compiled to a
versioned, verified bytecode and run by a cooperative script VM inside the game loop. See `docs/`:
`architecture.md`, `mission_language.md`, `bytecode_format.md`, `scripting_api.md`.

## Development

```bash
npm test          # unit tests (challenge logic, missions, progression, saves, scripting)
npm run typecheck # strict TypeScript
```

Project layout: `src/world` (city, sky, ocean), `src/actors`, `src/vehicles`, `src/game` (loop, camera, input),
`src/cyber` (challenges + arcade), `src/missions`, `src/scripting`, `src/progression`, `src/story`, `src/ui`, `src/audio`.

## Known limitations

- Art is procedural and stylized — not photoreal; it targets a vivid modern-retro look rather than GTA V/VI fidelity.
- Saves live in the browser's local storage (per browser/device; clearing site data deletes them).
- Desktop keyboard + mouse only for now; no touch controls.
- Simplified arcade vehicle physics; no multiplayer.

## Credits

Original game. Built with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev). Fonts: Bungee, Pacifico,
Rajdhani, JetBrains Mono (Google Fonts, SIL OFL).
