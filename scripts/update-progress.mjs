// Embeds progress-data.js into progress.html so the page works even as a
// static snapshot (no access to sibling files). Run after editing the data.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = readFileSync(resolve(root, 'progress-data.js'), 'utf8');
const htmlPath = resolve(root, 'progress.html');
const html = readFileSync(htmlPath, 'utf8');
const block = `<!--DATA--><script>\n${data}\n</script><!--/DATA-->`;
const out = html.includes('<!--DATA-->')
  ? html.replace(/<!--DATA-->[\s\S]*?<!--\/DATA-->/, block)
  : html.replace(/<script>(\r?\n)  function render/, (_m, nl) => `${block}${nl}<script>${nl}  function render`);
writeFileSync(htmlPath, out);
// Also publish it with the game (https://cyberhubitacademy.github.io/cybercity/progress.html).
writeFileSync(resolve(root, 'public', 'progress.html'), out);
console.log('progress.html updated');
