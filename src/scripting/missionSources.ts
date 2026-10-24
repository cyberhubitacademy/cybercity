import { compile } from './compiler';
import { verify, Program } from './verifier';
import m01 from '../../missions/m01-welcome.scm?raw';
import m02 from '../../missions/m02-phish.scm?raw';
import m03 from '../../missions/m03-wire.scm?raw';
import m04 from '../../missions/m04-walls.scm?raw';
import m05 from '../../missions/m05-chase.scm?raw';
import m06 from '../../missions/m06-payload.scm?raw';
import m07 from '../../missions/m07-footprints.scm?raw';
import m08 from '../../missions/m08-cipher.scm?raw';
import m09 from '../../missions/m09-final.scm?raw';
import sideSocial from '../../missions/side-social.scm?raw';
import sidePassword from '../../missions/side-password.scm?raw';
import sideWifi from '../../missions/side-wifi.scm?raw';
import s2_01 from '../../missions/s2-01.scm?raw';
import s2_02 from '../../missions/s2-02.scm?raw';
import s2_03 from '../../missions/s2-03.scm?raw';
import s2_04 from '../../missions/s2-04.scm?raw';
import s2_05 from '../../missions/s2-05.scm?raw';
import s2_06 from '../../missions/s2-06.scm?raw';
import s2_07 from '../../missions/s2-07.scm?raw';
import s2_08 from '../../missions/s2-08.scm?raw';
import s2_side_1 from '../../missions/s2-side-1.scm?raw';
import s2_side_2 from '../../missions/s2-side-2.scm?raw';

// Mission sources bundled into the build (Vite `?raw`), compiled on first use.
// Compiling at load time keeps the .scm files the single source of truth;
// the bytes still go through the same verifier as precompiled .scmb files.

export const MISSION_SOURCES: Record<string, string> = {
  'm01-welcome': m01,
  'm02-phish': m02,
  'm03-wire': m03,
  'm04-walls': m04,
  'm05-chase': m05,
  'm06-payload': m06,
  'm07-footprints': m07,
  'm08-cipher': m08,
  'm09-final': m09,
  'side-social': sideSocial,
  'side-password': sidePassword,
  'side-wifi': sideWifi,
  's2-01': s2_01,
  's2-02': s2_02,
  's2-03': s2_03,
  's2-04': s2_04,
  's2-05': s2_05,
  's2-06': s2_06,
  's2-07': s2_07,
  's2-08': s2_08,
  's2-side-1': s2_side_1,
  's2-side-2': s2_side_2,
};

const cache = new Map<string, { bytes: Uint8Array; program: Program }>();

/** Compile + verify a bundled mission. Throws CompileErrors / VerifyError. */
export function missionProgram(id: string): Program {
  return missionBytecode(id).program;
}

export function missionBytecode(id: string): { bytes: Uint8Array; program: Program } {
  const hit = cache.get(id);
  if (hit) return hit;
  const src = MISSION_SOURCES[id];
  if (src === undefined) throw new Error(`unknown mission script '${id}'`);
  const { bytes } = compile(src, { file: `missions/${id}.scm` });
  const entry = { bytes, program: verify(bytes) };
  cache.set(id, entry);
  return entry;
}

export const MISSION_IDS = Object.keys(MISSION_SOURCES);
