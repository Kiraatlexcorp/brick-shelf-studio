import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, previewParts } from "@/lib/brick/cube";
import { assembledBounds, centerOnBed } from "@/lib/brick/center";
import { DEFAULT_CUBE, type CubeSpec } from "@/lib/brick/spec";

const m = await Module();
m.setup();

describe("preview centring", () => {
  for (const o of [{}, { w: 2, d: 1, front: "drawer" }, { w: 3, d: 2, h: 1, front: "door" }] as Partial<CubeSpec>[])
    it(`model bbox centre == bed centre for ${JSON.stringify(o)}`, () => {
      const parts = previewParts(buildCube(m, { ...DEFAULT_CUBE, ...o } as CubeSpec));
      const s = centerOnBed([{ parts }]);
      const b = assembledBounds([{ parts, offset: s }])!;
      expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 6);
      expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(0, 6);
      expect(b.min[2]).toBeCloseTo(0, 6);
    });

  it("layout of several cubes is centred as a whole", () => {
    const parts = previewParts(buildCube(m, DEFAULT_CUBE));
    const groups = [{ parts, offset: [0, 0, 0] as [number, number, number] }, { parts, offset: [80, 0, 0] as [number, number, number] }];
    const s = centerOnBed(groups);
    const b = assembledBounds(groups.map((g) => ({ parts: g.parts, offset: [g.offset[0] + s[0], g.offset[1] + s[1], g.offset[2] + s[2]] as [number, number, number] })))!;
    expect(b.min[0] + b.max[0]).toBeCloseTo(0, 6);
    expect(b.min[1] + b.max[1]).toBeCloseTo(0, 6);
  });
});
