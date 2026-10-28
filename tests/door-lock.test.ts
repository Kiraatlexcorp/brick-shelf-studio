import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, printParts } from "@/lib/brick/cube";
import { boundsOf } from "@/lib/export/threemf";
import {
  A1_BED,
  DEFAULT_CUBE,
  LOCK_MAGNET,
  normalize,
  type CubeSpec,
  type Hinge,
} from "@/lib/brick/spec";

const m = await Module();
m.setup();

const noOverlap = (spec: CubeSpec, open = false) => {
  const panels = buildCube(m, spec);
  const solids = panels.map((p) => ({
    kind: p.kind,
    s: open && p.open ? p.open : p.solid,
  }));
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i].s.boundingBox();
      const b = solids[j].s.boundingBox();
      if ([0, 1, 2].some((k) => a.min[k] > b.max[k] || a.max[k] < b.min[k])) continue;
      const vol = solids[i].s.intersect(solids[j].s).volume();
      expect(vol, `${solids[i].kind} vs ${solids[j].kind} (open=${open})`).toBeLessThan(0.05);
    }
  }
  return panels;
};

describe("door lock normalize defaults and mapping", () => {
  it("DEFAULT_CUBE has lock 'none' and lockMagnet false", () => {
    expect(DEFAULT_CUBE.lock).toBe("none");
    expect(DEFAULT_CUBE.lockMagnet).toBe(false);
    expect(DEFAULT_CUBE.latch).toBe("magnet");
  });

  it("normalizes lock 'latch' to latch 'hook' and lock 'latch'", () => {
    const s = normalize({ ...DEFAULT_CUBE, lock: "latch" });
    expect(s.lock).toBe("latch");
    expect(s.latch).toBe("hook");
  });

  it("normalizes lock 'knob' to latch 'knob' and lock 'knob'", () => {
    const s = normalize({ ...DEFAULT_CUBE, lock: "knob" });
    expect(s.lock).toBe("knob");
    expect(s.latch).toBe("knob");
  });

  it("normalizes latch 'hook' to lock 'latch'", () => {
    const s = normalize({ ...DEFAULT_CUBE, latch: "hook" });
    expect(s.lock).toBe("latch");
    expect(s.latch).toBe("hook");
  });

  it("normalizes latch 'knob' to lock 'knob'", () => {
    const s = normalize({ ...DEFAULT_CUBE, latch: "knob" });
    expect(s.lock).toBe("knob");
    expect(s.latch).toBe("knob");
  });

  it("normalizes lock 'none' defaulting to magnet latch", () => {
    const s = normalize({ lock: "none" } as CubeSpec);
    expect(s.lock).toBe("none");
    expect(s.latch).toBe("magnet");
  });

  it("sanitizes lockMagnet to boolean", () => {
    expect(normalize({ ...DEFAULT_CUBE, lockMagnet: true }).lockMagnet).toBe(true);
    // @ts-expect-error test non-boolean coercion
    expect(normalize({ ...DEFAULT_CUBE, lockMagnet: 1 }).lockMagnet).toBe(true);
    // @ts-expect-error test undefined coercion
    expect(normalize({ ...DEFAULT_CUBE, lockMagnet: undefined }).lockMagnet).toBe(false);
  });
});

