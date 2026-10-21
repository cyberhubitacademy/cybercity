import { describe, expect, it } from 'vitest';
import { HEADER_SIZE, OP, TAG, compile, disassemble, parse, tokenize, verify } from '../../src/scripting';
import { compileErrors, local, run, wrap } from './helpers';

describe('lexer', () => {
  it('tokenizes numbers, strings, arrows, prefixes and skips comments', () => {
    const { tokens, errors } = tokenize('0300: SPAWN_CAR "van" -38.0 5 -> v ; comment\n// whole line\nSET x = a - 5');
    expect(errors).toEqual([]);
    const kinds = tokens.filter((t) => t.kind !== 'newline' && t.kind !== 'eof').map((t) => `${t.kind}:${t.text}`);
    expect(kinds).toEqual([
      'prefix:0300:', 'ident:SPAWN_CAR', 'string:van', 'float:-38.0', 'int:5', 'arrow:->', 'ident:v',
      'ident:SET', 'ident:x', 'op:=', 'ident:a', 'op:-', 'int:5',
    ]);
    expect(tokens.find((t) => t.kind === 'prefix')?.num).toBe(0x300);
  });

  it('reports unterminated strings and bad characters with positions', () => {
    const { errors } = tokenize('PRINT_HELP "oops\nX @');
    expect(errors.map((e) => [e.line, e.col])).toEqual([[1, 12], [2, 3]]);
  });
});

describe('parser', () => {
  it('builds nested IF/ELSE/WHILE blocks', () => {
    const { ast, errors } = parse(wrap('LOCAL a = 1\nWHILE a < 3\n  IF a == 2\n    SET a = a + 10\n  ELSE\n    SET a = a + 1\n  END_IF\nEND_WHILE'));
    expect(errors).toEqual([]);
    const w = ast.find((s) => s.k === 'while');
    expect(w && w.k === 'while' && w.body[0].k).toBe('if');
  });
});

describe('compile errors', () => {
  it('reports line and column for unknown commands, bad args and undeclared variables', () => {
    const errs = compileErrors(wrap('FLY_TO_MOON 1\nPRINT_HELP 5\nSET q = 1\nWAIT 1.5'));
    expect(errs).toEqual([
      { msg: "test.scm:2:1: unknown command 'FLY_TO_MOON'", line: 2, col: 1 },
      { msg: 'test.scm:3:12: expected str argument, got int', line: 3, col: 12 },
      { msg: "test.scm:4:1: undeclared variable 'q'", line: 4, col: 1 },
      { msg: 'test.scm:5:6: expected int argument, got float', line: 5, col: 6 },
    ]);
  });

  it('collects structural errors', () => {
    const errs = compileErrors('SCRIPT_START x\nIF TRUE\nGOTO nowhere\nLOCAL a\nLOCAL a\nIS_PLAYER_DEAD 3\nPRINT_HELP "x" -> a');
    const msgs = errs.map((e) => e.msg.replace(/^test\.scm:\d+:\d+: /, ''));
    expect(msgs).toContain('IF without END_IF');
    expect(msgs).toContain("variable 'a' already declared");
    expect(msgs).toContain('IS_PLAYER_DEAD expects 0 argument(s) (none), got 1');
    expect(msgs).toContain('missing SCRIPT_END');
    expect(errs.every((e) => e.line > 0 && e.col > 0)).toBe(true);
  });

  it('checks opcode prefixes against the command table', () => {
    const errs = compileErrors(wrap('0101: PRINT_MESSAGE "x" 5'));
    expect(errs[0].msg).toContain('opcode prefix 0101 does not match PRINT_MESSAGE (0100)');
    expect(compileErrors(wrap('0100: PRINT_MESSAGE "x" 5'))).toEqual([]);
  });

  it('rejects undefined and duplicate labels, and out-of-range ints', () => {
    const msgs = compileErrors(wrap('a:\na:\nGOSUB b\nLOCAL big = 3000000000')).map((e) => e.msg);
    expect(msgs.some((m) => m.includes("duplicate label 'a'"))).toBe(true);
    expect(msgs.some((m) => m.includes("undefined label 'b'"))).toBe(true);
    expect(msgs.some((m) => m.includes('out of 32-bit range'))).toBe(true);
  });
});

