// Generic item storage (safehouse stash). Pure; owned by the life system and
// exposed as `system('life').stash` for other builders (e.g. stolen goods).

export interface StashItem {
  id: string;
  name: string;
  qty: number;
  /** Street value per unit (for fences / selling). */
  value?: number;
  kind?: string;
}

export class Stash {
  items: StashItem[] = [];
  onChange?: () => void;
  constructor(readonly capacity = 60) {}

  load(raw: unknown): void {
    this.items = Array.isArray(raw)
      ? raw.filter((i): i is StashItem => !!i && typeof i.id === 'string' && typeof i.qty === 'number' && i.qty > 0)
        .map((i) => ({ id: i.id, name: String(i.name ?? i.id), qty: Math.floor(i.qty), value: typeof i.value === 'number' ? i.value : undefined, kind: typeof i.kind === 'string' ? i.kind : undefined }))
      : [];
  }

  list(): readonly StashItem[] {
    return this.items;
  }

  total(): number {
    return this.items.reduce((a, b) => a + b.qty, 0);
  }

  count(id: string): number {
    return this.items.find((i) => i.id === id)?.qty ?? 0;
  }

  /** Add items; returns false if the stash is full. */
  add(item: { id: string; name: string; qty?: number; value?: number; kind?: string }): boolean {
    const qty = Math.max(1, Math.floor(item.qty ?? 1));
    if (this.total() + qty > this.capacity) return false;
    const have = this.items.find((i) => i.id === item.id);
    if (have) have.qty += qty;
    else this.items.push({ id: item.id, name: item.name, qty, value: item.value, kind: item.kind });
    this.onChange?.();
    return true;
  }

  /** Remove items; returns false if there weren't enough. */
  remove(id: string, qty = 1): boolean {
    const have = this.items.find((i) => i.id === id);
    if (!have || have.qty < qty) return false;
    have.qty -= qty;
    if (have.qty <= 0) this.items = this.items.filter((i) => i !== have);
    this.onChange?.();
    return true;
  }

  value(): number {
    return this.items.reduce((a, b) => a + (b.value ?? 0) * b.qty, 0);
  }
}
