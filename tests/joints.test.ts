import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, buildJointFit, printParts } from "@/lib/brick/cube";
import { boundsOf } from "@/lib/export/threemf";
import { A1_BED, DEFAULT_CUBE, normalize, UNIT, type CubeSpec, type Joint } from "@/lib/brick/spec";

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
const neighbour = (joint: Joint, offset: [number, number, number], extra: Partial<CubeSpec> = {}) => {
  const { spec, parts } = check(joint, extra);
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
    expect(parts.filter((p) => /^node-\d/.test(p.kind))).toHaveLength(4);
    neighbour("twist", [0, 0, 2 * UNIT]);
    neighbour("twist", [2 * UNIT, 0, 0]);
    check("twist", { front: "drawer" });
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

  it("rail: clip staple locks the key and pins into both cubes", () => {
    const { parts } = check("rail");
    const clip = parts.find((p) => p.kind === "rail-clip-1")!.solid.boundingBox();
    const key = parts.find((p) => p.kind === "rail-key-1")!.solid.boundingBox();
    expect(key.max[2]).toBeLessThan(2 * UNIT - 2.4); // bar sits over the key top, so the key cannot slide up
    expect(clip.max[2]).toBeGreaterThan(2 * UNIT - 0.5);
    expect(clip.min[0]).toBeLessThan(2 * UNIT - 5);
    expect(clip.max[0]).toBeGreaterThan(2 * UNIT + 5);
  });

  it("magnet: 10 x 3 pockets, stubs mate with neighbours above and beside", () => {
    const { spec, parts } = check("magnet");
    check("magnet", { front: "drawer", drawers: 2 });
    const solid = (p: typeof parts) => p.filter((x) => x.group !== "joint");
    for (const off of [[0, 0, 2 * UNIT], [2 * UNIT, 0, 0]] as [number, number, number][]) {
      const other = solid(buildCube(m, spec)).map((p) => p.solid.translate(off));
      for (const a of solid(parts)) for (const b of other) expect(vol(a.solid, b), a.kind).toBeLessThan(0.05);
    }
    const top = parts.find((p) => p.kind === "top")!.solid;
    expect(top.genus()).toBeGreaterThanOrEqual(0);
    expect(top.boundingBox().max[2]).toBeCloseTo(2 * UNIT + 1.5, 1);
  });

  it("mixed mode: each face pair gets its own joint", () => {
    for (const [stack, side] of [["twist", "rail"], ["magnet", "clip"], ["lego", "twist"], ["rail", "magnet"], ["clip", "lego"]] as const) {
      const spec = normalize({ ...DEFAULT_CUBE, joint: "mixed", stack, side });
      neighbour("mixed", [0, 0, 2 * UNIT], spec);
      neighbour("mixed", [2 * UNIT, 0, 0], spec);
      const top = buildCube(m, spec).find((p) => p.kind === "top")!.solid.boundingBox().max[2];
      if (stack === "lego") expect(top).toBeGreaterThan(2 * UNIT + 1);
      else if (stack !== "magnet") expect(top).toBeCloseTo(2 * UNIT, 3);
      expect(spec.dovetail).toBe(side === "lego");
    }
    fits("mixed");
  });

  it("joint fit test: 1-unit print for every joint, joint parts included, fits the bed", () => {
    const specs: Partial<CubeSpec>[] = [
      ...(["lego", "twist", "rail", "clip", "magnet"] as Joint[]).map((joint) => ({ joint })),
      { joint: "mixed", stack: "twist", side: "rail" },
      { joint: "mixed", stack: "magnet", side: "clip" },
      { joint: "lego", wallMount: true },
    ];
    for (const extra of specs) {
      const panels = buildJointFit(m, { ...DEFAULT_CUBE, ...extra });
      for (let i = 0; i < panels.length; i++)
        for (let j = i + 1; j < panels.length; j++) expect(vol(panels[i].solid, panels[j].solid), `${panels[i].kind} vs ${panels[j].kind}`).toBeLessThan(0.05);
      if (extra.joint !== "lego" && extra.joint !== "magnet") expect(panels.some((p) => p.group === "joint"), JSON.stringify(extra)).toBe(true);
      if (extra.wallMount) expect(panels.some((p) => p.kind === "wall-rail")).toBe(true);
      for (const part of printParts(panels)) {
        const b = boundsOf(part);
        for (const v of [b.maxX - b.minX, b.maxY - b.minY]) expect(v).toBeLessThanOrEqual(A1_BED);
      }
    }
  });

  it("wall mode: hook bolts to the back, bevel drops behind the rail, cube floats", () => {
    for (const h of [1, 2, 4]) {
      const { parts } = check("lego", { wallMount: true, h });
      const hook = parts.find((p) => p.kind === "wall-hook")!.solid.boundingBox();
      const rail = parts.find((p) => p.kind === "wall-rail")!.solid.boundingBox();
      expect(hook.min[1]).toBeCloseTo(2 * UNIT, 3); // flush on the back wall
      expect(rail.max[1]).toBeCloseTo(2 * UNIT + 16, 3); // rail against the wall
      expect(hook.max[2]).toBeGreaterThan(rail.max[2]); // hook sits over the rail
      expect(rail.max[0] - rail.min[0]).toBeLessThanOrEqual(A1_BED);
    }
    // no back wall, no wall mode
    expect(buildCube(m, normalize({ ...DEFAULT_CUBE, back: "open", wallMount: true })).some((p) => p.kind === "wall-rail")).toBe(false);
  });

  it("every joint fits the bed at 4x4x4", () => {
    for (const j of ["lego", "twist", "rail", "clip", "magnet"] as Joint[]) fits(j);
  });
});
