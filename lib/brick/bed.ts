import type { MeshPart } from "@/lib/brick/mesh";
import { boundsOf } from "@/lib/export/threemf";
import {
  formatUnit,
  getSizePresets,
  mmToUnits,
  SIZE_PRESET_UNITS,
  snapToUnitMm,
  unitsToMm,
  type SizePreset,
  type UnitMode,
} from "@/lib/brick/units";

export {
  formatUnit,
  getSizePresets,
  mmToUnits,
  SIZE_PRESET_UNITS,
  snapToUnitMm,
  unitsToMm,
  type SizePreset,
  type UnitMode,
};

export const BED_A1 = 256; // 256 mm
export const BED_A1_MINI = 180; // 180 mm

export type BedType = "a1" | "mini" | "off";

export type BedPreset = {
  id: BedType;
  label: string;
  size: number | null;
  width: number;
  depth: number;
};

export const BED_PRESETS: BedPreset[] = [
  { id: "a1", label: "A1 (256×256)", size: BED_A1, width: BED_A1, depth: BED_A1 },
  { id: "mini", label: "A1 mini (180×180)", size: BED_A1_MINI, width: BED_A1_MINI, depth: BED_A1_MINI },
  { id: "off", label: "Off", size: null, width: 0, depth: 0 },
];

export type PartFitResult = {
  name: string;
  w: number;
  d: number;
  h: number;
  fits: boolean;
};

export type BedInput =
  | number
  | { width?: number; depth?: number; bed?: number; size?: number | null; [k: string]: any }
  | BedType
  | string;

/**
 * Pure helper checking if printed parts fit the selected printer bed.
 * Returns an array of [{name, w, d, h, fits}] per part.
 * Considers 90-degree bed rotation for footprint fitting.
 */
export function partsFitBed(
  parts: (MeshPart | { name: string; positions: Float32Array; [k: string]: any })[],
  bed: BedInput
): PartFitResult[] {
  let bedW = BED_A1;
  let bedD = BED_A1;

  if (typeof bed === "number") {
    bedW = bed;
    bedD = bed;
  } else if (typeof bed === "string") {
    const s = bed.toLowerCase();
    if (s.includes("mini") || s === "mini") {
      bedW = BED_A1_MINI;
      bedD = BED_A1_MINI;
    } else if (s === "off" || s === "none") {
      // In off mode, nothing is constrained or everything fits
      bedW = Infinity;
      bedD = Infinity;
    } else {
      bedW = BED_A1;
      bedD = BED_A1;
    }
  } else if (bed && typeof bed === "object") {
    if (bed.size === null) {
      bedW = Infinity;
      bedD = Infinity;
    } else {
      bedW = bed.width ?? bed.bed ?? bed.size ?? BED_A1;
      bedD = bed.depth ?? bed.bed ?? bed.size ?? bedW;
    }
  }

  return parts.map((part) => {
    // If part does not have positions but has solid/flat (Panel), toPart would be needed
    // Assuming MeshPart with positions
    const bounds = boundsOf(part as MeshPart);
    const rawW = bounds.maxX - bounds.minX;
    const rawD = bounds.maxY - bounds.minY;
    const rawH = bounds.maxZ - bounds.minZ;

    const w = Math.round(rawW * 100) / 100;
    const d = Math.round(rawD * 100) / 100;
    const h = Math.round(rawH * 100) / 100;

    // Fits if footprint fits in normal or 90-degree rotated orientation
    const fits =
      (rawW <= bedW + 1e-4 && rawD <= bedD + 1e-4) ||
      (rawW <= bedD + 1e-4 && rawD <= bedW + 1e-4);

    return {
      name: part.name,
      w,
      d,
      h,
      fits,
    };
  });
}
