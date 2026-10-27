import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, printParts, previewParts } from "@/lib/brick/cube";
import { boundsOf, meshTo3mf } from "@/lib/export/threemf";
import { A1_BED, DEFAULT_CUBE, STUD_H, STUD_R, UNIT, type CubeSpec, type Hinge } from "@/lib/brick/spec";

const m = await Module();
m.setup();

const noOverlap = (spec: CubeSpec, open = false) => {
  const panels = buildCube(m, spec);
  const solids = panels.map((p) => (open && p.open ? p.open : p.solid));
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++)
      expect(solids[i].intersect(solids[j]).volume(), `${panels[i].kind} vs ${panels[j].kind}`).toBeLessThan(0.05);
  return panels;
};
const fitsBed = (spec: CubeSpec) => {
  for (const part of printParts(buildCube(m, spec))) {
    const b = boundsOf(part);
    expect(b.maxX - b.minX, part.name).toBeLessThanOrEqual(A1_BED);
    expect(b.maxY - b.minY, part.name).toBeLessThanOrEqual(A1_BED);
    expect(b.maxZ - b.minZ, part.name).toBeLessThanOrEqual(A1_BED);
  }
};

describe("studs", () => {
  it("use Lego proportions", () => {
    expect((2 * STUD_R) / UNIT).toBeCloseTo(0.6, 2);
    expect(STUD_H / (2 * STUD_R)).toBeCloseTo(0.18, 1);
  });
});

describe("drawers", () => {
  const spec: CubeSpec = { ...DEFAULT_CUBE, front: "drawer", drawers: 2, dividers: 2 };
  it("builds two drawers that clear the cube closed and pulled out", () => {
    const panels = noOverlap(spec);
    noOverlap(spec, true);
    expect(panels.filter((p) => p.group === "drawer")).toHaveLength(2);
    for (const p of panels) expect(p.solid.status()).toBe("NoError");
  });
  it("runner is stopped by the groove lip", () => {
    const panels = buildCube(m, spec);
    const drawer = panels.find((p) => p.kind === "drawer-1")!;
    const left = panels.find((p) => p.kind === "left")!;
    // Pull the drawer fully forward: the runner must hit the wall.
    const depth = drawer.solid.boundingBox().max[1];
    expect(drawer.solid.translate([0, -(depth - 4), 0]).intersect(left.solid).volume()).toBeGreaterThan(0.5);
  });
  it("forces side walls for the rails", () => {
    const panels = buildCube(m, { ...spec, left: "open" });
    expect(panels.some((p) => p.kind === "left")).toBe(true);
  });
  it("fits the bed at 4x4x4", () => fitsBed({ ...spec, w: 4, d: 4, h: 4, drawers: 1 }));
});

describe("doors", () => {
  for (const hinge of ["left", "right", "top", "bottom"] as Hinge[])
    for (const latch of ["magnet", "bump"] as const)
      it(`hinge ${hinge} ${latch}: clears the cube closed and open`, () => {
        const spec: CubeSpec = { ...DEFAULT_CUBE, front: "door", hinge, latch };
        const panels = noOverlap(spec);
        noOverlap(spec, true);
        const door = panels.find((p) => p.group === "door")!;
        expect(door.solid.genus()).toBeGreaterThanOrEqual(0);
        const b = door.solid.boundingBox();
        expect(b.max[1]).toBeLessThanOrEqual(latch === "bump" ? 1.01 : 0.01); // sits in front of the face (bump pokes 1 mm in)
        expect(b.max[0] - b.min[0]).toBeGreaterThan(UNIT * 2 - 10);
      });
  it("works on every side", () => {
    noOverlap({ ...DEFAULT_CUBE, front: "open", back: "door", left: "door", right: "door" });
  });
  it("door plate prints flat", () => {
    const parts = printParts(buildCube(m, { ...DEFAULT_CUBE, front: "door", w: 4, h: 4 }));
    const b = boundsOf(parts.find((p) => p.name === "door-front")!);
    expect(b.maxZ - b.minZ).toBeLessThan(8);
  });
});

describe("sliding doors and strength", () => {
  it("sliding panels clear the cube", () => {
    noOverlap({ ...DEFAULT_CUBE, front: "slide", panels: 2 });
    noOverlap({ ...DEFAULT_CUBE, front: "slide", panels: 1 }, true);
  });
  it("dovetails of side-by-side cubes interlock without overlap", () => {
    const a = buildCube(m, DEFAULT_CUBE);
    const right = a.find((p) => p.kind === "right")!.solid;
    const left = a.find((p) => p.kind === "left")!.solid.translate([DEFAULT_CUBE.w * UNIT, 0, 0]);
    expect(right.intersect(left).volume()).toBeLessThan(0.05);
    // the rails stick out into the neighbour's grooves
    expect(right.boundingBox().max[0]).toBeGreaterThan(DEFAULT_CUBE.w * UNIT + 1);
  });
  it("thicker walls add volume, everything exports", () => {
    const thin = buildCube(m, { ...DEFAULT_CUBE, wall: 4 }).find((p) => p.kind === "left")!.solid.volume();
    const thick = buildCube(m, { ...DEFAULT_CUBE, wall: 8 }).find((p) => p.kind === "left")!.solid.volume();
    expect(thick).toBeGreaterThan(thin * 1.5);
    const parts = buildCube(m, { ...DEFAULT_CUBE, front: "door", back: "slide" });
    expect(meshTo3mf(printParts(parts), A1_BED, "x").byteLength).toBeGreaterThan(1000);
    expect(previewParts(parts, true).every((p) => p.group && p.out)).toBe(true);
  });
});
