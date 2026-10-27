import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { BOLT_R, DECK, UNIT, type CubeSpec } from "@/lib/brick/spec";
import type { JointPart } from "@/lib/brick/joints";

/** French cleat: 45° bevel, 8 mm thick strips, so the cube floats 16 mm off the wall. */
export const CLEAT = { t: 8, h: 24, bevel: 8, hook: 30, maxLen: 240 };

type Vec3 = [number, number, number];
/** Extrude a convex (y, z) polygon along x from x0 to x1. */
const prism = (m: ManifoldToplevel, pts: [number, number][], x0: number, x1: number): Manifold =>
  m.Manifold.hull(pts.flatMap(([y, z]) => [[x0, y, z], [x1, y, z]] as Vec3[]));

/**
 * Wall mode: a printed wall rail you screw to the wall, and a hook that bolts to the
 * back wall through the two M4 mounting holes. The hook's bevel drops behind the rail's.
 */
export function buildWallMount(m: ManifoldToplevel, spec: CubeSpec): JointPart[] {
  const { Manifold: M } = m;
  const W = spec.w * UNIT;
  const D = spec.d * UNIT;
  const H = spec.h * UNIT;
  const c = spec.clearance;
  const { t, h, bevel, hook } = CLEAT;
  const zb = DECK;
  const zt = H - DECK;
  const hz = Math.max(zb, zt - hook);
  const front = D + t; // rail face toward the cube
  const wall = D + 2 * t; // the wall
  const x0 = 4, x1 = W - 4;
  const pieces: Manifold[] = [
    M.cube([x1 - x0, t - c, zt - hz]).translate([x0, D, hz]),
    prism(m, [[front - c, hz + h + c], [wall - c, hz + h - bevel + c], [wall - c, zt], [front - c, zt]], x0, x1),
  ];
  // Legs down to a foot that rests on the wall, so the cube hangs plumb.
  const r = hz - 2 * c;
  if (r - zb > 14)
    for (const lx of [x0, x1 - 8]) {
      pieces.push(M.cube([8, t - c, hz - zb + 0.01]).translate([lx, D, zb]));
      pieces.push(M.cube([8, 2 * t - c, 8]).translate([lx, D, zb]));
    }
  let hookSolid = M.union(pieces);
  for (const fx of spec.w === 1 ? [0.5] : [0.25, 0.75])
    hookSolid = hookSolid.subtract(M.cylinder(2 * t + 2, BOLT_R + 0.3, BOLT_R + 0.3, 24).rotate([-90, 0, 0]).translate([W * fx, D - 1, H - DECK - 12]));

  // Rail: long face toward the cube, bevel rising away from the wall.
  const L = Math.min(W + 80, CLEAT.maxLen);
  const rx0 = W / 2 - L / 2;
  let rail = prism(m, [[front, r], [wall, r], [wall, r + h - bevel], [front, r + h]], rx0, rx0 + L);
  const n = Math.max(2, Math.round(L / 80) + 1);
  for (let i = 0; i < n; i++) {
    const sx = rx0 + 12 + ((L - 24) * i) / (n - 1);
    const sz = r + (h - bevel) / 2;
    // screw hole with a countersink on the cube side
    rail = rail.subtract(M.cylinder(2 * t + 2, 2.1, 2.1, 20).rotate([-90, 0, 0]).translate([sx, front - 1, sz]));
    rail = rail.subtract(M.cylinder(2.6, 4.4, 2.1, 24).rotate([-90, 0, 0]).translate([sx, front - 0.01, sz]));
  }
  return [
    { kind: "wall-hook", group: "joint", solid: hookSolid, flat: [90, 0, 0], out: [0, 1, 0] },
    { kind: "wall-rail", group: "joint", solid: rail, flat: [90, 0, 0], out: [0, 1, 0] },
  ];
}
