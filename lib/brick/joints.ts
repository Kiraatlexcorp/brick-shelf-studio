import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { UNIT, type CubeSpec, type PartGroup } from "@/lib/brick/spec";

type Vec3 = [number, number, number];
export type JointPart = { kind: string; group: PartGroup; solid: Manifold; flat: Vec3; out: Vec3 };
export type JointGeometry = {
  /** Cut from every wall and deck of this cube. */
  cuts: Manifold[];
  /** Loose printed parts (nodes, keys, clips), shown locked into this cube's top or right side. */
  parts: JointPart[];
};

/** Acmie Lock twist node: bayonet barrel with two lugs per end, 90° turn to lock. */
export const TWIST = { r: 4.5, lug: 2.5, lugW: 3, lugH: 2, depth: 5, lugZ: 2 };
/** Rail T-slot: narrow neck at the face, wider head inside. */
export const RAIL = { neckW: 4, neckD: 1, headW: 7, headD: 1.4, bump: 0.7 };
/** Bowtie clip: waist at the seam, wide ends, pocket depth. */
export const CLIP = { waist: 6, end: 10, half: 5, depth: 2.4 };

const sector = (M: ManifoldToplevel["Manifold"], r: number, h: number, a0: number, a1: number) => {
  const pts: Vec3[] = [[0, 0, 0], [0, 0, h]];
  for (let i = 0; i <= 12; i++) {
    const a = ((a0 + ((a1 - a0) * i) / 12) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a), 0], [r * Math.cos(a), r * Math.sin(a), h]);
  }
  return M.hull(pts);
};

/** Spots between grid tabs so joints miss pegs, bolts and studs. */
const between = (n: number) => (n > 1 ? Array.from({ length: n - 1 }, (_, j) => (j + 1) * UNIT) : [10, UNIT - 10]);

export function twistNode(m: ManifoldToplevel, c = 0): Manifold {
  const { Manifold: M } = m;
  const { r, lug, lugW, lugH, depth, lugZ } = TWIST;
  const len = 2 * (depth - 0.2);
  let n = M.cylinder(len, r, r, 40).translate([0, 0, -len / 2]);
  for (const s of [-1, 1])
    for (const a of [0, 180]) {
      const z0 = s > 0 ? lugZ + c : -lugZ - lugH + c;
      n = n.add(M.cube([lug + 0.5, lugW - 2 * c, lugH - 2 * c]).translate([r - 0.5, -lugW / 2 + c, z0]).rotate([0, 0, a]));
    }
  // Grip slot across the top end so a coin can turn it.
  return n.subtract(M.cube([2 * r + 2, 1.2, 1.2]).translate([-r - 1, -0.6, len / 2 - 1.2]));
}

/** Bayonet socket with its mouth at z = 0 opening toward +z (flip for the bottom deck). */
export function twistSocket(m: ManifoldToplevel, c: number): Manifold {
  const { Manifold: M } = m;
  const { r, lug, lugW, lugH, depth, lugZ } = TWIST;
  const R = r + lug + c;
  const bore = M.cylinder(depth + 0.01, r + c, r + c, 40).translate([0, 0, -depth]);
  const parts = [bore];
  for (const a of [0, 180]) {
    // entry slot straight down to the lug, then a 90° groove around
    parts.push(M.cube([R, lugW + 2 * c, depth + 0.01]).translate([0, -(lugW + 2 * c) / 2, -depth]).rotate([0, 0, a]));
    parts.push(sector(M, R / Math.cos(Math.PI / 24) + 0.2, lugH + 2 * c, -25, 115).translate([0, 0, -lugZ - lugH - c]).rotate([0, 0, a]));
  }
  return M.union(parts);
}

/** T-slot profile in x (0 at the face, +x into the wall) and y, extruded z0..z1. */
function tSlot(m: ManifoldToplevel, z0: number, z1: number, c: number): Manifold {
  const { Manifold: M } = m;
  const { neckW, neckD, headW, headD, bump } = RAIL;
  const neck = M.cube([neckD + 0.02, neckW + 2 * c, z1 - z0]).translate([-0.01, -(neckW + 2 * c) / 2, z0]);
  const head = M.cube([headD + c, headW + 2 * c, z1 - z0]).translate([neckD, -(headW + 2 * c) / 2, z0]);
  const dimple = M.sphere(bump + c, 20).translate([neckD + headD + c, 0, z0 + 6]);
  return M.union([neck, head, dimple]);
}

/** Double-T key centred on x = 0, y = 0, running z0..z1, with a clip bump on +x near z0. */
function railKey(m: ManifoldToplevel, z0: number, z1: number, c: number): Manifold {
  const { Manifold: M } = m;
  const { neckW, neckD, headW, headD, bump } = RAIL;
  const h = z1 - z0;
  const neck = M.cube([2 * neckD, neckW - 2 * c, h]).translate([-neckD, -(neckW - 2 * c) / 2, z0]);
  const heads = [1, -1].map((s) => M.cube([headD - c, headW - 2 * c, h]).translate([s > 0 ? neckD : -neckD - headD + c, -(headW - 2 * c) / 2, z0]));
  const b = M.sphere(bump, 20).translate([neckD + headD - c, 0, z0 + 6]).intersect(M.cube([bump + 1, 4, 4]).translate([neckD + headD - c - 0.01, -2, z0 + 4]));
  return M.union([neck, ...heads, b]);
}

