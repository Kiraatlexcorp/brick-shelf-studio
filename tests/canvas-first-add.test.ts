import { describe, expect, it } from "vitest";
import {
  addCube,
  defaultLayout,
  occupied,
  parseCanvasStorage,
  removeCube,
} from "@/lib/brick/layout";
import { DEFAULT_CUBE, normalize, type CubeSpec } from "@/lib/brick/spec";

describe("canvas-first-add", () => {
  const spec: CubeSpec = { ...DEFAULT_CUBE, w: 2, d: 2, h: 2 };

  it("fresh init has 1 cube at (0,0)", () => {
    // When storage is missing/null, parseCanvasStorage initialises to 1 cube at (0,0)
    const stored = parseCanvasStorage(null);
    expect(stored.layout.cubes).toHaveLength(1);
    expect(stored.layout.cubes[0].x).toBe(0);
    expect(stored.layout.cubes[0].z).toBe(0);
    expect(stored.selectedId).toBe(stored.layout.cubes[0].id);

    // defaultLayout produces 1 cube at (0,0)
    const layout = defaultLayout(spec);
    expect(layout.cubes).toHaveLength(1);
    expect(layout.cubes[0].x).toBe(0);
    expect(layout.cubes[0].z).toBe(0);
    expect(layout.cubes[0].spec).toEqual(normalize(spec));
    expect(occupied(layout, 0, 0)).toBe(true);
  });

  it("one add -> 2 cubes at (0,0),(1,0)", () => {
    const layout = defaultLayout(spec);
    expect(layout.cubes).toHaveLength(1);
    expect(layout.cubes[0].x).toBe(0);
    expect(layout.cubes[0].z).toBe(0);

    // The first "Add this cube" adds a second cube at (1,0) beside it
    const afterAdd = addCube(layout, spec);
    expect(afterAdd.cubes).toHaveLength(2);

    const [c1, c2] = afterAdd.cubes;
    expect(c1.x).toBe(0);
    expect(c1.z).toBe(0);
    expect(c2.x).toBe(1);
    expect(c2.z).toBe(0);

    expect(c1.id).not.toBe(c2.id);
    expect(occupied(afterAdd, 0, 0)).toBe(true);
    expect(occupied(afterAdd, 1, 0)).toBe(true);
  });

  it("remove last -> still 1 cube", () => {
    // Starting with 1 cube: removing the only cube retains 1 cube (canvas is never empty)
    const singleLayout = defaultLayout(spec);
    expect(singleLayout.cubes).toHaveLength(1);

    const attemptedRemoval = removeCube(singleLayout, singleLayout.cubes[0].id);
    expect(attemptedRemoval.cubes).toHaveLength(1);
    expect(attemptedRemoval.cubes[0].x).toBe(0);
    expect(attemptedRemoval.cubes[0].z).toBe(0);

    // Starting with 2 cubes: removing one leaves 1, removing that last one still leaves 1
    const twoCubesLayout = addCube(singleLayout, spec);
    expect(twoCubesLayout.cubes).toHaveLength(2);

    const afterOneRemove = removeCube(twoCubesLayout, twoCubesLayout.cubes[1].id);
    expect(afterOneRemove.cubes).toHaveLength(1);

    const afterLastRemove = removeCube(afterOneRemove, afterOneRemove.cubes[0].id);
    expect(afterLastRemove.cubes).toHaveLength(1);
  });

  it("bad storage -> 1 cube", () => {
    const badStorageSamples = [
      "",
      "   ",
      "{ bad json",
      "undefined",
      "null",
      "123",
      '"just a string"',
      "[]",
      "{}",
      JSON.stringify({ layout: null }),
      JSON.stringify({ layout: { cubes: [] } }),
      JSON.stringify({ layout: { cubes: "corrupted" } }),
      JSON.stringify({ layout: { cubes: [null, undefined, 123] } }),
      "<html>error</html>",
    ];

    for (const bad of badStorageSamples) {
      const parsed = parseCanvasStorage(bad);
      expect(parsed.layout.cubes).toHaveLength(1);
      expect(parsed.layout.cubes[0].x).toBe(0);
      expect(parsed.layout.cubes[0].z).toBe(0);
      expect(parsed.selectedId).toBe(parsed.layout.cubes[0].id);
    }
  });
});
