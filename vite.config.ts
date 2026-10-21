import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Dev-only: lets the running game save screenshots into ./drafts so build
// progress can be reviewed (progress.html shows them as a gallery).
function draftSaver(): Plugin {
  const dir = resolve(__dirname, 'drafts');
  return {
    name: 'draft-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__drafts', (req, res) => {
        if (req.method === 'GET') {
          mkdirSync(dir, { recursive: true });
          const files = readdirSync(dir).filter((f) => f.endsWith('.jpg') || f.endsWith('.png')).sort();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
          return;
        }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        const url = new URL(req.url ?? '', 'http://x');
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^a-z0-9_-]/gi, '');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${name}.jpg`), Buffer.from(b64, 'base64'));
          res.end('saved');
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [draftSaver()],
  server: { port: 5199, open: false, watch: { ignored: ['**/drafts/**'] } },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
