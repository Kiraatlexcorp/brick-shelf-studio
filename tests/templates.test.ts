import { describe, expect, it } from "vitest";
import { LAYOUT_TEMPLATES } from "@/lib/brick/templates";
import { DEFAULT_CUBE, type CubeSpec } from "@/lib/brick/spec";

describe("shelf layout templates", () => {
  it("every template has a unique id", () => {
    expect(LAYOUT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const ids = LAYOUT_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.trim().length).toBeGreaterThan(0);
    }
  });

  it("every template has >= 1 cube", () => {
    for (const template of LAYOUT_TEMPLATES) {
      const layout = template.build(DEFAULT_CUBE);
      expect(layout.cubes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("no two cubes share a cell in any template", () => {
    for (const template of LAYOUT_TEMPLATES) {
      const layout = template.build(DEFAULT_CUBE);
      const cells = new Set<string>();
      for (const cube of layout.cubes) {
        const key = `${cube.x},${cube.z}`;
        expect(cells.has(key)).toBe(false);
        cells.add(key);
      }
      expect(cells.size).toBe(layout.cubes.length);
    }
  });

  it("every cube with z > 0 has a cube under it at (x, z - 1)", () => {
    for (const template of LAYOUT_TEMPLATES) {
      const layout = template.build(DEFAULT_CUBE);
      for (const cube of layout.cubes) {
        if (cube.z > 0) {
          const hasCubeUnder = layout.cubes.some(
            (other) => other.x === cube.x && other.z === cube.z - 1
          );
          expect(hasCubeUnder).toBe(true);
        }
      }
    }
  });

  it("preserves validity with custom cube specs", () => {
    const customSpec: CubeSpec = { ...DEFAULT_CUBE, w: 3, d: 2, h: 1, joint: "twist" };
    for (const template of LAYOUT_TEMPLATES) {
      const layout = template.build(customSpec);
      expect(layout.cubes.length).toBeGreaterThanOrEqual(1);

      const cells = new Set<string>();
      for (const cube of layout.cubes) {
        const key = `${cube.x},${cube.z}`;
        expect(cells.has(key)).toBe(false);
        cells.add(key);

        if (cube.z > 0) {
          const hasCubeUnder = layout.cubes.some(
            (other) => other.x === cube.x && other.z === cube.z - 1
          );
          expect(hasCubeUnder).toBe(true);
        }
      }
    }
  });

  it("includes all requested presets", () => {
    const names = LAYOUT_TEMPLATES.map((t) => t.name);
    expect(names).toContain("Single row (3)");
    expect(names).toContain("2×2 block");
    expect(names).toContain("Staircase (3-2-1)");
    expect(names).toContain("Tower (1×4)");
    expect(names).toContain("Bookshelf 3×3");
  });
});
