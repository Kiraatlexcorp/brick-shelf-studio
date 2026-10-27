import type { Manifold, ManifoldToplevel } from "manifold-3d";
import {
  BOLT_R, CLEARANCES, DECK, DOVE, GROOVE, GUSSET, KNUCKLE_R, MAGNET, PEG_R, PIN_R, RIB_H, RIB_T, SLOT_EXTRA,
  SOCKET_EXTRA, STUD_H, STUD_R, TAB_LEN, UNIT,
  normalize, type CubeSpec, type PartGroup, type SideKey,
} from "@/lib/brick/spec";
import { buildJoints, stackJoint } from "@/lib/brick/joints";
import { toPart, type MeshPart } from "@/lib/brick/mesh";

type Vec3 = [number, number, number];

/** Assembled frame: x = width, y = depth (front at y 0), z = up. Units mm. */
export type Panel = {
  /** Unique part name, also the file name. */
  kind: string;
  group: PartGroup;
  solid: Manifold;
  /** The same part with doors opened and drawers pulled out (preview only). */
  open?: Manifold;
  /** Rotation that lays it flat for printing. */
  flat: Vec3;
  /** Explode direction. */
  out: Vec3;
};

const SEG = 48;
const OUT_OF: Record<SideKey, Vec3> = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0] };
/** Lays a plate whose inside faces `side` flat with the inside up. */
const FLAT_OF: Record<SideKey, Vec3> = { front: [90, 0, 0], back: [-90, 0, 0], left: [0, -90, 0], right: [0, 90, 0] };

function tabCentres(lengthUnits: number) {
  return Array.from({ length: lengthUnits }, (_, i) => i * UNIT + UNIT / 2);
}

/**
 * Face frame: the opening lies in the x–z plane at y = 0, x runs 0..faceWidth
 * along the face as seen from outside, z is up, and the cube interior is +y.
 */
function faceToWorld(s: Manifold, side: SideKey, W: number, D: number): Manifold {
  switch (side) {
    case "front": return s;
    case "back": return s.rotate([0, 0, 180]).translate([W, D, 0]);
    case "left": return s.rotate([0, 0, -90]).translate([0, D, 0]);
    case "right": return s.rotate([0, 0, 90]).translate([W, 0, 0]);
  }
}

