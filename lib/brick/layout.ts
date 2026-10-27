import type { ManifoldToplevel } from "manifold-3d";
import { buildCube, printParts } from "@/lib/brick/cube";
import type { MeshPart } from "@/lib/brick/mesh";
import { DEFAULT_CUBE, normalize, UNIT, type CubeSpec } from "@/lib/brick/spec";

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
    let x = layout.cubes.length === 0 ? 0 : Math.max(...layout.cubes.map((c) => c.x)) + 1;
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

export type MoveResult = {
  layout: Layout;
  error?: string;
};

/**
 * Applies gravity so cubes fall down to fill gaps in their column,
 * and shifts columns so min x = 0 and columns have no gaps.
 */
function applyGravityAndCompaction(cubes: Placed[]): Placed[] {
  // Step 1: Apply gravity within each column
  const colMap = new Map<number, Placed[]>();
  for (const c of cubes) {
    const list = colMap.get(c.x) ?? [];
    list.push(c);
    colMap.set(c.x, list);
  }

  const newZMap = new Map<string, number>();
  for (const [, colCubes] of colMap.entries()) {
    const sorted = [...colCubes].sort((a, b) => a.z - b.z);
    sorted.forEach((c, idx) => {
      newZMap.set(c.id, idx);
    });
  }

  // Step 2: Shift so min x = 0 and columns have no gaps
  const uniqueXs = Array.from(new Set(cubes.map((c) => c.x))).sort((a, b) => a - b);
  const xMapping = new Map<number, number>();
  uniqueXs.forEach((oldX, newX) => {
    xMapping.set(oldX, newX);
  });

  return cubes.map((c) => ({
    ...c,
    x: xMapping.get(c.x) ?? 0,
    z: newZMap.get(c.id) ?? 0,
  }));
}

/**
 * Moves a cube by dx, dz grid cells or named direction with the following semantics:
 * - left/right: target (x±1, z). If occupied, SWAP the two cubes. If x would be < 0 -> error "Already at the left end".
 *   Moving right past the last column is allowed onto empty only if z==0 or supported (cube at target x, z-1),
 *   else error "Nothing to stand on there".
 * - up: stack the cube on top of the nearest other column (prefer left neighbour column x-1, else x+1):
 *   new x = that column, new z = that column's height (first free level). If there is no neighbour column -> error "Nothing to stack on".
 * - down: if z>0 move to (x, z-1) or swap with the cube below; if z==0 and other columns exist,
 *   move it to the floor at the first free column to the right of the row; else error "Already on the floor".
 * - After every successful move apply gravity (cubes fall down to fill gaps in their column)
 *   and shift so min x = 0 and columns have no gaps. Never produce overlaps or floating cubes.
 */
