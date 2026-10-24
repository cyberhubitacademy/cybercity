// Cyber City game-event bus. Any system can post what just happened in the
// world; the phone (NeonFeed social posts, bank log, texts), relationships and
// wildlife log listen. Transport: a window CustomEvent named 'cc:event'.
//
//   window.dispatchEvent(new CustomEvent('cc:event', { detail: { type: 'race-won', name: 'Ocean Drive Sprint' } }))
//
// Known event types (extra fields are optional unless noted):
//   mission-complete { id: string; title?: string }
//   race-won         { name?: string; position?: number; prize?: number }
//   crime            { crime: string (e.g. 'carjack' | 'robbery' | 'assault' | 'vandalism'); x?: number; z?: number }
//   wanted           { level: number }          (police: wanted level changed)
//   busted / wasted  {}                         (arrested / hospitalized)
//   stunt            { name?: string; score?: number }
//   purchase         { item: string; price: number; shop?: string }
//   money            { amount: number; reason: string }   (bank log line; negative = spent)
//   meal             { item: string; place?: string }
//   workout          { exercise: string; score: number }
//   fish             { species: string; rarity: string; weight: number }
//   photo            { animals: string[]; selfie?: boolean; shared?: boolean }
//   animal           { action: 'pet' | 'adopt' | 'observe' | 'bitten'; species: string }
//   hangout          { with: string; activity: string }
//   activity         { name: string; score?: number; win?: boolean }
//   relationship     { with: string; level: string }
//   sleep            { hours: number }
//   post             { author: string; text: string; handle?: string }  (any system can post to NeonFeed directly)

export const CC_EVENT = 'cc:event';
export const CC_OPEN_MAP = 'cc:open-map';

export interface CcEvent {
  type: string;
  [key: string]: unknown;
}

export function emitEvent(detail: CcEvent): void {
  try {
    window.dispatchEvent(new CustomEvent<CcEvent>(CC_EVENT, { detail }));
  } catch {
    /* non-browser (tests) */
  }
}

/** Subscribe to the bus; returns an unsubscribe function. Malformed payloads are dropped. */
export function onEvent(fn: (e: CcEvent) => void): () => void {
  const h = (ev: Event): void => {
    const e = normalizeEvent((ev as CustomEvent<unknown>).detail);
    if (e) fn(e);
  };
  window.addEventListener(CC_EVENT, h);
  return () => window.removeEventListener(CC_EVENT, h);
}

/** Validate an arbitrary payload into a CcEvent (pure, used by listeners + tests). */
export function normalizeEvent(raw: unknown): CcEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== 'string' || !r.type) return null;
  const out: CcEvent = { type: r.type.slice(0, 40) };
  for (const [k, v] of Object.entries(r)) {
    if (k === 'type') continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 20);
  }
  return out;
}

export function str(e: CcEvent, k: string, fallback = ''): string {
  const v = e[k];
  return typeof v === 'string' ? v : fallback;
}

export function num(e: CcEvent, k: string, fallback = 0): number {
  const v = e[k];
  return typeof v === 'number' ? v : fallback;
}
