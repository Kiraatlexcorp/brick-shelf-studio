import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube, LOCK_DIMS } from "@/lib/brick/cube";
import { DEFAULT_CUBE, LOCK_MAGNET, normalize, type CubeSpec } from "@/lib/brick/spec";

const m = await Module();
m.setup();
const { Manifold: M } = m;

const build = (o: Partial<CubeSpec>) => buildCube(m, normalize({ ...DEFAULT_CUBE, ...o } as CubeSpec));
const clashes = (o: Partial<CubeSpec>) => {
  const panels = build(o);
  const bad: string[] = [];
  for (const open of [false, true]) {
    const s = panels.map((p) => (open && p.open ? p.open : p.solid));
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const v = s[i].intersect(s[j]).volume();
      if (v >= 0.05) bad.push(`${panels[i].kind}/${panels[j].kind} open=${open} ${v.toFixed(2)}`);
    }
  }
  return bad;
};

describe("lock parts are printable", () => {
  it("minimum feature sizes", () => {
    expect(LOCK_DIMS.arm).toBeGreaterThanOrEqual(1.2);
    expect(LOCK_DIMS.catch).toBeGreaterThanOrEqual(1.2);
    expect(LOCK_DIMS.magnetFloor).toBeGreaterThanOrEqual(0.8);
  });

  for (const front of ["door", "slide"] as const)
    for (const latch of ["hook", "knob"] as const)
      it(`${front} ${latch}${front === "door" ? " + magnet" : ""}: no clashes closed or open`, () => {
        expect(clashes({ front, latch, panels: 2, lockMagnet: front === "door" })).toEqual([]);
      });

  it("slide hook tongue is the full 3 mm panel and its barb sticks out behind", () => {
    const panel = build({ front: "slide", latch: "hook" }).find((p) => p.kind === "slide-front-1")!;
    const plain = build({ front: "slide" }).find((p) => p.kind === "slide-front-1")!;
    // the latch build has slots (removed volume) but the panel still reaches past its plain back face (the barb)
    expect(panel.solid.boundingBox().max[1]).toBeGreaterThan(plain.solid.boundingBox().max[1] + 0.5);
    expect(panel.solid.decompose().length).toBe(1);
  });

  it("door magnet pockets keep >= 0.8 mm floor (no through-holes)", () => {
    const withMag = build({ front: "door", latch: "hook", lockMagnet: true });
    const noMag = build({ front: "door", latch: "hook" });
    const door = withMag.find((p) => p.group === "door" && p.kind.startsWith("door"))!;
    const doorPlain = noMag.find((p) => p.group === "door" && p.kind.startsWith("door"))!;
    const removed = doorPlain.solid.volume() - door.solid.volume();
    const cup = Math.PI * LOCK_MAGNET.r ** 2 * LOCK_MAGNET.depth;
    // a through-hole would remove the full door thickness, not just the pocket
    expect(removed).toBeGreaterThan(cup * 0.9);
    expect(removed).toBeLessThan(cup * 1.1);
    // door thickness minus pocket depth leaves a floor
    const b = doorPlain.solid.boundingBox();
    const thick = Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    expect(thick - LOCK_MAGNET.depth).toBeGreaterThanOrEqual(LOCK_DIMS.magnetFloor);
  });

  it("slides never get a magnet pocket", () => {
    const a = build({ front: "slide", latch: "hook", lockMagnet: true }).find((p) => p.kind === "slide-front-1")!;
    const b = build({ front: "slide", latch: "hook" }).find((p) => p.kind === "slide-front-1")!;
    expect(Math.abs(a.solid.volume() - b.solid.volume())).toBeLessThan(0.01);
  });
});
void M;
