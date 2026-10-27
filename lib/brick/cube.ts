import type { Manifold, ManifoldToplevel } from "manifold-3d";
import {
  CLEARANCES, DECK, PEG_R, SLOT_EXTRA, SOCKET_EXTRA, STUD_H, STUD_R, TAB_LEN, UNIT, WALL,
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

  // Edge stud centres (x, y) along each wall, one per grid unit.
  const pegsOf = (wall: WallDef) =>
    wall.alongX
      ? tabCentres(spec.w, 0)
          .filter((cx) => cx - PEG_R >= wall.x && cx + PEG_R <= wall.x + wall.sx)
          .map((cx) => ({ x: cx, y: wall.y + WALL / 2 }))
      : tabCentres(spec.d, 0).map((cy) => ({ x: wall.x + WALL / 2, y: cy }));

  // Face studs and sockets: studs on the right and back faces, sockets on the
  // left and front, so a neighbour cube snaps on at the side like Lego.
  const faceGrid = (wall: WallDef) => {
    const along = wall.alongX ? spec.w : spec.d;
    const pts: { u: number; z: number }[] = [];
    for (let i = 0; i < along; i++)
      for (let k = 0; k < spec.h; k++) pts.push({ u: i * UNIT + UNIT / 2, z: k * UNIT + UNIT / 2 });
    return pts;
  };
  const faceStud = (wall: WallDef, u: number, z: number, socket: boolean) => {
    const r = socket ? STUD_R + SOCKET_EXTRA : STUD_R;
    const h = socket ? STUD_H + SOCKET_EXTRA : STUD_H;
    const cyl = M.cylinder(socket ? h + 1 : h, r, r, SEG);
    switch (wall.kind) {
      case "right": return cyl.rotate([0, 90, 0]).translate([W, u, z]);
      case "left": return cyl.rotate([0, -90, 0]).translate([h, u, z]);
      case "back": return cyl.rotate([-90, 0, 0]).translate([u, D, z]);
      default: return cyl.rotate([90, 0, 0]).translate([u, h, z]);
    }
  };

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
    for (const p of pegsOf(wall)) {
      const peg = M.cylinder(TAB_LEN, PEG_R, PEG_R, 32);
      solid = solid.add(peg.translate([p.x, p.y, DECK - TAB_LEN])).add(peg.translate([p.x, p.y, H - DECK]));
      const hole = M.cylinder(slotDepth + 1, PEG_R + c, PEG_R + c, 32);
      slotsBottom.push(hole.translate([p.x, p.y, DECK - slotDepth]));
      slotsTop.push(hole.translate([p.x, p.y, H - DECK - 1]));
    }
    const socketFace = wall.kind === "left" || wall.kind === "front";
    const face = faceGrid(wall)
      .filter(({ z }) => z - STUD_R >= DECK && z + STUD_R <= H - DECK)
      .map(({ u, z }) => faceStud(wall, u, z, socketFace));
    if (face.length) solid = socketFace ? solid.subtract(M.union(face)) : solid.add(M.union(face));
    // Lay flat with studs facing up (sockets face the bed).
    const flat: [number, number, number] =
      wall.kind === "right" ? [0, -90, 0] : wall.kind === "left" ? [0, 90, 0] : wall.kind === "back" ? [90, 0, 0] : [-90, 0, 0];
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
 * wall strip with one edge stud. Press the stud into each slot, keep the snuggest one
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
    cuts.push(M.cylinder(TAB_LEN + SLOT_EXTRA + 1, PEG_R + c, PEG_R + c, 32).translate([cx, 12, DECK - TAB_LEN - SLOT_EXTRA]));
    for (let k = 0; k <= i; k++) cuts.push(M.cylinder(1, 1, 1, 16).translate([cx - 4 + k * 4, 3, DECK - 0.6]));
  });
  deck = deck.subtract(M.union(cuts));
  // Key: a short wall with one tab on its edge, printed flat.
  const key = M.cube([30, 14, WALL]).add(M.cylinder(TAB_LEN, PEG_R, PEG_R, 32).rotate([-90, 0, 0]).translate([15, 14, WALL / 2]));
  return [toPart("fit-deck", deck), toPart("fit-key", key)];
}
