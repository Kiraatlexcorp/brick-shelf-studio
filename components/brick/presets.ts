import { DEFAULT_CUBE, type CubeSpec } from "@/lib/brick/spec";

export type BrickPreset = { id: string; name: string; tagline: string; spec: CubeSpec };

export const BRICK_PRESETS: BrickPreset[] = [
  { id: "cube", name: "Cube shelf", tagline: "2 × 2 × 2, open front", spec: DEFAULT_CUBE },
  { id: "drawers", name: "Drawer unit", tagline: "2 × 2 × 2, two half-height drawers", spec: { ...DEFAULT_CUBE, front: "drawer", drawers: 2, dividers: 1, wall: 6 } },
  { id: "drawer", name: "Deep drawer", tagline: "3 × 3 × 2, one drawer, 2 dividers", spec: { ...DEFAULT_CUBE, w: 3, d: 3, front: "drawer", dividers: 2, wall: 6 } },
  { id: "cabinet", name: "Cabinet", tagline: "2 × 2 × 3, hinged door, magnet latch", spec: { ...DEFAULT_CUBE, h: 3, front: "door" } },
  { id: "flap", name: "Flap cabinet", tagline: "3 × 2 × 2, door hinged at the top", spec: { ...DEFAULT_CUBE, w: 3, front: "door", hinge: "top" } },
  { id: "slider", name: "Sliding cabinet", tagline: "4 × 2 × 2, two sliding panels", spec: { ...DEFAULT_CUBE, w: 4, front: "slide" } },
  { id: "box", name: "Closed box", tagline: "2 × 2 × 2, every side a wall", spec: { ...DEFAULT_CUBE, front: "wall" } },
  { id: "wide", name: "Wide shelf", tagline: "4 × 2 × 1, open front", spec: { ...DEFAULT_CUBE, w: 4, d: 2, h: 1 } },
  { id: "tower", name: "Tower", tagline: "1 × 1 × 4, open front", spec: { ...DEFAULT_CUBE, w: 1, d: 1, h: 4 } },
];

export const sameSpec = (a: CubeSpec, b: CubeSpec) => (Object.keys(a) as (keyof CubeSpec)[]).every((k) => a[k] === b[k]);
