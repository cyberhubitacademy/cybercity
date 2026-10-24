// Gyms: Muscle Beach (outdoor, on the sand) and Iron Bay Gym (interior).
// Each station is a timing minigame; Rico is posed on the equipment using the
// rig's own clips creatively (run in place, sit = squat bottom, clapping arms
// = bench press / punches) plus procedural body transforms, with the barbell
// glued between his palms.
import * as THREE from 'three';
import type { SystemContext } from '../../game/Systems';
import { box, cyl, mat } from './world';
import { boneWorld } from './rigtools';
import { comboGame, repsGame, resultCard, rhythmGame } from './minigames';
import { workout, WORKOUTS, type LifeState } from './stats';
import { statBar } from './ui';
import { emitEvent } from './bus';

export type Exercise = 'treadmill' | 'bench' | 'deadlift' | 'squat' | 'pulldown' | 'bag';

export const EXERCISE_NAMES: Record<Exercise, string> = {
  treadmill: 'Treadmill', bench: 'Bench Press', deadlift: 'Deadlift', squat: 'Squats', pulldown: 'Lat Pulldown', bag: 'Punching Bag',
};

export interface Station {
  id: string;
  gym: string;
  exercise: Exercise;
  x: number;
  z: number;
  y: number;
  yaw: number;
  group?: THREE.Group;
  /** Moving parts */
  bar?: THREE.Object3D;
  bag?: THREE.Object3D;
  belt?: THREE.Mesh;
}

const steel = mat('#9aa3ad', 0.35, 0.8);
const black = mat('#1c1c22', 0.6);
const pad = mat('#d7263d', 0.7);
const plateM = mat('#202024', 0.5, 0.3);

export function barbell(): THREE.Group {
  const g = new THREE.Group();
  const bar = cyl(0.02, 0.02, 1.9, steel);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [-1, 1]) {
    for (const k of [0, 1]) {
      const p = cyl(0.2 - k * 0.04, 0.2 - k * 0.04, 0.05, plateM, s * (0.62 + k * 0.06), 0, 0, 18);
      p.rotation.z = Math.PI / 2;
      g.add(p);
    }
  }
  return g;
}

export function buildStation(st: Station): THREE.Group {
  const g = new THREE.Group();
  g.position.set(st.x, st.y, st.z);
  g.rotation.y = st.yaw;
  switch (st.exercise) {
    case 'bench': {
      g.add(box(0.35, 0.08, 1.3, pad, 0, 0.45, -0.55));
      g.add(box(0.12, 0.42, 0.12, black, 0, 0.21, -0.1));
      g.add(box(0.12, 0.42, 0.12, black, 0, 0.21, -1.0));
      for (const s of [-1, 1]) g.add(box(0.06, 1.1, 0.06, steel, s * 0.45, 0.55, -1.0));
      const b = barbell();
      b.position.set(0, 1.05, -1.0);
      g.add(b);
      st.bar = b;
      break;
    }
    case 'squat':
    case 'deadlift': {
      g.add(box(2.4, 0.06, 2.0, mat('#3b2a1a', 0.9), 0, 0.03, 0));
      if (st.exercise === 'squat') {
        for (const s of [-1, 1]) {
          g.add(box(0.08, 2.2, 0.08, steel, s * 0.85, 1.1, -0.45));
          g.add(box(0.08, 2.2, 0.08, steel, s * 0.85, 1.1, 0.45));
          g.add(box(0.08, 0.08, 0.9, steel, s * 0.85, 2.2, 0));
        }
      }
      const b = barbell();
      b.position.set(0, st.exercise === 'squat' ? 1.45 : 0.22, 0.05);
      g.add(b);
      st.bar = b;
      break;
    }
    case 'pulldown': {
      g.add(box(0.5, 0.08, 0.5, pad, 0, 0.5, 0));
      g.add(box(0.1, 0.5, 0.1, black, 0, 0.25, 0));
      g.add(box(0.12, 2.5, 0.12, black, 0, 1.25, -0.55));
      g.add(box(0.12, 0.12, 0.9, black, 0, 2.45, -0.15));
      g.add(box(0.4, 0.6, 0.2, plateM, 0, 0.6, -0.7));
      const bar = cyl(0.025, 0.025, 1.2, steel);
      bar.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(bar);
      holder.position.set(0, 2.1, 0.15);
      g.add(holder);
      st.bar = holder;
      break;
    }
    case 'bag': {
      g.add(box(0.1, 2.8, 0.1, black, 0, 1.4, -0.9));
      g.add(box(0.1, 0.1, 1.0, black, 0, 2.75, -0.45));
      const pivot = new THREE.Group();
      pivot.position.set(0, 2.7, 0);
      const bag = cyl(0.22, 0.22, 1.1, mat('#b5171e', 0.8), 0, -1.05, 0, 14);
      pivot.add(bag, cyl(0.01, 0.01, 0.5, steel, 0, -0.25, 0));
      g.add(pivot);
      st.bag = pivot;
      break;
    }
    case 'treadmill': {
      g.add(box(0.8, 0.18, 1.9, black, 0, 0.09, 0));
      const beltTex = (() => {
        const c = document.createElement('canvas');
        c.width = 16; c.height = 64;
        const x = c.getContext('2d')!;
        x.fillStyle = '#2a2a2e'; x.fillRect(0, 0, 16, 64);
        x.fillStyle = '#3c3c42';
        for (let i = 0; i < 64; i += 8) x.fillRect(0, i, 16, 3);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 6);
        return t;
      })();
      const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 1.7), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }));
      belt.rotation.x = -Math.PI / 2;
      belt.position.y = 0.185;
      g.add(belt);
      st.belt = belt;
      for (const s of [-1, 1]) g.add(box(0.05, 1.1, 0.05, steel, s * 0.38, 0.65, 0.85));
      g.add(box(0.8, 0.3, 0.12, black, 0, 1.25, 0.88));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ color: '#19e6ff', toneMapped: false }));
      scr.position.set(0, 1.28, 0.81);
      scr.rotation.y = Math.PI;
      g.add(scr);
      break;
    }
  }
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  st.group = g;
  return g;
}

