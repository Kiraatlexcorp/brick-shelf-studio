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
/** 6 × 3 mm disc magnet pocket for door and slide locks. */
export const LOCK_MAGNET = { r: 3.1, depth: 3.2 };
/** Drawer rail groove in the side walls. */
export const GROOVE = { depth: 1.8, height: 6, lip: 0.8, lipLen: 3 };

/** How cubes join each other: stacking (top/bottom) and side by side. */
/** A single connection system. */
export type BaseJoint = "lego" | "twist" | "rail" | "clip" | "magnet";
export const BASE_JOINTS: BaseJoint[] = ["lego", "twist", "rail", "clip", "magnet"];
/** "mixed" picks one system for stacking (top/bottom) and another for side by side. */
export type Joint = BaseJoint | "mixed";
export const JOINTS: Joint[] = [...BASE_JOINTS, "mixed"];

export type Side = "wall" | "open" | "door" | "drawer" | "slide";
export type Hinge = "left" | "right" | "top" | "bottom";
export type Latch = "magnet" | "bump" | "hook" | "knob";
export const LATCHES: Latch[] = ["magnet", "bump", "hook", "knob"];
export type Lock = "none" | "latch" | "knob";
export const LOCKS: Lock[] = ["none", "latch", "knob"];

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
  /** Lock style: "none" (default) or "latch" (flexible snap hook) or "knob" (turn-knob cam). Mapped to latch. */
  lock: Lock;
  /** Extra 6 × 3 mm disc magnet pocket for hook/knob door or slide locks. */
  lockMagnet: boolean;
  /** Drawers stacked in the front opening: 1 full height or 2 half height. */
  drawers: number;
  /** Divider walls inside each drawer. */
  dividers: number;
  /** Sliding door panels: 1 or 2. */
  panels: number;
  /** Cube-to-cube connection system. */
  joint: Joint;
  /** Mixed mode: joint on the top and bottom decks. */
  stack: BaseJoint;
  /** Mixed mode: joint on the left and right walls. */
  side: BaseJoint;
  /** Single cube: clip keys become flush half plugs, nothing sticks out past the faces. */
  solo: boolean;
  /** Gridfinity baseplate grid (42 mm cells) on the drawer floor. */
  gridfinity: boolean;
  /** Wall mode: printed wall rail plus a hook on the back, so the cube floats. */
  wallMount: boolean;
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
  lock: "none",
  lockMagnet: false,
  drawers: 1,
  dividers: 0,
  panels: 2,
  joint: "lego",
  stack: "twist",
  side: "rail",
  wallMount: false,
  solo: false,
  gridfinity: false,
};

export const CLEARANCES = [0.1, 0.2, 0.3] as const;

export type SideKey = "front" | "back" | "left" | "right";
export const SIDE_KEYS: SideKey[] = ["front", "back", "left", "right"];
export type PanelKind = "bottom" | "top" | SideKey;
/** Colour group in the preview. */
export type PartGroup = "deck" | "side" | "back" | "front" | "door" | "drawer" | "slide" | "joint";

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

  // Door lock & latch: map lock ("none" | "latch" | "knob") onto latch ("hook" | "knob").
  if (s.lock === "latch" || s.latch === "hook") {
    s.lock = "latch";
    s.latch = "hook";
  } else if (s.lock === "knob" || s.latch === "knob") {
    s.lock = "knob";
    s.latch = "knob";
  } else {
    s.lock = "none";
    if (!LATCHES.includes(s.latch)) s.latch = "magnet";
  }

  s.lockMagnet = !!s.lockMagnet;

  if (!JOINTS.includes(s.joint)) s.joint = "lego";
  // The hook bolts through the back wall's M4 holes.
  s.wallMount = !!s.wallMount && s.back === "wall";
  if (s.wallMount) s.bolts = true;
  s.solo = !!s.solo;
  s.gridfinity = !!s.gridfinity;
  if (!BASE_JOINTS.includes(s.stack)) s.stack = "twist";
  if (!BASE_JOINTS.includes(s.side)) s.side = "rail";
  const stack = s.joint === "mixed" ? s.stack : s.joint;
  const side = s.joint === "mixed" ? s.side : s.joint;
  const any = (j: BaseJoint) => stack === j || side === j;
  // Dovetails belong to the Lego side joint; the others replace them.
  if (side !== "lego") s.dovetail = false;
  // T-slots on the outer face need room next to the drawer grooves.
  if (any("rail") && s.wall < 5) s.wall = 5;
  // Side bayonets sink 5 mm into the wall; with drawers the grooves sit right behind them.
  if (any("twist")) s.wall = Math.max(s.wall, side === "twist" && s.front === "drawer" ? 8 : 6);
  // 3.2 mm magnet pockets.
  if (any("magnet") && s.wall < 6) s.wall = 6;
  return s;
}
