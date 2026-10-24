// Writes MISSIONS.md: a readable overview of every mission (not shown in game).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MISSIONS } from '../../src/missions/data';
import { CHARACTERS } from '../../src/story/characters';
import { PLACES } from '../../src/world/layout';
import { TERMINALS } from '../../src/world/spots';

const CHALLENGE_NAMES: Record<string, string> = {
  'phishing-1': 'Phishing Detective', 'traffic-1': 'Traffic Investigator', 'firewall-1': 'Firewall Architect',
  'password-1': 'Password Lab', 'social-1': 'Social Engineering Defense', 'malware-1': 'Malware Triage',
  'forensics-1': 'Forensics Timeline', 'crypto-1': 'Cipher Puzzle', 'incident-1': 'Incident Command',
  'detection-1': 'Detection Engineering Lab', 'soc-1': 'SOC Night Shift', 'web-1': 'Web App Defender',
  'cloud-1': 'Cloud Breach', 'ai-1': 'Deepfake CEO & the Poisoned Prompt', 'grid-1': 'Blackout Protocol',
  'supplychain-1': 'Poisoned Package',
};
const who = (id: string | null) => (id ? CHARACTERS[id]?.name ?? id : 'Starts automatically');
const place = (id: string) => PLACES[id]?.name ?? id;
const term = (id: string) => TERMINALS.find((t) => t.id === id)?.name ?? id;

function scriptBeats(id: string): string[] {
  const f = resolve(__dirname, '../../missions', `${id}.scm`);
  if (!existsSync(f)) return [];
  const src = readFileSync(f, 'utf8');
  const beats: string[] = [];
  for (const m of src.matchAll(/SHOW_TITLE\s+"([^"]+)"\s+"([^"]*)"/g)) beats.push(`Title card: **${m[1]}** — ${m[2]}`);
  const moods = [...new Set([...src.matchAll(/MUSIC_CUE\s+"(\w+)"/g)].map((m) => m[1]))];
  if (moods.length) beats.push(`Music: ${moods.join(' → ')}`);
  const shots = [...new Set([...src.matchAll(/CAMERA_SHOT\s+"(\w+)"/g)].map((m) => m[1]))];
  if (shots.length) beats.push(`Camera shots: ${shots.join(', ')}`);
  const weather = [...new Set([...src.matchAll(/SET_WEATHER\s+"(\w+)"/g)].map((m) => m[1]))].filter((w) => w !== 'clear');
  if (weather.length) beats.push(`Weather: ${weather.join(', ')}`);
  if (/CHASE_START/.test(src)) beats.push('Vehicle chase');
  if (/SET_TIMER|COLLECT_START/.test(src)) beats.push('Timed objective');
  if (/SLOW_MOTION/.test(src)) beats.push('Slow-motion moment');
  if (/SPAWN_ENEMY|GIVE_WEAPON/.test(src)) beats.push('Combat');
  return beats;
}

const groups: [string, (c: number | 'side', id: string) => boolean][] = [
  ['Season 1 — Neon Bay', (c, id) => typeof c === 'number' && !id.startsWith('s')],
  ['Season 1 — Side missions', (c, id) => c === 'side' && !id.startsWith('s2') && !id.startsWith('s3')],
  ['Season 2 — Black Lotus', (_c, id) => id.startsWith('s2')],
  ['Season 3 — Physical Threats', (_c, id) => id.startsWith('s3')],
];
let md = `# Cyber City — Mission List\n\nGenerated from the game's mission data (${MISSIONS.length} missions). Not shown in the game.\n`;
let n = 0;
for (const [title, test] of groups) {
  const list = MISSIONS.filter((m) => test(m.chapter, m.id));
  if (!list.length) continue;
  md += `\n## ${title}\n`;
  for (const m of list) {
    n++;
    md += `\n### ${n}. ${m.title}\n`;
    md += `*Mission giver:* ${who(m.giver)} · *Difficulty:* ${'★'.repeat(m.difficulty)}${'☆'.repeat(3 - m.difficulty)} · *Rewards:* ${m.rewards.xp} XP, $${m.rewards.credits}${m.rewards.item ? `, ${m.rewards.item}` : ''}\n\n`;
    md += `${m.summary}\n\n`;
    if (m.briefing.length) md += `> **${who(m.briefing[0].speaker)}:** “${m.briefing[0].text}”\n\n`;
    md += `**What you do**\n`;
    for (const o of m.objectives) {
      let extra = '';
      if (o.type === 'goto') extra = ` (${place(o.place)})`;
      if (o.type === 'talk') extra = ` (${who(o.npc)})`;
      if (o.type === 'challenge') extra = ` — mini-game: **${CHALLENGE_NAMES[o.challenge] ?? o.challenge}** at ${term(o.terminal)}`;
      if (o.type === 'chase') extra = ` — chase, ${o.duration}s limit`;
      if (o.type === 'collect') extra = ` — ${o.items.length} targets${o.timeLimit ? `, ${o.timeLimit}s limit` : ''}`;
      md += `- ${o.text}${extra}\n`;
    }
    const beats = scriptBeats(m.id);
    if (beats.length) md += `\n**Cinematic & gameplay moments**\n${beats.map((b) => `- ${b}`).join('\n')}\n`;
    if (m.learning.length) md += `\n**What you learn**\n${m.learning.map((l) => `- ${l}`).join('\n')}\n`;
  }
}
writeFileSync(resolve(__dirname, '../../MISSIONS.md'), md);
console.log(`MISSIONS.md: ${n} missions`);