/** Bowtie in u (seam at 0) and v, extruded 0..t. `half` keeps u >= 0 only. */
function bowtie(m: ManifoldToplevel, t: number, grow: number, half: boolean): Manifold {
  const { Manifold: M } = m;
  const { waist, end, half: L } = CLIP;
  const w = waist / 2 + grow;
  const e = end / 2 + grow;
  const side = (s: number): Manifold => {
    const pts: Vec3[] = [];
    for (const z of [0, t]) pts.push([0, -w, z], [0, w, z], [s * (L + grow), -e, z], [s * (L + grow), e, z]);
    return M.hull(pts);
  };
  const right = side(1);
  if (half) return right.translate([-0.01, 0, 0]).add(M.cube([0.02, 2 * w, t]).translate([-0.01, -w, 0]));
  return right.add(side(-1));
}

export function buildJoints(m: ManifoldToplevel, spec: CubeSpec): JointGeometry {
  const { Manifold: M } = m;
  const W = spec.w * UNIT;
  const D = spec.d * UNIT;
  const H = spec.h * UNIT;
  const c = spec.clearance;
  const cuts: Manifold[] = [];
  const parts: JointPart[] = [];

  if (spec.joint === "twist") {
    const sock = twistSocket(m, c);
    const corners: [number, number][] = [[13, 13], [W - 13, 13], [13, D - 13], [W - 13, D - 13]];
    corners.forEach(([x, y], i) => {
      cuts.push(sock.translate([x, y, H]));
      cuts.push(sock.mirror([0, 0, 1]).translate([x, y, 0]));
      // locked: turned 90° so the lugs sit in the grooves
      parts.push({ kind: `node-${i + 1}`, group: "joint", solid: twistNode(m, c / 2).rotate([0, 0, 90]).translate([x, y, H]), flat: [0, 0, 0], out: [0, 0, 1] });
    });
  }

  if (spec.joint === "rail") {
    const ys = Array.from({ length: spec.d }, (_, j) => j * UNIT + 30);
    for (const y of ys) {
      cuts.push(tSlot(m, 1, H + 0.01, c).translate([0, y, 0])); // left face, mouth at x = 0
      cuts.push(tSlot(m, 1, H + 0.01, c).mirror([1, 0, 0]).translate([W, y, 0]));
    }
    ys.forEach((y, i) =>
      parts.push({ kind: `rail-key-${i + 1}`, group: "joint", solid: railKey(m, 1 + c, H, c).mirror([1, 0, 0]).translate([W, y, 0]), flat: [0, 90, 0], out: [1, 0, 0] }),
    );
    // Stacking: the same T-slot front to back in the top and bottom decks.
    const xs = Array.from({ length: spec.w }, (_, i) => i * UNIT + UNIT / 2);
    for (const x of xs) {
      // slot depth -> z, width -> x, run -> +y (open at the front, closed 1 mm short of the back)
      const topSlot = tSlot(m, -0.01, D - 1, c).rotate([0, -90, 0]).rotate([0, 0, -90]);
      cuts.push(topSlot.mirror([0, 0, 1]).translate([x, 0, H]));
      cuts.push(topSlot.translate([x, 0, 0]));
    }
    xs.forEach((x, i) =>
      parts.push({
        kind: `deck-key-${i + 1}`, group: "joint", flat: [0, 0, 0], out: [0, 0, 1],
        solid: railKey(m, c, D - 1 - c, c).rotate([0, -90, 0]).rotate([0, 0, -90]).translate([x, 0, H]),
      }),
    );
  }

  if (spec.joint === "clip") {
    const t = CLIP.depth;
    const pocket = bowtie(m, t + 0.01, c, true);
    const key = bowtie(m, t - c, 0, false);
    // Side by side: top face of the top deck and bottom face of the bottom deck, at x = 0 and x = W.
    between(spec.d).forEach((y, i) => {
      for (const [z, up] of [[H - t, true], [0, false]] as const) {
        const p = up ? pocket : pocket.mirror([0, 0, 1]).translate([0, 0, t]);
        cuts.push(p.translate([0, y, z - (up ? 0 : 0.01)]));
        cuts.push(p.mirror([1, 0, 0]).translate([W, y, z - (up ? 0 : 0.01)]));
      }
      parts.push({ kind: `clip-side-${i + 1}`, group: "joint", solid: key.translate([W, y, H - t + 0.005]), flat: [0, 0, 0], out: [1, 0, 0] });
    });
    // Stacking: front and back faces, half in the top deck here, half in the next cube's bottom deck.
    // u (seam outward) -> -z, thickness -> +y into the cube, v -> x
    const facePocket = pocket.rotate([0, 90, 0]).rotate([0, 0, 90]);
    between(spec.w).forEach((x, i) => {
      for (const [y, flip] of [[0, false], [D, true]] as const) {
        const fp = flip ? facePocket.mirror([0, 1, 0]) : facePocket;
        cuts.push(fp.translate([x, y, H]));
        cuts.push(fp.mirror([0, 0, 1]).translate([x, y, 0]));
      }
      const k = key.rotate([0, 90, 0]).rotate([0, 0, 90]);
      parts.push({ kind: `clip-front-${i + 1}`, group: "joint", solid: k.translate([x, 0.005, H]), flat: [-90, 0, 0], out: [0, -1, 0] });
      parts.push({ kind: `clip-back-${i + 1}`, group: "joint", solid: k.mirror([0, 1, 0]).translate([x, D - 0.005, H]), flat: [90, 0, 0], out: [0, 1, 0] });
    });
  }
  return { cuts, parts };
}
