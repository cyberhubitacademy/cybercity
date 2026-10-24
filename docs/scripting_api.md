# CCS scripting API

The command table lives in `src/scripting/opcodes.ts` (`COMMANDS`,
`CONTROL_OPS`); the tables below were generated from it. The compiler, the
verifier and `NativeRegistry` all check against that one table.

Parameter types: `int`, `float` (accepts int), `bool`, `str`, `any`. Handles
(vehicles, actors, blips, checkpoints) are `int`s issued by the engine.

## VM control opcodes

| Opcode | Name | Operands | Result |
|---|---|---|---|
| 0000 | NOP | — | — |
| 0002 | WAIT | value | — |
| 0003 | GOTO | label | — |
| 0004 | JUMP_IF_FALSE | value, label | — |
| 0005 | SET | value | var |
| 0006 | ADD | value, value | var |
| 0007 | SUB | value, value | var |
| 0008 | MUL | value, value | var |
| 0009 | DIV | value, value | var |
| 000a | MOD | value, value | var |
| 0010 | CMP_EQ | value, value | var |
| 0011 | CMP_NE | value, value | var |
| 0012 | CMP_LT | value, value | var |
| 0013 | CMP_LE | value, value | var |
| 0014 | CMP_GT | value, value | var |
| 0015 | CMP_GE | value, value | var |
| 0016 | NOT | value | var |
| 0020 | GOSUB | label | — |
| 0021 | RETURN | — | — |
| 0022 | START_THREAD | label | — |
| 0023 | END_THREAD | — | — |
| 0024 | END_SCRIPT | — | — |

`IF`, `WHILE`, `SET x = a + b`, `LOCAL`/`GLOBAL` are compiled into these.

## Engine commands

| Opcode | Command | Parameters | Returns | Async | Notes |
|---|---|---|---|---|---|
| 0100 | PRINT_MESSAGE | str, int | — |  | Big centered message for N milliseconds. |
| 0101 | PRINT_HELP | str | — |  | Help box (top-left). |
| 0102 | SET_OBJECTIVE | str | — |  | Set the current objective line. |
| 0103 | CLEAR_OBJECTIVE | — | — |  | Clear the objective line. |
| 0104 | MISSION_COMPLETE | — | — |  | Pass the mission and end every thread of this script. Ends the script (complete). |
| 0105 | MISSION_FAILED | str | — |  | Fail the mission with a reason and end every thread. Ends the script (fail). |
| 0106 | SET_TIMER | int | — |  | Start the on-screen countdown (seconds). |
| 0107 | CLEAR_TIMER | — | — |  | Remove the countdown. |
| 0108 | IS_TIMER_EXPIRED | — | bool |  | True when the countdown reached zero. |
| 0109 | RANDOM_INT | int, int | int |  | Deterministic random integer in [min, max]. |
| 010a | GET_GAME_HOUR | — | float |  | In-game hour of day (0..24). |
| 010b | DEBUG_LOG | any | — |  | Write a value to the developer log. |
| 0200 | IS_PLAYER_DEAD | — | bool |  | True while the player is hospitalized. |
| 0201 | IS_PLAYER_AT | str, float | bool |  | Player within radius (m) of a named place. |
| 0202 | IS_PLAYER_IN_ANY_VEHICLE | — | bool |  | Player is driving something. |
| 0203 | IS_PLAYER_NEAR_HANDLE | int, float | bool |  | Player within radius of an entity. |
| 0204 | GET_PLAYER_X | — | float |  | Player world X. |
| 0205 | GET_PLAYER_Z | — | float |  | Player world Z. |
| 0206 | ADD_MONEY | int | — |  | Give (or take) credits. |
| 0207 | SET_WAYPOINT | str | — |  | GPS waypoint to a named place. |
| 0208 | CLEAR_WAYPOINT | — | — |  | Remove the GPS waypoint. |
| 0209 | ADD_BLIP | str, str | int |  | Map blip on a place with a color; returns blip handle. |
| 020a | ADD_BLIP_FOR_HANDLE | int, str | int |  | Blip that follows an entity. |
| 020b | REMOVE_BLIP | int | — |  | Remove a blip. |
| 020c | ADD_CHECKPOINT | float, float, float | int |  | Glowing checkpoint cylinder at x z radius. |
| 020d | IS_PLAYER_IN_CHECKPOINT | int | bool |  | Player inside a checkpoint. |
| 020e | REMOVE_CHECKPOINT | int | — |  | Remove a checkpoint. |
| 020f | FADE_OUT | int | — | yes | Fade the screen to black over N ms. |
| 0210 | FADE_IN | int | — | yes | Fade back in over N ms. |
| 0211 | TELEPORT_PLAYER | float, float | — |  | Move the player (on foot) to x z. |
| 0300 | SPAWN_CAR | str, float, float, float | int |  | Spawn a vehicle model at x z heading(rad). |
| 0301 | SPAWN_ACTOR | str, float, float, float | int |  | Spawn a character at x z heading(rad). |
| 0302 | DESTROY_ENTITY | int | — |  | Remove a spawned entity. |
| 0303 | DOES_ENTITY_EXIST | int | bool |  | Handle still refers to a live entity. |
| 0304 | SET_VEHICLE_ROUTE | int, str | — |  | AI drives the vehicle along a named route. |
| 0305 | GET_DISTANCE_TO | int | float |  | Distance (m) from player to entity. |
| 0400 | SHOW_DIALOGUE | str | — | yes | Play a dialogue by id; waits until closed. |
| 0401 | WAIT_FOR_TALK | str | — | yes | Wait until the player talks to an NPC (E). |
| 0402 | START_CHALLENGE | str, str | bool | yes | Arm a challenge at a terminal; resolves passed/failed when the player finishes it. |
| 0403 | SHOW_BRIEFING | str | bool | yes | Mission briefing card; resolves accepted. |
| 0404 | CHASE_START | int, int, float, int | bool | yes | Tail a vehicle: tagSeconds within radius before timeLimit (s). |
| 0405 | COLLECT_START | str, int | bool | yes | Timed collect of an item set (seconds). |
| 0406 | UNLOCK_NOTE | str | — |  | Show an "unlocked" notification. |

