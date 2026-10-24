import { describe, expect, it } from 'vitest';
import { accuracy, comboScore, grade, newTally, rhythmJudge, shotOutcome, idealPower, tallyHit, timingQuality, needleAt } from '../src/systems/activities/scoring';
import { SPECIES, biteDelay, fishValue, newReel, reelStep, rollSpecies, speciesOdds } from '../src/systems/activities/fishing';
import { HOLES, TABLE, judgeShot, putt, rack, shoot, stepGolf, stepPool, moving } from '../src/systems/activities/physics2d';
import { PEOPLE, accepts, addPoints, decay, giftReaction, hintsFrom, levelOf, newRel, canDate } from '../src/systems/activities/relationships';
import { CATALOG, defaultWardrobe, disguiseLevel, lookSignature, purchase, removeAccessory } from '../src/systems/shops/catalog';
import { photograph, observe, gatorBites, shouldFlee } from '../src/systems/animals/wildlife';
import { postsForEvent, growLikes } from '../src/systems/phone/social';
import { dueTexts, deliver, reply } from '../src/systems/phone/messages';
import { podcastLines } from '../src/systems/phone/podcast';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('minigame scoring', () => {
  it('timing quality peaks at the zone center', () => {
    expect(timingQuality(0.5, 0.5, 0.1)).toBe(1);
    expect(timingQuality(0.58, 0.5, 0.1)).toBeGreaterThan(0);
    expect(timingQuality(0.7, 0.5, 0.1)).toBeLessThan(0);
    expect(needleAt(0.5, 1)).toBeCloseTo(0.5);
    expect(needleAt(1.5, 1)).toBeCloseTo(0.5);
  });
  it('rhythm judgments, combos and grades', () => {
    expect(rhythmJudge(10)).toBe('perfect');
    expect(rhythmJudge(-80)).toBe('great');
    expect(rhythmJudge(130)).toBe('good');
    expect(rhythmJudge(300)).toBe('miss');
    const t = newTally();
    for (let i = 0; i < 9; i++) tallyHit(t, 'perfect');
    tallyHit(t, 'miss');
    expect(t.maxCombo).toBe(9);
    expect(t.combo).toBe(0);
    expect(accuracy(t)).toBeCloseTo(0.9);
    expect(grade(0.95)).toBe('S');
    expect(grade(0.3)).toBe('D');
  });
  it('combo score rewards accuracy and speed', () => {
    expect(comboScore(4, 4, 0.5, 3)).toBeGreaterThan(comboScore(4, 4, 2.9, 3));
    expect(comboScore(2, 4, 0.5, 3)).toBeLessThan(comboScore(4, 4, 0.5, 3));
  });
  it('basketball shots', () => {
    const ideal = idealPower(4.6);
    expect(shotOutcome(ideal, ideal)).toBe('swish');
    expect(shotOutcome(ideal + 0.3, ideal)).toBe('miss');
  });
});

describe('fishing odds', () => {
  it('odds sum to 1 and night favors night fish', () => {
    const day = speciesOdds(12), night = speciesOdds(23);
    expect(day.reduce((a, b) => a + b.p, 0)).toBeCloseTo(1);
    const koi = (o: typeof day) => o.find((x) => x.species.id === 'neonkoi')!.p;
    expect(koi(night)).toBeGreaterThan(koi(day));
    const mahi = (o: typeof day) => o.find((x) => x.species.id === 'mahi')!.p;
    expect(mahi(day)).toBeGreaterThan(mahi(night));
  });
  it('legendary fish are rare over many rolls', () => {
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    let legendary = 0;
    for (let i = 0; i < 5000; i++) if (rollSpecies(rnd, 23).rarity === 'legendary') legendary++;
    expect(legendary / 5000).toBeLessThan(0.06);
    expect(legendary).toBeGreaterThan(0);
  });
  it('bite delay, value and reel fight', () => {
    expect(biteDelay(() => 0.5, 1, 6)).toBeLessThan(biteDelay(() => 0.5, 0, 12));
    expect(fishValue(SPECIES[0], 2)).toBe(16);
    const r = newReel();
    // smart reeling: hold while tension low, release when high
    for (let i = 0; i < 2000 && !r.landed && !r.snapped; i++) reelStep(r, 1 / 60, r.tension < 0.6, 0.3, 0.5);
    expect(r.landed).toBe(true);
    const r2 = newReel();
    for (let i = 0; i < 600 && !r2.snapped; i++) reelStep(r2, 1 / 60, true, 0.8, 1);
    expect(r2.snapped).toBe(true);
  });
});

describe('2D physics', () => {
  it('pool balls collide, slow down and pocket', () => {
    const balls = rack();
    expect(balls).toHaveLength(16);
    shoot(balls[0], 0, 1);
    let potted: number[] = [];
    for (let i = 0; i < 1200 && moving(balls); i++) potted = potted.concat(stepPool(balls, 1 / 60));
    expect(moving(balls)).toBe(false);
    expect(balls.slice(1).some((b) => b.x < TABLE.w * 0.68 || b.pocketed)).toBe(true);
  });
  it('8-ball rules', () => {
    expect(judgeShot(null, [3], 3, 7).assigned).toBe('solids');
    expect(judgeShot('solids', [3], 3, 6).continueTurn).toBe(true);
    expect(judgeShot('solids', [0], 3, 6).foul).toBe(true);
    expect(judgeShot('solids', [8], 8, 0).over).toBe('win');
    expect(judgeShot('solids', [8], 8, 3).over).toBe('loss');
  });
  it('golf ball can be holed on the straight hole', () => {
    const h = HOLES[0];
    const b = { x: h.start[0], y: h.start[1], vx: 0, vy: 0, sunk: false };
    putt(b, 0, 0.62);
    let r = 'rolling', t = 0;
    for (let i = 0; i < 1500 && r === 'rolling'; i++) { t += 1 / 60; r = stepGolf(b, h, 1 / 60, t); }
    expect(['sunk', 'stopped']).toContain(r);
  });
});

