// SHOPS system ('shops'): clothing stores (Suburban Threads, Ocean Drip),
// Fade Factory barbershop, Ink Tide tattoo parlor and the Masquerade disguise
// shop. Items preview live on Rico (camera swings in front of him), are bought
// with credits, saved via setData('shops'), and worn through the wardrobe.
// Police can query `disguiseLevel()` / `outfitSignature()`.
import type { GameSystem, SystemContext } from '../../game/Systems';
import {
  CATALOG, TATTOO_DESIGNS, TATTOO_SLOTS, applyItem, defaultWardrobe, disguiseLevel, itemById, lookSignature, purchase, removeAccessory,
  sanitizeWardrobe, shopItems, type CatalogItem, type Look, type ShopId, type Slot, type Wardrobe,
} from './catalog';
import { Appearance } from './appearance';
import { emitEvent } from '../life/bus';
import { money, runMenu, splash, type MenuApi, type MenuDef, type MenuRow } from '../life/ui';
import { Culler, facadeNear, iconSprite } from '../life/world';
import { doorFrame } from '../life/props';

interface ShopDef {
  id: ShopId;
  name: string;
  tagline: string;
  color: string;
  icon: string;
  /** Sidewalk point near the storefront. */
  x: number;
  z: number;
}

export const SHOPS: ShopDef[] = [
  { id: 'suburban', name: 'Suburban Threads', tagline: 'Casual & workwear · Downtown', color: '#2a6cc4', icon: '👕', x: 70, z: -89 },
  { id: 'oceandrip', name: 'Ocean Drip', tagline: 'Beachwear & loud prints · Ocean Drive', color: '#19c3d6', icon: '🌺', x: 156.5, z: -62 },
  { id: 'barber', name: 'Fade Factory', tagline: 'Barbershop & salon · Old Town', color: '#e0453a', icon: '💈', x: -110, z: -70.5 },
  { id: 'tattoo', name: 'Ink Tide', tagline: 'Tattoo parlor · Ocean Drive', color: '#7b2cff', icon: '🖋️', x: 156.5, z: -8 },
  { id: 'masks', name: 'Masquerade', tagline: 'Masks & disguises · Byte Bazaar', color: '#ff2fa0', icon: '🎭', x: -16, z: -73.2 },
];

const SLOT_NAMES: Record<Slot, string> = {
  shirt: 'Shirts', pants: 'Pants & Shorts', shoes: 'Shoes', hat: 'Hats', glasses: 'Glasses', mask: 'Masks', hair: 'Hair', beard: 'Facial Hair', tattoo: 'Tattoos',
};