export function buildCube(m: ManifoldToplevel, input: CubeSpec): Panel[] {
  const spec = normalize(input);
  const { Manifold: M } = m;
  const W = spec.w * UNIT;
  const D = spec.d * UNIT;
  const H = spec.h * UNIT;
  const T = spec.wall;
  const wallH = H - 2 * DECK;
  const c = spec.clearance;
  const pegR = Math.min(PEG_R, T / 2 - 0.8);
  const slotDepth = TAB_LEN + SLOT_EXTRA;
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    M.cube([sx, sy, sz]).translate([x, y, z]);
  const union = (xs: Manifold[]) => (xs.length ? M.union(xs) : null);
  const hasWall = (k: SideKey) => spec[k] === "wall";
  const gus = spec.gussets && hasWall("back") ? GUSSET : 0;
  const backDepth = hasWall("back") ? T : 0;
  const ribs = spec.ribs;
  const ribFront = 12;

  // ---------- walls ----------
  type WallDef = { kind: SideKey; x: number; y: number; sx: number; sy: number; alongX: boolean };
  const walls: WallDef[] = [];
  if (hasWall("left")) walls.push({ kind: "left", x: 0, y: 0, sx: T, sy: D, alongX: false });
  if (hasWall("right")) walls.push({ kind: "right", x: W - T, y: 0, sx: T, sy: D, alongX: false });
  if (hasWall("back")) walls.push({ kind: "back", x: T, y: D - T, sx: W - 2 * T, sy: T, alongX: true });
  if (hasWall("front")) walls.push({ kind: "front", x: T, y: 0, sx: W - 2 * T, sy: T, alongX: true });

  const pegsOf = (wall: WallDef) =>
    wall.alongX
      ? tabCentres(spec.w)
          .filter((cx) => cx - pegR >= wall.x + 1 && cx + pegR <= wall.x + wall.sx - 1)
          .map((cx) => ({ x: cx, y: wall.y + T / 2 }))
      : tabCentres(spec.d).map((cy) => ({ x: wall.x + T / 2, y: cy }));

  // Dovetail profile across x (0 = outer face of the left wall), extruded in z.
  const dovetail = (y: number, male: boolean) => {
    const g = male ? c : 0;
    const n = DOVE.narrow / 2 - g;
    const w = DOVE.wide / 2 - g;
    const dz = male ? DOVE.depth - 0.2 : DOVE.depth;
    const z0 = DECK + (male ? 1 : 0);
    const z1 = H - DECK - (male ? 0 : -0.01);
    const pts: Vec3[] = [];
    for (const z of [z0, z1]) pts.push([0, y - n, z], [0, y + n, z], [dz, y - w, z], [dz, y + w, z]);
    // male: base on the right wall's outer face pointing +x; female: cut into the left wall from x = 0
    const shape = M.hull(pts);
    return male ? shape.translate([W, 0, 0]) : shape.translate([-0.01, 0, 0]);
  };
  // Note: the male base is the narrow end at x = W, tip (wide) at W + depth.

  // Drawer layout: the front opening split into equal rows.
  const drawerOn = spec.front === "drawer";
  const clearH = wallH - (ribs ? RIB_H : 0);
  const rowH = clearH / spec.drawers;
  const drawerDepth = D - backDepth - gus - 1.5;
  const rows = drawerOn ? Array.from({ length: spec.drawers }, (_, i) => DECK + i * rowH) : [];
  const grooveZ = rows.map((z0) => z0 + rowH / 2);

  // Side bolt holes: between dovetails, clear of drawer grooves.
  const sideBoltSpots: { y: number; z: number }[] = [];
  if (spec.bolts) {
    const ys = spec.d === 1 ? [UNIT / 2 - 12] : Array.from({ length: spec.d - 1 }, (_, j) => (j + 1) * UNIT);
    const zs = [DECK + 10, H - DECK - 10].filter((z, i, a) => a.indexOf(z) === i && z > DECK + 4 && z < H - DECK - 4);
    for (const y of ys) for (const z of zs)
      if (grooveZ.every((g) => Math.abs(g - z) > GROOVE.height / 2 + BOLT_R + 1)) sideBoltSpots.push({ y, z });
  }

  const panels: Panel[] = [];
  const slotsBottom: Manifold[] = [];
  const slotsTop: Manifold[] = [];
  for (const wall of walls) {
    let solid = box(wall.x, wall.y, DECK, wall.sx, wall.sy, wallH);
    for (const p of pegsOf(wall)) {
      const peg = M.cylinder(TAB_LEN, pegR, pegR, 32);
      solid = solid.add(peg.translate([p.x, p.y, DECK - TAB_LEN])).add(peg.translate([p.x, p.y, H - DECK]));
      const hole = M.cylinder(slotDepth + 1, pegR + c, pegR + c, 32);
      slotsBottom.push(hole.translate([p.x, p.y, DECK - slotDepth]));
      slotsTop.push(hole.translate([p.x, p.y, H - DECK - 1]));
    }
    const cuts: Manifold[] = [];
    const adds: Manifold[] = [];
    if (spec.dovetail && (wall.kind === "left" || wall.kind === "right"))
      for (const y of tabCentres(spec.d)) (wall.kind === "right" ? adds : cuts).push(dovetail(y, wall.kind === "right"));
    if (wall.kind === "left" || wall.kind === "right") {
      // Drawer grooves on the inner face, shallow lip at the front as the stop.
      const inner = wall.kind === "left" ? T : W - T;
      const dir = wall.kind === "left" ? -1 : 1;
      const grooveEnd = D - backDepth - gus;
      for (const zc of grooveZ) {
        const z0 = zc - GROOVE.height / 2;
        const deep = dir < 0 ? inner - GROOVE.depth : inner;
        cuts.push(box(deep, GROOVE.lipLen, z0, GROOVE.depth, grooveEnd - GROOVE.lipLen, GROOVE.height));
        const shallow = GROOVE.depth - GROOVE.lip;
        cuts.push(box(dir < 0 ? inner - shallow : inner, -1, z0, shallow, GROOVE.lipLen + 1.01, GROOVE.height));
      }
      for (const s of sideBoltSpots) cuts.push(M.cylinder(T + 2, BOLT_R, BOLT_R, 24).rotate([0, 90, 0]).translate([wall.x - 1, s.y, s.z]));
    }
    if (wall.kind === "back") {
      if (gus) {
        const g = (x0: number, sgn: number) =>
          M.hull([
            [x0, D - T, DECK], [x0 + sgn * GUSSET, D - T, DECK], [x0, D - T - GUSSET, DECK],
            [x0, D - T, H - DECK], [x0 + sgn * GUSSET, D - T, H - DECK], [x0, D - T - GUSSET, H - DECK],
          ]);
        adds.push(g(T + c, 1), g(W - T - c, -1));
      }
      if (spec.bolts)
        for (const fx of spec.w === 1 ? [0.5] : [0.25, 0.75])
          cuts.push(M.cylinder(T + 2, BOLT_R + 0.3, BOLT_R + 0.3, 24).rotate([-90, 0, 0]).translate([W * fx, D - T - 1, H - DECK - 12]));
    }
    const a = union(adds);
    if (a) solid = solid.add(a);
    const k = union(cuts);
    if (k) solid = solid.subtract(k);
    const flat: Vec3 =
      wall.kind === "right" ? [0, -90, 0] : wall.kind === "left" ? [0, 90, 0] : wall.kind === "back" ? [-90, 0, 0] : [90, 0, 0];
    const group: PartGroup = wall.kind === "back" ? "back" : wall.kind === "front" ? "front" : "side";
    panels.push({ kind: wall.kind, group, solid, flat, out: OUT_OF[wall.kind] });
  }

  // ---------- decks ----------
  let bottom = box(0, 0, 0, W, D, DECK);
  const sockets: Manifold[] = [];
  const studs: Manifold[] = [];
  if (stackJoint(spec) === "lego") for (const x of tabCentres(spec.w))
    for (const y of tabCentres(spec.d)) {
      sockets.push(M.cylinder(STUD_H + SOCKET_EXTRA, STUD_R + SOCKET_EXTRA, STUD_R + SOCKET_EXTRA, SEG).translate([x, y, -0.01]));
      studs.push(M.cylinder(STUD_H, STUD_R, STUD_R, SEG).translate([x, y, H - 0.01]));
    }
  if (sockets.length) bottom = bottom.subtract(M.union(sockets));
  let top = box(0, 0, H - DECK, W, D, DECK);
  if (studs.length) top = top.add(M.union(studs));
  if (ribs) {
    const xs = spec.w === 1 ? [W / 2] : Array.from({ length: spec.w - 1 }, (_, i) => (i + 1) * UNIT);
    // Ribs run front to back under the top deck so drawers still slide under them.
    const r = xs.map((x) => box(x - RIB_T / 2, ribFront, H - DECK - RIB_H, RIB_T, D - backDepth - gus - ribFront - 0.5, RIB_H + 0.01));
    // A cross rib at the back stiffens the deck against sag.
    r.push(box(T + c + (gus ? GUSSET : 0), D - backDepth - gus - RIB_T - 0.5, H - DECK - RIB_H, W - 2 * (T + c) - 2 * (gus ? GUSSET : 0), RIB_T, RIB_H + 0.01));
    top = top.add(M.union(r));
  }
  const deckCuts: Manifold[] = [];
  if (spec.bolts) {
    // Stack bolts sit between the studs so they never bite a stud.
    const spots: [number, number][] = [];
    if (spec.d > 1) for (let j = 1; j < spec.d; j++) for (const x of [T + 4.5, W - T - 4.5]) spots.push([x, j * UNIT]);
    else if (spec.w > 1) for (let i = 1; i < spec.w; i++) for (const y of [16, D - backDepth - 4.5]) spots.push([i * UNIT + 6, y]);
    for (const [x, y] of spots) deckCuts.push(M.cylinder(H + 10, BOLT_R, BOLT_R, 24).translate([x, y, -5]));
  }

  // ---------- fronts: doors, drawers, sliding panels ----------
  const fixtures: Panel[] = [];
  const deckAdds: Manifold[] = [];
  for (const side of ["front", "back", "left", "right"] as SideKey[]) {
    const kind = spec[side];
    const Lw = side === "front" || side === "back" ? W : D;
    const toWorld = (s: Manifold) => faceToWorld(s, side, W, D);
    if (kind === "door") {
      const door = buildDoor(m, spec, Lw, H);
      for (const f of door.fixed) deckAdds.push(toWorld(f));
      for (const p of door.pockets) deckCuts.push(toWorld(p));
      fixtures.push({
        kind: `door-${side}`, group: "door", solid: toWorld(door.door), open: toWorld(door.opened),
        flat: FLAT_OF[side], out: OUT_OF[side],
      });
    } else if (kind === "slide") {
      const sl = buildSlide(m, spec, Lw, H);
      for (const g of sl.grooves) deckCuts.push(toWorld(g));
      sl.panels.forEach((p, i) =>
        fixtures.push({ kind: `slide-${side}-${i + 1}`, group: "slide", solid: toWorld(p.solid), open: toWorld(p.open), flat: FLAT_OF[side], out: OUT_OF[side] }),
      );
    } else if (kind === "drawer" && side === "front") {
      rows.forEach((z0, i) => {
        const solid = buildDrawer(m, spec, {
          W, z0, rowH, depth: drawerDepth,
          plateZ0: i === 0 ? DECK + c : z0 + 0.5,
          plateZ1: i === rows.length - 1 ? H - 0.5 : z0 + rowH - 0.5,
        });
        fixtures.push({
          kind: `drawer-${i + 1}`, group: "drawer", solid, open: solid.translate([0, -drawerDepth * 0.6, 0]),
          flat: [0, 0, 0], out: [0, -1, 0],
        });
      });
    }
  }

  const fixed = union(deckAdds);
  if (fixed) {
    // Hinge knuckles sit on the deck whose height they share.
    const parts = fixed.decompose();
    const low = parts.filter((p) => { const b = p.boundingBox(); return (b.min[2] + b.max[2]) / 2 < H / 2; });
    const high = parts.filter((p) => !low.includes(p));
    if (low.length) bottom = bottom.add(M.union(low));
    if (high.length) top = top.add(M.union(high));
  }
  const allBottom = [...slotsBottom, ...deckCuts];
  const allTop = [...slotsTop, ...deckCuts];
  if (allBottom.length) bottom = bottom.subtract(M.union(allBottom));
  if (allTop.length) top = top.subtract(M.union(allTop));

  const joints = buildJoints(m, spec);
  if (joints.cuts.length) {
    const jc = M.union(joints.cuts);
    bottom = bottom.subtract(jc);
    top = top.subtract(jc);
    for (const p of panels) p.solid = p.solid.subtract(jc);
  }
  const ja = joints.adds;
  if (ja?.top.length) top = top.add(M.union(ja.top));
  if (ja?.bottom.length) bottom = bottom.add(M.union(ja.bottom));
  const right = panels.find((p) => p.kind === "right");
  if (ja?.right.length && right) right.solid = right.solid.add(M.union(ja.right));
  panels.unshift(
    { kind: "top", group: "deck", solid: top, flat: [0, 0, 0], out: [0, 0, 1] },
    { kind: "bottom", group: "deck", solid: bottom, flat: [0, 0, 0], out: [0, 0, -1] },
  );
  return [...panels, ...fixtures, ...joints.parts];
}

