// Contextual "press E" interactions. Each frame the game registers what's
// nearby; the closest valid target in range is shown in the prompt and
// fires on E.

export interface Interactable {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Prompt title, e.g. "Talk to Max Cortez". */
  title: string;
  /** One line about what happens. */
  desc?: string;
  key?: string;
  priority?: number;
  enabled?: () => boolean;
  action: () => void;
}

export class Interactions {
  private items = new Map<string, Interactable>();

  set(i: Interactable): void {
    this.items.set(i.id, i);
  }

  remove(id: string): void {
    this.items.delete(id);
  }

  removePrefix(prefix: string): void {
    for (const id of [...this.items.keys()]) if (id.startsWith(prefix)) this.items.delete(id);
  }

  /** Best target for a player at (x, z): closest in range, higher priority wins ties. */
  best(x: number, z: number): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const i of this.items.values()) {
      if (i.enabled && !i.enabled()) continue;
      const d = Math.hypot(i.x - x, i.z - z);
      if (d > i.radius) continue;
      const score = d - (i.priority ?? 0) * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }
}
