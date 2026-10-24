import { describe, expect, it } from 'vitest';
import { ROADS_X, ROADS_Z, ROAD_WIDTH, buildBlocks } from '../src/world/layout';
import { inBlock, kerbEdges, kerbPoint, kerbYaw, onRoadway, stopSignSpots, wireSag } from '../src/world/StreetDetail';

const blocks = buildBlocks();

describe('street detail layout', () => {
  it('gives every block four kerb edges that sit on a road edge', () => {
    const edges = kerbEdges(blocks);
    expect(edges.length).toBe(blocks.length * 4);
    for (const e of edges) {
      const p = kerbPoint(e, e.len / 2, 0);
      const coord = e.roadNS ? p.x : p.z;
      expect(Math.abs(Math.abs(coord - e.road) - ROAD_WIDTH / 2)).toBeLessThan(1e-9);
      // the kerb strip (0.4-1.5 m in) is never roadway and stays inside the block
      for (const d of [0.4, 1.5]) {
        const q = kerbPoint(e, e.len / 2, d);
        expect(onRoadway(q.x, q.z)).toBe(false);
        expect(inBlock(blocks, q.x, q.z)).toBe(true);
      }
    }
  });

  it('turns props to face the road', () => {
    for (const e of kerbEdges(blocks)) {
      const yaw = kerbYaw(e);
      // local +z = (sin yaw, cos yaw) must point away from the block
      expect(Math.sin(yaw) * e.nx + Math.cos(yaw) * e.nz).toBeCloseTo(-1);
    }
  });

  it('puts stop signs on the kerb, clear of traffic lanes, facing oncoming cars', () => {
    const spots = stopSignSpots();
    expect(spots.length).toBeGreaterThan(60);
    for (const s of spots) {
      expect(onRoadway(s.x, s.z)).toBe(false);
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      // the sign faces away from the intersection it guards
      const nx = ROADS_X.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a));
      const nz = ROADS_Z.reduce((a, b) => (Math.abs(b - s.z) < Math.abs(a - s.z) ? b : a));
      expect(fx * (s.x - nx) + fz * (s.z - nz)).toBeGreaterThan(0);
    }
    // deterministic
    expect(stopSignSpots()).toEqual(spots);
  });

  it('sags wires at mid-span and not at the poles', () => {
    expect(wireSag(0, 1)).toBeCloseTo(0);
    expect(wireSag(1, 1)).toBeCloseTo(0);
    expect(wireSag(0.5, 0.8)).toBeCloseTo(-0.8);
  });
});