## Host contract (`ScriptHost`, `src/scripting/host.ts`)

The engine implements one `ScriptHost` and binds it with
`bindGameNatives(new NativeRegistry(), host)`. Rules for implementers:

* Methods receiving a handle must throw `ScriptHandleError(handle)` when it is
  unknown or destroyed. The VM turns that into a thread error (with source
  line), never a crash.
* Async methods (`fadeOut`, `fadeIn`, `showDialogue`, `waitForTalk`,
  `startChallenge`, `showBriefing`, `chaseStart`, `collectStart`) may return a
  value directly or a Promise. A rejected Promise fails the waiting thread.
* `missionComplete` / `missionFailed` are notifications; the VM itself ends the
  script instance afterwards. Grant rewards from the instance's `onFinish`
  (outcome `completed`), so a reward is tied to exactly one finish event.
* `isPlayerAt(place, radius)` uses the world's named places (`hq`, `cafe`,
  `soc`, `datacenter`, `bank`, `university`, `market`, `pier`, `carla`,
  `hospital`, `spawn`).
* `startChallenge(challengeId, terminalId)` should arm the terminal and resolve
  when the player finishes that challenge there (`true` if passed).
* `setVehicleRoute(vehicle, 'pinktide_loop')` and `collectStart('rogue_aps', s)`
  name engine-defined data; unknown names should throw so the script reports them.

## Identifiers used by the shipped missions

Places: `hq`, `cafe`, `soc`, `datacenter`, `bank`, `university`, `market`, `pier`.
NPCs (`WAIT_FOR_TALK`): `max`, `carla`, `dex`, `tito`, `marisol`, `lena`, `priya`.
Terminals: `cafe-terminal`, `soc-terminal`, `dc-terminal`, `bank-terminal`,
`uni-terminal`, `market-terminal` (`hq-lab` is free-practice only).
Challenges: `phishing-1`, `traffic-1`, `firewall-1`, `password-1`, `social-1`,
`malware-1`, `forensics-1`, `crypto-1`, `incident-1`.
Routes: `pinktide_loop`. Item sets: `rogue_aps`. Blip colors: `pink`, `cyan`,
`yellow`, `red`, `purple`.

