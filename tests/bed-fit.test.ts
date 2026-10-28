import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, printParts } from "@/lib/brick/cube";
import { DEFAULT_CUBE, UNIT } from "@/lib/brick/spec";
import {
  BED_A1,
  BED_A1_MINI,
  partsFitBed,
  type PartFitResult,
} from "@/lib/brick/bed";
import {
  formatUnit,
  getSizePresets,
  mmToUnits,
  snapToUnitMm,
  unitsToMm,
} from "@/lib/brick/units";

const m = await Module();
m.setup();

describe("partsFitBed", () => {
  it("default cube fits A1 bed (256x256)", () => {
    const panels = buildCube(m, DEFAULT_CUBE);
    const parts = printParts(panels);
    const results = partsFitBed(parts, BED_A1);

    expect(results.length).toBe(parts.length);
    for (const r of results) {
      expect(r).toHaveProperty("name");
      expect(typeof r.name).toBe("string");
      expect(r).toHaveProperty("w");
      expect(r).toHaveProperty("d");
      expect(r).toHaveProperty("h");
      expect(r).toHaveProperty("fits");
      expect(typeof r.fits).toBe("boolean");
      expect(r.fits).toBe(true);
    }

    // Decks for 2u x 2u should be 80x80 mm
    const topDeck = results.find((p) => p.name === "top");
    expect(topDeck).toBeDefined();
    expect(topDeck!.w).toBeCloseTo(80, 0);
    expect(topDeck!.d).toBeCloseTo(80, 0);
    expect(topDeck!.fits).toBe(true);
  });

  it("big cube (w=7) fails A1 mini bed (180x180) for its deck", () => {
    const panels = buildCube(m, { ...DEFAULT_CUBE, w: 7 });
    const parts = printParts(panels);
    const results = partsFitBed(parts, BED_A1_MINI);

    const topDeck = results.find((p) => p.name === "top");
    const bottomDeck = results.find((p) => p.name === "bottom");

    expect(topDeck).toBeDefined();
    expect(bottomDeck).toBeDefined();

    // 7 units * 40 mm = 280 mm > 180 mm
    expect(Math.max(topDeck!.w, topDeck!.d)).toBeGreaterThanOrEqual(280);
    expect(topDeck!.fits).toBe(false);
    expect(bottomDeck!.fits).toBe(false);

    // Some parts exceed the bed
    expect(results.some((p) => !p.fits)).toBe(true);
  });

  it("accepts bed presets as string or object", () => {
    const panels = buildCube(m, DEFAULT_CUBE);
    const parts = printParts(panels);

    const byString = partsFitBed(parts, "a1");
    expect(byString.every((p) => p.fits)).toBe(true);

    const byMiniString = partsFitBed(parts, "mini");
    expect(byMiniString.every((p) => p.fits)).toBe(true);

    const byObject = partsFitBed(parts, { width: 256, depth: 256 });
    expect(byObject.every((p) => p.fits)).toBe(true);

    const byOff = partsFitBed(parts, "off");
    expect(byOff.every((p) => p.fits)).toBe(true);
  });
});

describe("unit conversion helpers", () => {
  it("unitsToMm converts grid units to millimetres based on UNIT", () => {
    expect(UNIT).toBe(40);
    expect(unitsToMm(1)).toBe(40);
    expect(unitsToMm(2)).toBe(80);
    expect(unitsToMm(3)).toBe(120);
    expect(unitsToMm(4)).toBe(160);
    expect(unitsToMm(7)).toBe(280);
  });

  it("mmToUnits converts millimetres to whole or fractional grid units", () => {
    expect(mmToUnits(40)).toBe(1);
    expect(mmToUnits(80)).toBe(2);
    expect(mmToUnits(120)).toBe(3);
    expect(mmToUnits(160)).toBe(4);
    expect(mmToUnits(280)).toBe(7);

    // Snaps to nearest whole unit by default
    expect(mmToUnits(38)).toBe(1);
    expect(mmToUnits(55)).toBe(1);
    expect(mmToUnits(65)).toBe(2);

    // Fractional conversion when round=false
    expect(mmToUnits(100, false)).toBe(2.5);
    expect(mmToUnits(60, false)).toBe(1.5);
  });

  it("snapToUnitMm snaps millimetres to nearest unit pitch", () => {
    expect(snapToUnitMm(38)).toBe(40);
    expect(snapToUnitMm(42)).toBe(40);
    expect(snapToUnitMm(75)).toBe(80);
    expect(snapToUnitMm(118)).toBe(120);
  });

  it("formatUnit formats strings with correct suffix", () => {
    expect(formatUnit(2, "u")).toBe("2u");
    expect(formatUnit(80, "mm")).toBe("80 mm");
  });

  it("getSizePresets returns preset chips 1u..4u with mm equivalents", () => {
    const presets = getSizePresets();
    expect(presets).toHaveLength(4);
    expect(presets[0]).toEqual({
      u: 1,
      mm: 40,
      label: "1u",
      sublabel: "40 mm",
      fullLabel: "1u (40 mm)",
    });
    expect(presets[1]).toEqual({
      u: 2,
      mm: 80,
      label: "2u",
      sublabel: "80 mm",
      fullLabel: "2u (80 mm)",
    });
    expect(presets[3]).toEqual({
      u: 4,
      mm: 160,
      label: "4u",
      sublabel: "160 mm",
      fullLabel: "4u (160 mm)",
    });
  });
});
