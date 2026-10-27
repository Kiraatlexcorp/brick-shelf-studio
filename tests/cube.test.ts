import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, buildFitTile, printParts } from "@/lib/brick/cube";
import { boundsOf } from "@/lib/export/threemf";
import { meshTo3mf } from "@/lib/export/threemf";
import { A1_BED, DEFAULT_CUBE, UNIT } from "@/lib/brick/spec";

const m = await Module();
m.setup();

describe("cube", () => {
  it("default cube has 5 panels (front open), each a valid solid", () => {
    const panels = buildCube(m, DEFAULT_CUBE);
    expect(panels.map((p) => p.kind).sort()).toEqual(["back", "bottom", "left", "right", "top"]);
    for (const p of panels) {
      expect(p.solid.status()).toBe("NoError");
      expect(p.solid.genus()).toBeGreaterThanOrEqual(0);
      expect(p.solid.volume()).toBeGreaterThan(0);
    }
  });

  it("every printed panel lies flat and fits the A1 bed at 4x4x4", () => {
    const panels = buildCube(m, { ...DEFAULT_CUBE, w: 4, d: 4, h: 4, front: "wall" });
    for (const part of printParts(panels)) {
      const b = boundsOf(part);
      expect(b.maxX - b.minX).toBeLessThanOrEqual(A1_BED);
      expect(b.maxY - b.minY).toBeLessThanOrEqual(A1_BED);
      // flat: thickness (z) is small next to the footprint
      expect(b.maxZ - b.minZ).toBeLessThan(UNIT / 2);
    }
  });

  it("walls and decks do not overlap when assembled", () => {
    const panels = buildCube(m, { ...DEFAULT_CUBE, front: "wall" });
    for (let i = 0; i < panels.length; i++)
      for (let j = i + 1; j < panels.length; j++)
        expect(panels[i].solid.intersect(panels[j].solid).volume()).toBeLessThan(1e-3);
  });

  it("exports a 3MF and a fit tile", () => {
    const bytes = meshTo3mf(printParts(buildCube(m, DEFAULT_CUBE)), A1_BED, "cube");
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(buildFitTile(m)).toHaveLength(2);
  });
});