### Dialogue ids (`SHOW_DIALOGUE`)

| Mission | Ids |
|---|---|
| m01-welcome | `m01.intro_call`, `m01.max_welcome` |
| m02-phish | `m02.max_brief`, `m02.carla_intro`, `m02.carla_done` |
| m03-wire | `m03.dex_brief`, `m03.dex_done` |
| m04-walls | `m04.tito_brief`, `m04.tito_done` |
| m05-chase | `m05.max_brief`, `m05.tracker_planted`, `m05.max_debrief` |
| m06-payload | `m06.tito_brief`, `m06.tito_done` |
| m07-footprints | `m07.lena_brief`, `m07.lena_done` |
| m08-cipher | `m08.priya_brief`, `m08.priya_decoded`, `m08.pier_clue`, `m08.max_target` |
| m09-final | `m09.alarm`, `m09.marisol_brief`, `m09.ending` |
| side-social | `side_social.marisol_brief`, `side_social.marisol_done` |
| side-password | `side_password.carla_brief`, `side_password.carla_done` |
| side-wifi | `side_wifi.priya_brief`, `side_wifi.priya_done` |

## Tools

```bash
npx vite-node tools/scmc.ts -- missions/m02-phish.scm --disasm
npx vite-node tools/scmc.ts -- missions/m02-phish.scm -o m02.scmb
npx vite-node tools/scmc.ts -- --disasm-file m02.scmb
npx vite-node tools/scmc.ts -- missions/sample-getaway.scm --hex --trace
```

Errors print as `file:line:col: message` and exit with code 1.

## Cinematics, music and atmosphere (0x05xx)

| Opcode | Command | Args | Async | Notes |
| --- | --- | --- | --- | --- |
| 0x0500 | `CINEMATIC_START` | — | | Letterbox on, HUD hidden, player controls frozen. |
| 0x0501 | `CINEMATIC_END` | — | | Back to gameplay. The engine also ends any cinematic when a mission ends, fails or is cancelled. |
| 0x0502 | `CAMERA_SHOT` | preset `str`, target `str`, ms `int` | yes | Presets: `establish`, `orbit`, `flyover` (target = place id), `closeup`, `over_shoulder` (target = npc id), `skyline` (target `"city"`). Waits until the shot ends. |
| 0x0503 | `CAMERA_FOLLOW` | vehicle `int`, ms `int` | yes | Cinematic chase camera on a spawned vehicle handle. Stale handle → thread error. |
| 0x0504 | `SHOW_TITLE` | title `str`, subtitle `str`, ms `int` | yes | Mission title card. |
| 0x0505 | `MUSIC_CUE` | mood `str` | | `calm`, `tension`, `action`, `chase`, `sorrow`, `hope`, `triumph`, `villain`, `stealth`, `epic`, `none`. Crossfades ~2.5 s; any mood ducks the radio, `none` hands back to it. |
| 0x0506 | `SLOW_MOTION` | factor `float`, ms `int` | | Time scale clamped to 0.1..1 for N real milliseconds. |
| 0x0507 | `SCREEN_SHAKE` | strength `float` | | Impulse, clamped 0..1. |
| 0x0508 | `SET_HOUR` | hour `float` | | Jump the clock (wrapped to 0..24). |
| 0x0509 | `SET_WEATHER` | kind `str` | | `clear`, `rain`, `storm` (storm adds lightning + thunder). |
| 0x050a | `PLAY_SFX` | name `str` | | Any sound-effect name the AudioEngine knows (`alert`, `crash`, `whoosh`, …). |

Durations are clamped to 0..60000 ms. An unknown preset, mood or weather fails the thread with the source line,
for example `m10.scm:14 [thread 1]: unknown music mood "jazz" (use calm, tension, …)`.

Host methods (`ScriptHost`): `cinematicStart()`, `cinematicEnd()`, `cameraShot(preset, target, ms)`,
`cameraFollow(vehicle, ms)`, `showTitle(title, subtitle, ms)`, `musicCue(mood)`, `slowMotion(factor, ms)`,
`screenShake(strength)`, `setHour(hour)`, `setWeather(kind)`, `playSfx(name)`.
