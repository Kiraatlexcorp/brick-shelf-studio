import { addCube, cubeSizeMm, type Layout } from "@/lib/brick/layout";
import type { CubeSpec } from "@/lib/brick/spec";

export type Space = {
  w: number;
  h: number;
  d: number;
};

export type FitGridResult = {
  cols: number;
  rows: number;
  fits: boolean;
  cube: { w: number; h: number; d: number };
  used: { w: number; h: number; d: number };
  leftover: { w: number; h: number };
  reason?: string;
};

/**
 * Calculates how many cubes fit side by side (cols) and stacked (rows)
 * within the given space minus margin on each side.
 *
 * Uses cubeSizeMm and stacking logic matching layoutSizeMm so used dimensions
 * correspond directly to a real layout.
 */
export function fitGrid(
  space: { w: number; h: number; d: number },
  spec: CubeSpec,
  margin = 10
): FitGridResult {
  const cubeSize = cubeSizeMm(spec);
  const cube = { w: cubeSize.w, h: cubeSize.h, d: cubeSize.d };

  const m = Math.max(0, margin);
  const availW = Math.max(0, space.w - 2 * m);
  const availH = Math.max(0, space.h - 2 * m);

  const rawCols = cube.w > 0 ? Math.floor(availW / cube.w) : 0;
  const rawRows = cube.h > 0 ? Math.floor(availH / cube.h) : 0;

  const cols = Math.max(0, rawCols);
  const rows = Math.max(0, rawRows);

  const depthTooShallow = space.d < cube.d;
  const zeroFit = cols === 0 || rows === 0;

  let fits = true;
  let reason: string | undefined;

  if (depthTooShallow) {
    fits = false;
    reason = `Depth ${space.d} mm is too shallow (cube depth is ${cube.d} mm)`;
  } else if (zeroFit) {
    fits = false;
    reason = `Not even one cube fits in ${space.w} × ${space.h} mm with ${margin} mm margins`;
  }

  const used = {
    w: cols * cube.w,
    h: rows * cube.h,
    d: cols > 0 && rows > 0 ? cube.d : 0,
  };

  const leftover = {
    w: Math.max(0, space.w - used.w),
    h: Math.max(0, space.h - used.h),
  };

  return {
    cols,
    rows,
    fits,
    cube,
    used,
    leftover,
    reason,
  };
}

/**
 * Builds a full grid layout of dimensions cols × rows using addCube.
 */
export function gridLayout(spec: CubeSpec, cols: number, rows: number): Layout {
  let layout: Layout = { cubes: [] };
  if (cols <= 0 || rows <= 0) {
    return layout;
  }
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      layout = addCube(layout, spec, { x, z });
    }
  }
  return layout;
}
