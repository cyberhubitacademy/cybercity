// Weapon table and the pure arsenal logic (ammo, reload, fire rate, spread,
// damage multipliers). No three.js here so it can be unit-tested in node.

export type WeaponId = 'fists' | 'bat' | 'knife' | 'taser' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper';
export type WeaponClass = 'melee' | 'stun' | 'handgun' | 'smg' | 'shotgun' | 'rifle' | 'sniper';
export type UpgradeId = 'suppressor' | 'extmag' | 'scope' | 'tint';
export type HitPart = 'head' | 'body' | 'limb';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  cls: WeaponClass;
  /** Quick slot 1–5 (1 melee, 2 handguns, 3 SMG/shotgun, 4 rifle, 5 sniper). */
  slot: 1 | 2 | 3 | 4 | 5;
  damage: number;
  /** Effective range (m); damage falls off past 60% of it. */
  range: number;
  /** Shots per second. */
  rate: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  /** Spread cone half-angle in radians (hip / aimed / extra while moving). */
  spreadHip: number;
  spreadAim: number;
  spreadMove: number;
  /** Camera kick per shot (radians of pitch). */
  recoil: number;
  pellets: number;
  auto: boolean;
  /** Non-lethal weapons knock out instead of killing. */
  lethal: boolean;
  /** Gunshot hearing radius (m) for enemies, peds and police. 0 for silent. */
  loudness: number;
  price: number;
  /** Price of one magazine of ammo. */
  ammoPrice: number;
  /** Shown in the shop and wheel. */
  blurb: string;
  /** Aim zoom (FOV multiplier, 1 = none). */
  zoom: number;
}

const W = (d: WeaponDef): WeaponDef => d;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: W({ id: 'fists', name: 'Fists', cls: 'melee', slot: 1, damage: 12, range: 1.6, rate: 2.6, magSize: 0, reserveMax: 0, reloadTime: 0, spreadHip: 0, spreadAim: 0, spreadMove: 0, recoil: 0, pellets: 1, auto: false, lethal: true, loudness: 0, price: 0, ammoPrice: 0, blurb: 'Left mouse to punch, again for a combo.', zoom: 1 }),
  bat: W({ id: 'bat', name: 'Baseball Bat', cls: 'melee', slot: 1, damage: 30, range: 2.1, rate: 1.4, magSize: 0, reserveMax: 0, reloadTime: 0, spreadHip: 0, spreadAim: 0, spreadMove: 0, recoil: 0, pellets: 1, auto: false, lethal: true, loudness: 0, price: 120, ammoPrice: 0, blurb: 'Neon Bay Marlins souvenir. Swings hard.', zoom: 1 }),
  knife: W({ id: 'knife', name: 'Knife', cls: 'melee', slot: 1, damage: 40, range: 1.7, rate: 2.0, magSize: 0, reserveMax: 0, reloadTime: 0, spreadHip: 0, spreadAim: 0, spreadMove: 0, recoil: 0, pellets: 1, auto: false, lethal: true, loudness: 0, price: 180, ammoPrice: 0, blurb: 'Quiet and fast. Best for takedowns.', zoom: 1 }),
  taser: W({ id: 'taser', name: 'Stun Gun', cls: 'stun', slot: 2, damage: 100, range: 11, rate: 0.7, magSize: 1, reserveMax: 12, reloadTime: 1.6, spreadHip: 0.02, spreadAim: 0.006, spreadMove: 0.02, recoil: 0.01, pellets: 1, auto: false, lethal: false, loudness: 6, price: 350, ammoPrice: 25, blurb: 'Non-lethal. Drops a target for a clean arrest.', zoom: 0.92 }),
  pistol: W({ id: 'pistol', name: 'Bayside .45 Pistol', cls: 'handgun', slot: 2, damage: 26, range: 45, rate: 4, magSize: 12, reserveMax: 120, reloadTime: 1.3, spreadHip: 0.035, spreadAim: 0.01, spreadMove: 0.03, recoil: 0.025, pellets: 1, auto: false, lethal: true, loudness: 70, price: 600, ammoPrice: 40, blurb: 'Reliable sidearm. Conceals under a shirt.', zoom: 0.88 }),
  smg: W({ id: 'smg', name: 'Riptide SMG', cls: 'smg', slot: 3, damage: 17, range: 35, rate: 11, magSize: 30, reserveMax: 300, reloadTime: 1.8, spreadHip: 0.05, spreadAim: 0.022, spreadMove: 0.03, recoil: 0.014, pellets: 1, auto: true, lethal: true, loudness: 70, price: 1500, ammoPrice: 70, blurb: 'Fast and compact. Great from a car window.', zoom: 0.86 }),
  shotgun: W({ id: 'shotgun', name: 'Breaker Pump Shotgun', cls: 'shotgun', slot: 3, damage: 14, range: 18, rate: 1.1, magSize: 7, reserveMax: 70, reloadTime: 2.4, spreadHip: 0.09, spreadAim: 0.06, spreadMove: 0.02, recoil: 0.07, pellets: 8, auto: false, lethal: true, loudness: 90, price: 1800, ammoPrice: 60, blurb: 'Eight pellets of close-range argument.', zoom: 0.9 }),
  rifle: W({ id: 'rifle', name: 'Mangrove Assault Rifle', cls: 'rifle', slot: 4, damage: 24, range: 80, rate: 8, magSize: 30, reserveMax: 300, reloadTime: 2.1, spreadHip: 0.045, spreadAim: 0.012, spreadMove: 0.035, recoil: 0.018, pellets: 1, auto: true, lethal: true, loudness: 95, price: 3200, ammoPrice: 90, blurb: 'Accurate full-auto. The Black Lotus favorite.', zoom: 0.78 }),
  sniper: W({ id: 'sniper', name: 'Lighthouse Sniper Rifle', cls: 'sniper', slot: 5, damage: 95, range: 220, rate: 0.75, magSize: 5, reserveMax: 40, reloadTime: 2.8, spreadHip: 0.08, spreadAim: 0.0015, spreadMove: 0.06, recoil: 0.08, pellets: 1, auto: false, lethal: true, loudness: 120, price: 5200, ammoPrice: 120, blurb: 'Scoped. One shot, one lesson.', zoom: 0.3 }),
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const FIREARMS: WeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];

