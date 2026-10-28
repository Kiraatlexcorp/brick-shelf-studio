import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { buildCube } from "@/lib/brick/cube";
import { BASE_JOINTS, DEFAULT_CUBE, normalize } from "@/lib/brick/spec";

const m = await Module();
m.setup();

const MODES = ["wall", "open", "door", "slide"] as const;
const MOVING = new Set(["door", "slide", "drawer"]);

const overlaps = (solids: { kind: string; s: import("manifold-3d").Manifold }[]) => {
  const bad: string[] = [];
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i].s.boundingBox(), b = solids[j].s.boundingBox();
      if ([0, 1, 2].some((k) => a.min[k] > b.max[k] || a.max[k] < b.min[k])) continue;
      const v = solids[i].s.intersect(solids[j].s).volume();
      if (v >= 0.05) bad.push(`${solids[i].kind} vs ${solids[j].kind} ${v.toFixed(2)}`);
    }
  return bad;
};

describe("mixed joints never clash", () => {
  for (const stack of BASE_JOINTS)
    for (const side of BASE_JOINTS)
      it(`${stack} stack + ${side} side, every front mode`, () => {
        for (const front of MODES) for (const lr of ["wall", "open"] as const) {
          const spec = normalize({ ...DEFAULT_CUBE, joint: "mixed", stack, side, front, left: lr, right: lr });
          const panels = buildCube(m, spec);
          const deckTop = panels.find((p) => p.kind === "top")!.solid.boundingBox().max[2];
          const H = spec.h * 40;
          for (const open of [false, true]) {
            const bad = overlaps(panels.map((p) => ({ kind: p.kind, s: open && p.open ? p.open : p.solid })));
            expect(bad, `${front} sides=${lr} open=${open}`).toEqual([]);
          }
          for (const p of panels.filter((p) => MOVING.has(p.group)))
            expect(p.solid.boundingBox().max[2], `${p.kind} rises above the deck`).toBeLessThanOrEqual(Math.min(deckTop, H) + 0.01);
        }
      });
});
