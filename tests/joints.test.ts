import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, printParts } from "@/lib/brick/cube";
import { boundsOf } from "@/lib/export/threemf";
import { A1_BED, DEFAULT_CUBE, UNIT, type CubeSpec, type Joint } from "@/lib/brick/spec";

const m = await Module();
m.setup();

const vol = (a: ReturnType<typeof buildCube>[number]["solid"], b: typeof a) => a.intersect(b).volume();

const check = (joint: Joint, extra: Partial<CubeSpec> = {}) => {
  const spec: CubeSpec = { ...DEFAULT_CUBE, joint, ...extra };
  const parts = buildCube(m, spec);
  for (const p of parts) expect(p.solid.status(), p.kind).toBe("NoError");
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      expect(vol(parts[i].solid, parts[j].solid), `${parts[i].kind} vs ${parts[j].kind}`).toBeLessThan(0.05);
  return { spec, parts };
};

/** Loose joint parts locked into a neighbour (above or to the right) must sit in its pockets, not its walls. */
const neighbour = (joint: Joint, offset: [number, number, number]) => {
  const { spec, parts } = check(joint);
  const other = buildCube(m, spec).filter((p) => p.group !== "joint").map((p) => p.solid.translate(offset));
  const loose = parts.filter((p) => p.group === "joint");
  expect(loose.length).toBeGreaterThan(0);
  for (const l of loose) for (const o of other) expect(vol(l.solid, o), l.kind).toBeLessThan(0.05);
};

const fits = (joint: Joint) => {
  for (const part of printParts(buildCube(m, { ...DEFAULT_CUBE, joint, w: 4, d: 4, h: 4 }))) {
    const b = boundsOf(part);
    for (const s of [b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ]) expect(s, part.name).toBeLessThanOrEqual(A1_BED);
  }
};

describe("joints", () => {
  it("lego keeps studs; others are flat on top", () => {
    const top = (j: Joint) => buildCube(m, { ...DEFAULT_CUBE, joint: j }).find((p) => p.kind === "top")!.solid.boundingBox().max[2];
    expect(top("lego")).toBeGreaterThan(2 * UNIT + 1);
    for (const j of ["twist", "rail", "clip"] as Joint[]) expect(top(j)).toBeCloseTo(2 * UNIT, 3);
  });

  it("twist: 4 corner nodes, lugs locked in grooves, mate with the cube above", () => {
    const { parts } = check("twist");
    expect(parts.filter((p) => p.kind.startsWith("node-"))).toHaveLength(4);
    neighbour("twist", [0, 0, 2 * UNIT]);
    // unlocked (not turned) the lugs hit the deck: proves the bayonet holds
    const top = parts.find((p) => p.kind === "top")!.solid;
    const node = parts.find((p) => p.kind === "node-1")!.solid;
    const b = node.boundingBox();
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const unlocked = node.translate([-cx, -cy, 0]).rotate([0, 0, 45]).translate([cx, cy, 0]);
    expect(vol(unlocked, top)).toBeGreaterThan(0.5);
  });

  it("rail: T-slot keys on both sides and in the decks, mate with neighbours", () => {
    check("rail");
    check("rail", { front: "drawer" });
    neighbour("rail", [2 * UNIT, 0, 0]);
    neighbour("rail", [0, 0, 2 * UNIT]);
  });

  it("clip: bowtie keys bridge two cubes", () => {
    check("clip");
    check("clip", { w: 1, d: 1, h: 1 });
    neighbour("clip", [2 * UNIT, 0, 0]);
  });

  it("every joint fits the bed at 4x4x4", () => {
    for (const j of ["lego", "twist", "rail", "clip"] as Joint[]) fits(j);
  });
});
