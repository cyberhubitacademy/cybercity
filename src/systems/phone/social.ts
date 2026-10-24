// NeonFeed: procedurally generated social posts reacting to game events. Pure.
import type { CcEvent } from '../life/bus';

export interface Post {
  id: string;
  author: string;
  handle: string;
  color: string;
  text: string;
  /** Real ms timestamp. */
  time: number;
  likes: number;
  targetLikes: number;
  liked: boolean;
  /** Gallery photo id when Rico shares a picture. */
  photo?: string;
  mine?: boolean;
}

export const LOCALS: { author: string; handle: string; color: string }[] = [
  { author: 'Beach Bum', handle: '@beachbum86', color: '#ff8a3d' },
  { author: 'Neon Nancy', handle: '@neonnancy', color: '#ff2fa0' },
  { author: 'Tony Turbo', handle: '@turbotony', color: '#e0453a' },
  { author: 'Gina from Old Town', handle: '@oldtowngina', color: '#ffd23f' },
  { author: 'Harbor Hank', handle: '@harborhank', color: '#3dffb0' },
  { author: 'Cyber Sal', handle: '@cybersal', color: '#19e6ff' },
  { author: 'Neon Bay News', handle: '@NBNews', color: '#f4f4f4' },
  { author: 'Flamingo Fan', handle: '@pinkfeathers', color: '#ff6fb5' },
  { author: 'Gym Rat Gus', handle: '@gusliftz', color: '#c27cff' },
  { author: 'Bird Watcher Bea', handle: '@beabirds', color: '#9be15d' },
];

export const CAST_HANDLES: Record<string, { author: string; handle: string; color: string }> = {
  max: { author: 'Max Cortez', handle: '@SunsetShieldMax', color: '#19e6ff' },
  carla: { author: 'Carla Reyes', handle: '@CoralCafeCarla', color: '#ff7f6b' },
  dex: { author: 'Dex Holloway', handle: '@dex_soc', color: '#7b2cff' },
  priya: { author: 'Priya Shah', handle: '@priya_pwns', color: '#ffd23f' },
  tito: { author: 'Tito Ramos', handle: '@titoroutes', color: '#3dffb0' },
  skye: { author: 'Skye Navarro', handle: '@skye_lifeguard', color: '#ff8a3d' },
  ruby: { author: 'Ruby Lane', handle: '@djrubylane', color: '#ff2fa0' },
};

type Template = { who: 'local' | string; text: string };

const T: Record<string, Template[]> = {
  'mission-complete': [
    { who: 'max', text: 'Proud of my analyst today. {title} — handled. #SunsetShield' },
    { who: 'local', text: 'Heard Sunset Shield stopped something big. "{title}"? Whatever it was, thanks Rico 🙏' },
    { who: 'local', text: 'My bank app works again. Somebody give that Rico Vega a raise. #{tag}' },
    { who: 'carla', text: 'Free café con leche for Rico tomorrow. He knows why. ☕' },
  ],
  'race-won': [
    { who: 'local', text: 'Just watched a guy in a Hawaiian shirt win {name} like it was nothing 🏁' },
    { who: 'local', text: 'Who let Rico drive?? He won {name}. Speed demon.' },
  ],
  crime: [
    { who: 'local', text: 'Uh… someone just pulled a {crime} near me. Neon Bay is WILD tonight 😳' },
    { who: 'local', text: 'Cops everywhere downtown. Reports of a {crime}. Stay safe y\'all.' },
    { who: 'local', text: 'Saw a guy in a loud shirt do a {crime}. Fashion crimes too tbh.' },
  ],
  wanted: [{ who: 'local', text: 'Helicopter over the city again. Somebody is in BIG trouble 🚁' }],
  busted: [{ who: 'local', text: 'Ha! They finally caught the guy. #NeonBayPD' }],
  wasted: [{ who: 'local', text: 'Ambulance sirens on Ocean Drive… hope everyone\'s ok' }],
  stunt: [{ who: 'local', text: 'Did that car just FLY?? {name} 🤯' }],
  purchase: [
    { who: 'local', text: 'Spotted someone dropping ${price} on {item}. Ballin\' 💸' },
    { who: 'local', text: 'New fit alert: {item}. The Neon Bay drip is real.' },
  ],
  workout: [
    { who: 'local', text: 'This dude at the gym is getting HUGE. {exercise} PR? 💪' },
    { who: 'local', text: 'Leg day at Muscle Beach. Somebody\'s grinding hard today.' },
  ],
  meal: [{ who: 'local', text: 'Best {item} in town, no debate. 🌮' }],
  fish: [
    { who: 'local', text: 'Somebody just pulled a {weight} kg {species} off Starlight Pier 🎣 ({rarity}!)' },
    { who: 'local', text: 'Fishing at the pier today. Guy next to me caught a {species}. I caught a boot.' },
  ],
  animal: [
    { who: 'local', text: 'Cutest thing: a guy in a Hawaiian shirt just stopped to pet a {species} 🥹' },
    { who: 'local', text: 'Gator spotted near the harbor again 🐊 keep your toes out of the water!' },
  ],
  photo: [{ who: 'local', text: 'Neon Bay sunsets hit different 🌅' }],
  hangout: [{ who: '{with}', text: 'Great time with Rico at the {activity} today! 😄' }],
  activity: [
    { who: 'local', text: '{name} at the beach today. Somebody posted a score of {score}! 🔥' },
  ],
  relationship: [{ who: '{with}', text: 'Rico is officially my {level}. ✨' }],
  sleep: [],
  money: [],
};

