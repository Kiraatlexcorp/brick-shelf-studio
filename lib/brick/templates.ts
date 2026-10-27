import { addCube, type Layout } from "@/lib/brick/layout";
import { type CubeSpec } from "@/lib/brick/spec";
import { BRICK_PRESETS } from "@/components/brick/presets";

export type LayoutTemplate = {
  id: string;
  name: string;
  hint: string;
  build: (spec: CubeSpec) => Layout;
};

export const LAYOUT_TEMPLATES: Array<{
  id: string;
  name: string;
  hint: string;
  build: (spec: CubeSpec) => Layout;
}> = [
  {
    id: "single-row-3",
    name: "Single row (3)",
    hint: "Three cubes side by side on the floor (3 × 1)",
    build: (spec: CubeSpec): Layout => {
      let layout: Layout = { cubes: [] };
      for (let x = 0; x < 3; x++) {
        layout = addCube(layout, spec, { x, z: 0 });
      }
      return layout;
    },
  },
  {
    id: "block-2x2",
    name: "2×2 block",
    hint: "Four cubes arranged in a 2 × 2 square",
    build: (spec: CubeSpec): Layout => {
      let layout: Layout = { cubes: [] };
      for (let z = 0; z < 2; z++) {
        for (let x = 0; x < 2; x++) {
          layout = addCube(layout, spec, { x, z });
        }
      }
      return layout;
    },
  },
  {
    id: "staircase-3-2-1",
    name: "Staircase (3-2-1)",
    hint: "Stepped layout: 3 tall, 2 tall, and 1 tall",
    build: (spec: CubeSpec): Layout => {
      let layout: Layout = { cubes: [] };
      const heights = [3, 2, 1];
      for (let z = 0; z < 3; z++) {
        for (let x = 0; x < heights.length; x++) {
          if (z < heights[x]) {
            layout = addCube(layout, spec, { x, z });
          }
        }
      }
      return layout;
    },
  },
  {
    id: "tower-1x4",
    name: "Tower (1×4)",
    hint: "Four cubes stacked vertically in a single column",
    build: (spec: CubeSpec): Layout => {
      let layout: Layout = { cubes: [] };
      for (let z = 0; z < 4; z++) {
        layout = addCube(layout, spec, { x: 0, z });
      }
      return layout;
    },
  },
  {
    id: "bookshelf-3x3",
    name: "Bookshelf 3×3",
    hint: "Nine cubes in a 3 × 3 grid with drawer units at the bottom",
    build: (spec: CubeSpec): Layout => {
      const drawersPreset = BRICK_PRESETS.find((p) => p.id === "drawers");
      let layout: Layout = { cubes: [] };
      for (let z = 0; z < 3; z++) {
        for (let x = 0; x < 3; x++) {
          const cubeSpec =
            z === 0 && drawersPreset
              ? {
                  ...spec,
                  ...drawersPreset.spec,
                  w: spec.w,
                  d: spec.d,
                  h: spec.h,
                }
              : spec;
          layout = addCube(layout, cubeSpec, { x, z });
        }
      }
      return layout;
    },
  },
];
