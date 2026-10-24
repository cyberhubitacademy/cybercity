// Procedural full-body poses as bone directions in body space, shared by the
// skinned CharacterModel and the procedural Humanoid. Body space: +z forward,
// +y up, +x the character's LEFT. Each bone points from its joint toward the
// next joint (upper arm -> elbow, etc.). Pure data + math (no three.js).

export type PoseName = 'none' | 'crouch' | 'swim' | 'tread' | 'dive' | 'climb' | 'fall' | 'aim' | 'parachute' | 'tuck';

export type PoseBone =
  | 'spine' | 'chest' | 'neck'
  | 'armUL' | 'armLL' | 'armUR' | 'armLR'
  | 'legUL' | 'legLL' | 'legUR' | 'legLR';

export const POSE_BONES: readonly PoseBone[] = [
  'spine', 'chest', 'neck', 'armUL', 'armLL', 'armUR', 'armLR', 'legUL', 'legLL', 'legUR', 'legLR',
];

/** Poses applied in this order (later ones win where they overlap; 'aim' is last so combat owns the arms). */
export const POSE_ORDER: readonly Exclude<PoseName, 'none'>[] = [
  'crouch', 'tuck', 'tread', 'swim', 'dive', 'climb', 'fall', 'parachute', 'aim',
];

export interface PoseOptions {
  /** Aim pitch in radians (positive = aim up). */
  pitch?: number;
}

export type Dir = [number, number, number];
export type PoseTargets = Partial<Record<PoseBone, Dir>>;

