import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, gridfinityLayout, gridfinityPlate, GF } from "@/lib/brick/cube";
import { DEFAULT_CUBE, type CubeSpec } from "@/lib/brick/spec";

const m = await Module();
m.setup();
const spec = (o: Partial<CubeSpec>): CubeSpec => ({ ...DEFAULT_CUBE, front: "drawer", gridfinity: true, ...o } as CubeSpec);

describe("gridfinity baseplate", () => {
  it("2x1 plate matches spec dims: 84 x 42 x 4.65, socket profile 0.7/1.8/2.15", () => {
    const p = gridfinityPlate(m, 0, 0, 0, 2, 1);
    const b = p.boundingBox();
    expect(b.max[0] - b.min[0]).toBeCloseTo(84, 2);
    expect(b.max[1] - b.min[1]).toBeCloseTo(42, 2);
    expect(b.max[2] - b.min[2]).toBeCloseTo(GF.height, 2);
    expect(GF.height).toBeCloseTo(0.7 + 1.8 + 2.15, 6);
    // straight section: a slice at z=3 has socket walls 0.7 from cell edge -> material ring ~ cell perimeter * 1.4
    const area = (z: number) => p.slice(z).area();
    const atStraight = area(3);
    expect(area(2.5)).toBeCloseTo(atStraight, 0);
    // bottom chamfer: more material lower down, top knife edge has almost none
    expect(area(0.3)).toBeGreaterThan(atStraight * 2);
    expect(area(4.6)).toBeLessThan(atStraight * 0.5);
  });

  it("dividers 0: one compartment of whole cells", () => {
    const g = gridfinityLayout(spec({ w: 3, d: 3, dividers: 0 }));
    expect(g.comps).toHaveLength(1);
    expect(g.comps[0].cols).toBe(Math.floor((g.inner[0] - 2 * GF.gap) / 42));
    expect(g.rows).toBe(Math.floor((g.inner[1] - 2 * GF.gap) / 42));
    expect(g.comps[0].cols * 42).toBeLessThanOrEqual(g.inner[0]);
  });

  for (const w of [3, 4, 5, 6])
    for (const dividers of [1, 2, 3])
      it(`w=${w} dividers=${dividers}: compartments hold whole cells, dividers sit on cell lines`, () => {
        const g = gridfinityLayout(spec({ w, d: 3, dividers }));
        expect(g.dividerX).toHaveLength(dividers);
        const end = g.comps.at(-1)!;
        expect(end.x + end.w).toBeCloseTo(g.inner[0], 3);
        for (const c of g.comps) expect(c.cols * 42 + 2 * GF.gap).toBeLessThanOrEqual(c.w + 1e-6);
        g.comps.forEach((c, i) => i < dividers && expect(g.dividerX[i]).toBeCloseTo(c.x + c.w, 6));
        if (g.comps.some((c) => c.cols === 0)) expect(g.warn).toMatch(/can't land/);
      });

  it("warns when dividers outnumber columns", () => {
    expect(gridfinityLayout(spec({ w: 2, dividers: 2 })).warn).toMatch(/can't land/);
  });

  it("drawer with 2 dividers builds as one solid with plates in each compartment", () => {
    const s = spec({ w: 5, d: 3, dividers: 2 });
    const g = gridfinityLayout(s);
    expect(g.comps.every((c) => c.cols >= 1)).toBe(true);
    const off = buildCube(m, { ...s, gridfinity: false }).find((p) => p.kind === "drawer-1")!.solid.volume();
    const on = buildCube(m, s).find((p) => p.kind === "drawer-1")!;
    expect(on.solid.decompose().length).toBe(1);
    const plates = g.comps.reduce((a, c) => a + gridfinityPlate(m, 0, 0, 0, c.cols, g.rows).volume(), 0);
    expect(on.solid.volume() - off).toBeGreaterThan(plates * 0.9);
  });
});
