import './mute'; // must stay first: ?mute=1 silences everything before audio code loads
import './styles.css';
import { Game } from './game/Game';
import { ASSETS } from './assets/Assets';

// Entry point. Shows a readable message instead of a blank page if WebGL is missing.

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

if (!webglAvailable()) {
  ui.innerHTML = '<div class="panel" style="margin:20vh auto;max-width:520px;padding:24px;text-align:center"><h2 class="neon-title">Cyber City</h2><p>This game needs a browser with WebGL2 (Chrome, Edge, Firefox or Safari 15+). Try enabling hardware acceleration.</p></div>';
} else {
  void boot();
}

async function boot(): Promise<void> {
  // Download the 3D asset pack first (people, cars, textures, skies), with a progress bar.
  const loader = document.createElement('div');
  loader.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#3a1260,#0b0a24);z-index:100;font-family:Bungee,Impact,sans-serif;color:#fff;text-align:center';
  loader.innerHTML = '<div><div style="font-size:clamp(40px,8vw,84px);background:linear-gradient(90deg,#ff2fa0,#ff8a3d,#ffd23f);-webkit-background-clip:text;background-clip:text;color:transparent">CYBER CITY</div><div id="ld-text" style="font-family:Rajdhani,sans-serif;font-size:18px;margin:14px 0 10px;color:#8ff4ff">Loading Neon Bay…</div><div style="width:min(420px,80vw);height:8px;border-radius:6px;background:#ffffff22;overflow:hidden;margin:auto"><div id="ld-bar" style="height:100%;width:0;background:linear-gradient(90deg,#19e6ff,#ff2fa0);transition:width .2s"></div></div></div>';
  document.body.append(loader);
  const bar = loader.querySelector('#ld-bar') as HTMLElement;
  const text = loader.querySelector('#ld-text') as HTMLElement;
  await ASSETS.load(import.meta.env.BASE_URL, (pct, label) => {
    bar.style.width = `${Math.round(pct * 100)}%`;
    text.textContent = `Loading ${label}… ${Math.round(pct * 100)}%`;
  });
  loader.remove();
  try {
    const game = new Game(canvas, ui);
    if (import.meta.env.DEV) {
      // Dev-only helper used to capture review drafts into ./drafts.
      const w = window as unknown as { game: Game; saveDraft: (name: string) => Promise<string> };
      w.game = game;
      w.saveDraft = async (name: string) => {
        game.step(0.016);
        const data = game.renderer.renderer.domElement.toDataURL('image/jpeg', 0.9);
        const r = await fetch(`/__drafts?name=${encodeURIComponent(name)}`, { method: 'POST', body: data });
        return r.text();
      };
    }
  } catch (err) {
    console.error(err);
    ui.innerHTML = `<div class="panel" style="margin:20vh auto;max-width:560px;padding:24px"><h2 class="neon-title">Something broke</h2><pre style="white-space:pre-wrap">${String(err)}</pre></div>`;
  }
}
