import type { Manifold, ManifoldToplevel } from "manifold-3d";
import {
  CLEARANCES, DECK, SLOT_EXTRA, SOCKET_EXTRA, STUD_H, STUD_R, TAB_LEN, TAB_W, UNIT, WALL,
  type CubeSpec, type PanelKind,
} from "@/lib/brick/spec";
import { toPart, type MeshPart } from "@/lib/brick/mesh";

/** Assembled frame: x = width, y = depth (front at y 0), z = up. Units mm. */
export type Panel = { kind: PanelKind; solid: Manifold; /** rotation that lays it flat for printing */ flat: [number, number, number] };

const SEG = 48;

/** Tab centres along one edge: one tab in the middle of every grid unit. */
function tabCentres(lengthUnits: number, start: number) {
  return Array.from({ length: lengthUnits }, (_, i) => start + i * UNIT + UNIT / 2);
}

export function buildCube(m: ManifoldToplevel, spec: CubeSpec): Panel[] {
  const { Manifold: M } = m;
  const W = spec.w * UNIT;
  const D = spec.d * UNIT;
  const H = spec.h * UNIT;
  const wallH = H - 2 * DECK;
  const c = spec.clearance;
  const slotDepth = TAB_LEN + SLOT_EXTRA;
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    M.cube([sx, sy, sz]).translate([x, y, z]);

  // Every wall that exists: its footprint on the decks and its tab positions.
  type WallDef = { kind: PanelKind; x: number; y: number; sx: number; sy: number; alongX: boolean };
  const walls: WallDef[] = [];
  if (spec.left === "wall") walls.push({ kind: "left", x: 0, y: 0, sx: WALL, sy: D, alongX: false });
  if (spec.right === "wall") walls.push({ kind: "right", x: W - WALL, y: 0, sx: WALL, sy: D, alongX: false });
  if (spec.back === "wall") walls.push({ kind: "back", x: WALL, y: D - WALL, sx: W - 2 * WALL, sy: WALL, alongX: true });
  if (spec.front === "wall") walls.push({ kind: "front", x: WALL, y: 0, sx: W - 2 * WALL, sy: WALL, alongX: true });

  // Tabs as footprints (x, y, sx, sy), centred per unit and clamped inside the wall.
  const tabsOf = (wall: WallDef) =>
    wall.alongX
      ? tabCentres(spec.w, 0)
          .filter((cx) => cx - TAB_W / 2 >= wall.x && cx + TAB_W / 2 <= wall.x + wall.sx)
          .map((cx) => ({ x: cx - TAB_W / 2, y: wall.y, sx: TAB_W, sy: WALL }))
      : tabCentres(spec.d, 0).map((cy) => ({ x: wall.x, y: cy - TAB_W / 2, sx: WALL, sy: TAB_W }));

  const panels: Panel[] = [];

  // Bottom deck: slots on top, stud sockets underneath.
  let bottom = box(0, 0, 0, W, D, DECK);
  const sockets: Manifold[] = [];
  for (let i = 0; i < spec.w; i++)
    for (let j = 0; j < spec.d; j++)
      sockets.push(
        M.cylinder(STUD_H + SOCKET_EXTRA, STUD_R + SOCKET_EXTRA, STUD_R + SOCKET_EXTRA, SEG)
          .translate([i * UNIT + UNIT / 2, j * UNIT + UNIT / 2, 0]),
      );
  if (sockets.length) bottom = bottom.subtract(M.union(sockets));

  // Top deck: studs on top, slots underneath.
  let top = box(0, 0, H - DECK, W, D, DECK);
  const studs: Manifold[] = [];
  for (let i = 0; i < spec.w; i++)
    for (let j = 0; j < spec.d; j++)
      studs.push(M.cylinder(STUD_H, STUD_R, STUD_R, SEG).translate([i * UNIT + UNIT / 2, j * UNIT + UNIT / 2, H]));
  top = top.add(M.union(studs));

  const slotsBottom: Manifold[] = [];
  const slotsTop: Manifold[] = [];
  for (const wall of walls) {
    let solid = box(wall.x, wall.y, DECK, wall.sx, wall.sy, wallH);
    const tabs = tabsOf(wall);
    for (const t of tabs) {
      solid = solid
        .add(box(t.x, t.y, DECK - TAB_LEN, t.sx, t.sy, TAB_LEN))
        .add(box(t.x, t.y, H - DECK, t.sx, t.sy, TAB_LEN));
      slotsBottom.push(box(t.x - c, t.y - c, DECK - slotDepth, t.sx + 2 * c, t.sy + 2 * c, slotDepth + 1));
      slotsTop.push(box(t.x - c, t.y - c, H - DECK - 1, t.sx + 2 * c, t.sy + 2 * c, slotDepth + 1));
    }
    const flat: [number, number, number] = wall.alongX ? [90, 0, 0] : [0, 90, 0];
    panels.push({ kind: wall.kind, solid, flat });
  }
  if (slotsBottom.length) bottom = bottom.subtract(M.union(slotsBottom));
  if (slotsTop.length) top = top.subtract(M.union(slotsTop));

  panels.unshift({ kind: "top", solid: top, flat: [0, 0, 0] }, { kind: "bottom", solid: bottom, flat: [0, 0, 0] });
  return panels;
}

/** Assembled meshes for the 3D view. */
export function previewParts(panels: Panel[]): MeshPart[] {
  return panels.map((p) => toPart(p.kind, p.solid));
}

/** Each panel laid flat, ready for the bed. */
export function printParts(panels: Panel[]): MeshPart[] {
  return panels.map((p) => toPart(p.kind, p.solid.rotate(p.flat)));
}

/**
 * Fit tile: a deck strip with three slots (0.1, 0.2, 0.3 mm gap per side) and a
 * wall strip with one tab. Press the tab into each slot, keep the snuggest one
 * that still goes in by hand. Dots next to each slot count 1, 2, 3.
 */
export function buildFitTile(m: ManifoldToplevel): MeshPart[] {
  const { Manifold: M } = m;
  const pitch = 22;
  const len = pitch * CLEARANCES.length + 6;
  let deck = M.cube([len, 20, DECK]);
  const cuts: Manifold[] = [];
  CLEARANCES.forEach((c, i) => {
    const cx = 6 + i * pitch + 5;
    cuts.push(M.cube([TAB_W + 2 * c, WALL + 2 * c, TAB_LEN + SLOT_EXTRA + 1]).translate([cx - TAB_W / 2 - c, 8 - c, DECK - TAB_LEN - SLOT_EXTRA]));
    for (let k = 0; k <= i; k++) cuts.push(M.cylinder(1, 1, 1, 16).translate([cx - 4 + k * 4, 3, DECK - 0.6]));
  });
  deck = deck.subtract(M.union(cuts));
  // Key: a short wall with one tab on its edge, printed flat.
  const key = M.cube([30, 14, WALL]).add(M.cube([TAB_W, TAB_LEN, WALL]).translate([10, 14, 0]));
  return [toPart("fit-deck", deck), toPart("fit-key", key)];
}