describe('relationships', () => {
  it('levels and progression', () => {
    const r = newRel();
    expect(levelOf(r.points).name).toBe('Acquaintance');
    expect(addPoints(r, 20, 1)).toBe(true);
    expect(levelOf(r.points).name).toBe('Friend');
    decay(r, 10);
    expect(r.points).toBeLessThan(38);
    expect(r.points).toBeGreaterThanOrEqual(15);
  });
  it('gifts, hints, dating, availability', () => {
    const skye = PEOPLE.find((p) => p.id === 'skye')!;
    expect(giftReaction(skye, 'flowers').kind).toBe('love');
    expect(giftReaction(skye, 'hotsauce').kind).toBe('meh');
    const r = newRel(false);
    expect(accepts(skye, r, 12, false).ok).toBe(false);
    r.met = true;
    expect(accepts(skye, r, 12, false).ok).toBe(true);
    expect(accepts(skye, r, 3, false).ok).toBe(false);
    expect(hintsFrom(r)).toBe(0);
    r.points = 70;
    expect(hintsFrom(r)).toBe(1);
    expect(canDate(skye, r)).toBe(true);
  });
});

describe('shops', () => {
  it('buys, owns and re-wears for free', () => {
    const w = defaultWardrobe();
    const r = purchase(w, 'haw-sunset', 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spent).toBe(85);
    expect(r.wardrobe.owned).toContain('haw-sunset');
    expect(r.wardrobe.look.shirt).toBe('#ff8a3d');
    const again = purchase(r.wardrobe, 'haw-sunset', 0);
    expect(again.ok && again.spent).toBe(0);
    expect(purchase(w, 'ski', 10).ok).toBe(false);
  });
  it('disguise level and outfit signature', () => {
    const w = defaultWardrobe();
    expect(disguiseLevel(w.look)).toBe(0);
    const r = purchase(w, 'ski', 100);
    if (!r.ok) throw new Error('buy failed');
    expect(disguiseLevel(r.wardrobe.look)).toBeGreaterThan(0.6);
    expect(lookSignature(r.wardrobe.look)).not.toBe(lookSignature(w.look));
    expect(disguiseLevel(removeAccessory(r.wardrobe.look, 'mask'))).toBe(0);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
  });
});

describe('wildlife', () => {
  it('logs sightings and pays photo rewards once', () => {
    const log = {};
    expect(observe(log, 'cat')).toBe(true);
    expect(observe(log, 'cat')).toBe(false);
    const a = photograph(log, ['cat', 'alligator']);
    expect(a.newSpecies).toEqual(['cat', 'alligator']);
    expect(a.reward).toBe(150);
    expect(photograph(log, ['cat']).reward).toBe(0);
  });
  it('flee + bite rules', () => {
    expect(shouldFlee(5, 6)).toBe(true);
    expect(shouldFlee(5, 1)).toBe(false);
    expect(gatorBites(2, true, false)).toBe(true);
    expect(gatorBites(2, false, true)).toBe(false);
  });
});

describe('phone social + messages', () => {
  it('creates posts from bus events', () => {
    const posts = postsForEvent({ type: 'race-won', name: 'Ocean Drive Sprint' }, seq([0.1, 0.9, 0.3]), 1000);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].text).toContain('Ocean Drive Sprint');
    expect(postsForEvent({ type: 'unknown-thing' }, Math.random, 0)).toEqual([]);
    const custom = postsForEvent({ type: 'post', author: 'Police', text: 'All clear' }, Math.random, 0);
    expect(custom[0].text).toBe('All clear');
    const p = posts[0];
    growLikes(p, 1000);
    expect(p.likes).toBe(p.targetLikes);
  });
  it('texts fire from story progress and replies grant points', () => {
    const state = { completed: ['m02-phish'], day: 0, hour: 12, rel: {}, stats: { fat: 30, muscle: 25, strength: 20 } };
    const due = dueTexts(['welcome'], state).map((t) => t.id);
    expect(due).toContain('m02');
    expect(due).not.toContain('m03');
    const threads: Parameters<typeof deliver>[0] = [];
    const t = deliver(threads, 'carla', 'hi', [['yo', 'hey', 3]], 0);
    expect(t.unread).toBe(1);
    expect(reply(t, 0, 1)?.points).toBe(3);
    expect(reply(t, 0, 2)).toBeNull();
  });
  it('podcast lines are timed', () => {
    const lines = podcastLines();
    expect(lines.length).toBeGreaterThan(20);
    const ep1 = lines.filter((l) => l.episode === 'ep1');
    for (let i = 1; i < ep1.length; i++) expect(ep1[i].t).toBeGreaterThan(ep1[i - 1].t);
  });
});
