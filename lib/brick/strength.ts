import { type BaseJoint, type CubeSpec, WALLS } from "@/lib/brick/spec";
import { sideJoint, stackJoint } from "@/lib/brick/joints";

/**
 * Rough load guesses (kg on the top deck of one cube, static, PLA, 5 mm walls).
 * These are NOT test results; they are ballpark estimates to steer choices.
 */
export const JOINT_KG: Record<BaseJoint, number> = { lego: 3, twist: 15, rail: 10, clip: 8, magnet: 2 };
export const WALL_CLEAT_KG = 25;
export const MATERIALS = [
  { name: "PLA", factor: 1 },
  { name: "PETG", factor: 1.4 },
  { name: "PETG-CF / ASA", factor: 1.8 },
] as const;
const wallFactor = (w: number) => 0.6 + 0.08 * w; // 5 mm ≈ 1.0, 8 mm ≈ 1.24
const extras = (s: CubeSpec) => (s.ribs ? 1.15 : 1) * (s.gussets ? 1.1 : 1) * (s.bolts ? 1.25 : 1);

/** Estimated capacity (kg) of the current spec in a given material factor. */
export function capacity(s: CubeSpec, material = 1): number {
  const joint = Math.min(JOINT_KG[stackJoint(s)], JOINT_KG[sideJoint(s)] * 1.5);
  let kg = joint * wallFactor(s.wall) * extras(s) * material;
  if (s.wallMount) kg = Math.min(kg, WALL_CLEAT_KG * material);
  return Math.round(kg * 10) / 10;
}

export type Suggestion = { joint: BaseJoint; wall: number; material: string; kg: number; ok: boolean };

/** Cheapest combo (weakest joint, thinnest wall, plainest material) that holds the load. */
export function suggest(load: number, base: CubeSpec): Suggestion {
  const order: BaseJoint[] = ["magnet", "lego", "clip", "rail", "twist"];
  for (const mat of MATERIALS)
    for (const wall of WALLS)
      for (const joint of order) {
        const s = { ...base, joint, wall, bolts: true, ribs: true, gussets: true };
        const kg = capacity(s, mat.factor);
        if (kg >= load) return { joint, wall, material: mat.name, kg, ok: true };
      }
  const top = MATERIALS[MATERIALS.length - 1];
  const s = { ...base, joint: "twist" as const, wall: WALLS[WALLS.length - 1], bolts: true, ribs: true, gussets: true };
  return { joint: "twist", wall: s.wall, material: top.name, kg: capacity(s, top.factor), ok: false };
}