describe("hinged door locks", () => {
  it("hook latch: door and frame clear each other closed and open", () => {
    const spec: CubeSpec = { ...DEFAULT_CUBE, front: "door", latch: "hook" };
    const panelsClosed = noOverlap(spec, false);
    noOverlap(spec, true);

    expect(panelsClosed.some((p) => p.kind === "door-front")).toBe(true);
    expect(panelsClosed.some((p) => p.kind.includes("knob"))).toBe(false);
  });

  it("knob lock: knob part is present and clears closed and open", () => {
    const spec: CubeSpec = { ...DEFAULT_CUBE, front: "door", latch: "knob" };
    const panels = noOverlap(spec, false);
    noOverlap(spec, true);

    const knob = panels.find((p) => p.kind.includes("knob"));
    expect(knob).toBeDefined();
    expect(knob?.group).toBe("door");
    expect(knob?.solid.status()).toBe("NoError");
  });

  it("lockMagnet: 6x3 mm magnet pocket has expected volume", () => {
    const baseSpec: CubeSpec = { ...DEFAULT_CUBE, front: "door", latch: "hook", lockMagnet: false };
    const withMagSpec: CubeSpec = { ...DEFAULT_CUBE, front: "door", latch: "hook", lockMagnet: true };

    const basePanels = noOverlap(baseSpec, false);
    const withMagPanels = noOverlap(withMagSpec, false);
    noOverlap(withMagSpec, true);

    const baseDoor = basePanels.find((p) => p.kind === "door-front")!.solid;
    const magDoor = withMagPanels.find((p) => p.kind === "door-front")!.solid;

    const diffVol = baseDoor.volume() - magDoor.volume();
    const expectedPocketVol = Math.PI * LOCK_MAGNET.r * LOCK_MAGNET.r * LOCK_MAGNET.depth;

    expect(diffVol).toBeGreaterThan(80);
    expect(diffVol).toBeLessThan(110);
    expect(diffVol).toBeCloseTo(expectedPocketVol, -1);
  });

  it("knob + lockMagnet combined clear closed and open", () => {
    const spec: CubeSpec = { ...DEFAULT_CUBE, front: "door", latch: "knob", lockMagnet: true };
    const panels = noOverlap(spec, false);
    noOverlap(spec, true);
    expect(panels.some((p) => p.kind.includes("knob"))).toBe(true);
  });

  it("works across different hinge placements", () => {
    for (const hinge of ["left", "right", "top", "bottom"] as Hinge[]) {
      const spec: CubeSpec = { ...DEFAULT_CUBE, front: "door", hinge, latch: "hook" };
      noOverlap(spec, false);
      noOverlap(spec, true);
    }
  });

  it("door and knob parts print flat within bed limits", () => {
    const spec: CubeSpec = { ...DEFAULT_CUBE, front: "door", latch: "knob", lockMagnet: true, w: 4, h: 4 };
    const parts = printParts(buildCube(m, spec));
    for (const part of parts) {
      const b = boundsOf(part);
      expect(b.maxX - b.minX, part.name).toBeLessThanOrEqual(A1_BED);
      expect(b.maxY - b.minY, part.name).toBeLessThanOrEqual(A1_BED);
      expect(b.maxZ - b.minZ, part.name).toBeLessThanOrEqual(A1_BED);
    }
  });
});

describe("sliding panel locks", () => {
  it("hook latch: sliding panels clear closed and open", () => {
    const spec: CubeSpec = { ...DEFAULT_CUBE, front: "slide", panels: 2, latch: "hook" };
    const panelsClosed = noOverlap(spec, false);
    noOverlap(spec, true);

    expect(panelsClosed.some((p) => p.kind === "slide-front-1")).toBe(true);
    expect(panelsClosed.some((p) => p.kind.includes("knob"))).toBe(false);
  });

  it("knob lock: knob part is present on slide and clears closed and open", () => {
    const spec: CubeSpec = { ...DEFAULT_CUBE, front: "slide", panels: 2, latch: "knob" };
    const panels = noOverlap(spec, false);
    noOverlap(spec, true);

    const knob = panels.find((p) => p.kind.includes("knob"));
    expect(knob).toBeDefined();
    expect(knob?.group).toBe("slide");
    expect(knob?.solid.status()).toBe("NoError");
  });

  it("single sliding panel clears closed and open with knob", () => {
    const spec: CubeSpec = { ...DEFAULT_CUBE, front: "slide", panels: 1, latch: "knob" };
    noOverlap(spec, false);
    noOverlap(spec, true);
  });

  it("lockMagnet on slide is ignored (3 mm panel would be a through-hole)", () => {
    const baseSpec: CubeSpec = { ...DEFAULT_CUBE, front: "slide", panels: 2, latch: "hook", lockMagnet: false };
    const withMagSpec: CubeSpec = { ...DEFAULT_CUBE, front: "slide", panels: 2, latch: "hook", lockMagnet: true };
    const a = noOverlap(baseSpec, false).find((p) => p.kind === "slide-front-1")!.solid;
    const b = noOverlap(withMagSpec, false).find((p) => p.kind === "slide-front-1")!.solid;
    expect(Math.abs(a.volume() - b.volume())).toBeLessThan(0.01);
  });

});
