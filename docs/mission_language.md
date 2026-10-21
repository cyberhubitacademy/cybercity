# CCS mission language

Line-oriented: one statement per line. Keywords and command names are
case-insensitive; variable and label names are case-sensitive. Comments start
with `;` or `//` and run to the end of the line.

## Grammar (EBNF)

```ebnf
program      = { NL } "SCRIPT_START" name NL { statement } ;
statement    = label | [ prefix ] simple NL | block ;
label        = IDENT ":" [ statement ] ;
prefix       = HEX4 ":" ;                 (* 4 hex digits starting with 0-9, e.g. 0300: *)
simple       = "SCRIPT_END"
             | "GOTO" IDENT | "GOSUB" IDENT | "RETURN"
             | "START_THREAD" IDENT | "END_THREAD"
             | "WAIT" value
             | ( "LOCAL" | "GLOBAL" ) IDENT [ "=" expr ]
             | "SET" IDENT "=" expr
             | COMMAND { value } [ "->" IDENT ] ;
block        = "IF" cond NL { statement } [ "ELSE" NL { statement } ] "END_IF" NL
             | "WHILE" cond NL { statement } "END_WHILE" NL ;
cond         = { "NOT" } ( COMMAND { value }          (* command returning bool *)
                         | value [ cmpop value ] ) ;
expr         = value [ binop value ] ;
value        = INT | FLOAT | STRING | "TRUE" | "FALSE" | IDENT ;
cmpop        = "==" | "!=" | "<" | "<=" | ">" | ">=" ;
binop        = "+" | "-" | "*" | "/" | "%" ;
name         = IDENT | STRING ;
```

Lexical notes:

* `INT` is a 32-bit signed integer (`-5`, `1000`). `FLOAT` contains a dot
  (`12.0`, `-38.5`) and is stored as IEEE-754 float32.
* A `-`/`+` glued to a digit is a signed literal unless it directly follows a
  value character: `SPAWN_CAR "van" -38.0 5.0` passes `-38.0`, while
  `SET x = a - 5` subtracts. Write binary minus with spaces on both sides.
* Strings use double quotes with escapes `\"`, `\\`, `\n`, `\t`; max 255 bytes UTF-8.
* An opcode prefix (`0300:`) is optional documentation. When present the
  compiler checks it matches the command's opcode. Labels must start with a
  letter or `_`, so `dead:` is a label, `0300:` is a prefix.

## Semantics

* **Variables.** `LOCAL` variables belong to each thread (zero-initialized when
  a thread starts). `GLOBAL`s are shared by all threads of one running script
  instance. A `-> name` result capture declares `name` as a local if it does
  not exist yet. Using an undeclared variable is a compile error.
* **Types** are dynamic and tagged: `int`, `float`, `bool`, `str`. Commands
  check argument types (an `int` is accepted where a `float` is expected).
  Mismatches in literals are compile errors; in variables, runtime errors.
* **Arithmetic.** `int op int` stays `int` with explicit two's-complement
  wrap-around (`2147483647 + 1 = -2147483648`); division truncates toward
  zero. Any float operand makes the result float32. `/` or `%` by zero is a
  runtime error. `+` with a string operand concatenates.
* **Conditions** must be `bool` (an `int` counts as true when non-zero).
  `==`/`!=` compare numbers numerically and strings/bools by value; ordering
  operators need numbers. There is no `AND`/`OR`: nest `IF`s.
* **Control flow.** `IF/ELSE/END_IF` and `WHILE/END_WHILE` nest freely. `GOTO`
  may jump anywhere in the script, including out of blocks. `GOSUB` pushes a
  return address (max depth 16); `RETURN` pops it.
* **Yielding.** `WAIT ms` suspends the thread for `ms` of game time (`WAIT 0`
  yields until the next frame). Async commands suspend until the engine
  answers.
* **Ending.** `MISSION_COMPLETE` / `MISSION_FAILED "reason"` end every thread of
  the instance. `SCRIPT_END` (or falling off the end) ends it with outcome
  `ended`. `END_THREAD` ends the current thread; ending the main thread ends
  the instance. Code after `SCRIPT_END` is reachable only through labels,
  which is where thread bodies and subroutines usually live.

## Example

```text
SCRIPT_START m05_chase
LOCAL van = 0
LOCAL tagged = FALSE

SET_OBJECTIVE "Get a vehicle."
WHILE NOT IS_PLAYER_IN_ANY_VEHICLE
    WAIT 250
END_WHILE

0300: SPAWN_CAR "van" -38.0 -60.0 0.0 -> van
SET_VEHICLE_ROUTE van "pinktide_loop"
START_THREAD watchdog
CHASE_START van 6 16.0 120 -> tagged
IF NOT tagged
    MISSION_FAILED "The van got away."
END_IF
MISSION_COMPLETE
SCRIPT_END

watchdog:
WHILE TRUE
    WAIT 500
    IF IS_PLAYER_DEAD
        MISSION_FAILED "You were hospitalized."
    END_IF
END_WHILE
```

## Compiler errors

All errors in a file are reported together as `file:line:col: message`, e.g.

```text
test.scm:2:1: unknown command 'FLY_TO_MOON'
test.scm:3:12: expected str argument, got int
test.scm:4:1: undeclared variable 'q'
```

Other checks: wrong argument counts, `-> var` on a command without a result,
duplicate/undefined labels, duplicate declarations, out-of-range integers,
over-long strings, unbalanced `IF`/`WHILE`, opcode-prefix mismatches, and
missing `SCRIPT_START`/`SCRIPT_END`.
