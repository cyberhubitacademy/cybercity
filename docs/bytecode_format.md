# SCMB bytecode format (version 1)

Original format for Cyber City mission scripts. Not compatible with any
Rockstar SCM file. All multi-byte integers are **little-endian**; floats are
IEEE-754 **float32** little-endian. Source of truth: `src/scripting/bytecode.ts`,
`compiler.ts` (writer) and `verifier.ts` (reader).

## File layout

```
offset  size  field
0       4     magic "SCMB" (53 43 4D 42)
4       2     u16 format version = 1
6       2     u16 flags (bit 0 = debug section present; other bits must be 0)
8       4     u32 code length in bytes (1 .. 1 MiB)
12      4     u32 string-table offset (must equal 32 + code length)
16      4     u32 string count (1 .. 65535; string 0 = script name)
20      2     u16 local variable count (<= 256)
22      2     u16 global variable count (<= 512)
24      4     u32 CRC-32 (IEEE, reflected, init/xorout 0xFFFFFFFF) of the code bytes
28      4     u32 debug-section offset (0 when flag bit 0 is clear)
32      n     code
32+n    ...   string table: per string u8 byte-length (<= 255) + UTF-8 bytes
...     ...   debug section (optional):
                u32 line-entry count, then per entry u32 code offset + u32 source line
                u16 local-name count (== local count), then u16 string index each
                u16 global-name count (== global count), then u16 string index each
```

## Instruction encoding

```
u16  opcode
u8   argc        number of input operands (<= 8; must equal the opcode signature)
u8   flags       bit 0 = a result operand follows the inputs; other bits must be 0
...  operands    argc x (u8 tag + payload)
...  [result]    (u8 tag + payload), tag must be LVAR or GVAR
```

Operand tags:

| Tag | Name | Payload | Meaning |
|---|---|---|---|
| 0x01 | INT | i32 | integer literal |
| 0x02 | FLOAT | f32 | float literal (must be finite) |
| 0x03 | BOOL | u8 (0 or 1) | boolean literal |
| 0x04 | STR | u16 | index into the string table |
| 0x05 | LVAR | u16 | thread-local variable slot (< local count) |
| 0x06 | GVAR | u16 | instance-global variable slot (< global count) |
| 0x07 | LABEL | u32 | absolute byte offset into the code section; must be an instruction start |

Instruction boundaries are implicit: the verifier decodes the code section
front to back and records each start offset. There is no padding or alignment;
all reads go through a bounds-checked `DataView` reader. The compiler always
ends the code with `END_SCRIPT`, so no label can point past the last
instruction.

Opcode ranges: `0x0000–0x00FF` VM control (see `docs/scripting_api.md`),
`0x0100+` engine commands (`0x06xx` = combat, police and crime, added in Season 3 without a format bump: new opcodes only). Opcode numbers are stable within a format version.

## Versioning and compatibility

* The VM accepts exactly the version it was built for (`FORMAT_VERSION = 1`).
  Any other version is rejected with `VerifyError: unsupported format version`.
* Adding a **new** command opcode is backwards compatible (old files still
  verify), so it does not bump the version. Changing an existing opcode's
  number, operand list, tag meanings or header layout requires a version bump.
* Unknown flag bits, unknown opcodes and unknown tags are rejected, never
  skipped.

## Verification

`verify(bytes)` checks, in order: size ≥ 32, magic, version, flags, code
length range and truncation, string-table placement, counts within limits,
**CRC-32 of the code**, every string is valid UTF-8 and in bounds, every
instruction: known opcode, argc = signature, flag bits valid, result present
iff allowed, each operand tag allowed for that parameter type, payload in
bounds, string/variable indices in range, floats finite, bools 0/1; then every
LABEL resolves to an instruction start; then the debug section (if flagged) is
in bounds and consistent. Any failure throws `VerifyError("verify @offset: …")`.
Truncating a valid file at **every** byte position is covered by tests.

## Worked example

Source `missions/sample-getaway.scm`:

```text
; Sample mission used in docs/bytecode_format.md.
SCRIPT_START getaway

LOCAL playerDead = FALSE

WAIT 1000
IS_PLAYER_DEAD -> playerDead

IF playerDead
    MISSION_FAILED "Rico was hospitalized."
END_IF

0300: SPAWN_CAR "stinger" 100.0 -20.0 1.57 -> getawayCar
PRINT_MESSAGE "Get in the car!" 2000
MISSION_COMPLETE
SCRIPT_END
```