/**
 * Door in the face frame. Built hinge-left (axis along z at x = R, y = -R),
 * then mirrored or swapped for right, top and bottom hinges.
 */
function buildDoor(m: ManifoldToplevel, spec: CubeSpec, Lw: number, H: number) {
  const { Manifold: M } = m;
  const R = KNUCKLE_R;
  const vertical = spec.hinge === "left" || spec.hinge === "right";
  const A = vertical ? Lw : H; // across the door, away from the hinge
  const B = vertical ? H : Lw; // along the hinge axis
  const gap = 0.3;
  const fixedSegs: [number, number][] = [];
  const doorSegs: [number, number][] = [];
  if (vertical) {
    fixedSegs.push([0, DECK], [B - DECK, B]);
    doorSegs.push([DECK + gap, B - DECK - gap]);
  } else {
    let n = Math.max(3, Math.round(B / 22));
    if (n % 2 === 0) n += 1;
    const L = B / n;
    for (let i = 0; i < n; i++) (i % 2 === 0 ? fixedSegs : doorSegs).push(i % 2 === 0 ? [i * L, (i + 1) * L] : [i * L + gap, (i + 1) * L - gap]);
  }
  const knuckle = (z0: number, z1: number) => M.cylinder(z1 - z0, R, R, 32).translate([R, -R, z0]);
  const pin = M.cylinder(B + 2, PIN_R, PIN_R, 24).translate([R, -R, -1]);
  const pinLoose = M.cylinder(B + 2, PIN_R + 0.15, PIN_R + 0.15, 24).translate([R, -R, -1]);
  const fixed = fixedSegs.map(([z0, z1]) => knuckle(z0, z1).add(M.cube([2 * R, R + 0.5, z1 - z0]).translate([0, -R, z0])).subtract(pin));

  const plateX0 = 2 * R + 0.4;
  let door = M.cube([A - 0.5 - plateX0, 2 * R, B - 1]).translate([plateX0, -2 * R, 0.5]);
  for (const [z0, z1] of doorSegs) door = door.add(knuckle(z0, z1)).add(M.cube([plateX0 + 0.2 - R, 2 * R, z1 - z0]).translate([R, -2 * R, z0]));
  door = door.subtract(pinLoose);
  // Finger notch near the free edge.
  door = door.subtract(M.cylinder(4 * R, 7, 7, 32).rotate([90, 0, 0]).translate([A - 2, R, B / 2]));

  // Latch spots on the deck edge near the free edge.
  const spots: [number, number][] = vertical
    ? [[A - 9, DECK / 2], [A - 9, B - DECK / 2]]
    : [[A - DECK / 2, B * 0.25], [A - DECK / 2, B * 0.75]];
  const pockets: Manifold[] = [];
  for (const [x, z] of spots) {
    if (spec.latch === "magnet") {
      const cup = M.cylinder(MAGNET.depth + 0.01, MAGNET.r, MAGNET.r, 32).rotate([-90, 0, 0]);
      pockets.push(cup.translate([x, -0.01, z]));
      door = door.subtract(cup.translate([x, -MAGNET.depth, z]));
    } else {
      door = door.add(M.sphere(1.0, 24).translate([x, 0, z]).intersect(M.cube([4, 2, 4]).translate([x - 2, -0.5, z - 2])));
      pockets.push(M.sphere(1.3, 24).translate([x, 0, z]));
    }
  }
  const opened = door.translate([-R, R, 0]).rotate([0, 0, -100]).translate([R, -R, 0]);

  const toFace = (s: Manifold) => {
    switch (spec.hinge) {
      case "left": return s;
      case "right": return s.mirror([1, 0, 0]).translate([Lw, 0, 0]);
      case "bottom": return s.mirror([Math.SQRT1_2, 0, -Math.SQRT1_2]);
      case "top": return s.mirror([Math.SQRT1_2, 0, -Math.SQRT1_2]).mirror([0, 0, 1]).translate([0, 0, H]);
    }
  };
  return { door: toFace(door), opened: toFace(opened), fixed: fixed.map(toFace), pockets: pockets.map(toFace) };
}