// ---------------------------------------------------------------- live pose while working out

export interface PoseState {
  st: Station;
  phase: number;
  effort: number;
  /** Punch flash timer for the bag. */
  punch: number;
  bagVel: number;
  bagAng: number;
  run: number;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** Pose Rico on the station (call every frame while working out, after nothing else animates him). */
export function applyPose(ctx: SystemContext, p: PoseState, dt: number): void {
  const pl = ctx.world.player, rig = pl.rig, st = p.st;
  const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
  rig.body.rotation.order = 'YXZ';
  rig.body.rotation.set(0, st.yaw, 0);
  let x = st.x, z = st.z, y = st.y;
  switch (st.exercise) {
    case 'treadmill':
      p.run += dt;
      rig.animate(dt, 5.6);
      if (st.belt) (st.belt.material as THREE.MeshStandardMaterial).map!.offset.y -= dt * 3;
      y += 0.19;
      break;
    case 'bench':
      // lie back along the bench (feet at the station end)
      rig.body.rotation.x = -Math.PI / 2;
      rig.wave(0);
      rig.animate(dt * (0.4 + p.phase), 0);
      x += fx * 0.35; z += fz * 0.35;
      y += 0.62;
      break;
    case 'squat':
      rig.animate(dt, 0, false, p.phase > 0.35);
      x -= fx * 0.15; z -= fz * 0.15;
      y += 0.06 - (p.phase > 0.35 ? 0.1 : 0);
      break;
    case 'deadlift':
      rig.animate(dt, 0, false, p.effort > 0.05 && p.phase < 0.25);
      x -= fx * 0.15; z -= fz * 0.15;
      y += 0.06 - (p.phase > 0.35 ? 0.1 : 0);
      break;
    case 'pulldown':
      rig.animate(dt, 0, false, true);
      x += fx * 0.05; z += fz * 0.05;
      y += 0.08;
      break;
    case 'bag':
      if (p.punch > 0) { rig.wave(0); p.punch -= dt; }
      rig.animate(dt * 1.6, 0);
      x -= fx * 0.85; z -= fz * 0.85;
      break;
  }
  pl.position.set(x, y, z);
  rig.root.position.copy(pl.position);
  rig.root.visible = true;
  rig.root.updateMatrixWorld(true);
  // equipment follows
  if (st.bar && st.group) {
    if (st.exercise === 'pulldown') {
      st.bar.position.y = 2.1 - p.phase * 0.75 - p.effort * 0.1;
    } else if (st.exercise !== 'bag') {
      boneWorld(rig, 'PalmL', _a);
      boneWorld(rig, 'PalmR', _b);
      _c.addVectors(_a, _b).multiplyScalar(0.5);
      if (st.exercise === 'bench') _c.y += 0.05 + p.phase * 0.35;
      if (st.exercise === 'squat') _c.y = y + (p.phase > 0.35 ? 1.05 : 1.45);
      if (st.exercise === 'deadlift') _c.y = y + 0.22 + p.phase * 0.62;
      st.group.worldToLocal(_c);
      st.bar.position.lerp(_c, Math.min(1, dt * 14));
    }
  }
  if (st.bag) {
    p.bagVel += (-p.bagAng * 30 - p.bagVel * 3) * dt;
    p.bagAng += p.bagVel * dt;
    st.bag.rotation.x = p.bagAng;
  }
}

export function resetPose(ctx: SystemContext, st: Station): void {
  const rig = ctx.world.player.rig;
  rig.body.rotation.set(0, rig.body.rotation.y, 0);
  rig.body.rotation.order = 'XYZ';
  if (st.bar && st.group) {
    if (st.exercise === 'bench') st.bar.position.set(0, 1.05, -1.0);
    else if (st.exercise === 'squat') st.bar.position.set(0, 1.45, 0.05);
    else if (st.exercise === 'deadlift') st.bar.position.set(0, 0.22, 0.05);
    else if (st.exercise === 'pulldown') st.bar.position.y = 2.1;
  }
}

/** Frame the camera on the workout. */
export function frameCamera(ctx: SystemContext, st: Station): void {
  const side = st.yaw + Math.PI / 2 + 0.5;
  const d = st.exercise === 'treadmill' ? 4.2 : 3.8;
  ctx.camera.position.set(st.x + Math.sin(side) * d, st.y + 1.9, st.z + Math.cos(side) * d);
  ctx.camera.lookAt(st.x, st.y + (st.exercise === 'bench' ? 0.7 : 1.0), st.z);
}

/** Run a workout at a station. Returns once the result card is dismissed. */
export async function runWorkout(ctx: SystemContext, life: LifeState, st: Station, setPose: (p: PoseState | null) => void, onDone: () => void): Promise<void> {
  const ex = st.exercise;
  const pose: PoseState = { st, phase: 0, effort: 0, punch: 0, bagVel: 0, bagAng: 0, run: 0 };
  setPose(pose);
  frameCamera(ctx, st);
  const diff = 1 + life.strength / 140;
  let quality = 0;
  try {
    if (ex === 'treadmill') {
      const r = await rhythmGame(ctx, {
        title: 'Treadmill Sprint', bpm: 112 + Math.round(life.stamina / 3), duration: 15,
        lanes: [{ code: ['KeyA', 'ArrowLeft'], label: 'A / ←', color: '#4aa4e0' }, { code: ['KeyD', 'ArrowRight'], label: 'D / →', color: '#ff2fa0' }],
        pattern: (n) => (n % 8 === 7 ? -1 : n % 2),
        help: 'Left foot, right foot — keep the rhythm!',
      });
      quality = r ? r.accuracy : 0;
    } else if (ex === 'bag') {
      const r = await comboGame(ctx, {
        title: 'Punching Bag', rounds: 5, length: [3, 5], timeLimit: 2.8,
        onPunch: (_h, good) => { pose.punch = 0.25; if (good) { pose.bagVel -= 2.2; ctx.sfx('crash'); ctx.world.rig.addShake(0.08); } },
      });
      quality = r ? r.quality : 0;
    } else {
      const hold = ex === 'deadlift' || ex === 'pulldown';
      const r = await repsGame(ctx, {
        title: EXERCISE_NAMES[ex],
        reps: ex === 'deadlift' ? 5 : 8,
        speed: (ex === 'bench' ? 0.85 : 0.95) * diff,
        zone: hold ? 0.12 : 0.13,
        hold,
        onPose: (ph, eff) => { pose.phase = ph; pose.effort = eff; },
      });
      quality = r ? r.quality : 0;
    }
  } finally {
    setPose(null);
    resetPose(ctx, st);
  }
  if (quality <= 0.01) { ctx.notify('Workout abandoned.', 'warn'); return; }
  const before = { ...life };
  const sessions = life.today.sessions[ex] ?? 0;
  const g = workout(life, ex, quality);
  onDone();
  emitEvent({ type: 'workout', exercise: ex, score: Math.round(quality * 100) });
  const pct = Math.round(quality * 100);
  const rows = [
    `<div style="display:flex;justify-content:space-between"><span>Performance</span><b>${pct}%</b></div>`,
    statBar('Strength', before.strength, '#e0453a', `${life.strength.toFixed(1)} (+${g.strength.toFixed(2)})`, g.strength),
    statBar('Stamina', before.stamina, '#4aa4e0', `${life.stamina.toFixed(1)} (+${g.stamina.toFixed(2)})`, g.stamina),
    statBar('Muscle', before.muscle, '#f0c850', `${life.muscle.toFixed(1)} (+${g.muscle.toFixed(2)})`, g.muscle),
    g.lung > 0 ? statBar('Lung Capacity', before.lung, '#3dffb0', `${life.lung.toFixed(1)} (+${g.lung.toFixed(2)})`, g.lung) : '',
    `<div class="cx-muted" style="margin-top:6px;font-size:13px">Body fat ${g.fat.toFixed(2)} · Session ${sessions + 1} today${sessions >= 1 ? ' — gains are tapering off, try another exercise or come back tomorrow.' : ''}</div>`,
  ].join('');
  await resultCard(ctx, pct >= 85 ? 'Beast Mode' : pct >= 55 ? 'Good Set' : 'Rough Set', rows, pct >= 85 ? '#f0c850' : '#72cc72');
  ctx.notify(`${EXERCISE_NAMES[ex]}: [y]+${(g.strength + g.stamina).toFixed(1)}[/y] fitness`, 'xp');
}

export function exerciseDesc(ex: Exercise): string {
  const w = WORKOUTS[ex];
  const parts: string[] = [];
  if (w.strength >= 1) parts.push('Strength');
  if (w.stamina >= 1) parts.push('Stamina');
  if ((w.lung ?? 0) > 0) parts.push('Lungs');
  if (w.fatBurn >= 1) parts.push('Fat burn');
  return parts.join(' · ');
}