export interface UpgradeDef { id: UpgradeId; name: string; price: number; desc: string }
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  suppressor: { id: 'suppressor', name: 'Suppressor', price: 450, desc: 'Gunshots are heard only up to 15 m. Police hear far less.' },
  extmag: { id: 'extmag', name: 'Extended Magazine', price: 380, desc: '+50% magazine size.' },
  scope: { id: 'scope', name: 'Scope', price: 300, desc: 'Tighter aim and extra zoom.' },
  tint: { id: 'tint', name: 'Neon Tint', price: 150, desc: 'Pink and cyan finish. Pure style.' },
};

export const isWeaponId = (s: string): s is WeaponId => s in WEAPONS;
export const isFirearm = (id: WeaponId): boolean => WEAPONS[id].cls !== 'melee';

/** Body-part multiplier (GTA style: headshots hurt). */
export function partMultiplier(def: WeaponDef, part: HitPart): number {
  if (part === 'head') return def.cls === 'sniper' ? 4 : def.cls === 'melee' ? 1.3 : 2.5;
  if (part === 'limb') return 0.7;
  return 1;
}

/** Damage after distance falloff and body part. */
export function damageAt(def: WeaponDef, part: HitPart, dist: number): number {
  const start = def.range * 0.6;
  const fall = dist <= start ? 1 : Math.max(0.35, 1 - (dist - start) / Math.max(1, def.range - start) * 0.65);
  return def.damage * partMultiplier(def, part) * fall;
}

/** Armor soaks 80% of incoming damage until depleted. Returns new health/armor. */
export function applyDamage(health: number, armor: number, dmg: number): { health: number; armor: number } {
  if (dmg <= 0) return { health, armor };
  const soak = Math.min(armor, dmg * 0.8);
  return { health: Math.max(0, health - (dmg - soak)), armor: Math.max(0, armor - soak) };
}

/** Effective spread cone for the current stance. */
export function spreadFor(def: WeaponDef, aiming: boolean, moving: boolean, bloom: number, scoped = false): number {
  const base = aiming ? def.spreadAim * (scoped ? 0.5 : 1) : def.spreadHip;
  return base + (moving ? def.spreadMove : 0) + bloom;
}

export interface WeaponSlotState {
  id: WeaponId;
  mag: number;
  reserve: number;
  upgrades: UpgradeId[];
}

export interface ArsenalSave {
  owned: WeaponSlotState[];
  current: WeaponId;
}

/** The player's (or an enemy's) weapons: ammo, fire timing and reloads. */
export class Arsenal {
  readonly owned = new Map<WeaponId, WeaponSlotState>();
  current: WeaponId = 'fists';
  holstered = false;
  /** Seconds left in the current reload (0 = not reloading). */
  reloadT = 0;
  cooldown = 0;
  /** Spread bloom from sustained fire, decays over time. */
  bloom = 0;

  constructor() {
    this.owned.set('fists', { id: 'fists', mag: 0, reserve: 0, upgrades: [] });
  }

  get def(): WeaponDef { return WEAPONS[this.active]; }
  /** The weapon in hand (fists while holstered). */
  get active(): WeaponId { return this.holstered ? 'fists' : this.current; }
  get state(): WeaponSlotState { return this.owned.get(this.active) ?? { id: 'fists', mag: 0, reserve: 0, upgrades: [] }; }
  get reloading(): boolean { return this.reloadT > 0; }

  has(id: WeaponId): boolean { return this.owned.has(id); }
  hasUpgrade(id: WeaponId, u: UpgradeId): boolean { return this.owned.get(id)?.upgrades.includes(u) ?? false; }

  magSize(id: WeaponId): number {
    const d = WEAPONS[id];
    return this.hasUpgrade(id, 'extmag') ? Math.round(d.magSize * 1.5) : d.magSize;
  }

