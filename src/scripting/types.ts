// Core value and error types for the Cyber City mission scripting system (CCS).
// Script values are tagged so scripts never touch engine objects directly:
// entities are plain integer handles that the host validates on every use.

export type ScriptValue =
  | { t: 'int'; v: number }
  | { t: 'float'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'str'; v: string };

/** Static parameter types used by the command table. */
export type ParamType = 'int' | 'float' | 'bool' | 'str' | 'any';

export const INT_MIN = -2147483648;
export const INT_MAX = 2147483647;

export const sInt = (v: number): ScriptValue => ({ t: 'int', v: v | 0 });
export const sFloat = (v: number): ScriptValue => ({ t: 'float', v: Math.fround(v) });
export const sBool = (v: boolean): ScriptValue => ({ t: 'bool', v });
export const sStr = (v: string): ScriptValue => ({ t: 'str', v });

export function formatValue(v: ScriptValue): string {
  switch (v.t) {
    case 'str': return JSON.stringify(v.v);
    case 'bool': return v.v ? 'TRUE' : 'FALSE';
    case 'float': return Number.isInteger(v.v) ? `${v.v}.0` : String(v.v);
    default: return String(v.v);
  }
}

/** Compile-time error with a source position. */
export class ScriptError extends Error {
  constructor(message: string, readonly line: number, readonly col: number, readonly file = '<script>') {
    super(`${file}:${line}:${col}: ${message}`);
    this.name = 'ScriptError';
  }
}

/** Thrown by the compiler with every error found (not just the first). */
export class CompileErrors extends Error {
  constructor(readonly errors: ScriptError[]) {
    super(errors.map((e) => e.message).join('\n'));
    this.name = 'CompileErrors';
  }
}

/** Bytecode failed verification (bad header, truncated, bad operand, ...). */
export class VerifyError extends Error {
  constructor(message: string, readonly offset = -1) {
    super(offset >= 0 ? `verify @${offset}: ${message}` : `verify: ${message}`);
    this.name = 'VerifyError';
  }
}

/** Runtime error inside one script thread. Fails only that thread. */
export class ScriptRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptRuntimeError';
  }
}

/** Hosts throw this when a script passes a handle that does not exist (stale/destroyed/forged). */
export class ScriptHandleError extends Error {
  constructor(readonly handle: number, what = 'entity') {
    super(`invalid ${what} handle ${handle}`);
    this.name = 'ScriptHandleError';
  }
}

/**
 * Result token for asynchronous natives (dialogue, challenges, chases...).
 * The thread waits until the host resolves (or rejects) it.
 */
export class Pending {
  state: 'pending' | 'resolved' | 'rejected' = 'pending';
  value: ScriptValue | undefined;
  error = '';
  resolve(value?: ScriptValue): void {
    if (this.state !== 'pending') return;
    this.state = 'resolved';
    this.value = value;
  }
  reject(error: string): void {
    if (this.state !== 'pending') return;
    this.state = 'rejected';
    this.error = error;
  }
}
