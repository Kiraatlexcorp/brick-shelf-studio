import { describe, expect, it } from "vitest";
import { capacity, suggest } from "@/lib/brick/strength";
import { DEFAULT_CUBE } from "@/lib/brick/spec";

describe("strength meter (guesses)", () => {
  it("stronger joints and walls rate higher", () => {
    expect(capacity({ ...DEFAULT_CUBE, joint: "twist" })).toBeGreaterThan(capacity({ ...DEFAULT_CUBE, joint: "magnet" }));
    expect(capacity({ ...DEFAULT_CUBE, wall: 8 })).toBeGreaterThan(capacity({ ...DEFAULT_CUBE, wall: 4 }));
  });
  it("suggests something that holds, and escalates with load", () => {
    const light = suggest(2, DEFAULT_CUBE);
    expect(light.ok && light.kg >= 2 && light.material === "PLA").toBe(true);
    const heavy = suggest(40, DEFAULT_CUBE);
    expect(heavy.ok).toBe(true);
    expect(heavy.kg).toBeGreaterThanOrEqual(40);
    expect(heavy.material).not.toBe("PLA");
    expect(suggest(500, DEFAULT_CUBE).ok).toBe(false);
  });
});
