import type { UI } from '../ui/UI';
import type { PlayerProfile } from '../progression/types';
import type { ChallengeDefinition } from '../cyber/types';

interface ArcadeModule {
  arcadeChallenge: (entryId: string) => ChallengeDefinition;
  mountArcadeBoard: (root: HTMLElement, opts: { progress: Record<string, { best: number }>; onPlay: (entryId: string) => void }) => () => void;
}

// import.meta.glob keeps the build working even when the arcade module is absent.
const arcadeModules = import.meta.glob<ArcadeModule>('../cyber/arcade/index.ts');

async function loadArcade(): Promise<ArcadeModule | null> {
  const load = Object.values(arcadeModules)[0];
  return load ? load() : null;
}

// Full-screen Cyber Arcade board. Picking an entry closes the board, runs the
// challenge through the normal challenge shell, then reopens the board.

function bestScores(profile: PlayerProfile): Record<string, { best: number }> {
  const out: Record<string, { best: number }> = {};
  for (const h of profile.challengeHistory) {
    if (!h.id.startsWith('arcade:')) continue;
    const id = h.id.slice('arcade:'.length);
    out[id] = { best: Math.max(out[id]?.best ?? 0, h.score) };
  }
  return out;
}

export async function openArcade(ui: UI, profile: PlayerProfile, play: (def: ChallengeDefinition) => Promise<void>): Promise<void> {
  const arcade = await loadArcade();
  if (!arcade) {
    ui.notify('The Cyber Arcade is still being installed in this build.', 'info');
    return;
  }
  const { arcadeChallenge, mountArcadeBoard } = arcade;
  for (;;) {
    const picked = await new Promise<string | null>((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'arcade-overlay panel';
      overlay.style.cssText = 'position:fixed;inset:3vh 3vw;z-index:60;display:flex;flex-direction:column;overflow:hidden;';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;justify-content:flex-end;padding:8px 10px 0;';
      const close = document.createElement('button');
      close.className = 'cx-btn';
      close.textContent = 'Close (Esc)';
      bar.append(close);
      const root = document.createElement('div');
      root.style.cssText = 'flex:1;overflow:auto;padding:0 14px 14px;';
      overlay.append(bar, root);
      document.getElementById('ui')?.append(overlay);
      let cleanup: () => void = () => undefined;
      const done = (v: string | null) => {
        window.removeEventListener('keydown', onKey, true);
        cleanup();
        overlay.remove();
        resolve(v);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Escape') { e.stopPropagation(); done(null); }
      };
      window.addEventListener('keydown', onKey, true);
      close.onclick = () => done(null);
      cleanup = mountArcadeBoard(root, { progress: bestScores(profile), onPlay: (id) => done(id) });
    });
    if (!picked) return;
    await play(arcadeChallenge(picked));
  }
}
