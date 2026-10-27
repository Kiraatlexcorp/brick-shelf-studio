import { describe, expect, it } from "vitest";
import {
  addCube,
  CANVAS_STORAGE_KEY,
  cubeSizeMm,
  defaultLayout,
  layoutPlacements,
  parseCanvasStorage,
  saveCanvasStorage,
  type Layout,
} from "@/lib/brick/layout";
import { DEFAULT_CUBE, UNIT, type CubeSpec } from "@/lib/brick/spec";
import { LAYOUT_TEMPLATES } from "@/lib/brick/templates";

describe("layoutPlacements pure helper", () => {
  const spec2x2: CubeSpec = { ...DEFAULT_CUBE, w: 2, d: 2, h: 2 };

  it("returns an empty array for an empty layout", () => {
    const emptyLayout: Layout = { cubes: [] };
    const placements = layoutPlacements(emptyLayout);
    expect(placements).toEqual([]);
  });

  it("computes correct mm offsets for a single cube at (0, 0)", () => {
    const layout = addCube({ cubes: [] }, spec2x2, { x: 0, z: 0, id: "c1" });
    const placements = layoutPlacements(layout);

    expect(placements).toHaveLength(1);
    expect(placements[0]).toEqual({
      id: "c1",
      offset: [0, 0, 0],
      cube: layout.cubes[0],
    });
  });

  it("computes correct mm offsets for a 2x2 layout", () => {
    const template = LAYOUT_TEMPLATES.find((t) => t.id === "block-2x2");
    expect(template).toBeDefined();

    const layout = template!.build(spec2x2);
    expect(layout.cubes).toHaveLength(4);

    const placements = layoutPlacements(layout);
    expect(placements).toHaveLength(4);

    const cubeSize = cubeSizeMm(spec2x2);
    const expectedW = cubeSize.w; // 2 * UNIT = 80mm
    const expectedH = cubeSize.h; // 2 * UNIT = 80mm

    const c00 = placements.find((p) => p.cube.x === 0 && p.cube.z === 0);
    const c10 = placements.find((p) => p.cube.x === 1 && p.cube.z === 0);
    const c01 = placements.find((p) => p.cube.x === 0 && p.cube.z === 1);
    const c11 = placements.find((p) => p.cube.x === 1 && p.cube.z === 1);

    expect(c00?.offset).toEqual([0, 0, 0]);
    expect(c10?.offset).toEqual([expectedW, 0, 0]);
    expect(c01?.offset).toEqual([0, 0, expectedH]);
    expect(c11?.offset).toEqual([expectedW, 0, expectedH]);
  });

  it("computes correct mm offsets for a stacked layout (vertical stacking sits on each other)", () => {
    const template = LAYOUT_TEMPLATES.find((t) => t.id === "tower-1x4");
    expect(template).toBeDefined();

    const layout = template!.build(spec2x2);
    expect(layout.cubes).toHaveLength(4);

    const placements = layoutPlacements(layout);
    expect(placements).toHaveLength(4);

    const cubeH = cubeSizeMm(spec2x2).h; // 80mm

    // Ensure each stacked cube's vertical offset sits exactly on top of the one below
    for (let z = 0; z < 4; z++) {
      const p = placements.find((item) => item.cube.z === z);
      expect(p).toBeDefined();
      expect(p?.offset).toEqual([0, 0, z * cubeH]);
    }
  });

  it("handles non-uniform column widths and row heights", () => {
    const spec1u: CubeSpec = { ...DEFAULT_CUBE, w: 1, d: 2, h: 2 }; // w: 40mm, h: 80mm
    const spec3u: CubeSpec = { ...DEFAULT_CUBE, w: 3, d: 2, h: 1 }; // w: 120mm, h: 40mm

    let layout: Layout = { cubes: [] };
    layout = addCube(layout, spec1u, { x: 0, z: 0, id: "c-00" });
    layout = addCube(layout, spec3u, { x: 1, z: 0, id: "c-10" });
    layout = addCube(layout, spec1u, { x: 0, z: 1, id: "c-01" });
    layout = addCube(layout, spec3u, { x: 1, z: 1, id: "c-11" });

    const placements = layoutPlacements(layout);

    const p00 = placements.find((p) => p.id === "c-00");
    const p10 = placements.find((p) => p.id === "c-10");
    const p01 = placements.find((p) => p.id === "c-01");
    const p11 = placements.find((p) => p.id === "c-11");

    // Col 0 width = 40mm, Row 0 height = max(80, 40) = 80mm
    expect(p00?.offset).toEqual([0, 0, 0]);
    expect(p10?.offset).toEqual([40, 0, 0]);
    expect(p01?.offset).toEqual([0, 0, 80]);
    expect(p11?.offset).toEqual([40, 0, 80]);
  });
});