const AMBIENT: Template[] = [
  { who: 'local', text: 'Ocean Drive at sunset >>> everything else 🌴' },
  { who: 'local', text: 'Reminder: never click links in texts from "Neon Bay Bank". It\'s always a scam.' },
  { who: 'local', text: 'Taco Loco truck is back on the beach!! 🌮🌮🌮' },
  { who: 'local', text: 'Seagull stole my fries. Again.' },
  { who: 'local', text: 'Club Afterglow tonight? DJ Ruby is spinning 🎛️' },
  { who: 'ruby', text: 'Afterglow tonight. New synthwave set. Dress loud. 💜' },
  { who: 'skye', text: 'Red flags up at Neon Beach — strong currents today. Swim near the towers! 🚩' },
  { who: 'local', text: 'Who else saw the alligator by the harbor?? 🐊' },
  { who: 'priya', text: 'Byte Bazaar has new retro hardware in. Come nerd out.' },
  { who: 'local', text: 'Pigeons downtown have no fear. They own the place.' },
];

function fill(text: string, e: CcEvent): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = e[k];
    if (k === 'tag') return String(e.title ?? 'NeonBay').replace(/[^A-Za-z]/g, '') || 'NeonBay';
    return v === undefined ? (k === 'name' ? 'the race' : k === 'crime' ? 'robbery' : k) : String(v);
  });
}

/** Up to `max` post drafts reacting to an event. rnd: 0..1 generator. */
export function postsForEvent(e: CcEvent, rnd: () => number, now: number, max = 2): Post[] {
  if (e.type === 'post') {
    return [mk({ author: String(e.author ?? 'Someone'), handle: String(e.handle ?? '@neonbay'), color: '#ffffff' }, String(e.text ?? ''), rnd, now)];
  }
  const list = T[e.type];
  if (!list || !list.length) return [];
  const out: Post[] = [];
  const n = Math.min(max, list.length, 1 + (rnd() < 0.4 ? 1 : 0));
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let k = Math.floor(rnd() * list.length);
    for (let tries = 0; used.has(k) && tries < 5; tries++) k = (k + 1) % list.length;
    used.add(k);
    const t = list[k];
    out.push(mk(authorFor(t.who, e, rnd), fill(t.text, e), rnd, now));
  }
  return out;
}

export function ambientPost(rnd: () => number, now: number): Post {
  const t = AMBIENT[Math.floor(rnd() * AMBIENT.length)];
  return mk(authorFor(t.who, { type: 'ambient' }, rnd), t.text, rnd, now);
}

function authorFor(who: string, e: CcEvent, rnd: () => number): { author: string; handle: string; color: string } {
  if (who === 'local') return LOCALS[Math.floor(rnd() * LOCALS.length)];
  const id = who.startsWith('{') ? String(e[who.slice(1, -1)] ?? '') : who;
  return CAST_HANDLES[id] ?? LOCALS[Math.floor(rnd() * LOCALS.length)];
}

let seq = 0;
function mk(a: { author: string; handle: string; color: string }, text: string, rnd: () => number, now: number): Post {
  return { id: `p${now.toString(36)}${(seq++).toString(36)}`, ...a, text, time: now, likes: 0, targetLikes: 3 + Math.floor(rnd() * rnd() * 400), liked: false };
}

/** Likes trickle in towards the target (fast at first). */
export function growLikes(p: Post, dtSec: number): void {
  if (p.likes >= p.targetLikes) return;
  const rate = Math.max(0.2, (p.targetLikes - p.likes) * 0.08);
  p.likes = Math.min(p.targetLikes, p.likes + rate * dtSec);
}

/** Rico's own photo post: likes scale with what's in it. */
export function photoPost(photoId: string, caption: string, animals: string[], followers: number, rnd: () => number, now: number): Post {
  const base = 10 + followers * 0.15 + animals.length * 40;
  return {
    id: `me${now.toString(36)}`, author: 'Rico Vega', handle: '@rico_vega', color: '#1fb5c9', text: caption, time: now,
    likes: 0, targetLikes: Math.round(base * (0.6 + rnd() * 0.9)), liked: false, photo: photoId, mine: true,
  };
}

export function timeAgo(now: number, t: number): string {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