/** Sliding panels riding in grooves cut into the top and bottom decks just inside the opening. */
function buildSlide(m: ManifoldToplevel, spec: CubeSpec, Lw: number, H: number) {
  const { Manifold: M } = m;
  const c = spec.clearance;
  const t = 3;
  const gBot = 2;
  const gTop = 4;
  const span = Lw - 2 * spec.wall;
  const grooves: Manifold[] = [];
  const panels: { solid: Manifold; open: Manifold }[] = [];
  const pw = (spec.panels === 2 ? span / 2 + 6 : span / 2 + 6) - c;
  const ph = H - 2 * DECK + gTop - 0.5;
  for (let i = 0; i < spec.panels; i++) {
    const y0 = 1.5 + i * (t + 2 * c + 1.5);
    grooves.push(M.cube([span, t + 2 * c, gBot + 0.01]).translate([spec.wall, y0, DECK - gBot]));
    grooves.push(M.cube([span, t + 2 * c, gTop + 0.01]).translate([spec.wall, y0, H - DECK - 0.01]));
    const x0 = i === 0 ? spec.wall + c / 2 : Lw - spec.wall - c / 2 - pw;
    let p = M.cube([pw, t, ph]).translate([x0, y0 + c, DECK - gBot]);
    // Recessed finger pull on the outward face only (no through-hole), placed outside the
    // overlap band so the other panel or the frame never covers or catches it.
    const overlap = spec.panels === 2 ? 2 * pw - span : 0;
    const inset = overlap + 12;
    const fx = i === 0 ? x0 + pw - inset : x0 + inset;
    const zc = DECK - gBot + ph / 2;
    const slotH = Math.min(36, ph * 0.4);
    const depth = 1.6;
    const cup = M.cylinder(depth + 0.01, 6, 6, 32).rotate([-90, 0, 0]);
    const pull = M.hull([cup.translate([fx, y0 + c - 0.01, zc - slotH / 2 + 6]), cup.translate([fx, y0 + c - 0.01, zc + slotH / 2 - 6])]);
    p = p.subtract(pull);
    const shift = span - pw - c;
    panels.push({ solid: p, open: p.translate([i === 0 ? shift : -shift, 0, 0]) });
  }
  if (spec.panels === 2) panels[1].open = panels[1].solid; // one side open at a time
  return { grooves, panels };
}

