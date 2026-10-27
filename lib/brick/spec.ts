/** Every size is in grid units of UNIT mm, Lego look at 5x scale. */
export const UNIT = 40;
/** Side, back and front panel thickness. */
export const WALL = 4;
/** Top and bottom panel thickness; thick enough for slots plus stud sockets. */
export const DECK = 6;
/** Edge tabs: width along the edge and how far they reach into the deck. */
export const TAB_W = 10;
export const TAB_LEN = 3;
/** Slot depth is the tab length plus this air gap. */
export const SLOT_EXTRA = 0.4;
/** Big Lego-look studs on the top deck, sockets under the bottom deck. */
export const STUD_R = 12;
export const STUD_H = 3;
export const SOCKET_EXTRA = 0.2;
export const A1_BED = 256;

export type Side = "wall" | "open";

export type CubeSpec = {
  /** Grid units, 1..4 each. */
  w: number;
  d: number;
  h: number;
  front: Side;
  back: Side;
  left: Side;
  right: Side;
  /** Gap per side between tab and slot, from the fit tile. */
  clearance: number;
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
};

export const CLEARANCES = [0.1, 0.2, 0.3] as const;

export type PanelKind = "bottom" | "top" | "left" | "right" | "back" | "front";

export const PANEL_LABEL: Record<PanelKind, string> = {
  bottom: "Bottom",
  top: "Top",
  left: "Left",
  right: "Right",
  back: "Back",
  front: "Front",
};
