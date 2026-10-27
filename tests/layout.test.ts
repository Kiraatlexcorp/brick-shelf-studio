import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import {
  addCube,
  cubeSizeMm,
  layoutBounds,
  layoutPrintParts,
  layoutSizeMm,
  moveCube,
  occupied,
  removeCube,
  type Layout,
} from "@/lib/brick/layout";
import { DEFAULT_CUBE, UNIT, type CubeSpec } from "@/lib/brick/spec";

const m = await Module();
m.setup();

describe("layout - pure helpers", () => {
  const spec: CubeSpec = { ...DEFAULT_CUBE, w: 2, d: 2, h: 2 };

  it("addCube places cubes at first free cell on row 0 to the right by default", () => {
    let layout: Layout = { cubes: [] };
    expect(occupied(layout, 0, 0)).toBe(false);

    // First cube at (0, 0)
    layout = addCube(layout, spec);
    expect(layout.cubes).toHaveLength(1);
    expect(layout.cubes[0].x).toBe(0);
    expect(layout.cubes[0].y).toBe(0);
    expect(layout.cubes[0].z).toBe(0);
    expect(occupied(layout, 0, 0)).toBe(true);

    // Second cube at (1, 0)
    layout = addCube(layout, spec);
    expect(layout.cubes).toHaveLength(2);
    expect(layout.cubes[1].x).toBe(1);
    expect(layout.cubes[1].z).toBe(0);

    // Third cube at (2, 0)
    layout = addCube(layout, spec);
    expect(layout.cubes).toHaveLength(3);
    expect(layout.cubes[2].x).toBe(2);
    expect(layout.cubes[2].z).toBe(0);
  });

  it("addCube with 'at' respects position and gravity rules", () => {
    let layout: Layout = { cubes: [] };
    // Placing at (0, 0)
    layout = addCube(layout, spec, { x: 0, z: 0 });
    expect(layout.cubes).toHaveLength(1);

    // Placing floating cube at (0, 2) when (0, 1) doesn't exist is refused
    const floatAttempt = addCube(layout, spec, { x: 0, z: 2 });
    expect(floatAttempt.cubes).toHaveLength(1);

    // Placing on top of (0, 0) at (0, 1) succeeds
    layout = addCube(layout, spec, { x: 0, z: 1 });
    expect(layout.cubes).toHaveLength(2);
    expect(layout.cubes[1].x).toBe(0);
    expect(layout.cubes[1].z).toBe(1);

    // Placing at an already occupied cell (0, 0) is refused
    const overlapAttempt = addCube(layout, spec, { x: 0, z: 0 });
    expect(overlapAttempt.cubes).toHaveLength(2);
  });

  it("moveCube refuses z < 0", () => {
    let layout: Layout = { cubes: [] };
    layout = addCube(layout, spec, { x: 0, z: 0, id: "c1" });

    // Moving down from z=0 is refused
    const moved = moveCube(layout, "c1", 0, -1);
    expect(moved.layout.cubes[0].z).toBe(0);
    expect(moved.error).toBe("Already on the floor");
  });

  it("moveCube refuses overlaps", () => {
    let layout: Layout = { cubes: [] };
    layout = addCube(layout, spec, { x: 0, z: 0, id: "c1" });
    layout = addCube(layout, spec, { x: 1, z: 0, id: "c2" });

    // Moving c2 into c1's cell (dx = -1, dz = 0) swaps the two cubes
    const moved = moveCube(layout, "c2", -1, 0);
    expect(moved.error).toBeUndefined();
    expect(moved.layout.cubes.find((c) => c.id === "c2")?.x).toBe(0);
    expect(moved.layout.cubes.find((c) => c.id === "c1")?.x).toBe(1);
  });

  it("moveCube refuses floating moves (z > 0 needs cube under it at same x, z - 1)", () => {
    let layout: Layout = { cubes: [] };
    layout = addCube(layout, spec, { x: 0, z: 0, id: "c1" });
    layout = addCube(layout, spec, { x: 1, z: 0, id: "c2" });

    // Moving c2 up stacks it on c1 at (0, 1)
    const stacked = moveCube(layout, "c2", 0, 1);
    expect(stacked.error).toBeUndefined();
    expect(stacked.layout.cubes.find((c) => c.id === "c2")?.x).toBe(0);
    expect(stacked.layout.cubes.find((c) => c.id === "c2")?.z).toBe(1);

    // Moving c2 right into empty air without support is refused
    const float1 = moveCube(stacked.layout, "c2", 1, 0);
    expect(float1.error).toBe("Nothing to stand on there");
    expect(float1.layout).toBe(stacked.layout);

    // Moving base cube c1 away applies gravity so c2 falls down to floor rather than floating
    const moveBase = moveCube(stacked.layout, "c1", 1, 0);
    expect(moveBase.error).toBeUndefined();
    expect(moveBase.layout.cubes.find((c) => c.id === "c1")?.x).toBe(1);
    expect(moveBase.layout.cubes.find((c) => c.id === "c2")?.z).toBe(0);
  });

  it("removeCube removes the target cube", () => {
    let layout: Layout = { cubes: [] };
    layout = addCube(layout, spec, { x: 0, z: 0, id: "c1" });
    layout = addCube(layout, spec, { x: 1, z: 0, id: "c2" });

    const removed = removeCube(layout, "c1");
    expect(removed.cubes).toHaveLength(1);
    expect(removed.cubes[0].id).toBe("c2");
    expect(occupied(removed, 0, 0)).toBe(false);
    expect(occupied(removed, 1, 0)).toBe(true);
  });

  it("layoutBounds and sizes compute correctly", () => {
    const empty: Layout = { cubes: [] };
    expect(layoutBounds(empty)).toEqual({ cols: 0, rows: 0 });
    expect(layoutSizeMm(empty).w).toBe(0);

    let layout: Layout = { cubes: [] };
    layout = addCube(layout, { ...spec, w: 2, d: 2, h: 2 }, { x: 0, z: 0 });
    layout = addCube(layout, { ...spec, w: 2, d: 2, h: 2 }, { x: 2, z: 0 });
    layout = addCube(layout, { ...spec, w: 2, d: 2, h: 2 }, { x: 2, z: 1 });

    const bounds = layoutBounds(layout);
    expect(bounds.cols).toBe(3);
    expect(bounds.rows).toBe(2);

    const singleSize = cubeSizeMm(spec);
    expect(singleSize.w).toBe(2 * UNIT);
    expect(singleSize.d).toBe(2 * UNIT);
    expect(singleSize.h).toBe(2 * UNIT);

    const size = layoutSizeMm(layout);
    expect(size.w).toBe(3 * (2 * UNIT));
    expect(size.h).toBe(2 * (2 * UNIT));
    expect(size.d).toBe(2 * UNIT);
  });
});

describe("layoutPrintParts - Manifold export", () => {
  const spec: CubeSpec = { ...DEFAULT_CUBE, w: 1, d: 1, h: 1 };

  it("returns twice the parts for 2 cubes compared to 1 cube", () => {
    const singleLayout: Layout = {
      cubes: [{ id: "c1", x: 0, y: 0, z: 0, spec }],
    };
    const doubleLayout: Layout = {
      cubes: [
        { id: "c1", x: 0, y: 0, z: 0, spec },
        { id: "c2", x: 1, y: 0, z: 0, spec },
      ],
    };

    const singleParts = layoutPrintParts(m, singleLayout);
    const doubleParts = layoutPrintParts(m, doubleLayout);

    expect(singleParts.length).toBeGreaterThan(0);
    expect(doubleParts.length).toBe(2 * singleParts.length);

    // Ensure part names are prefixed with "cube-<n>-"
    expect(doubleParts.some((p) => p.name.startsWith("cube-0-"))).toBe(true);
    expect(doubleParts.some((p) => p.name.startsWith("cube-1-"))).toBe(true);
  });
});