Command (output below is pasted verbatim from it):

```bash
npx vite-node tools/scmc.ts -- missions/sample-getaway.scm --hex --disasm --trace
```

### Hex dump (282 bytes)

```
000000  53 43 4d 42 01 00 01 00 59 00 00 00 79 00 00 00  |SCMB....Y...y...|
000010  06 00 00 00 02 00 00 00 f6 4f 8f 41 c6 00 00 00  |.........O.A....|
000020  05 00 01 01 03 00 05 00 00 02 00 01 00 01 e8 03  |................|
000030  00 00 00 02 00 01 05 00 00 04 00 02 00 05 00 00  |................|
000040  07 2c 00 00 00 05 01 01 00 04 01 00 00 03 04 01  |.,..............|
000050  04 02 00 02 00 00 c8 42 02 00 00 a0 c1 02 c3 f5  |.......B........|
000060  c8 3f 05 01 00 00 01 02 00 04 03 00 01 d0 07 00  |.?..............|
000070  00 04 01 00 00 24 00 00 00 07 67 65 74 61 77 61  |.....$....getawa|
000080  79 16 52 69 63 6f 20 77 61 73 20 68 6f 73 70 69  |y.Rico was hospi|
000090  74 61 6c 69 7a 65 64 2e 07 73 74 69 6e 67 65 72  |talized..stinger|
0000a0  0f 47 65 74 20 69 6e 20 74 68 65 20 63 61 72 21  |.Get in the car!|
0000b0  0a 70 6c 61 79 65 72 44 65 61 64 0a 67 65 74 61  |.playerDead.geta|
0000c0  77 61 79 43 61 72 09 00 00 00 00 00 00 00 04 00  |wayCar..........|
0000d0  00 00 09 00 00 00 06 00 00 00 12 00 00 00 07 00  |................|
0000e0  00 00 19 00 00 00 09 00 00 00 25 00 00 00 0a 00  |..........%.....|
0000f0  00 00 2c 00 00 00 0d 00 00 00 45 00 00 00 0e 00  |..,.......E.....|
000100  00 00 51 00 00 00 0f 00 00 00 55 00 00 00 10 00  |..Q.......U.....|
000110  00 00 02 00 04 00 05 00 00 00                    |..........|
```

### Header

| Bytes | Field | Value |
|---|---|---|
| `53 43 4d 42` | magic | "SCMB" |
| `01 00` | version | 1 |
| `01 00` | flags | debug section present |
| `59 00 00 00` | code length | 89 bytes (0x20–0x78) |
| `79 00 00 00` | string table offset | 0x79 = 32 + 89 |
| `06 00 00 00` | string count | 6 |
| `02 00` | locals | 2 (`playerDead`, `getawayCar`) |
| `00 00` | globals | 0 |
| `f6 4f 8f 41` | CRC-32 of code | 0x418F4FF6 |
| `c6 00 00 00` | debug offset | 0xC6 |

### Code, instruction by instruction

Offsets are relative to the start of the code section (file offset 0x20).

| Offset | Bytes | Decoded |
|---|---|---|
| 0000 | `05 00` `01` `01` · `03 00` · `05 00 00` | SET (0x0005), 1 arg, has result · BOOL 0 = FALSE · result LVAR 0 (`playerDead`) |
| 0009 | `02 00` `01` `00` · `01 e8 03 00 00` | WAIT (0x0002), 1 arg · INT 0x000003E8 = 1000 |
| 0012 | `00 02` `00` `01` · `05 00 00` | IS_PLAYER_DEAD (0x0200), 0 args, has result · LVAR 0 |
| 0019 | `04 00` `02` `00` · `05 00 00` · `07 2c 00 00 00` | JUMP_IF_FALSE (0x0004), 2 args · LVAR 0 · LABEL 0x002C |
| 0025 | `05 01` `01` `00` · `04 01 00` | MISSION_FAILED (0x0105), 1 arg · STR #1 "Rico was hospitalized." |
| 002c | `00 03` `04` `01` · `04 02 00` · `02 00 00 c8 42` · `02 00 00 a0 c1` · `02 c3 f5 c8 3f` · `05 01 00` | SPAWN_CAR (0x0300), 4 args, has result · STR #2 "stinger" · FLOAT 0x42C80000 = 100.0 · FLOAT 0xC1A00000 = −20.0 · FLOAT 0x3FC8F5C3 ≈ 1.57 · result LVAR 1 (`getawayCar`) |
| 0045 | `00 01` `02` `00` · `04 03 00` · `01 d0 07 00 00` | PRINT_MESSAGE (0x0100), 2 args · STR #3 "Get in the car!" · INT 2000 |
| 0051 | `04 01` `00` `00` | MISSION_COMPLETE (0x0104), no operands |
| 0055 | `24 00` `00` `00` | END_SCRIPT (0x0024) |

