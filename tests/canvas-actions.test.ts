import { describe, expect, it } from "vitest";
import {
  addCube,
  cubeSizeMm,
  layoutPlacements,
  moveCube,
  type Layout,
} from "@/lib/brick/layout";
import { DEFAULT_CUBE, type CubeSpec } from "@/lib/brick/spec";

describe("canvas actions - UI sequences", () => {
  const spec: CubeSpec = { ...DEFAULT_CUBE, w: 2, d: 2, h: 2 };

  it("simulates real UI sequence: add 3 cubes, up on cube 3, right on cube 1, left at edge, and placement offsets", () => {
    let layout: Layout = { cubes: [] };

    // 1. add 3 cubes -> cells (0,0)(1,0)(2,0), all distinct
    layout = addCube(layout, spec);
    layout = addCube(layout, spec);
    layout = addCube(layout, spec);

    expect(layout.cubes).toHaveLength(3);
    const [c1, c2, c3] = layout.cubes;

    expect(c1.x).toBe(0);
    expect(c1.z).toBe(0);
    expect(c2.x).toBe(1);
    expect(c2.z).toBe(0);
    expect(c3.x).toBe(2);
    expect(c3.z).toBe(0);

    // All distinct IDs
    const ids = new Set(layout.cubes.map((c) => c.id));
    expect(ids.size).toBe(3);

    // All distinct cells
    const cells = new Set(layout.cubes.map((c) => `${c.x},${c.z}`));
    expect(cells.size).toBe(3);

    // 2. up on cube 3 -> it sits at (1,1) and no floating/overlap
    const resUp = moveCube(layout, c3.id, 0, 1);
    expect(resUp.error).toBeUndefined();
    layout = resUp.layout;

    const c3AfterUp = layout.cubes.find((c) => c.id === c3.id);
    expect(c3AfterUp?.x).toBe(1);
    expect(c3AfterUp?.z).toBe(1);

    // No floating: every cube at z > 0 has a cube directly below it at (x, z - 1)
    const hasFloating = layout.cubes.some(
      (c) => c.z > 0 && !layout.cubes.some((other) => other.x === c.x && other.z === c.z - 1)
    );
    expect(hasFloating).toBe(false);

    // No overlap: distinct cell coordinates
    const cellsAfterUp = new Set(layout.cubes.map((c) => `${c.x},${c.z}`));
    expect(cellsAfterUp.size).toBe(3);

    // 3. right on cube 1 -> swaps with neighbour (cube 2 at 1,0)
    const resRight = moveCube(layout, c1.id, 1, 0);
    expect(resRight.error).toBeUndefined();
    layout = resRight.layout;

    const c1AfterRight = layout.cubes.find((c) => c.id === c1.id);
    const c2AfterRight = layout.cubes.find((c) => c.id === c2.id);
    expect(c1AfterRight?.x).toBe(1);
    expect(c1AfterRight?.z).toBe(0);
    expect(c2AfterRight?.x).toBe(0);
    expect(c2AfterRight?.z).toBe(0);

    // 4. left at edge -> error string
    // Cube 2 is at (0, 0), which is at the left edge
    const resLeft = moveCube(layout, c2.id, -1, 0);
    expect(resLeft.error).toBe("Already at the left end");
    expect(resLeft.layout).toBe(layout);

    // 5. layoutPlacements offsets for stacked cube have z offset = cube height
    // Cube 3 is at (1, 1), stacked on top of Cube 1 at (1, 0)
    const placements = layoutPlacements(layout);
    const p1 = placements.find((p) => p.id === c1.id);
    const p3 = placements.find((p) => p.id === c3.id);
    const cubeH = cubeSizeMm(spec).h;

    expect(p1).toBeDefined();
    expect(p3).toBeDefined();
    expect(p1?.offset[2]).toBe(0);
    expect(p3?.offset[2]).toBe(cubeH);
  });

  it("up with single cube -> error", () => {
    let layout: Layout = { cubes: [] };
    layout = addCube(layout, spec);
    expect(layout.cubes).toHaveLength(1);

    const res = moveCube(layout, layout.cubes[0].id, 0, 1);
    expect(res.error).toBe("Nothing to stack on");
    expect(res.layout).toBe(layout);
  });
});