export class ShopsSystem implements GameSystem {
  readonly id = 'shops';
  wardrobe: Wardrobe = defaultWardrobe();
  private ctx: SystemContext | null = null;
  private app: Appearance | null = null;
  private built = false;
  private drift = 0;
  private preview: { x: number; z: number; yaw: number; t: number } | null = null;
  private culler = new Culler();
  readonly places: { id: string; name: string; x: number; z: number; kind: string }[] = [];

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    this.wardrobe = sanitizeWardrobe(ctx.getData('shops', null));
    if (!this.app || this.app.rig !== ctx.world.player.rig) this.app = new Appearance(ctx.world.player.rig);
    this.wear(this.wardrobe.look);
    if (!this.built) {
      this.built = true;
      try { this.buildStores(ctx); } catch (err) { console.error('[shops] build failed', err); }
    }
  }

  // ---------------------------------------------------------------- public API

  /** 0..1 how disguised Rico is (hats, glasses, masks, new hair). */
  disguiseLevel(): number { return disguiseLevel(this.wardrobe.look); }
  /** Changes whenever the visible outfit changes (police "changed clothes" check). */
  outfitSignature(): string { return lookSignature(this.wardrobe.look); }
  look(): Look { return this.wardrobe.look; }
  /** Apply + save a look. */
  setLook(look: Look): void {
    this.wardrobe = { ...this.wardrobe, look };
    this.wear(look);
    this.persist();
  }
  /** Quick-remove all disguise accessories (e.g. after losing the cops). */
  removeDisguise(): void {
    let l = this.wardrobe.look;
    for (const s of ['hat', 'glasses', 'mask'] as const) l = removeAccessory(l, s);
    this.setLook(l);
  }

  update(dt: number): void {
    this.culler.update(this.ctx!.world.player.position.x, this.ctx!.world.player.position.z);
    this.drift += dt;
    if (this.drift > 1 && this.app) {
      this.drift = 0;
      if (this.app.drifted(this.wardrobe.look)) this.wear(this.wardrobe.look);
    }
  }

  always(dt: number, ctx: SystemContext): void {
    const pv = this.preview;
    if (!pv) return;
    pv.t += dt;
    const p = ctx.world.player;
    p.rig.animate(dt, 0);
    const a = pv.yaw + Math.sin(pv.t * 0.35) * 0.45;
    const d = 2.5;
    ctx.camera.position.set(pv.x + Math.sin(a) * d, p.position.y + 1.55, pv.z + Math.cos(a) * d);
    ctx.camera.lookAt(pv.x, p.position.y + 1.25, pv.z);
  }

  private wear(look: Look): void {
    try { this.app?.apply(look); } catch (err) { console.warn('[shops] apply look failed', err); }
  }

  private persist(): void {
    this.ctx?.setData('shops', this.wardrobe);
  }

  // ---------------------------------------------------------------- world

  private buildStores(ctx: SystemContext): void {
    for (const s of SHOPS) {
      const f = facadeNear(ctx.world.city.collision, s.x, s.z, 14);
      const door = f ? { x: f.wx + f.nx * 0.2, z: f.wz + f.nz * 0.2, yaw: f.yaw } : { x: s.x, z: s.z, yaw: 0 };
      const frame = doorFrame(s.name, s.color, 2.6);
      frame.position.set(door.x, 0, door.z);
      frame.rotation.y = door.yaw;
      ctx.scene.add(frame);
      this.culler.add(frame, door.x, door.z, 180);
      const spot = { x: door.x + Math.sin(door.yaw) * 1.6, z: door.z + Math.cos(door.yaw) * 1.6, yaw: door.yaw };
      const icon = iconSprite(s.icon, s.color, 1.3);
      icon.position.set(spot.x, 5.4, spot.z);
      ctx.scene.add(icon);
      this.culler.add(icon, spot.x, spot.z, 70);
      this.places.push({ id: s.id, name: s.name, x: spot.x, z: spot.z, kind: 'shop' });
      ctx.interactions.set({
        id: `shops-${s.id}`, x: spot.x, z: spot.z, radius: 2.6, priority: 1,
        title: `Shop at ${s.name}`, desc: s.tagline,
        enabled: () => !ctx.world.vehicle,
        action: () => void this.openShop(s, spot),
      });
    }
  }

  // ---------------------------------------------------------------- menus

  private startPreview(spot: { x: number; z: number; yaw: number }): void {
    const p = this.ctx!.world.player;
    p.place(spot.x, spot.z, spot.yaw);
    this.preview = { ...spot, t: 0 };
  }

  private stopPreview(): void {
    this.preview = null;
    this.wear(this.wardrobe.look);
  }

  async openShop(s: ShopDef, spot: { x: number; z: number; yaw: number }): Promise<void> {
    const ctx = this.ctx!;
    this.startPreview(spot);
    try {
      await runMenu(ctx, (api) => this.shopRoot(s, api));
    } finally {
      this.stopPreview();
    }
  }

  private shopRoot(s: ShopDef, api: MenuApi): MenuDef {
    const ctx = this.ctx!;
    this.menuApi = api;
    const items = shopItems(s.id);
    if (s.id === 'tattoo') {
      return {
        title: s.name, subtitle: 'Choose a placement', color: s.color,
        rows: () => TATTOO_SLOTS.map((sl): MenuRow => ({
          id: sl.id, label: sl.name, right: this.wardrobe.look.tattoos[sl.id] ? (TATTOO_DESIGNS.find((d) => d.id === this.wardrobe.look.tattoos[sl.id])?.name ?? '') : '—',
          onSelect: () => api.push(this.tattooMenu(s, sl.id, api)),
        })),
      };
    }
    const slots = [...new Set(items.map((i) => i.slot))];
    return {
      title: s.name, subtitle: s.tagline, color: s.color,
      rows: () => slots.map((sl): MenuRow => ({ id: sl, label: SLOT_NAMES[sl], right: '›', onSelect: () => api.push(this.itemMenu(s, sl, items.filter((i) => i.slot === sl))) })),
      side: () => `<h3>WALLET</h3><div style="font:400 30px 'Anton';color:#72cc72">${money(ctx.profile().credits)}</div><div class="cx-muted">Disguise ${Math.round(this.disguiseLevel() * 100)}%</div>`,
    };
  }

  private itemRow(item: CatalogItem, api: MenuApi): MenuRow {
    const ctx = this.ctx!;
    const owned = !item.service && this.wardrobe.owned.includes(item.id);
    const worn = this.isWorn(item);
    return {
      id: item.id, label: item.name,
      right: worn ? '👕 Worn' : owned ? 'Owned' : item.price ? money(item.price) : 'FREE',
      tag: item.disguise ? `${Math.round(item.disguise * 100)}% disguise` : undefined,
      disabled: !owned && ctx.profile().credits < item.price,
      desc: item.service ? 'Service — applied immediately.' : owned ? 'You own this. Select to wear it.' : 'Select to buy and wear.',
      onFocus: () => this.wear(applyItem(this.wardrobe.look, item)),
      onSelect: () => { this.buy(item); api.refresh(); },
    };
  }

  private itemMenu(s: ShopDef, slot: Slot, items: CatalogItem[]): MenuDef {
    const api = this.menuApi!;
    return {
      title: s.name, subtitle: SLOT_NAMES[slot], color: s.color,
      rows: () => {
        const rows = items.map((i) => this.itemRow(i, api));
        if (slot === 'hat' || slot === 'glasses' || slot === 'mask') {
          rows.unshift({ id: 'none', label: `No ${slot}`, right: this.wardrobe.look[slot] ? '' : '✓', onFocus: () => this.wear(removeAccessory(this.wardrobe.look, slot)), onSelect: () => { this.setLook(removeAccessory(this.wardrobe.look, slot)); } });
        }
        return rows;
      },
      onBack: () => this.wear(this.wardrobe.look),
    };
  }

  private menuApi: MenuApi | null = null;

  private tattooMenu(s: ShopDef, slot: string, api: MenuApi): MenuDef {
    this.menuApi = api;
    const items = CATALOG.filter((c) => c.tattoo?.slot === slot);
    return {
      title: s.name, subtitle: TATTOO_SLOTS.find((x) => x.id === slot)?.name ?? slot, color: s.color,
      rows: () => [
        { id: 'remove', label: 'Laser removal', right: this.wardrobe.look.tattoos[slot] ? money(60) : '—', disabled: !this.wardrobe.look.tattoos[slot],
          onFocus: () => { const l = { ...this.wardrobe.look, tattoos: { ...this.wardrobe.look.tattoos } }; delete l.tattoos[slot]; this.wear(l); },
          onSelect: () => {
            if (!this.ctx!.addMoney(-60)) { this.ctx!.notify('Not enough cash.', 'warn'); return; }
            const l = { ...this.wardrobe.look, tattoos: { ...this.wardrobe.look.tattoos } };
            delete l.tattoos[slot];
            this.setLook(l);
            emitEvent({ type: 'money', amount: -60, reason: 'Ink Tide: laser removal' });
          } },
        ...items.map((i) => this.itemRow(i, api)),
      ],
      onBack: () => this.wear(this.wardrobe.look),
    };
  }

  private isWorn(item: CatalogItem): boolean {
    const l = this.wardrobe.look;
    if (item.tattoo) return l.tattoos[item.tattoo.slot] === item.tattoo.design;
    return Object.entries(item.look).every(([k, v]) => (l as unknown as Record<string, unknown>)[k] === v);
  }

  private buy(item: CatalogItem): void {
    const ctx = this.ctx!;
    const r = purchase(this.wardrobe, item.id, ctx.profile().credits);
    if (!r.ok) { ctx.notify(r.reason, 'warn'); ctx.sfx('bad'); return; }
    if (r.spent > 0) {
      ctx.addMoney(-r.spent);
      emitEvent({ type: 'money', amount: -r.spent, reason: `${item.shop === 'tattoo' ? 'Ink Tide' : SHOPS.find((s) => s.id === item.shop)?.name}: ${item.name}` });
      emitEvent({ type: 'purchase', item: item.name, price: r.spent, shop: item.shop });
      ctx.sfx('cash');
      ctx.notify(`Bought ${item.name}  -${money(r.spent)}`, 'money');
      if (item.shop === 'tattoo') splash(ctx, 'Fresh Ink', item.name, '#c27cff');
    } else ctx.sfx('click');
    this.wardrobe = r.wardrobe;
    this.wear(this.wardrobe.look);
    this.persist();
  }

  /** Safehouse wardrobe: wear owned items for free. */
  async openWardrobe(): Promise<void> {
    const ctx = this.ctx!;
    const p = ctx.world.player;
    this.preview = { x: p.position.x, z: p.position.z, yaw: p.yaw, t: 0 };
    try {
      await runMenu(ctx, (api) => {
        this.menuApi = api;
        const slots: Slot[] = ['shirt', 'pants', 'shoes', 'hat', 'glasses', 'mask'];
        return {
          title: 'Wardrobe', subtitle: 'Clothes you own', color: '#c9a27a',
          rows: () => slots.map((sl): MenuRow => ({
            id: sl, label: SLOT_NAMES[sl], right: `${this.wardrobe.owned.filter((id) => itemById(id)?.slot === sl).length} owned ›`,
            onSelect: () => api.push(this.itemMenu({ id: 'suburban', name: 'Wardrobe', tagline: '', color: '#c9a27a', icon: '', x: 0, z: 0 }, sl,
              this.wardrobe.owned.map((id) => itemById(id)).filter((i): i is CatalogItem => !!i && i.slot === sl))),
          })),
        };
      });
    } finally {
      this.stopPreview();
    }
  }

  /** Safehouse mirror: body overview + quick accessory toggles. */
  async openMirror(): Promise<void> {
    const ctx = this.ctx!;
    const life = ctx.system<GameSystem & { bodyPanel?(): string }>('life');
    const p = ctx.world.player;
    this.preview = { x: p.position.x, z: p.position.z, yaw: p.yaw, t: 0 };
    try {
      await runMenu(ctx, {
        title: 'Mirror', subtitle: 'Looking sharp', color: '#d4af37',
        side: () => (life?.bodyPanel?.() ?? '') + `<div class="cx-muted" style="margin-top:8px">Disguise ${Math.round(this.disguiseLevel() * 100)}%</div>`,
        rows: () => [
          { id: 'strip', label: 'Remove hat / glasses / mask', onSelect: () => this.removeDisguise() },
          { id: 'tip', label: 'Train at Muscle Beach or Iron Bay to bulk up. Junk food adds weight.', disabled: true },
        ],
      });
    } finally {
      this.stopPreview();
    }
  }
}

export default function create(): GameSystem {
  return new ShopsSystem();
}