export function moveCube(
  layout: Layout,
  id: string,
  dxOrDir: number | "left" | "right" | "up" | "down",
  dzInput?: number
): MoveResult {
  const cube = layout.cubes.find((c) => c.id === id);
  if (!cube) return { layout };

  let dx = 0;
  let dz = 0;

  if (typeof dxOrDir === "string") {
    switch (dxOrDir) {
      case "left":
        dx = -1;
        break;
      case "right":
        dx = 1;
        break;
      case "up":
        dz = 1;
        break;
      case "down":
        dz = -1;
        break;
    }
  } else {
    dx = dxOrDir;
    dz = dzInput ?? 0;
  }

  if (dx === 0 && dz === 0) return { layout };

  const nextCubes = layout.cubes.map((c) => ({ ...c }));
  const moving = nextCubes.find((c) => c.id === id)!;

  // UP: stack the cube on top of the nearest other column (prefer left neighbour x-1, else x+1)
  if (dz > 0) {
    const otherCols = Array.from(
      new Set(nextCubes.filter((c) => c.id !== id && c.x !== moving.x).map((c) => c.x))
    );

    if (otherCols.length === 0) {
      return { layout, error: "Nothing to stack on" };
    }

    let targetCol: number;
    if (otherCols.includes(moving.x - 1)) {
      targetCol = moving.x - 1;
    } else if (otherCols.includes(moving.x + 1)) {
      targetCol = moving.x + 1;
    } else {
      const sorted = [...otherCols].sort((a, b) => {
        const distA = Math.abs(a - moving.x);
        const distB = Math.abs(b - moving.x);
        if (distA !== distB) return distA - distB;
        return a - b;
      });
      targetCol = sorted[0];
    }

    const targetColCubes = nextCubes.filter((c) => c.id !== id && c.x === targetCol);
    moving.x = targetCol;
    moving.z = targetColCubes.length;

    return { layout: { cubes: applyGravityAndCompaction(nextCubes) } };
  }

  // DOWN: if z>0 move to (x, z-1) or swap with cube below; if z==0 and other columns exist, move to floor at first free column to right of row; else error "Already on the floor"
  if (dz < 0) {
    if (moving.z > 0) {
      const targetZ = moving.z - 1;
      const cubeBelow = nextCubes.find(
        (c) => c.id !== id && c.x === moving.x && c.z === targetZ
      );
      if (cubeBelow) {
        cubeBelow.z = moving.z;
        moving.z = targetZ;
      } else {
        moving.z = targetZ;
      }
      return { layout: { cubes: applyGravityAndCompaction(nextCubes) } };
    }

    const otherCols = Array.from(
      new Set(nextCubes.filter((c) => c.id !== id && c.x !== moving.x).map((c) => c.x))
    );
    if (otherCols.length === 0) {
      return { layout, error: "Already on the floor" };
    }

    const maxX = Math.max(...nextCubes.map((c) => c.x));
    moving.x = maxX + 1;
    moving.z = 0;

    return { layout: { cubes: applyGravityAndCompaction(nextCubes) } };
  }

  // LEFT / RIGHT: target (x±1, z)
  const targetX = moving.x + (dx > 0 ? 1 : -1);
  const targetZ = moving.z;

  if (targetX < 0) {
    return { layout, error: "Already at the left end" };
  }

  const occupant = nextCubes.find(
    (c) => c.id !== id && c.x === targetX && c.z === targetZ
  );

  if (occupant) {
    // SWAP the two cubes
    occupant.x = moving.x;
    moving.x = targetX;
  } else {
    // Allowed onto empty only if z==0 or supported (cube at target x, z-1)
    const isSupported =
      targetZ === 0 ||
      nextCubes.some((c) => c.id !== id && c.x === targetX && c.z === targetZ - 1);
    if (!isSupported) {
      return { layout, error: "Nothing to stand on there" };
    }
    moving.x = targetX;
  }

  return { layout: { cubes: applyGravityAndCompaction(nextCubes) } };
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

export type LayoutPlacement = {
  id: string;
  offset: [number, number, number];
  cube: Placed;
};

/**
 * Computes the 3D mm offset [x, y, z] for each placed cube in the layout.
 * Uses the exact column width and row height spacing of layoutSizeMm so stacked cubes sit on each other.
 */
export function layoutPlacements(layout: Layout): LayoutPlacement[] {
  if (layout.cubes.length === 0) {
    return [];
  }
  const { cols, rows } = layoutBounds(layout);

  const fallbackW = Math.max(...layout.cubes.map((c) => cubeSizeMm(c.spec).w));
  const fallbackH = Math.max(...layout.cubes.map((c) => cubeSizeMm(c.spec).h));

  const colWidths: number[] = [];
  for (let x = 0; x < cols; x++) {
    const colCubes = layout.cubes.filter((c) => c.x === x);
    colWidths[x] =
      colCubes.length > 0
        ? Math.max(...colCubes.map((c) => cubeSizeMm(c.spec).w))
        : fallbackW;
  }

  const colXOffsets: number[] = [0];
  for (let x = 1; x < cols; x++) {
    colXOffsets[x] = colXOffsets[x - 1] + colWidths[x - 1];
  }

  const rowHeights: number[] = [];
  for (let z = 0; z < rows; z++) {
    const rowCubes = layout.cubes.filter((c) => c.z === z);
    rowHeights[z] =
      rowCubes.length > 0
        ? Math.max(...rowCubes.map((c) => cubeSizeMm(c.spec).h))
        : fallbackH;
  }

  const rowZOffsets: number[] = [0];
  for (let z = 1; z < rows; z++) {
    rowZOffsets[z] = rowZOffsets[z - 1] + rowHeights[z - 1];
  }

  return layout.cubes.map((cube) => ({
    id: cube.id,
    offset: [colXOffsets[cube.x] ?? 0, 0, rowZOffsets[cube.z] ?? 0],
    cube,
  }));
}

export const CANVAS_STORAGE_KEY = "brick-canvas-v1";

export function parseCanvasStorage(raw: string | null | undefined): {
  layout: Layout;
  selectedId: string | null;
} {
  const fallback: { layout: Layout; selectedId: string | null } = {
    layout: { cubes: [] },
    selectedId: null,
  };

  if (!raw || typeof raw !== "string") {
    return fallback;
  }

  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") {
      return fallback;
    }

    const rawCubes = (data as { layout?: { cubes?: unknown } })?.layout?.cubes;
    if (!Array.isArray(rawCubes)) {
      return fallback;
    }

    const validCubes: Placed[] = [];
    for (const c of rawCubes) {
      if (!c || typeof c !== "object") continue;
      const cubeObj = c as Record<string, unknown>;
      const id =
        typeof cubeObj.id === "string" && cubeObj.id.length > 0
          ? cubeObj.id
          : `cube-${validCubes.length + 1}`;
      const x =
        typeof cubeObj.x === "number" && Number.isFinite(cubeObj.x) && cubeObj.x >= 0
          ? Math.floor(cubeObj.x)
          : 0;
      const y =
        typeof cubeObj.y === "number" && Number.isFinite(cubeObj.y)
          ? Math.floor(cubeObj.y)
          : 0;
      const z =
        typeof cubeObj.z === "number" && Number.isFinite(cubeObj.z) && cubeObj.z >= 0
          ? Math.floor(cubeObj.z)
          : 0;
      const rawSpec =
        cubeObj.spec && typeof cubeObj.spec === "object"
          ? (cubeObj.spec as CubeSpec)
          : DEFAULT_CUBE;
      const spec = normalize(rawSpec);

      validCubes.push({
        id,
        x,
        y,
        z,
        spec,
      });
    }

    let selectedId: string | null = null;
    const rawSelectedId = (data as { selectedId?: unknown }).selectedId;
    if (
      typeof rawSelectedId === "string" &&
      validCubes.some((c) => c.id === rawSelectedId)
    ) {
      selectedId = rawSelectedId;
    } else if (validCubes.length > 0) {
      selectedId = validCubes[0].id;
    }

    return {
      layout: { cubes: validCubes },
      selectedId,
    };
  } catch {
    return fallback;
  }
}

export function saveCanvasStorage(layout: Layout, selectedId: string | null): void {
  if (typeof window === "undefined" && typeof localStorage === "undefined") return;
  try {
    const storage = typeof window !== "undefined" ? window.localStorage : globalThis.localStorage;
    if (!storage) return;
    const data = {
      layout,
      selectedId,
    };
    storage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // safely ignore storage errors
  }
}
