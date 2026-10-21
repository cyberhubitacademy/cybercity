# Cyber City — mission scripting architecture

Cyber City's missions are written in **CCS** (Cyber City Script), an original,
assembly-flavored mission language inspired by the *programming model* of
classic open-world mission scripts (numbered opcodes, labels, `WAIT`, threads).
The language, opcodes, bytecode format (`SCMB`) and VM are original and are
**not** compatible with Rockstar's SCM format.

The game runs in the browser (TypeScript + Three.js), so the whole pipeline is
TypeScript too. It stays hostable on GitHub Pages and testable in Node (vitest).

## Three layers

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Mission scripts            missions/*.scm                  │
│    objectives, dialogue ids, waits, branching, threads        │
└──────────────┬───────────────────────────────────────────────┘
               │ compile (lexer → parser → IR → labels → validate → assemble)
               ▼
        SCMB bytecode (Uint8Array) ──► verifier (bounded reader)
               │
┌──────────────▼───────────────────────────────────────────────┐
│ 2. Script VM + native API     src/scripting/                  │
│    ScriptVM / ScriptScheduler / ScriptThread / NativeRegistry │
│    tagged values, budgets, game-clock WAIT, async natives     │
└──────────────┬───────────────────────────────────────────────┘
               │ ScriptHost interface (strings + integer handles only)
┌──────────────▼───────────────────────────────────────────────┐
│ 3. Game engine                src/game, src/world, src/ui ... │
│    player, vehicles, NPCs, terminals, HUD, dialogue, render   │
└──────────────────────────────────────────────────────────────┘
```

Changing a mission never touches engine code. The engine only implements
`ScriptHost` once; every story mission, side mission or ambient script reuses it.

## Source files

| File | Responsibility |
|---|---|
| `src/scripting/lexer.ts` | Tokens with line/column, comments, opcode prefixes |
| `src/scripting/parser.ts` | AST for statements, conditions, expressions, blocks |
| `src/scripting/compiler.ts` | AST → IR, symbol tables, operand validation, assembler |
| `src/scripting/bytecode.ts` | Format constants, CRC-32, bounded `ByteReader`/`ByteWriter` |
| `src/scripting/verifier.ts` | Decodes + validates an image into a `Program` |
| `src/scripting/disassembler.ts` | Listing, hex dump |
| `src/scripting/opcodes.ts` | Control opcodes + command table (single source of truth) |
| `src/scripting/natives.ts` | `NativeRegistry`, `bindGameNatives(host)` |
| `src/scripting/host.ts` | `ScriptHost` interface + `MockHost` for tests/CLI |
| `src/scripting/vm.ts` | `ScriptVM`, `ScriptScheduler`, `ScriptThread`, `ScriptInstance`, `ScriptDebugger` |
| `src/scripting/missionSources.ts` | Bundles `missions/*.scm` via Vite `?raw`, compiles on first use |
| `tools/scmc.ts` | CLI compiler / disassembler / tracer |

## Engine integration

```ts
import { NativeRegistry, ScriptVM, bindGameNatives } from './scripting';
import { missionProgram } from './scripting/missionSources';

const vm = new ScriptVM(bindGameNatives(new NativeRegistry(), gameHost));
const inst = vm.start(missionProgram('m02-phish'), (i) => {
  // i.outcome: 'completed' | 'failed' | 'ended' | 'error' | 'cancelled'; i.reason
});

// in Game.update(dt):
//   input → player → vehicles → AI → vm.update(gameDtMs) → UI → render
vm.update(paused ? 0 : dtSeconds * 1000 * timeScale);
```

`vm.cancel(inst)` aborts a mission (e.g. player abandons it). Pending async
results that arrive after cancellation are ignored.

## Execution model

* **Cooperative and non-blocking.** Each `update` runs every live thread until
  it yields (`WAIT`, an async native, `END_THREAD`) or hits its instruction
  budget (default 500 per thread, 5000 per update). A thread that exhausts its
  budget simply continues next update, so an infinite loop costs at most its
  budget per frame and never freezes the game.
* **Time.** `WAIT` uses the scheduler's clock, advanced only by the engine
  (`update(dtMs)` or `update(0, absoluteGameTimeMs)`). Pass `0` while paused and
  scaled dt in slow motion; scripts therefore pause with the game. Wall-clock
  time is never read.
* **Async natives** (`SHOW_DIALOGUE`, `WAIT_FOR_TALK`, `START_CHALLENGE`,
  `CHASE_START`, `COLLECT_START`, `FADE_*`, `SHOW_BRIEFING`) return a
  `Pending`. The host resolves it (or rejects it) later; the thread resumes on
  the next update and the value is written to the `-> var`.
* **Threads.** `START_THREAD label` starts a sibling thread in the same
  instance with its own locals (zero-initialized), sharing `GLOBAL`s. The
  instance ends when its main thread ends, on `MISSION_COMPLETE` /
  `MISSION_FAILED`, or on a runtime error in the main thread. Up to 32 live
  threads per VM.

## Safety and isolation — what it does and does not guarantee

What is enforced:

* Bytecode is verified before running: magic, version, flags, CRC-32, every
  opcode known, operand counts and tags match the signature, string/variable
  indices in range, jump targets on instruction boundaries, valid UTF-8,
  bounded reads only (`ByteReader` checks length before every read; no
  unchecked casts). Corrupt input raises `VerifyError`; it never crashes.
* Scripts hold only tagged values (`int`, `float`, `bool`, `str`). Entities
  are integer handles; the host validates them on every call and throws
  `ScriptHandleError` for stale or forged ones.
* Runtime errors (type errors, division by zero, bad handle, call-stack
  overflow, `RETURN` underflow, thread limit) fail **only that thread**, with
  the script name, source line and thread id. A main-thread failure ends that
  mission instance, not the game.
* Limits: 8 args/instruction, 255-byte strings, 256 locals, 512 globals,
  1 MiB code, 16 GOSUB levels, 32 threads, per-frame instruction budgets.

What it is **not**: an operating-system or browser security sandbox. The VM is
logical isolation inside the same JavaScript realm as the game. It protects the
game from buggy or malformed mission scripts; it is not designed to contain
hostile code that has already gained the ability to run JavaScript on the page.
Mission scripts come from the game's own bundle, not from users.