function n(x: number, y: number, z: number): Dir {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** Rotate a direction about the body's x axis (positive pitches toward +y). */
function pitchDir(d: Dir, a: number): Dir {
  const c = Math.cos(a), s = Math.sin(a);
  return [d[0], d[1] * c + d[2] * s, -d[1] * s + d[2] * c];
}

/**
 * Bone directions for a pose at animation phase `p` (radians; callers advance
 * it with movement speed so strokes/steps cycle). `move` is 0..1 how much the
 * character is moving (blends idle vs moving variants).
 */
export function poseTargets(pose: PoseName, p: number, move: number, opts: PoseOptions = {}): PoseTargets {
  const s = Math.sin(p), c = Math.cos(p);
  switch (pose) {
    case 'none':
      return {};
    case 'crouch': {
      // Low sneak: hips dropped ~0.36 m by the caller, thighs forward, shins back.
      const swing = 0.35 * move;
      const aL = 1.1 + s * swing, aR = 1.1 - s * swing;
      const bL = 0.5 + Math.max(0, c) * 0.35 * move, bR = 0.5 + Math.max(0, -c) * 0.35 * move;
      return {
        spine: n(0, 0.9, 0.42), chest: n(0, 0.88, 0.48), neck: n(0, 0.96, 0.05),
        legUL: n(0.12, -Math.cos(aL), Math.sin(aL)), legLL: n(0.04, -Math.cos(bL), -Math.sin(bL)),
        legUR: n(-0.12, -Math.cos(aR), Math.sin(aR)), legLR: n(-0.04, -Math.cos(bR), -Math.sin(bR)),
        armUL: n(0.3, -0.75, 0.45 - s * 0.25 * move), armLL: n(0.05, -0.35, 0.95),
        armUR: n(-0.3, -0.75, 0.45 + s * 0.25 * move), armLR: n(-0.05, -0.35, 0.95),
      };
    }
    case 'tuck':
      // Forward roll / landing tuck.
      return {
        spine: n(0, 0.6, 0.8), chest: n(0, 0.4, 0.9), neck: n(0, 0.2, 1),
        legUL: n(0.12, 0.15, 1), legLL: n(0.05, -1, -0.15),
        legUR: n(-0.12, 0.15, 1), legLR: n(-0.05, -1, -0.15),
        armUL: n(0.25, -0.3, 0.9), armLL: n(-0.2, 0.3, 0.9),
        armUR: n(-0.25, -0.3, 0.9), armLR: n(0.2, 0.3, 0.9),
      };
    case 'tread': {
      // Upright treading water: sculling arms, slow bicycle legs.
      return {
        spine: n(0, 1, 0.05), chest: n(0, 1, 0.05), neck: n(0, 1, 0.1),
        armUL: n(0.75, -0.45, 0.35 + s * 0.3), armLL: n(0.45, -0.15, 0.85 + s * 0.2),
        armUR: n(-0.75, -0.45, 0.35 - s * 0.3), armLR: n(-0.45, -0.15, 0.85 - s * 0.2),
        legUL: n(0.12, -0.85, 0.4 + s * 0.3), legLL: n(0.05, -0.9, -0.25 + c * 0.3),
        legUR: n(-0.12, -0.85, 0.4 - s * 0.3), legLR: n(-0.05, -0.9, -0.25 - c * 0.3),
      };
    }
    case 'swim': {
      // Front crawl. The caller pitches the body ~85 deg forward, so body +y is
      // world-forward and body +z is world-down. Arms circle reach -> pull -> push -> recover.
      const aL = p, aR = p + Math.PI;
      const arm = (a: number, side: number): [Dir, Dir] => {
        const u = n(0.18 * side, Math.cos(a), Math.sin(a) * 0.9);
        const l = n(0.1 * side, Math.cos(a + 0.35), Math.sin(a + 0.35) * 0.9 + 0.15);
        return [u, l];
      };
      const [uL, lL] = arm(aL, 1), [uR, lR] = arm(aR, -1);
      const k = Math.sin(p * 2) * (0.25 + 0.15 * move);
      return {
        spine: n(0, 1, 0), chest: n(0, 1, -0.05), neck: n(0, 0.55, -0.85),
        armUL: uL, armLL: lL, armUR: uR, armLR: lR,
        legUL: n(0.07, -1, k), legLL: n(0.04, -1, k * 1.3 - 0.12),
        legUR: n(-0.07, -1, -k), legLR: n(-0.04, -1, -k * 1.3 - 0.12),
      };
    }
    case 'dive':
      // Arms overhead, body straight (the caller tilts the body head-first).
      return {
        spine: n(0, 1, 0), chest: n(0, 1, 0), neck: n(0, 1, 0.12),
        armUL: n(0.12, 1, 0.08), armLL: n(0.06, 1, 0.04),
        armUR: n(-0.12, 1, 0.08), armLR: n(-0.06, 1, 0.04),
        legUL: n(0.04, -1, -0.02), legLL: n(0.03, -1, -0.06),
        legUR: n(-0.04, -1, -0.02), legLR: n(-0.03, -1, -0.06),
      };
    case 'climb': {
      // Hands on the ledge, one knee up. `p` is used as climb progress 0..1 scaled to radians by the caller.
      const lift = Math.sin(p) * 0.4;
      return {
        spine: n(0, 0.92, 0.38), chest: n(0, 0.9, 0.42), neck: n(0, 0.95, 0.2),
        armUL: n(0.28, 0.75 - lift, 0.6), armLL: n(0.15, 0.85 - lift * 1.6, 0.45),
        armUR: n(-0.28, 0.75 - lift, 0.6), armLR: n(-0.15, 0.85 - lift * 1.6, 0.45),
        legUL: n(0.12, -0.35, 0.94), legLL: n(0.04, -1, 0.05),
        legUR: n(-0.1, -0.92, 0.2 + lift), legLR: n(-0.04, -1, -0.3),
      };
    }
    case 'fall': {
      // Skydive arch (the caller pitches the body ~80 deg forward, belly down);
      // limbs flail a bit with `move` (0 = stable arch, 1 = tumbling).
      const f = move;
      return {
        spine: n(0, 1, -0.12), chest: n(0, 1, -0.18), neck: n(0, 0.65, -0.75),
        armUL: n(0.85, 0.35 + s * 0.4 * f, -0.35 + c * 0.5 * f), armLL: n(0.55, 0.7, -0.35 + s * 0.6 * f),
        armUR: n(-0.85, 0.35 - s * 0.4 * f, -0.35 - c * 0.5 * f), armLR: n(-0.55, 0.7, -0.35 - c * 0.6 * f),
        legUL: n(0.3, -0.92, -0.1 + s * 0.4 * f), legLL: n(0.2, -0.6, -0.75 + c * 0.3 * f),
        legUR: n(-0.3, -0.92, -0.1 - s * 0.4 * f), legLR: n(-0.2, -0.6, -0.75 - c * 0.3 * f),
      };
    }
    case 'parachute': {
      // Hanging in the harness, hands up on the toggles. move = flare amount (pull toggles down).
      const pull = move;
      return {
        spine: n(0, 1, -0.03), chest: n(0, 1, 0), neck: n(0, 0.97, 0.2),
        armUL: n(0.4, 0.85 - pull * 1.1, 0.1 + pull * 0.3), armLL: n(0.12, 0.95 - pull * 1.4, -0.1 + pull * 0.4),
        armUR: n(-0.4, 0.85 - pull * 1.1, 0.1 + pull * 0.3), armLR: n(-0.12, 0.95 - pull * 1.4, -0.1 + pull * 0.4),
        legUL: n(0.07, -0.95, 0.25 + s * 0.05), legLL: n(0.05, -1, 0.05),
        legUR: n(-0.07, -0.95, 0.25 - s * 0.05), legLR: n(-0.05, -1, 0.05),
      };
    }
    case 'aim': {
      // Two-handed weapon at shoulder height, right hand on the grip.
      const a = opts.pitch ?? 0;
      return {
        armUR: pitchDir(n(-0.12, 0.02, 1), a), armLR: pitchDir(n(0.08, 0.05, 1), a),
        armUL: pitchDir(n(0.3, -0.15, 0.94), a), armLL: pitchDir(n(-0.62, 0.12, 0.78), a),
      };
    }
  }
}