describe("localStorage parse/validate function (parseCanvasStorage)", () => {
  const defaultResult = {
    layout: defaultLayout(DEFAULT_CUBE),
    selectedId: "cube-1",
  };

  it("returns default 1-cube layout on bad JSON syntax", () => {
    const badJsons = [
      "{ bad json",
      "undefined",
      "NaN",
      "{ layout: { cubes: [ } }",
      "<html><body>error</body></html>",
    ];

    for (const bad of badJsons) {
      const result = parseCanvasStorage(bad);
      expect(result).toEqual(defaultResult);
    }
  });

  it("returns default 1-cube layout on null, undefined, or empty string", () => {
    expect(parseCanvasStorage(null)).toEqual(defaultResult);
    expect(parseCanvasStorage(undefined)).toEqual(defaultResult);
    expect(parseCanvasStorage("")).toEqual(defaultResult);
  });

  it("returns default 1-cube layout on valid JSON with invalid shape or non-object root", () => {
    expect(parseCanvasStorage("123")).toEqual(defaultResult);
    expect(parseCanvasStorage('"string"')).toEqual(defaultResult);
    expect(parseCanvasStorage("true")).toEqual(defaultResult);
    expect(parseCanvasStorage("[]")).toEqual(defaultResult);
    expect(parseCanvasStorage("{}")).toEqual(defaultResult);
    expect(parseCanvasStorage(JSON.stringify({ layout: null }))).toEqual(defaultResult);
    expect(
      parseCanvasStorage(JSON.stringify({ layout: { cubes: "not-an-array" } }))
    ).toEqual(defaultResult);
  });

  it("parses valid layout JSON, normalizes specs, and preserves valid selectedId", () => {
    const rawData = {
      layout: {
        cubes: [
          {
            id: "cube-1",
            x: 0,
            y: 0,
            z: 0,
            spec: {
              ...DEFAULT_CUBE,
              w: 2,
              d: 2,
              h: 2,
              joint: "rail",
              wall: 4, // invalid wall for rail: normalize will enforce wall >= 5
            },
          },
          {
            id: "cube-2",
            x: 1,
            y: 0,
            z: 0,
            spec: {
              ...DEFAULT_CUBE,
              w: 2,
              d: 2,
              h: 2,
            },
          },
        ],
      },
      selectedId: "cube-2",
    };

    const parsed = parseCanvasStorage(JSON.stringify(rawData));

    expect(parsed.layout.cubes).toHaveLength(2);
    expect(parsed.selectedId).toBe("cube-2");

    // Spec normalization check
    expect(parsed.layout.cubes[0].spec.wall).toBeGreaterThanOrEqual(5);
    expect(parsed.layout.cubes[0].id).toBe("cube-1");
    expect(parsed.layout.cubes[1].id).toBe("cube-2");
  });

  it("falls back to the first cube ID if stored selectedId does not exist in cubes", () => {
    const rawData = {
      layout: {
        cubes: [
          {
            id: "cube-first",
            x: 0,
            y: 0,
            z: 0,
            spec: DEFAULT_CUBE,
          },
        ],
      },
      selectedId: "non-existent-id",
    };

    const parsed = parseCanvasStorage(JSON.stringify(rawData));
    expect(parsed.layout.cubes).toHaveLength(1);
    expect(parsed.selectedId).toBe("cube-first");
  });

  it("saveCanvasStorage safely writes to localStorage if available", () => {
    const layout = addCube({ cubes: [] }, DEFAULT_CUBE, { x: 0, z: 0, id: "test-cube" });
    const fakeStore: Record<string, string> = {};

    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => fakeStore[k] ?? null,
        setItem: (k: string, v: string) => {
          fakeStore[k] = v;
        },
        removeItem: (k: string) => {
          delete fakeStore[k];
        },
        clear: () => {
          for (const k in fakeStore) delete fakeStore[k];
        },
      },
      configurable: true,
      writable: true,
    });

    try {
      saveCanvasStorage(layout, "test-cube");
      expect(fakeStore[CANVAS_STORAGE_KEY]).toBeDefined();

      const parsed = parseCanvasStorage(fakeStore[CANVAS_STORAGE_KEY]);
      expect(parsed.layout.cubes).toHaveLength(1);
      expect(parsed.layout.cubes[0].id).toBe("test-cube");
      expect(parsed.selectedId).toBe("test-cube");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalLocalStorage,
        configurable: true,
        writable: true,
      });
    }
  });
});
