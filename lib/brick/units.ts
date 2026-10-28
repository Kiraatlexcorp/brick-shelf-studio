import { UNIT } from "@/lib/brick/spec";

export type UnitMode = "u" | "mm";

/** Converts grid units to millimetres (1u = 40mm). */
export function unitsToMm(units: number): number {
  return units * UNIT;
}

/** Converts millimetres to grid units (defaults to nearest whole unit). */
export function mmToUnits(mm: number, round = true): number {
  const u = mm / UNIT;
  return round ? Math.round(u) : u;
}

/** Snaps a millimetre dimension to the nearest whole grid unit pitch. */
export function snapToUnitMm(mm: number): number {
  return Math.round(mm / UNIT) * UNIT;
}

/** Formats a value with its unit suffix. */
export function formatUnit(value: number, unit: UnitMode): string {
  if (unit === "mm") {
    const rounded = Math.round(value * 10) / 10;
    return `${rounded} mm`;
  }
  return `${value}u`;
}

/** Standard quick size preset units (1u to 4u). */
export const SIZE_PRESET_UNITS = [1, 2, 3, 4] as const;

export type SizePreset = {
  u: number;
  mm: number;
  label: string;
  sublabel: string;
  fullLabel: string;
};

/** Returns quick preset suggestions with both unit and mm values. */
export function getSizePresets(): SizePreset[] {
  return SIZE_PRESET_UNITS.map((u) => {
    const mm = unitsToMm(u);
    return {
      u,
      mm,
      label: `${u}u`,
      sublabel: `${mm} mm`,
      fullLabel: `${u}u (${mm} mm)`,
    };
  });
}
