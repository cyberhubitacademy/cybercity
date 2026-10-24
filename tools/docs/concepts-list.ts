// Writes CONCEPTS.md: everything a player learns by finishing Cyber City (not shown in game).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHALLENGES } from '../../src/cyber/registry';
import { TOPIC_LABELS, type Topic } from '../../src/cyber/types';
import { MISSIONS } from '../../src/missions/data';
import { ARCADE_CATEGORIES, ARCADE_ENTRIES } from '../../src/cyber/arcade';

let md = '# Cyber City — What Players Learn\n\nGenerated from the game\'s content. Not shown in the game.\n';
const byTopic = new Map<Topic, { challenge: string; cards: { title: string; definition: string; bestPractice: string }[] }[]>();
for (const c of CHALLENGES) {
  const list = byTopic.get(c.topic) ?? [];
  list.push({ challenge: c.title, cards: c.conceptCards });
  byTopic.set(c.topic, list);
}
let total = 0;
md += '\n## Concepts by domain (from the hand-built mini-games)\n';
for (const [topic, label] of Object.entries(TOPIC_LABELS) as [Topic, string][]) {
  const list = byTopic.get(topic);
  if (!list) continue;
  md += `\n### ${label}\n`;
  for (const { challenge, cards } of list) {
    md += `\n*Mini-game: ${challenge}*\n\n`;
    for (const k of cards) {
      total++;
      md += `- **${k.title}** — ${k.definition} *Do this:* ${k.bestPractice}\n`;
    }
  }
}
md += `\n**${total} concept cards** across ${byTopic.size} domains.\n`;
md += '\n## Lessons from the story missions\n';
for (const m of MISSIONS) {
  if (!m.learning.length) continue;
  md += `\n**${m.title}**\n${m.learning.map((l) => `- ${l}`).join('\n')}\n`;
}
md += `
## Cyber Arcade: ${ARCADE_ENTRIES.length} extra challenges in ${ARCADE_CATEGORIES.length} areas

`;
for (const c of ARCADE_CATEGORIES) {
  const n = ARCADE_ENTRIES.filter((e) => e.categoryIds.includes(c.id)).length;
  md += `- **${c.title}** (${n} challenges) — ${c.blurb}
`;
}
writeFileSync(resolve(__dirname, '../../CONCEPTS.md'), md);
console.log(`CONCEPTS.md: ${total} concept cards, ${MISSIONS.length} missions`);
