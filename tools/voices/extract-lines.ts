// Collects every spoken line in the game into tools/voices/lines.json for the
// Piper voice generator. Run: npx vite-node tools/voices/extract-lines.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHARACTERS, ENDING_CUTSCENE, INTRO_CUTSCENE, PEDESTRIAN_LINES, SCRIPT_LINES, type DialogueLine } from '../../src/story/characters';
import { MISSIONS } from '../../src/missions/data';
import { voiceKey } from '../../src/audio/voiceKey';

const out = new Map<string, { key: string; speaker: string; text: string }>();
const add = (l: DialogueLine) => {
  const key = voiceKey(l.speaker, l.text);
  out.set(key, { key, speaker: l.speaker, text: l.text });
};
[...INTRO_CUTSCENE, ...ENDING_CUTSCENE].forEach(add);
Object.values(SCRIPT_LINES).flat().forEach(add);
for (const m of MISSIONS) {
  m.briefing.forEach(add);
  m.completion.forEach(add);
  for (const o of m.objectives) if (o.type === 'talk') o.lines.forEach(add);
}
for (const c of Object.values(CHARACTERS)) [...c.greeting, ...c.idle].forEach((text) => add({ speaker: c.id, text }));
PEDESTRIAN_LINES.forEach((text) => add({ speaker: 'Local', text }));
const lines = [...out.values()];
writeFileSync(resolve(__dirname, 'lines.json'), JSON.stringify(lines, null, 1));
console.log(`${lines.length} lines, ${lines.reduce((n, l) => n + l.text.length, 0)} characters`);