  /** Give a weapon (or ammo for one already owned). Returns true if it was new. */
  give(id: WeaponId, ammo: number): boolean {
    const d = WEAPONS[id];
    const s = this.owned.get(id);
    if (s) {
      this.addAmmo(id, ammo);
      return false;
    }
    const mag = Math.min(this.magSize(id), Math.max(0, ammo));
    this.owned.set(id, { id, mag, reserve: Math.min(d.reserveMax, Math.max(0, ammo - mag)), upgrades: [] });
    return true;
  }

  addAmmo(id: WeaponId, n: number): number {
    const s = this.owned.get(id);
    if (!s) return 0;
    const d = WEAPONS[id];
    const before = s.reserve;
    s.reserve = Math.min(d.reserveMax, s.reserve + Math.max(0, n));
    return s.reserve - before;
  }

  addUpgrade(id: WeaponId, u: UpgradeId): boolean {
    const s = this.owned.get(id);
    if (!s || s.upgrades.includes(u)) return false;
    s.upgrades.push(u);
    return true;
  }

  select(id: WeaponId): boolean {
    if (!this.owned.has(id)) return false;
    if (this.current !== id) { this.reloadT = 0; this.cooldown = Math.max(this.cooldown, 0.25); }
    this.current = id;
    this.holstered = false;
    return true;
  }

  /** Cycle through owned weapons sharing a quick slot. */
  selectSlot(slot: number): WeaponId | null {
    const list = [...this.owned.keys()].filter((w) => WEAPONS[w].slot === slot);
    if (!list.length) return null;
    const i = list.indexOf(this.current);
    const next = list[(i + 1) % list.length];
    this.select(next);
    return next;
  }

  holster(): void { this.holstered = !this.holstered; this.reloadT = 0; }

  canFire(): boolean {
    const d = this.def;
    if (this.cooldown > 0 || this.reloading) return false;
    if (d.cls === 'melee') return true;
    return this.state.mag > 0;
  }

  /** Consume one shot. Returns false if nothing fired (empty -> auto reload). */
  fire(): boolean {
    if (!this.canFire()) {
      if (!this.reloading && this.def.cls !== 'melee' && this.state.mag <= 0) this.startReload();
      return false;
    }
    const d = this.def;
    this.cooldown = 1 / d.rate;
    if (d.cls !== 'melee') {
      this.state.mag--;
      this.bloom = Math.min(d.spreadHip * 1.5, this.bloom + d.recoil * 0.35);
    }
    return true;
  }

  startReload(): boolean {
    const d = this.def;
    const s = this.state;
    if (d.cls === 'melee' || this.reloading || s.reserve <= 0 || s.mag >= this.magSize(s.id)) return false;
    this.reloadT = d.reloadTime;
    return true;
  }

  /** Advance timers. Returns true on the frame a reload finishes. */
  update(dt: number): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const s = this.state;
        const need = this.magSize(s.id) - s.mag;
        const take = Math.min(need, s.reserve);
        s.mag += take;
        s.reserve -= take;
        return true;
      }
    }
    return false;
  }

  totalAmmo(id: WeaponId): number {
    const s = this.owned.get(id);
    return s ? s.mag + s.reserve : 0;
  }

  /** Busted: police confiscate every firearm and the taser (GTA rules). */
  confiscate(): WeaponId[] {
    const lost: WeaponId[] = [];
    for (const id of [...this.owned.keys()]) {
      if (WEAPONS[id].cls !== 'melee') { this.owned.delete(id); lost.push(id); }
    }
    if (!this.owned.has(this.current)) this.current = 'fists';
    this.reloadT = 0;
    return lost;
  }

  /** True when a firearm is drawn (police react to open carry). */
  openCarry(): boolean {
    const d = this.def;
    return !this.holstered && d.cls !== 'melee' && d.cls !== 'stun' && d.id !== 'pistol';
  }

  save(): ArsenalSave {
    return { owned: [...this.owned.values()].map((s) => ({ ...s, upgrades: [...s.upgrades] })), current: this.current };
  }

  load(data: ArsenalSave | null | undefined): void {
    this.owned.clear();
    this.owned.set('fists', { id: 'fists', mag: 0, reserve: 0, upgrades: [] });
    if (data && Array.isArray(data.owned)) {
      for (const s of data.owned) {
        if (!s || !isWeaponId(s.id)) continue;
        const d = WEAPONS[s.id];
        this.owned.set(s.id, {
          id: s.id,
          mag: Math.max(0, Math.min(Math.round(d.magSize * 1.5), Number(s.mag) || 0)),
          reserve: Math.max(0, Math.min(d.reserveMax, Number(s.reserve) || 0)),
          upgrades: (Array.isArray(s.upgrades) ? s.upgrades : []).filter((u): u is UpgradeId => u in UPGRADES),
        });
      }
    }
    this.current = data && isWeaponId(data.current) && this.owned.has(data.current) ? data.current : 'fists';
  }
}
