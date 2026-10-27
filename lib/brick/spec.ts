/** Every size is in grid units of UNIT mm. */
export const UNIT = 40;
/** Default side, back and front panel thickness; the spec can override (4–8 mm). */
export const WALL = 5;
export const WALLS = [4, 5, 6, 8] as const;
/** Top and bottom panel thickness; thick enough for slots, stud sockets and hinge knuckles. */
export const DECK = 6;
/** Edge pegs on wall edges that press into deck holes (shrunk on thin walls). */
export const PEG_R = 3;
export const TAB_LEN = 3;
/** Slot depth is the tab length plus this air gap. */
export const SLOT_EXTRA = 0.4;
/** Alignment studs, Lego proportions: diameter 0.6 of pitch, height 0.18 of diameter. */
export const STUD_R = (0.6 * UNIT) / 2;
export const STUD_H = Math.round(0.18 * 2 * STUD_R * 10) / 10;
export const SOCKET_EXTRA = 0.2;
export const A1_BED = 256;

/** Dovetail rail between side-by-side cubes: narrow at the face, wide inside. */
export const DOVE = { depth: 2, narrow: 5, wide: 7.4 };
/** M4 bolt clearance hole. */
export const BOLT_R = 2.2;
/** Corner gusset leg and shelf rib height. */
export const GUSSET = 10;
export const RIB_H = 4;
export const RIB_T = 3;
/** Hinge knuckle radius (half the deck) and pin hole for a 1.75 mm filament offcut. */
export const KNUCKLE_R = DECK / 2;
export const PIN_R = 1.05;
/** 4 × 2 mm disc magnet pocket. */
export const MAGNET = { r: 2.1, depth: 2.2 };
/** Drawer rail groove in the side walls. */
export const GROOVE = { depth: 1.8, height: 6, lip: 0.8, lipLen: 3 };

export type Side = "wall" | "open" | "door" | "drawer" | "slide";
export type Hinge = "left" | "right" | "top" | "bottom";
export type Latch = "magnet" | "bump";

export type CubeSpec = {
  /** Grid units, 1..4 each. */
  w: number;
  d: number;
  h: number;
  front: Side;
  back: Side;
  left: Side;
  right: Side;
  /** Gap per side between mating parts, from the fit tile. */
  clearance: number;
  /** Wall thickness, mm. */
  wall: number;
  /** Dovetail rails on the right wall, grooves on the left, so cubes slide together. */
  dovetail: boolean;
  /** M4 holes: through the decks at the corners (stack) and side walls (side by side), plus back wall mounting. */
  bolts: boolean;
  /** Triangular gussets in the back corners. */
  gussets: boolean;
  /** Ribs under the top deck. */
  ribs: boolean;
  hinge: Hinge;
  latch: Latch;
  /** Drawers stacked in the front opening: 1 full height or 2 half height. */
  drawers: number;
  /** Divider walls inside each drawer. */
  dividers: number;
  /** Sliding door panels: 1 or 2. */
  panels: number;
};

export const DEFAULT_CUBE: CubeSpec = {
  w: 2,
  d: 2,
  h: 2,
  front: "open",
  back: "wall",
  left: "wall",
  right: "wall",
  clearance: 0.2,
  wall: WALL,
  dovetail: true,
  bolts: true,
  gussets: true,
  ribs: true,
  hinge: "left",
  latch: "magnet",
  drawers: 1,
  dividers: 0,
  panels: 2,
};

export const CLEARANCES = [0.1, 0.2, 0.3] as const;

export type SideKey = "front" | "back" | "left" | "right";
export const SIDE_KEYS: SideKey[] = ["front", "back", "left", "right"];
export type PanelKind = "bottom" | "top" | SideKey;
/** Colour group in the preview. */
export type PartGroup = "deck" | "side" | "back" | "front" | "door" | "drawer" | "slide";

/** Make a spec consistent: drawers only at the front, side walls kept for drawer rails. */
export function normalize(spec: CubeSpec): CubeSpec {
  const s = { ...spec };
  for (const k of ["back", "left", "right"] as const) if (s[k] === "drawer") s[k] = "open";
  if (s.front === "drawer") {
    if (s.left !== "wall") s.left = "wall";
    if (s.right !== "wall") s.right = "wall";
  }
  if (s.h < 2) s.drawers = 1;
  s.drawers = Math.max(1, Math.min(2, Math.round(s.drawers)));
  s.dividers = Math.max(0, Math.min(3, Math.round(s.dividers)));
  s.panels = s.panels === 1 ? 1 : 2;
  return s;
}
