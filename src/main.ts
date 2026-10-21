import './styles.css';
import { Game } from './game/Game';

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
