import type { MeshPart } from "@/lib/brick/mesh";

type Vec3 = [number, number, number];
export type Placed = { parts: MeshPart[]; offset?: Vec3 };

/** Axis-aligned bounds of assembled parts (vertex positions plus each group's offset). */
export function assembledBounds(groups: Placed[]): { min: Vec3; max: Vec3 } | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const g of groups) {
    const o = g.offset ?? [0, 0, 0];
    for (const p of g.parts) {
      const a = p.positions;
      for (let i = 0; i < a.length; i += 3)
        for (let k = 0; k < 3; k++) {
          const v = a[i + k] + o[k];
          if (v < min[k]) min[k] = v;
          if (v > max[k]) max[k] = v;
        }
    }
  }
  return min[0] === Infinity ? null : { min, max };
}

/** Shift that puts the model's XY bbox centre on the bed centre (0,0) and its bottom on z=0. */
export function centerOnBed(groups: Placed[]): Vec3 {
  const b = assembledBounds(groups);
  if (!b) return [0, 0, 0];
  return [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]];
}
