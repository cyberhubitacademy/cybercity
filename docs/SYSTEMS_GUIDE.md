# Cyber City — guide for gameplay-system builders

Read this fully before writing code. Project root: `D:\1. YouTube\Zack D. Films Reverse Engineering\CyberCity`.

## The game
Browser 3D open-world game (Vite + strict TypeScript + Three.js r169), GTA-style, set in **Neon Bay**, a fictional
1980s-neon coastal city. Player: **Rico Vega**, analyst at Sunset Shield Security. The core is cybersecurity
missions (do not touch those), and we are now adding a full GTA-like open-world life: movement, water, vehicles,
life sim, activities, combat, police and crime. Live build: https://cyberhubitacademy.github.io/cybercity/

Run: `npm run dev` is already running at http://localhost:5199 (do NOT start another server). Tests: `npx vitest run`.
Types: `npx tsc --noEmit` (must stay clean for YOUR files; ignore others' in-progress errors but report them).

## Architecture you plug into
- `src/game/Systems.ts`: the **GameSystem** contract and **SystemContext** (world, input, ui, audio, scene, camera,
  interactions, markers, hudRoot, profile(), settings(), notify(), sfx(), addMoney(), modal(), isBusy(), save(),
  getData()/setData() for saved per-system data, system(id) to reach other systems).
- **Auto-discovery:** create `src/systems/<name>/index.ts` with `export default function create(): GameSystem`.
  The game picks it up automatically (no shared registry file to edit). One folder can hold several systems by
  exporting one system that internally manages sub-systems.
- `update(dt, ctx)` runs every frame while playing and nothing modal is open; `always()` runs every frame.
- Saved data: `ctx.getData('<id>', default)` / `ctx.setData('<id>', value)` (JSON-safe). Saved with the game.
- HUD widgets: append your own DOM to `ctx.hudRoot` (absolute-positioned, `pointer-events:none` unless needed).
  Use the palette in `src/styles.css` (CSS vars) and GTA V style (black translucent boxes, Anton/Oswald fonts are
  loaded). Hide your widgets while `ctx.isBusy()`.
- Prompts: register "press E" interactions with `ctx.interactions.set({id, x, z, radius, title, desc, action})`
  (see `src/game/Interactions.ts`); remove them when not relevant. Use ids prefixed with your system name.
- Blocking screens (shops, minigames, phone): build DOM yourself and wrap in `ctx.modal(async () => ...)` so input,
  pointer lock and the world pause correctly. Esc should close your screen.
- Notifications: `ctx.notify(text, 'info'|'good'|'warn'|'xp'|'money')`; supports `[y]..[/y]` color markup and `~E~` keycaps.
- Sounds: `ctx.sfx(name)` (click, good, bad, type, alert, open, pickup, levelup, passed, failed, crash, horn, door,
  whoosh, beep, cash). You may synthesize extra sounds with WebAudio inside your folder.

## World facts
- Units are meters; +x east, +z south, y up. City bounds roughly x -268..330, z -268..300.
  Ocean east of x = 238 (`SHORE_X`), harbor water south of z = 212 (`HARBOR_Z`). `isWater(x,z)` in `src/world/layout.ts`.
  Water surface y = -0.35. Sand slopes into the water near the shore.
- Places: `PLACES` in `src/world/layout.ts` (hq, cafe, soc, datacenter, bank, university, market, pier, carla,
  hospital, spawn, powerplant, docks, warroom). Districts via `districtAt(x,z)`; blocks via `buildBlocks()`.
- Collision: `world.city.collision` (`CollisionWorld` in `src/world/Collision.ts`): `add({x0,x1,z0,z1,y0,y1})`,
  `addRect`, `resolveCircle`, `groundHeight`, `raycast`. Buildings are boxes.
- `WorldSim` (`src/game/WorldSim.ts`): `player` (`src/actors/Player.ts`), `vehicle` (current), `vehicles`,
  `traffic` (AI cars, `src/vehicles/Traffic.ts`), `peds` (`src/actors/Pedestrians.ts`), `rig` (camera), `env`
  (sky/lighting), `hour`, `spawnVehicle(kind,x,z,yaw)`, `enterVehicle(v)`, `exitVehicle()`, `events`.
- Characters: `src/actors/CharacterModel.ts` (`createRig(outfit, {female, seed})`, skinned Quaternius models with
  clips Idle/Walk/Run/Jump/Punch/Death/Sitting/Standing/Clapping/SwordSlash/RunningJump; recolorable materials).
  Fallback procedural `Humanoid`. Both implement `Rig`.
- Assets: `src/assets/Assets.ts` (`ASSETS.people`, `ASSETS.cars`, surfaces, HDRIs). Models in `public/models/**`.

## Assets rules
- Only **CC0** assets (no attribution required) may be downloaded. Sources that work from this machine:
  - Poly Pizza (Quaternius etc.): fetch `https://poly.pizza/m/<publicID>` and grep `https://static.poly.pizza/<uuid>.glb`;
    search pages `https://poly.pizza/search/<query>` embed `"publicID":"..","licence":"CC0 1.0"`. Only use CC0 ones.
  - Poly Haven API: `https://api.polyhaven.com/files/<id>` (textures, HDRIs, models; all CC0).
- Put raw downloads in `assets-src/` (git-ignored), copy only what you use into `public/models/<area>/`, keep files
  small (prefer < 1 MB each; recompress textures with ffmpeg `-q:v 6`), and add a line to `public/models/CREDITS.txt`.
- Load via `GLTFLoader` lazily (when first needed) or add to `ASSETS` only if tiny. Always keep a procedural fallback.
- Do NOT use Blender.

## Key bindings (reserved — use only your own)
| Key | Owner |
| --- | --- |
| W A S D, Shift sprint, Space jump, E interact, F enter/exit vehicle, M map, Tab missions, I, J, G arcade, Esc pause | core |
| R radio (in vehicle) / reload (on foot, combat) ; H horn | core / combat |
| C crouch-sneak toggle; Space = climb/vault near ledge, swim up; C = swim down; Space while falling = parachute | movement |
| P phone | life |
| N nitro, L headlights, K vehicle menu (doors/trunk/hood) | vehicles |
| Right mouse aim (block with melee), Left mouse shoot/punch, Q tap = take/leave cover, Q hold = weapon wheel, 1–5 weapon slots, X holster, Z Focus (slow-mo aim), B shoulder swap; E context: takedown / disarm / human shield / zip-tie / search body | combat |

## Quality bar
- GTA V/VI feel: responsive controls, smooth blends, camera feel, satisfying feedback (sounds, shakes, UI pops).
- Runs on ordinary laptops: instance repeated meshes, pool objects, cap counts by `ctx.settings().quality`
  ('low'|'medium'|'high'|'ultra'), no per-frame allocations in hot loops.
- Never crash the game: wrap risky code; degrade gracefully.
- Write vitest tests for pure logic (`tests/<system>.test.ts`, node env, no DOM/three imports where possible).
- Keep code readable and modular; match the existing style (strict TS, no `any`).
- Finish with: `npx tsc --noEmit`, `npx vitest run`, and a quick browser check in a NEW tab you create
  (built-in browser tools; don't navigate other tabs). Report exactly what you built, keys, files, and anything the
  integrator must do.
