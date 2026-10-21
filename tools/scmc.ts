// scmc — Cyber City mission compiler CLI.
//
//   npx vite-node tools/scmc.ts -- <in.scm> [-o out.scmb] [--disasm] [--hex] [--trace] [--no-debug]
//   npx vite-node tools/scmc.ts -- --disasm-file <in.scmb>
//
// Exit code 0 on success, 1 on compile/verify errors (printed as file:line:col: message).
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  CompileErrors, MockHost, NativeRegistry, ScriptDebugger, ScriptVM, VerifyError, bindGameNatives, compile, disassemble, hexDump,
  instructionBytes, verify,
} from '../src/scripting';

function usage(): never {
  console.error('usage: scmc <in.scm> [-o out.scmb] [--disasm] [--hex] [--trace] [--no-debug]\n       scmc --disasm-file <in.scmb>');
  process.exit(2);
}

const argv = process.argv.slice(2).filter((a) => a !== '--');
if (!argv.length) usage();

try {
  if (argv[0] === '--disasm-file') {
    if (!argv[1]) usage();
    const bytes = new Uint8Array(readFileSync(argv[1]));
    console.log(disassemble(bytes));
    process.exit(0);
  }
  const input = argv[0];
  const outIdx = argv.indexOf('-o');
  const out = outIdx >= 0 ? argv[outIdx + 1] : null;
  const src = readFileSync(input, 'utf8');
  const { bytes } = compile(src, { file: input, debug: !argv.includes('--no-debug') });
  const program = verify(bytes);
  if (out) {
    writeFileSync(out, bytes);
    console.log(`wrote ${out} (${bytes.length} bytes, ${program.instructions.length} instructions)`);
  } else {
    console.log(`${basename(input)}: OK — ${bytes.length} bytes, ${program.instructions.length} instructions, ${program.strings.length} strings`);
  }
  if (argv.includes('--hex')) {
    console.log('\n; ---- hex dump ----');
    console.log(hexDump(bytes));
    console.log('\n; ---- instruction bytes ----');
    const ib = instructionBytes(bytes, program);
    program.instructions.forEach((ins, i) => console.log(`${ins.pc.toString(16).padStart(4, '0')}: ${ib[i]}`));
  }
  if (argv.includes('--disasm')) {
    console.log('\n; ---- disassembly ----');
    console.log(disassemble(program));
  }
  if (argv.includes('--trace')) {
    console.log('\n; ---- VM trace (MockHost, 16 ms frames) ----');
    const host = new MockHost();
    const vm = new ScriptVM(bindGameNatives(new NativeRegistry(), host));
    const dbg = new ScriptDebugger();
    dbg.onTrace = (e) => console.log(`t=${String(e.time).padStart(5)}ms  thread ${e.thread}  @${e.pc.toString(16).padStart(4, '0')}  line ${String(e.line).padStart(3)}  ${e.text}`);
    vm.debugger = dbg;
    const inst = vm.start(program);
    let frames = 0;
    while (!inst.done && frames < 20000) { vm.update(16); frames++; }
    console.log(`; outcome: ${inst.outcome}${inst.reason ? ` (${inst.reason})` : ''} after ${frames} frames`);
    console.log('; host calls:');
    for (const c of host.calls) console.log(`;   ${c}`);
  }
} catch (e) {
  if (e instanceof CompileErrors) {
    for (const err of e.errors) console.error(err.message);
    process.exit(1);
  }
  if (e instanceof VerifyError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
