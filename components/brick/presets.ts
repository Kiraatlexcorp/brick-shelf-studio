import { DEFAULT_CUBE, type CubeSpec } from "@/lib/brick/spec";

export type BrickPreset = { id: string; name: string; tagline: string; spec: CubeSpec };

export const BRICK_PRESETS: BrickPreset[] = [
  { id: "cube", name: "Cube shelf", tagline: "2 × 2 × 2, open front", spec: DEFAULT_CUBE },
  { id: "box", name: "Closed box", tagline: "2 × 2 × 2, every side a wall", spec: { ...DEFAULT_CUBE, front: "wall" } },
  { id: "wide", name: "Wide shelf", tagline: "4 × 2 × 1, open front", spec: { ...DEFAULT_CUBE, w: 4, d: 2, h: 1 } },
  { id: "tower", name: "Tower", tagline: "1 × 1 × 4, open front", spec: { ...DEFAULT_CUBE, w: 1, d: 1, h: 4 } },
  { id: "tunnel", name: "Tunnel", tagline: "3 × 2 × 2, open front and back", spec: { ...DEFAULT_CUBE, w: 3, back: "open" } },
];

export const sameSpec = (a: CubeSpec, b: CubeSpec) => (Object.keys(a) as (keyof CubeSpec)[]).every((k) => a[k] === b[k]);