describe('operand encoding', () => {
  it('encodes int, float, bool, string, local and global operands little-endian', () => {
    const { bytes } = compile(wrap('GLOBAL g = 0\nLOCAL l = -2\nSET g = 1.5\nSET l = TRUE\nPRINT_MESSAGE "hi" 258'), { debug: false });
    const p = verify(bytes);
    const [setG0, setL, setG, setL2, print] = p.instructions;
    expect(setG0.result).toEqual({ tag: TAG.GVAR, v: 0 });
    expect(setL.args[0]).toEqual({ tag: TAG.INT, v: -2 });
    expect(setG.args[0]).toEqual({ tag: TAG.FLOAT, v: 1.5 });
    expect(setL2.args[0]).toEqual({ tag: TAG.BOOL, v: true });
    expect(p.strings[print.args[0].v as number]).toBe('hi');
    // raw bytes of PRINT_MESSAGE "hi" 258: opcode 0x0100 LE, argc 2, flags 0, STR idx 1, INT 258
    const raw = [...bytes.subarray(HEADER_SIZE + print.pc, HEADER_SIZE + print.pc + print.size)];
    expect(raw).toEqual([0x00, 0x01, 0x02, 0x00, TAG.STR, 0x01, 0x00, TAG.INT, 0x02, 0x01, 0x00, 0x00]);
  });

  it('converts int literals to floats for float parameters', () => {
    const p = verify(compile(wrap('SPAWN_CAR "van" 1 2 3 -> v')).bytes);
    expect(p.instructions[0].args.slice(1).map((a) => a.tag)).toEqual([TAG.FLOAT, TAG.FLOAT, TAG.FLOAT]);
  });

  it('resolves labels to instruction boundaries and appends END_SCRIPT', () => {
    const p = verify(compile(wrap('GOTO end\nWAIT 5\nend:')).bytes);
    expect(p.instructions[0].opcode).toBe(OP.GOTO);
    expect(p.instructions[p.instructions[0].args[0].v as number].opcode).toBe(OP.END_SCRIPT);
    expect(disassemble(p)).toContain('GOTO @');
  });
});

describe('control flow execution', () => {
  it('runs IF/ELSE, WHILE and arithmetic', () => {
    const r = run(wrap('LOCAL i = 0\nLOCAL sum = 0\nWHILE i < 5\n  SET i = i + 1\n  IF i == 3\n    SET sum = sum + 100\n  ELSE\n    SET sum = sum + i\n  END_IF\nEND_WHILE\nMISSION_COMPLETE'));
    expect(r.inst.outcome).toBe('completed');
    expect(local(r, 'sum')).toEqual({ t: 'int', v: 1 + 2 + 100 + 4 + 5 });
  });

  it('GOSUB/RETURN and NOT conditions', () => {
    const r = run(wrap('LOCAL n = 0\nGOSUB add\nGOSUB add\nIF NOT n == 2\n  MISSION_FAILED "bad"\nEND_IF\nMISSION_COMPLETE\nadd:\nSET n = n + 1\nRETURN'));
    expect(r.inst.outcome).toBe('completed');
    expect(local(r, 'n').v).toBe(2);
  });

  it('wraps int32 overflow explicitly and keeps floats as float32', () => {
    const r = run(wrap('LOCAL a = 2147483647\nSET a = a + 1\nLOCAL m = 65536\nSET m = m * 65536\nLOCAL f = 0.1\nSET f = f + 0.2\nLOCAL s = "x" + 5\nMISSION_COMPLETE'));
    expect(local(r, 'a').v).toBe(-2147483648);
    expect(local(r, 'm').v).toBe(0);
    expect(local(r, 'f')).toEqual({ t: 'float', v: Math.fround(Math.fround(0.1) + Math.fround(0.2)) });
    expect(local(r, 's')).toEqual({ t: 'str', v: 'x5' });
  });

  it('uses command results as conditions', () => {
    const r = run(wrap('IF IS_PLAYER_DEAD\n  MISSION_FAILED "dead"\nELSE\n  MISSION_COMPLETE\nEND_IF'));
    expect(r.inst.outcome).toBe('completed');
  });
});
