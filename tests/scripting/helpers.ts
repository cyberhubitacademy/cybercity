import { CompileErrors, MockHost, MockOptions, NativeRegistry, ScriptInstance, ScriptVM, VMOptions, bindGameNatives, compile } from '../../src/scripting';

export function wrap(body: string, name = 't'): string {
  return `SCRIPT_START ${name}\n${body}\nSCRIPT_END\n`;
}

export function compileErrors(src: string): { msg: string; line: number; col: number }[] {
  try {
    compile(src, { file: 'test.scm' });
  } catch (e) {
    if (e instanceof CompileErrors) return e.errors.map((x) => ({ msg: x.message, line: x.line, col: x.col }));
    throw e;
  }
  return [];
}

export interface RunResult {
  vm: ScriptVM;
  host: MockHost;
  inst: ScriptInstance;
  frames: number;
}

export function setup(src: string, mock: MockOptions = {}, vmOpts: VMOptions = {}): RunResult {
  const host = new MockHost(mock);
  const vm = new ScriptVM(bindGameNatives(new NativeRegistry(), host), vmOpts);
  const { bytes } = compile(src, { file: 'test.scm' });
  const inst = vm.start(bytes);
  return { vm, host, inst, frames: 0 };
}

/** Run with fixed 16 ms frames until the instance finishes or maxFrames pass. */
export function run(src: string, mock: MockOptions = {}, vmOpts: VMOptions = {}, maxFrames = 20000): RunResult {
  const r = setup(src, mock, vmOpts);
  while (!r.inst.done && r.frames < maxFrames) { r.vm.update(16); r.frames++; }
  return r;
}

export const tick = () => new Promise<void>((res) => setTimeout(res, 0));

/** Read a local variable by name from the main thread. */
export function local(r: RunResult, name: string) {
  const t = r.inst.threads[0];
  const idx = r.inst.program.localNames.indexOf(name);
  if (idx < 0) throw new Error(`no local ${name}`);
  return t.locals[idx];
}