The `IF playerDead … END_IF` block became a single `JUMP_IF_FALSE` to 0x002C
(the instruction after the block). The `0300:` prefix in the source was checked
against SPAWN_CAR's opcode and leaves no trace in the bytes. `getawayCar` was
auto-declared by the `-> getawayCar` capture.

### String table (file offset 0x79)

| # | Length byte | Text |
|---|---|---|
| 0 | `07` | getaway (script name) |
| 1 | `16` (22) | Rico was hospitalized. |
| 2 | `07` | stinger |
| 3 | `0f` (15) | Get in the car! |
| 4 | `0a` | playerDead (debug name) |
| 5 | `0a` | getawayCar (debug name) |

### Debug section (file offset 0xC6)

`09 00 00 00` = 9 line entries: (0x00→4) (0x09→6) (0x12→7) (0x19→9) (0x25→10)
(0x2C→13) (0x45→14) (0x51→15) (0x55→16); then `02 00` local names
`04 00` `05 00` (strings #4, #5); then `00 00` global names.

### Disassembly

```
; script "getaway"  format v1  code 89 bytes  crc 418f4ff6
; 2 local(s) [playerDead, getawayCar]  0 global(s) []  6 string(s)
  0000  0005: SET FALSE -> L0(playerDead)  ; line 4
  0009  0002: WAIT 1000  ; line 6
  0012  0200: IS_PLAYER_DEAD -> L0(playerDead)  ; line 7
  0019  0004: JUMP_IF_FALSE L0(playerDead) @002c  ; line 9
  0025  0105: MISSION_FAILED "Rico was hospitalized."  ; line 10
@002c:
  002c  0300: SPAWN_CAR "stinger" 100.0 -20.0 1.57 -> L1(getawayCar)  ; line 13
  0045  0100: PRINT_MESSAGE "Get in the car!" 2000  ; line 14
  0051  0104: MISSION_COMPLETE  ; line 15
  0055  0024: END_SCRIPT  ; line 16
```

### VM execution trace (MockHost, 16 ms frames)

```
t=   16ms  thread 1  @0000  line   4  SET FALSE -> L0(playerDead)
t=   16ms  thread 1  @0009  line   6  WAIT 1000
t= 1024ms  thread 1  @0012  line   7  IS_PLAYER_DEAD -> L0(playerDead)
t= 1024ms  thread 1  @0019  line   9  JUMP_IF_FALSE L0(playerDead) @002c
t= 1024ms  thread 1  @002c  line  13  SPAWN_CAR "stinger" 100.0 -20.0 1.57 -> L1(getawayCar)
t= 1024ms  thread 1  @0045  line  14  PRINT_MESSAGE "Get in the car!" 2000
t= 1024ms  thread 1  @0051  line  15  MISSION_COMPLETE
; outcome: completed after 64 frames
; host calls:
;   SPAWN_CAR stinger 100 -20 1.5700000524520874 -> 100
;   PRINT_MESSAGE Get in the car! 2000
;   MISSION_COMPLETE
```

`WAIT 1000` was issued at t=16 ms, so the thread became runnable at
t ≥ 1016 ms and resumed on the first frame after that (t = 1024 ms); the rest
of the game kept updating in between. `1.57` round-trips as float32
(1.5700000524520874). `END_SCRIPT` never runs because `MISSION_COMPLETE` ends
the instance.

### Native handlers involved

From `src/scripting/natives.ts` (`bindGameNatives`):

```ts
b('IS_PLAYER_DEAD', () => sBool(host.isPlayerDead()));
b('SPAWN_CAR', (_c, a) => sInt(host.spawnCar(S(a, 0), N(a, 1), N(a, 2), N(a, 3))));
b('PRINT_MESSAGE', (_c, a) => host.printMessage(S(a, 0), N(a, 1)));
b('MISSION_FAILED', (_c, a) => host.missionFailed(S(a, 0)));
b('MISSION_COMPLETE', () => host.missionComplete());
```

The VM type-checks and coerces arguments against the command table before the
handler runs, checks the returned value's type before writing the result
variable, and ends the instance after commands marked `terminates`.
