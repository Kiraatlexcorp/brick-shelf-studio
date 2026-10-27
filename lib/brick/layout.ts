import type { ManifoldToplevel } from "manifold-3d";
import { buildCube, printParts } from "@/lib/brick/cube";
import type { MeshPart } from "@/lib/brick/mesh";
import { normalize, UNIT, type CubeSpec } from "@/lib/brick/spec";

export type Placed = {
  id: string;
  x: number;
  y: number;
  z: number;
  spec: CubeSpec;
};

export type Layout = {
  cubes: Placed[];
};

export type LayoutSize = {
  width: number;
  depth: number;
  height: number;
  w: number;
  d: number;
  h: number;
};

/** Checks whether a grid cell (x, z) is occupied by any cube in the layout. */
export function occupied(layout: Layout, x: number, z: number): boolean {
  return layout.cubes.some((c) => c.x === x && c.z === z);
}

/** Computes outer size of a cube spec in millimetres. */
export function cubeSizeMm(spec: CubeSpec): LayoutSize {
  const s = normalize(spec);
  const w = s.w * UNIT;
  const d = s.d * UNIT;
  const h = s.h * UNIT;
  return {
    width: w,
    depth: d,
    height: h,
    w,
    d,
    h,
  };
}

/** Computes grid column count and row/stack level count of the layout. */
export function layoutBounds(layout: Layout): { cols: number; rows: number } {
  if (layout.cubes.length === 0) {
    return { cols: 0, rows: 0 };
  }
  const cols = Math.max(...layout.cubes.map((c) => c.x)) + 1;
  const rows = Math.max(...layout.cubes.map((c) => c.z)) + 1;
  return {
    cols: Math.max(0, cols),
    rows: Math.max(0, rows),
  };
}

/** Computes the overall dimensions of the layout in millimetres. */
export function layoutSizeMm(layout: Layout): LayoutSize {
  if (layout.cubes.length === 0) {
    return { width: 0, depth: 0, height: 0, w: 0, d: 0, h: 0 };
  }
  const { cols, rows } = layoutBounds(layout);

  const fallbackW = Math.max(...layout.cubes.map((c) => cubeSizeMm(c.spec).w));
  const fallbackH = Math.max(...layout.cubes.map((c) => cubeSizeMm(c.spec).h));

  let totalW = 0;
  for (let x = 0; x < cols; x++) {
    const colCubes = layout.cubes.filter((c) => c.x === x);
    if (colCubes.length > 0) {
      totalW += Math.max(...colCubes.map((c) => cubeSizeMm(c.spec).w));
    } else {
      totalW += fallbackW;
    }
  }

  let totalH = 0;
  for (let z = 0; z < rows; z++) {
    const rowCubes = layout.cubes.filter((c) => c.z === z);
    if (rowCubes.length > 0) {
      totalH += Math.max(...rowCubes.map((c) => cubeSizeMm(c.spec).h));
    } else {
      totalH += fallbackH;
    }
  }

  const depth = Math.max(...layout.cubes.map((c) => cubeSizeMm(c.spec).d));

  return {
    width: totalW,
    depth,
    height: totalH,
    w: totalW,
    d: depth,
    h: totalH,
  };
}

function nextId(layout: Layout): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cube-${layout.cubes.length + 1}-${Date.now()}`;
}

/**
 * Adds a cube to the layout.
 * If `at` is provided, attempts to place at (at.x, at.z).
 * If `at` is omitted, places at first free cell on row 0 to the right.
 */
export function addCube(
  layout: Layout,
  spec: CubeSpec,
  at?: { x?: number; z?: number; id?: string }
): Layout {
  let targetX = at?.x;
  let targetZ = at?.z ?? 0;

  if (targetX === undefined) {
    let x = 0;
    while (occupied(layout, x, targetZ)) {
      x++;
    }
    targetX = x;
  }

  // Refuse invalid coordinates
  if (targetX < 0 || targetZ < 0) return layout;
  // Refuse overlaps
  if (occupied(layout, targetX, targetZ)) return layout;
  // Refuse floating (z > 0 needs a cube under it at same x, z - 1)
  if (targetZ > 0 && !occupied(layout, targetX, targetZ - 1)) return layout;

  const id = at?.id ?? nextId(layout);

  const placed: Placed = {
    id,
    x: targetX,
    y: 0,
    z: targetZ,
    spec: normalize(spec),
  };

  return {
    cubes: [...layout.cubes, placed],
  };
}

/**
 * Moves a cube by dx, dz grid cells.
 * Refuses overlaps, z < 0, and moving if any cube would float
 * (z > 0 needs a cube under it at same x, z - 1).
 */
export function moveCube(
  layout: Layout,
  id: string,
  dx: number,
  dz: number
): Layout {
  const cube = layout.cubes.find((c) => c.id === id);
  if (!cube) return layout;
  if (dx === 0 && dz === 0) return layout;

  const newX = cube.x + dx;
  const newZ = cube.z + dz;

  // Refuse z < 0 and x < 0
  if (newZ < 0 || newX < 0) return layout;

  // Refuse overlaps
  if (layout.cubes.some((c) => c.id !== id && c.x === newX && c.z === newZ)) {
    return layout;
  }

  // Candidate layout after moving
  const candidateCubes = layout.cubes.map((c) =>
    c.id === id ? { ...c, x: newX, z: newZ } : c
  );

  // Refuse if any cube would float (z > 0 needs a cube under it at same x, z - 1)
  const hasFloating = candidateCubes.some(
    (c) => c.z > 0 && !candidateCubes.some((other) => other.x === c.x && other.z === c.z - 1)
  );
  if (hasFloating) return layout;

  return {
    cubes: candidateCubes,
  };
}

/** Removes a cube by id from the layout. */
export function removeCube(layout: Layout, id: string): Layout {
  return {
    cubes: layout.cubes.filter((c) => c.id !== id),
  };
}

/**
 * Builds each cube with buildCube + printParts and prefixes part names with "cube-<n>-"
 * so all parts of all cubes can go into one 3MF via meshTo3mf.
 */
export function layoutPrintParts(m: ManifoldToplevel, layout: Layout): MeshPart[] {
  const parts: MeshPart[] = [];
  layout.cubes.forEach((cube, index) => {
    const panels = buildCube(m, cube.spec);
    const cubeParts = printParts(panels);
    for (const part of cubeParts) {
      parts.push({
        ...part,
        name: `cube-${index}-${part.name}`,
      });
    }
  });
  return parts;
}
