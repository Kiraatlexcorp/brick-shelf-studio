import { describe, expect, it } from "vitest";
import { fitGrid, gridLayout } from "@/lib/brick/measure";
import { layoutSizeMm } from "@/lib/brick/layout";
import { DEFAULT_CUBE, UNIT, type CubeSpec } from "@/lib/brick/spec";

describe("measure your space - fitGrid and gridLayout", () => {
  const spec: CubeSpec = { ...DEFAULT_CUBE, w: 2, d: 2, h: 2 };
  // Cube size in mm: 2 * 40 = 80mm in each dimension
  const cubeMm = 2 * UNIT;

  it("exact-fit boundary", () => {
    const margin = 10;
    // Exactly fits 1 cube: width = 80 + 2 * 10 = 100, height = 80 + 2 * 10 = 100, depth = 80
    const exact1x1 = { w: cubeMm + 2 * margin, h: cubeMm + 2 * margin, d: cubeMm };
    const resExact = fitGrid(exact1x1, spec, margin);
    expect(resExact.fits).toBe(true);
    expect(resExact.cols).toBe(1);
    expect(resExact.rows).toBe(1);
    expect(resExact.used.w).toBe(cubeMm);
    expect(resExact.used.h).toBe(cubeMm);
    expect(resExact.used.d).toBe(cubeMm);
    expect(resExact.leftover.w).toBe(2 * margin);
    expect(resExact.leftover.h).toBe(2 * margin);
    expect(resExact.reason).toBeUndefined();

    // 1 mm less width: does not fit 1 cube
    const narrow = fitGrid({ w: exact1x1.w - 1, h: exact1x1.h, d: exact1x1.d }, spec, margin);
    expect(narrow.fits).toBe(false);
    expect(narrow.cols).toBe(0);
    expect(narrow.reason).toBeDefined();

    // 1 mm less height: does not fit 1 cube
    const short = fitGrid({ w: exact1x1.w, h: exact1x1.h - 1, d: exact1x1.d }, spec, margin);
    expect(short.fits).toBe(false);
    expect(short.rows).toBe(0);
    expect(short.reason).toBeDefined();

    // 1 mm less depth: depth is too shallow
    const shallow = fitGrid({ w: exact1x1.w, h: exact1x1.h, d: exact1x1.d - 1 }, spec, margin);
    expect(shallow.fits).toBe(false);
    expect(shallow.reason?.toLowerCase()).toContain("depth");

    // Exact fit for 2 cols × 3 rows
    const exact2x3 = {
      w: 2 * cubeMm + 2 * margin,
      h: 3 * cubeMm + 2 * margin,
      d: cubeMm,
    };
    const res2x3 = fitGrid(exact2x3, spec, margin);
    expect(res2x3.fits).toBe(true);
    expect(res2x3.cols).toBe(2);
    expect(res2x3.rows).toBe(3);
    expect(res2x3.used.w).toBe(2 * cubeMm);
    expect(res2x3.used.h).toBe(3 * cubeMm);

    // 1 mm less width -> cols drops to 1
    const sub2x3 = fitGrid({ w: exact2x3.w - 1, h: exact2x3.h, d: exact2x3.d }, spec, margin);
    expect(sub2x3.fits).toBe(true);
    expect(sub2x3.cols).toBe(1);
    expect(sub2x3.rows).toBe(3);
  });

  it("too-shallow depth returns fits: false with reason", () => {
    // Generous width and height, but depth < cube depth (80mm)
    const space = { w: 800, h: 600, d: 50 };
    const res = fitGrid(space, spec);
    expect(res.fits).toBe(false);
    expect(res.reason).toBeDefined();
    expect(res.reason?.toLowerCase()).toContain("depth");
    expect(res.reason?.toLowerCase()).toContain("shallow");
  });

  it("zero fit when space is too small for even one cube", () => {
    // Space smaller than a single cube + margins
    const smallSpace = { w: 50, h: 50, d: 300 };
    const res = fitGrid(smallSpace, spec);
    expect(res.fits).toBe(false);
    expect(res.cols).toBe(0);
    expect(res.rows).toBe(0);
    expect(res.used.w).toBe(0);
    expect(res.used.h).toBe(0);
    expect(res.used.d).toBe(0);
    expect(res.reason).toBeDefined();
    expect(res.reason?.toLowerCase()).toContain("not even one cube");

    // Zero width
    const zeroW = fitGrid({ w: 0, h: 600, d: 300 }, spec);
    expect(zeroW.fits).toBe(false);
    expect(zeroW.cols).toBe(0);

    // Zero height
    const zeroH = fitGrid({ w: 800, h: 0, d: 300 }, spec);
    expect(zeroH.fits).toBe(false);
    expect(zeroH.rows).toBe(0);
  });

  it("gridLayout cube count = cols*rows and its layoutSizeMm <= space", () => {
    const space = { w: 800, h: 600, d: 300 };
    const res = fitGrid(space, spec);
    expect(res.fits).toBe(true);
    expect(res.cols).toBeGreaterThan(0);
    expect(res.rows).toBeGreaterThan(0);

    const layout = gridLayout(spec, res.cols, res.rows);
    expect(layout.cubes).toHaveLength(res.cols * res.rows);

    const size = layoutSizeMm(layout);
    expect(size.w).toBeLessThanOrEqual(space.w);
    expect(size.h).toBeLessThanOrEqual(space.h);
    expect(size.d).toBeLessThanOrEqual(space.d);

    expect(size.w).toBe(res.used.w);
    expect(size.h).toBe(res.used.h);
    expect(size.d).toBe(res.used.d);

    // Verify coordinates are arranged in full grid without floating or duplicate cells
    const cells = new Set<string>();
    for (const cube of layout.cubes) {
      const key = `${cube.x},${cube.z}`;
      expect(cells.has(key)).toBe(false);
      cells.add(key);

      expect(cube.x).toBeGreaterThanOrEqual(0);
      expect(cube.x).toBeLessThan(res.cols);
      expect(cube.z).toBeGreaterThanOrEqual(0);
      expect(cube.z).toBeLessThan(res.rows);

      if (cube.z > 0) {
        const hasCubeUnder = layout.cubes.some(
          (other) => other.x === cube.x && other.z === cube.z - 1
        );
        expect(hasCubeUnder).toBe(true);
      }
    }
  });

  it("gridLayout with custom spec dimensions adheres to layoutSizeMm <= space", () => {
    const customSpec: CubeSpec = { ...DEFAULT_CUBE, w: 3, d: 1, h: 2 };
    const space = { w: 750, h: 500, d: 200 };
    const res = fitGrid(space, customSpec);
    expect(res.fits).toBe(true);

    const layout = gridLayout(customSpec, res.cols, res.rows);
    expect(layout.cubes).toHaveLength(res.cols * res.rows);

    const size = layoutSizeMm(layout);
    expect(size.w).toBeLessThanOrEqual(space.w);
    expect(size.h).toBeLessThanOrEqual(space.h);
    expect(size.d).toBeLessThanOrEqual(space.d);
    expect(size.w).toBe(res.used.w);
    expect(size.h).toBe(res.used.h);
    expect(size.d).toBe(res.used.d);
  });

  it("gridLayout with zero or negative dimensions produces empty layout", () => {
    expect(gridLayout(spec, 0, 5).cubes).toHaveLength(0);
    expect(gridLayout(spec, 5, 0).cubes).toHaveLength(0);
    expect(gridLayout(spec, -1, -2).cubes).toHaveLength(0);
  });
});