/** Drawer box with rear runners, a front plate covering the opening, a pull and a label slot. */
function buildDrawer(
  m: ManifoldToplevel,
  spec: CubeSpec,
  o: { W: number; z0: number; rowH: number; depth: number; plateZ0: number; plateZ1: number },
) {
  const { Manifold: M } = m;
  const c = spec.clearance;
  const T = spec.wall;
  const sh = 1.6;
  const x0 = T + c;
  const bw = o.W - 2 * T - 2 * c;
  const bh = o.rowH - 2 * c;
  const z0 = o.z0 + c;
  let boxS = M.cube([bw, o.depth, bh]).translate([x0, 0, z0]);
  boxS = boxS.subtract(M.cube([bw - 2 * sh, o.depth - 2 * sh, bh]).translate([x0 + sh, sh, z0 + sh]));
  for (let i = 1; i <= spec.dividers; i++)
    boxS = boxS.add(M.cube([1.2, o.depth - 2 * sh, bh - 3]).translate([x0 + (bw * i) / (spec.dividers + 1) - 0.6, sh, z0 + sh]));
  // Runners at the back of both sides ride in the wall grooves; the groove lip stops them at the front.
  const rl = 16;
  const rh = GROOVE.height - 2 * c;
  const rd = GROOVE.depth - c;
  const zc = o.z0 + o.rowH / 2;
  for (const x of [x0 - rd, x0 + bw]) boxS = boxS.add(M.cube([rd + 0.01, rl, rh]).translate([x === x0 + bw ? x - 0.01 : x, o.depth - rl - 1, zc - rh / 2]));
  // Front plate.
  const pz0 = o.plateZ0;
  const ph = o.plateZ1 - pz0;
  let plate = M.cube([o.W - 1, 4, ph]).translate([0.5, -4, pz0]);
  const mid = pz0 + ph / 2;
  // Label slot above the pull when there is room.
  const hasLabel = ph >= 44;
  const pullZ = hasLabel ? mid - 8 : mid - 6;
  if (hasLabel) plate = plate.subtract(M.cube([Math.min(60, o.W * 0.45), 1, 12]).translate([o.W / 2 - Math.min(60, o.W * 0.45) / 2, -4.01, pullZ + 18]));
  // Pull: a ledge with a 45° underside so it prints upright without support.
  const hw = Math.min(70, o.W * 0.5);
  const pts: Vec3[] = [];
  for (const x of [o.W / 2 - hw / 2, o.W / 2 + hw / 2])
    pts.push([x, -3.9, pullZ], [x, -14, pullZ + 10], [x, -14, pullZ + 13], [x, -3.9, pullZ + 13]);
  plate = plate.add(M.hull(pts));
  return boxS.add(plate);
}

/** Assembled meshes for the 3D view. */
export function previewParts(panels: Panel[], open = false): MeshPart[] {
  return panels.map((p) => ({ ...toPart(p.kind, open && p.open ? p.open : p.solid), group: p.group, out: p.out }));
}

/** Each panel laid flat, ready for the bed. */
export function printParts(panels: Panel[]): MeshPart[] {
  return panels.map((p) => toPart(p.kind, p.solid.rotate(p.flat)));
}

/**
 * Fit tile: a deck strip with three holes (0.1, 0.2, 0.3 mm gap per side) and a
 * wall strip with one edge peg. Press the peg into each hole, keep the snuggest one
 * that still goes in by hand. Dots next to each hole count 1, 2, 3.
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
  const key = M.cube([30, 14, 8]).add(M.cylinder(TAB_LEN, PEG_R, PEG_R, 32).rotate([-90, 0, 0]).translate([15, 14, 4]));
  return [toPart("fit-deck", deck), toPart("fit-key", key)];
}
