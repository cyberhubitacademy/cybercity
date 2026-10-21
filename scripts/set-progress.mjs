// Usage: node scripts/set-progress.mjs "now text" "Task name prefix=85" ...
// Updates progress-data.js, then re-embeds it into progress.html.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'progress-data.js');
let s = readFileSync(path, 'utf8');
const [now, ...pairs] = process.argv.slice(2);
const stamp = new Date().toLocaleString('en-GB', { hour12: false }).replace(',', '');
const esc = (t) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
if (now) {
  s = s.replace(/now: '(?:[^'\\]|\\.)*'/, `now: '${esc(now)}'`);
  s = s.replace(/updated: '(?:[^'\\]|\\.)*'/, `updated: '${stamp}'`);
}
for (const p of pairs) {
  const i = p.lastIndexOf('=');
  const name = p.slice(0, i), val = Number(p.slice(i + 1));
  const re = new RegExp(`(name: '${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^']*', weight: \\d+, done: )\\d+`);
  if (!re.test(s)) { console.error('no task matching', name); process.exitCode = 1; continue; }
  s = s.replace(re, `$1${val}`);
}
writeFileSync(path, s);
execFileSync(process.execPath, [resolve(root, 'scripts/update-progress.mjs')], { stdio: 'inherit' });
const window = {};
new Function('window', s)(window);
let a = 0, b = 0;
for (const t of window.PROGRESS.tasks) { a += t.weight; b += (t.weight * t.done) / 100; }
console.log(`overall ${((b / a) * 100).toFixed(1)}%`);
