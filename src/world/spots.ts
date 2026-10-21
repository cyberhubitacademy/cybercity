// Fixed gameplay spots: cyber terminals and where story characters stand.

export interface TerminalSpot {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Yaw the screen faces (radians, 0 = +z). */
  facing: number;
  /** Challenge practiced here when no mission needs it. */
  practice?: string;
}

export const TERMINALS: TerminalSpot[] = [
  { id: 'hq-lab', name: 'Sunset Shield Cyber Lab', x: 122, z: -28, facing: Math.PI / 2 },
  { id: 'cafe-terminal', name: 'Coral Café Back-Office PC', x: 155, z: 38, facing: -Math.PI / 2 },
  { id: 'soc-terminal', name: 'Harbor SOC Console', x: -30, z: 104, facing: Math.PI },
  { id: 'dc-terminal', name: 'Data Center Firewall Console', x: 58, z: 106, facing: Math.PI },
  { id: 'bank-terminal', name: 'Palmetto Bank Help Desk', x: 38, z: -93, facing: 0 },
  { id: 'uni-terminal', name: 'Okafor Forensics Lab', x: -114, z: -180, facing: 0 },
  { id: 'market-terminal', name: 'Byte Bazaar Crypto Rig', x: -28, z: -46, facing: -Math.PI / 2 },
  { id: 'arcade-uni', name: 'Bayview CTF Arena (Cyber Arcade)', x: -200, z: -205, facing: 0 },
  { id: 'arcade-beach', name: 'Tiki Bytes Cyber Arcade', x: 198, z: 128, facing: Math.PI / 2 },
];

/** Terminals that open the Cyber Arcade board instead of a story challenge. */
export const ARCADE_TERMINALS = new Set(['arcade-uni', 'arcade-beach']);

export interface CharacterPost {
  npc: string;
  x: number;
  z: number;
  facing: number;
}

export const POSTS: CharacterPost[] = [
  { npc: 'max', x: 136, z: -40, facing: Math.PI / 2 },
  { npc: 'carla', x: 153, z: 48, facing: Math.PI / 2 },
  { npc: 'dex', x: -40, z: 102, facing: Math.PI },
  { npc: 'tito', x: 48, z: 104, facing: Math.PI },
  { npc: 'marisol', x: 48, z: -96, facing: 0 },
  { npc: 'lena', x: -125, z: -180, facing: 0 },
  { npc: 'priya', x: -38, z: -38, facing: Math.PI / 4 },
];

/** Parked vehicles available to the player. */
export const PARKED: { kind: string; x: number; z: number; yaw: number }[] = [
  { kind: 'stinger', x: 182, z: -14, yaw: Math.PI },
  { kind: 'cabrio', x: 182, z: -60, yaw: 0 },
  { kind: 'shield', x: 179, z: -36, yaw: 0 },
  { kind: 'bike', x: 180, z: 30, yaw: Math.PI },
  { kind: 'sedan', x: 179, z: 70, yaw: Math.PI },
  { kind: 'taxi', x: 12, z: -60, yaw: 0 },
  { kind: 'cabrio', x: -2, z: 110, yaw: Math.PI },
  { kind: 'stinger', x: 70, z: -88, yaw: Math.PI / 2 },
  { kind: 'sedan', x: -150, z: -6, yaw: Math.PI / 2 },
  { kind: 'bike', x: -100, z: -177, yaw: 0 },
  { kind: 'sedan', x: -190, z: 20, yaw: Math.PI / 2 },
  { kind: 'shield', x: -60, z: -50, yaw: 0 },
  { kind: 'boat', x: 252, z: -100, yaw: Math.PI / 2 },
  { kind: 'boat', x: 20, z: 222, yaw: 0 },
];
