"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type * as React from "react";
import dynamic from "next/dynamic";
import { strToU8, zipSync } from "fflate";
import type { ManifoldToplevel } from "manifold-3d";
import {
  ChevronDown,
  Download,
  Expand,
  Link2,
  Minimize2,
  Moon,
  Printer,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { loadManifold } from "@/lib/geometry/manifold";
import {
  buildCube,
  gridfinityLayout,
  buildFitTile,
  buildJointFit,
  previewParts,
  printParts,
} from "@/lib/brick/cube";
import {
  A1_BED,
  BASE_JOINTS,
  CLEARANCES,
  DEFAULT_CUBE,
  JOINTS,
  LATCHES,
  LOCKS,
  UNIT,
  WALLS,
  normalize,
  type BaseJoint,
  type CubeSpec,
  type Hinge,
  type Joint,
  type Latch,
  type Lock,
  type Side,
} from "@/lib/brick/spec";
import {
  addCube,
  CANVAS_STORAGE_KEY,
  cubeSizeMm,
  defaultLayout,
  layoutBounds,
  layoutPlacements,
  layoutPrintParts,
  layoutSizeMm,
  moveCube,
  parseCanvasStorage,
  removeCube,
  saveCanvasStorage,
  type Layout,
} from "@/lib/brick/layout";
import { LAYOUT_TEMPLATES } from "@/lib/brick/templates";
import { fitGrid, gridLayout } from "@/lib/brick/measure";
import { capacity, suggest } from "@/lib/brick/strength";
import type { MeshPart } from "@/lib/brick/mesh";
import { arrangeOnBed, meshTo3mf } from "@/lib/export/threemf";
import { meshToStl } from "@/lib/export/stl";
import { MafiaLogo } from "@/components/studio/mafia-logo";
import { HorrorBanner } from "@/components/studio/horror-banner";
import { HalloweenBanner } from "@/components/studio/halloween-banner";
import { InfoTip } from "@/components/studio/info-tip";
import { Segmented } from "@/components/studio/segmented";
import { SectionCard } from "@/components/studio/section-card";
import { MeasureField, SizeStepperField, SwitchField } from "@/components/studio/fields";
import { ViewButtons, type ViewMode } from "@/components/app/viewer";
import { partsFitBed, type PartFitResult, type UnitMode } from "@/lib/brick/bed";
import { cn } from "@/lib/utils";
import { Toast, useToast } from "@/components/studio/toast";
import { BrickPresetsCard } from "@/components/brick/presets-card";
import { BRICK_PRESETS } from "@/components/brick/presets";
import { PlateStats } from "@/components/studio/plate-stats";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const Viewer = dynamic(() => import("@/components/app/viewer").then((x) => x.Viewer), {
  ssr: false,
});

export const APP_NAME = "Brick Shelf";

export type BedPresetType = "a1" | "mini" | "p1s" | "custom";

function save(bytes: Uint8Array, name: string, type: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function saveStls(parts: MeshPart[], stem: string) {
  if (parts.length === 1) return save(meshToStl(parts[0]), `${stem}.stl`, "model/stl");
  const files: Record<string, Uint8Array> = {};
  for (const p of parts) files[`${stem}-${p.name}.stl`] = meshToStl(p);
  save(zipSync(files), `${stem}-stl.zip`, "application/zip");
}

function Wordmark() {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <MafiaLogo className="size-9 shrink-0 -my-1 drop-shadow-[0_1px_0_rgb(0_0_0/0.35)]" />
      <span className="flex min-w-0 items-baseline gap-1 font-heading leading-none">
        <span className="truncate whitespace-nowrap text-[15px] font-semibold tracking-tight">
          {APP_NAME}
        </span>
      </span>
    </div>
  );
}

function Choice<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <Field>
      <div className="flex items-center">
        <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
        {hint ? <InfoTip id={`${id}-hint`} label={label} text={hint} /> : null}
      </div>
      <Segmented
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        options={options}
        onChange={onChange}
      />
    </Field>
  );
}

const JOINT_OPTIONS: { value: Joint; label: string }[] = [
  { value: "lego", label: "Lego" },
  { value: "twist", label: "Acmie" },
  { value: "rail", label: "Rail" },
  { value: "clip", label: "Clip" },
  { value: "magnet", label: "Magnet" },
  { value: "mixed", label: "Mix" },
];
const BASE_OPTIONS = JOINT_OPTIONS.filter((o) => o.value !== "mixed") as {
  value: BaseJoint;
  label: string;
}[];
const JOINT_HINT: Record<Joint, string> = {
  lego: "Studs on top, sockets underneath, dovetail rails between neighbours.",
  twist:
    "Acmie Lock: printed bayonet nodes with two lugs, at the corners for stacking and mid-wall side by side. Push in, turn 90° to lock. Walls go to 6 mm.",
  rail: "Double-T keys slide down T-slots from the top; a clip staple snaps over the slot and pins into both cubes.",
  magnet:
    "10 × 3 mm disc magnets glued into pockets, plus small stubs that line cubes up. Easy to rearrange, light loads only. Walls go to 6 mm.",
  clip: "Bowtie clips press into pockets across two cubes. Flat faces, no studs.",
  mixed:
    "Mixed: pick one joint for stacking (top and bottom) and another for side by side (left and right). Walls follow the stricter of the two.",
};

type Stat = { label: string; value: string; badge: string; note: string; hint: string };

/**
 * Below lg the stats are their own wrapping row under the header; from lg up
 * they sit inline in the header and the row is hidden. No dot separators.
 */
function StatBar({ stats, inline = false }: { stats: Stat[]; inline?: boolean }) {
  return (
    <div
      className={
        inline
          ? "hidden min-w-0 flex-1 items-center gap-x-4 overflow-hidden text-xs lg:flex"
          : "hidden shrink-0 flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-card px-3 py-1.5 text-xs md:flex lg:hidden"
      }
    >
      {stats.map((stat) => (
        <span
          key={stat.label}
          title={`${stat.label} · ${stat.hint}`}
          className="whitespace-nowrap"
        >
          <span className="font-heading font-semibold tabular-nums">{stat.value}</span>
          <span
            className={
              inline ? "hidden text-muted-foreground xl:inline" : "text-muted-foreground"
            }
          >
            {" "}
            {stat.note.toLowerCase()}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Load in, suggestion out. All numbers are guesses, not test data. */
function StrengthMeter({
  spec,
  set,
}: {
  spec: CubeSpec;
  set: (patch: Partial<CubeSpec>) => void;
}) {
  const [load, setLoad] = useState(10);
  const kg = capacity(spec);
  const ok = kg >= load;
  const tip = suggest(load, spec);
  const label = JOINT_OPTIONS.find((o) => o.value === tip.joint)?.label ?? tip.joint;
  return (
    <div className="flex flex-col gap-2">
      <MeasureField
        label="Load"
        hint="Weight you plan to put on one cube. Ratings are rough guesses, not lab tests: start light and check for sag."
        value={load}
        min={1}
        max={60}
        step={1}
        digits={0}
        suffix="kg"
        onChange={setLoad}
      />
      <div
        id="strength-meter"
        role="status"
        className={`rounded-lg border px-3 py-2 text-xs ${
          ok
            ? "border-green-600/40 bg-green-600/10 text-green-800 dark:text-green-300"
            : "border-red-600/40 bg-red-600/10 text-red-800 dark:text-red-300"
        }`}
      >
        <div className="font-medium">
          {ok ? "Holds" : "Too weak"}: about {kg} kg in PLA{" "}
          <span className="opacity-70">(estimate, a guess)</span>
        </div>
        <div className="mt-1">
          {tip.ok ? (
            <>
              Suggest: {label} joint, {tip.wall} mm walls, {tip.material} (about {tip.kg} kg, a
              guess).
            </>
          ) : (
            <>Over every guess (best about {tip.kg} kg). Split the load or add a shelf bracket.</>
          )}
        </div>
        {tip.ok && !ok ? (
          <button
            type="button"
            className="mt-2 rounded-md border border-current px-2 py-0.5 font-medium"
            onClick={() =>
              set({
                joint: tip.joint,
                wall: tip.wall,
                bolts: true,
                ribs: true,
                gussets: true,
              })
            }
          >
            Apply joint and wall
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SIDES = ["front", "back", "left", "right"] as const;
const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: "wall", label: "Wall" },
  { value: "open", label: "Open" },
  { value: "door", label: "Door" },
  { value: "slide", label: "Slide" },
];
const FRONT_OPTIONS: { value: Side; label: string }[] = [
  ...SIDE_OPTIONS,
  { value: "drawer", label: "Drawer" },
];
const SIDE_HINT: Record<Side, string> = {
  wall: "a solid panel",
  open: "nothing, an open shelf",
  door: "a hinged door on a filament pin",
  slide: "sliding panels in deck grooves",
  drawer: "sliding drawers with a front plate and pull",
};

export function encodeSpecParams(
  spec: CubeSpec,
  bedPreset?: BedPresetType,
  customBed?: number,
  open?: boolean,
  explode?: boolean
): string {
  const p = new URLSearchParams();
  p.set("w", String(spec.w));
  p.set("d", String(spec.d));
  p.set("h", String(spec.h));
  p.set("front", spec.front);
  p.set("back", spec.back);
  p.set("left", spec.left);
  p.set("right", spec.right);
  p.set("c", String(spec.clearance));
  p.set("wall", String(spec.wall));
  p.set("dove", spec.dovetail ? "1" : "0");
  p.set("bolts", spec.bolts ? "1" : "0");
  p.set("gussets", spec.gussets ? "1" : "0");
  p.set("ribs", spec.ribs ? "1" : "0");
  p.set("hinge", spec.hinge);
  p.set("latch", spec.latch);
  p.set("lock", spec.lock);
  if (spec.lockMagnet) p.set("lockMag", "1");
  p.set("drawers", String(spec.drawers));
  p.set("div", String(spec.dividers));
  p.set("panels", String(spec.panels));
  p.set("joint", spec.joint);
  if (spec.joint === "mixed") {
    p.set("stack", spec.stack);
    p.set("side", spec.side);
  }
  if (spec.solo) p.set("solo", "1");
  if (spec.gridfinity) p.set("gf", "1");
  if (spec.wallMount) p.set("wm", "1");
  if (bedPreset) p.set("bedp", bedPreset);
  if (bedPreset === "custom" && customBed) p.set("bed", String(customBed));
  if (open) p.set("open", "1");
  if (explode) p.set("explode", "1");
  return p.toString();
}

export function decodeSpecParams(
  q: URLSearchParams,
  base: CubeSpec = DEFAULT_CUBE
): CubeSpec {
  const s: CubeSpec = { ...base };
  if (q.has("w")) {
    const v = Number(q.get("w"));
    if (v >= 1 && v <= 8) s.w = v;
  }
  if (q.has("d")) {
    const v = Number(q.get("d"));
    if (v >= 1 && v <= 8) s.d = v;
  }
  if (q.has("h")) {
    const v = Number(q.get("h"));
    if (v >= 1 && v <= 8) s.h = v;
  }
  if (q.has("front")) {
    const v = q.get("front") as Side;
    if (FRONT_OPTIONS.some((o) => o.value === v)) s.front = v;
  }
  for (const side of ["back", "left", "right"] as const) {
    if (q.has(side)) {
      const v = q.get(side) as Side;
      if (SIDE_OPTIONS.some((o) => o.value === v)) s[side] = v;
    }
  }
  if (q.has("c")) {
    const v = Number(q.get("c"));
    if (CLEARANCES.includes(v as any)) s.clearance = v;
  }
  if (q.has("wall")) {
    const v = Number(q.get("wall"));
    if (WALLS.includes(v as any)) s.wall = v;
  }
  if (q.has("dove")) s.dovetail = q.get("dove") === "1";
  if (q.has("bolts")) s.bolts = q.get("bolts") === "1";
  if (q.has("gussets")) s.gussets = q.get("gussets") === "1";
  if (q.has("ribs")) s.ribs = q.get("ribs") === "1";
  if (q.has("hinge")) {
    const v = q.get("hinge") as Hinge;
    if (["left", "right", "top", "bottom"].includes(v)) s.hinge = v;
  }
  if (q.has("latch")) {
    const v = q.get("latch") as Latch;
    if (LATCHES.includes(v)) s.latch = v;
  }
  if (q.has("lock")) {
    const v = q.get("lock") as Lock;
    if (LOCKS.includes(v)) s.lock = v;
  }
  if (q.has("lockMag")) s.lockMagnet = q.get("lockMag") === "1";
  if (q.has("drawers")) {
    const v = Number(q.get("drawers"));
    if (v === 1 || v === 2) s.drawers = v;
  }
  if (q.has("div")) {
    const v = Number(q.get("div"));
    if (v >= 0 && v <= 3) s.dividers = v;
  }
  if (q.has("panels")) {
    const v = Number(q.get("panels"));
    if (v === 1 || v === 2) s.panels = v;
  }
  if (q.has("joint")) {
    const v = q.get("joint") as Joint;
    if (JOINTS.includes(v)) s.joint = v;
  }
  if (q.has("stack")) {
    const v = q.get("stack") as BaseJoint;
    if (BASE_JOINTS.includes(v)) s.stack = v;
  }
  if (q.has("side")) {
    const v = q.get("side") as BaseJoint;
    if (BASE_JOINTS.includes(v)) s.side = v;
  }
  if (q.has("solo")) s.solo = q.get("solo") === "1";
  if (q.has("gf")) s.gridfinity = q.get("gf") === "1";
  if (q.has("wm")) s.wallMount = q.get("wm") === "1";
  return normalize(s);
}

function Controls({
  spec,
  set,
  exploded,
  setExploded,
  open,
  setOpen,
  onFitTest,
  ready,
  fitView,
  setFitView,
  unitMode,
  setUnitMode,
  bedPreset,
  setBedPreset,
  customBed,
  setCustomBed,
  bedFitResults,
}: {
  fitView: boolean;
  setFitView: (v: boolean) => void;
  spec: CubeSpec;
  set: (p: Partial<CubeSpec>) => void;
  exploded: boolean;
  setExploded: (v: boolean) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  onFitTest: () => void;
  ready: boolean;
  unitMode: UnitMode;
  setUnitMode: (mode: UnitMode) => void;
  bedPreset: BedPresetType;
  setBedPreset: (preset: BedPresetType) => void;
  customBed: number;
  setCustomBed: (size: number) => void;
  bedFitResults: PartFitResult[];
}) {
  const sides = SIDES.map((k) => spec[k]);
  const hasDoor = sides.includes("door");
  const hasSlide = sides.includes("slide");
  const hasDrawer = spec.front === "drawer";
  const allFit = bedFitResults.length > 0 && bedFitResults.every((p) => p.fits);
  const failCount = bedFitResults.filter((p) => !p.fits).length;

  return (
    <>
      <SectionCard id="bin" title="Cube size">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-medium text-muted-foreground">Units</span>
          <Segmented
            value={unitMode}
            options={[
              { value: "u", label: "Grid (u)" },
              { value: "mm", label: "Millimetres (mm)" },
            ]}
            onChange={(v) => setUnitMode(v as UnitMode)}
          />
        </div>
        <SizeStepperField
          label="Width"
          hint="Grid units across, 40 mm each."
          value={spec.w}
          unitMode={unitMode}
          min={1}
          max={4}
          onChange={(w) => set({ w })}
        />
        <SizeStepperField
          label="Depth"
          hint="Grid units front to back, 40 mm each."
          value={spec.d}
          unitMode={unitMode}
          min={1}
          max={4}
          onChange={(d) => set({ d })}
        />
        <SizeStepperField
          label="Height"
          hint="Grid units tall, 40 mm each."
          value={spec.h}
          unitMode={unitMode}
          min={1}
          max={4}
          onChange={(h) => set({ h })}
        />
      </SectionCard>
      <SectionCard id="walls" title="Sides">
        {SIDES.map((side) => (
          <Choice
            key={side}
            label={side[0].toUpperCase() + side.slice(1)}
            hint={`Wall, open, door or sliding panels${
              side === "front"
                ? ", or drawers (front only; keeps the side walls for the rails)"
                : ""
            }. Now: ${SIDE_HINT[spec[side]]}.`}
            value={spec[side]}
            options={side === "front" ? FRONT_OPTIONS : SIDE_OPTIONS}
            onChange={(v) => set({ [side]: v })}
          />
        ))}
      </SectionCard>
      {hasDoor || hasSlide || hasDrawer ? (
        <SectionCard id="fronts" title="Doors and drawers">
          {hasDoor ? (
            <>
              <Choice<Hinge>
                label="Hinge"
                hint="Which edge the door swings on. Knuckles sit on the decks; the pin is a 1.75 mm filament offcut."
                value={spec.hinge}
                options={[
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                  { value: "top", label: "Top" },
                  { value: "bottom", label: "Bottom" },
                ]}
                onChange={(hinge) => set({ hinge })}
              />
              <Choice<Latch>
                label="Latch"
                hint="Magnet: 4 × 2 mm disc magnets, glue one in the door and one in the deck edge. Bump: a printed click bump."
                value={spec.latch}
                options={[
                  { value: "magnet", label: "Magnet" },
                  { value: "bump", label: "Snap bump" },
                ]}
                onChange={(latch) => set({ latch })}
              />
            </>
          ) : null}
          {hasDrawer ? (
            <>
              <Choice
                label="Drawers"
                hint="One full height drawer or two half height drawers (needs 2u tall)."
                value={String(spec.drawers)}
                options={[
                  { value: "1", label: "1 full" },
                  { value: "2", label: "2 half" },
                ]}
                onChange={(v) => set({ drawers: Number(v) })}
              />
              <MeasureField
                label="Dividers"
                hint="Walls inside each drawer, side to side."
                value={spec.dividers}
                min={0}
                max={3}
                step={1}
                digits={0}
                suffix=""
                onChange={(dividers) => set({ dividers })}
              />
              <SwitchField
                id="gridfinity"
                label="Gridfinity floor"
                hint="Adds a 42 mm Gridfinity baseplate grid to each drawer floor so standard bins lock in place. Dividers snap to cell lines so every compartment holds whole 42 mm cells."
                checked={spec.gridfinity}
                onChange={(gridfinity) => set({ gridfinity })}
              />
              {spec.gridfinity ? <GridfinityInfo spec={spec} onSnap={(w) => set({ w })} /> : null}
            </>
          ) : null}
          {hasSlide ? (
            <Choice
              label="Sliding panels"
              hint="One panel covers half the opening; two overlap and slide past each other."
              value={String(spec.panels)}
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
              ]}
              onChange={(v) => set({ panels: Number(v) })}
            />
          ) : null}
          {hasDoor || hasSlide ? (
            <>
              <Choice<Lock>
                label="Lock"
                hint="None: no lock. Latch: printed flexible snap latch hook. Knob: turn-knob cam catch."
                value={spec.lock}
                options={[
                  { value: "none", label: "None" },
                  { value: "latch", label: "Latch" },
                  { value: "knob", label: "Knob" },
                ]}
                onChange={(lock) => {
                  if (lock === "latch") set({ lock: "latch", latch: "hook" });
                  else if (lock === "knob") set({ lock: "knob", latch: "knob" });
                  else
                    set({
                      lock: "none",
                      latch:
                        spec.latch === "hook" || spec.latch === "knob"
                          ? "magnet"
                          : spec.latch,
                    });
                }}
              />
              {hasDoor ? (
                <SwitchField
                  id="lockMagnet"
                  label="Magnet catch"
                  hint="Adds a 6 × 3 mm disc magnet pocket in the door free edge and matching pocket in the frame/deck."
                  checked={spec.lockMagnet}
                  onChange={(lockMagnet) => set({ lockMagnet })}
                />
              ) : null}
            </>
          ) : null}
          <SwitchField
            id="open"
            label="Show open"
            hint="Swing doors open and pull drawers out in the preview."
            checked={open}
            onChange={setOpen}
          />
        </SectionCard>
      ) : null}
      <SectionCard id="connection" title="Connection">
        <Choice<Joint>
          label="Joint"
          hint={JOINT_HINT[spec.joint]}
          value={spec.joint}
          options={JOINT_OPTIONS}
          onChange={(joint) => set({ joint })}
        />
        {spec.joint === "mixed" ? (
          <>
            <Choice<BaseJoint>
              label="Stack (top / bottom)"
              hint={JOINT_HINT[spec.stack]}
              value={spec.stack}
              options={BASE_OPTIONS}
              onChange={(stack) => set({ stack })}
            />
            <Choice<BaseJoint>
              label="Side (left / right)"
              hint={JOINT_HINT[spec.side]}
              value={spec.side}
              options={BASE_OPTIONS}
              onChange={(side) => set({ side })}
            />
          </>
        ) : null}
        {spec.joint === "clip" ||
        (spec.joint === "mixed" && (spec.stack === "clip" || spec.side === "clip")) ? (
          <SwitchField
            id="solo"
            label="Single cube"
            hint="Print clip keys as flush half plugs so nothing sticks out of a cube that stands alone."
            checked={spec.solo}
            onChange={(solo) => set({ solo })}
          />
        ) : null}
        {spec.back === "wall" ? (
          <SwitchField
            id="wallmount"
            label="Wall mode"
            hint="Floating cube: print the wall rail, screw it to the wall, bolt the hook to the back wall with two M4 bolts, then drop the cube on. The 45° cleat only resists pulling straight off the wall; it lifts off upward, so keep 10 mm free above the cube. Holding power is a guess and depends on your wall anchors: use anchors rated for at least twice the load. Turns bolt holes on."
            checked={spec.wallMount}
            onChange={(wallMount) => set({ wallMount })}
          />
        ) : null}
      </SectionCard>
      <SectionCard id="strength" title="Strength">
        <StrengthMeter spec={spec} set={set} />
        <Choice
          label="Wall"
          hint="Panel thickness. 5 mm with ribs and gussets is the 10 kg default; 6 mm or more if you use drawers and dovetails."
          value={String(spec.wall)}
          options={WALLS.map((w) => ({ value: String(w), label: `${w} mm` }))}
          onChange={(v) => set({ wall: Number(v) })}
        />
        {(spec.joint === "mixed" ? spec.side : spec.joint) === "lego" ? (
          <SwitchField
            id="dovetail"
            label="Dovetail joins"
            hint="Rails on the right wall slide down into grooves on the next cube's left wall."
            checked={spec.dovetail}
            onChange={(dovetail) => set({ dovetail })}
          />
        ) : null}
        <SwitchField
          id="bolts"
          label="M4 bolt holes"
          hint="Corner holes through the decks to bolt stacked cubes, side holes to bolt neighbours, two back holes to screw to a wall."
          checked={spec.bolts}
          onChange={(bolts) => set({ bolts })}
        />
        <SwitchField
          id="gussets"
          label="Corner gussets"
          hint="Triangles in the back corners stop the cube racking."
          checked={spec.gussets}
          onChange={(gussets) => set({ gussets })}
        />
        <SwitchField
          id="ribs"
          label="Deck ribs"
          hint="Ribs under the top deck cut sag under load."
          checked={spec.ribs}
          onChange={(ribs) => set({ ribs })}
        />
      </SectionCard>
      <SectionCard id="drawer" title="Fit">
        <Choice
          label="Clearance"
          hint="Gap per side between mating parts. Print the fit test and pick the snuggest hole that still goes in by hand."
          value={String(spec.clearance)}
          options={CLEARANCES.map((c) => ({ value: String(c), label: `${c} mm` }))}
          onChange={(v) => set({ clearance: Number(v) })}
        />
        <Choice<BedPresetType>
          label="Printer"
          hint="A1 and P1S share a 256 mm square. A1 mini is 180 mm. Outlines the bed on the ground and checks which printed panels fit."
          value={bedPreset}
          options={[
            { value: "a1", label: "A1" },
            { value: "mini", label: "Mini" },
            { value: "p1s", label: "P1S" },
            { value: "custom", label: "Custom" },
          ]}
          onChange={setBedPreset}
        />
        {bedPreset === "custom" ? (
          <MeasureField
            label="Bed size"
            suffix="mm"
            hint="Square bed size in millimetres."
            value={customBed}
            min={40}
            max={600}
            step={10}
            digits={0}
            onChange={setCustomBed}
          />
        ) : null}
        {bedFitResults.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/60 p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Bed fit</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  allFit
                    ? "bg-green-500/15 text-green-700 dark:text-green-300"
                    : "bg-destructive/15 text-destructive"
                )}
              >
                {allFit
                  ? "All parts fit"
                  : `${failCount} of ${bedFitResults.length} exceed bed`}
              </span>
            </div>
            <div className="flex flex-col gap-1 max-h-44 overflow-y-auto divide-y divide-border/40">
              {bedFitResults.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between py-1 text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={
                        item.fits
                          ? "text-green-600 dark:text-green-400 font-bold"
                          : "text-destructive font-bold"
                      }
                    >
                      {item.fits ? "✓" : "✗"}
                    </span>
                    <span className="font-medium truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums text-muted-foreground text-[11px] shrink-0">
                    <span>
                      {item.w} × {item.d} mm
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.2 text-[10px] font-medium",
                        item.fits
                          ? "bg-green-500/10 text-green-700 dark:text-green-300"
                          : "bg-destructive/10 text-destructive font-semibold"
                      )}
                    >
                      {item.fits ? "Fits" : "Fails"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <SwitchField
          id="explode"
          label="Explode view"
          hint="Pull the panels apart in the preview to see the joints."
          checked={exploded}
          onChange={setExploded}
        />
        <SwitchField
          id="fitview"
          label="Preview fit test"
          hint="Show the actual fit-test pieces for your joint (1-unit decks, side walls and joint parts) instead of the full cube. The clearance tile prints alongside."
          checked={fitView}
          onChange={setFitView}
        />
        <Button variant="outline" disabled={!ready} onClick={onFitTest}>
          <Printer data-icon="inline-start" />
          Fit test print
        </Button>
      </SectionCard>
    </>
  );
}

function CanvasCard({
  layout,
  spec,
  selectedId,
  onSelectCube,
  onAddCube,
  onMoveCube,
  onRemoveCube,
  onLoadCube,
  onApplyTemplate,
  onUseGrid,
  onDownloadAll,
  ready,
}: {
  layout: Layout;
  spec: CubeSpec;
  selectedId: string | null;
  onSelectCube: (id: string) => void;
  onAddCube: () => void;
  onMoveCube: (id: string, dx: number, dz: number) => void;
  onRemoveCube: (id: string) => void;
  onLoadCube: (id: string) => void;
  onApplyTemplate: (templateId: string) => void;
  onUseGrid: (layout: Layout) => void;
  onDownloadAll: () => void;
  ready: boolean;
}) {
  const size = layoutSizeMm(layout);
  const [spaceW, setSpaceW] = useState(800);
  const [spaceH, setSpaceH] = useState(600);
  const [spaceD, setSpaceD] = useState(300);

  const fit = useMemo(
    () => fitGrid({ w: spaceW, h: spaceH, d: spaceD }, spec),
    [spaceW, spaceH, spaceD, spec]
  );

  return (
    <SectionCard id="canvas" title="Canvas">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 justify-center"
            onClick={onAddCube}
          >
            Add this cube
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 justify-between gap-1"
                >
                  <span className="truncate">Templates</span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-64">
              {LAYOUT_TEMPLATES.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  className="items-start"
                  onClick={() => onApplyTemplate(t.id)}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5">
          <span className="text-xs font-medium">Measure your space</span>
          <div className="grid grid-cols-3 gap-1.5">
            <MeasureField
              label="W"
              suffix="mm"
              min={10}
              max={5000}
              step={10}
              digits={0}
              value={spaceW}
              onChange={setSpaceW}
            />
            <MeasureField
              label="H"
              suffix="mm"
              min={10}
              max={5000}
              step={10}
              digits={0}
              value={spaceH}
              onChange={setSpaceH}
            />
            <MeasureField
              label="D"
              suffix="mm"
              min={10}
              max={5000}
              step={10}
              digits={0}
              value={spaceD}
              onChange={setSpaceD}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {fit.fits ? (
              <span>
                Fits {fit.cols} × {fit.rows} cubes (used {fit.used.w}×{fit.used.h} mm,{" "}
                {fit.leftover.w} mm spare)
              </span>
            ) : (
              <span className="text-destructive">{fit.reason}</span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-center"
            disabled={!fit.fits || fit.cols === 0 || fit.rows === 0}
            onClick={() => onUseGrid(gridLayout(spec, fit.cols, fit.rows))}
          >
            Use this grid
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-y py-1.5">
          <span>Overall size:</span>
          <span className="font-heading font-medium text-foreground tabular-nums">
            {size.w} × {size.d} × {size.h} mm
          </span>
        </div>

        {layout.cubes.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">
            No cubes placed yet. Click &quot;Add this cube&quot; to build a layout.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-0.5">
            {layout.cubes.map((cube, index) => {
              const isSelected = cube.id === selectedId;
              return (
                <div
                  key={cube.id}
                  onClick={() => onSelectCube(cube.id)}
                  className={`flex flex-col gap-1.5 rounded-lg border p-2 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary ring-1 ring-primary bg-primary/10 dark:bg-primary/20"
                      : "border-border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1.5">
                      Cube {index + 1}: {cube.spec.w}×{cube.spec.d}×{cube.spec.h}u
                      {isSelected ? (
                        <span className="rounded bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                          Selected
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      col {cube.x}, row {cube.z}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between gap-1 pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Move cube ${index + 1} left`}
                        onClick={() => onMoveCube(cube.id, -1, 0)}
                      >
                        ←
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Move cube ${index + 1} right`}
                        onClick={() => onMoveCube(cube.id, 1, 0)}
                      >
                        →
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Move cube ${index + 1} up`}
                        onClick={() => onMoveCube(cube.id, 0, 1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Move cube ${index + 1} down`}
                        onClick={() => onMoveCube(cube.id, 0, -1)}
                      >
                        ↓
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant={isSelected ? "secondary" : "outline"}
                        size="xs"
                        onClick={() => onLoadCube(cube.id)}
                      >
                        {isSelected ? "Editing" : "Load into editor"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onRemoveCube(cube.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          ← → move or swap · ↑ stacks onto the next column · ↓ brings it down
        </p>

        <Button
          type="button"
          size="sm"
          className="w-full justify-center"
          disabled={!ready || layout.cubes.length === 0}
          onClick={onDownloadAll}
        >
          <Download data-icon="inline-start" />
          Download all (3mf)
        </Button>
      </div>
    </SectionCard>
  );
}

export function Builder() {
  const search = useSearchParams();
  const [m, setM] = useState<ManifoldToplevel | null>(null);
  const [spec, setSpec] = useState<CubeSpec>(() => {
    const presetId = search.get("preset");
    const found = BRICK_PRESETS.find((p) => p.id === presetId);
    const base = found ? found.spec : DEFAULT_CUBE;
    return decodeSpecParams(search, base);
  });
  const [bedPreset, setBedPreset] = useState<BedPresetType>(() => {
    const bp = search.get("bedp") as BedPresetType;
    if (["a1", "mini", "p1s", "custom"].includes(bp)) return bp;
    return "a1";
  });
  const [customBed, setCustomBed] = useState<number>(() => {
    const b = Number(search.get("bed"));
    return b >= 40 && b <= 1000 ? b : 256;
  });
  const [layout, setLayout] = useState<Layout>(() => defaultLayout(DEFAULT_CUBE));
  const [selectedId, setSelectedId] = useState<string | null>("cube-1");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [exploded, setExploded] = useState(() => search.get("explode") === "1");
  const [open, setOpen] = useState(() => search.get("open") === "1");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<null | "stl" | "3mf" | "project">(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const { toast, show } = useToast();

  useEffect(() => {
    loadManifold().then(setM);

    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(CANVAS_STORAGE_KEY) : null;
      if (raw) {
        const hasQuery = Array.from(search.keys()).length > 0;
        const parsed = parseCanvasStorage(raw, spec);
        if (parsed.layout.cubes.length > 0) {
          if (hasQuery) {
            const activeId = parsed.selectedId ?? parsed.layout.cubes[0].id;
            setLayout({
              cubes: parsed.layout.cubes.map((c) =>
                c.id === activeId ? { ...c, spec } : c
              ),
            });
            setSelectedId(activeId);
          } else {
            setLayout(parsed.layout);
            setSelectedId(parsed.selectedId);
            const activeCube =
              parsed.layout.cubes.find((c) => c.id === parsed.selectedId) ??
              parsed.layout.cubes[0];
            if (activeCube) {
              setSpec(activeCube.spec);
            }
          }
        }
      } else {
        const fresh = defaultLayout(spec);
        setLayout(fresh);
        setSelectedId(fresh.cubes[0].id);
      }
    } catch {
      const fresh = defaultLayout(spec);
      setLayout(fresh);
      setSelectedId(fresh.cubes[0].id);
    } finally {
      setHasHydrated(true);
    }
  }, []);

  const activeSelectedId = useMemo(() => {
    if (layout.cubes.length === 0) return null;
    if (selectedId && layout.cubes.some((c) => c.id === selectedId)) {
      return selectedId;
    }
    return layout.cubes[0]?.id ?? null;
  }, [layout.cubes, selectedId]);

  useEffect(() => {
    if (!hasHydrated) return;
    saveCanvasStorage(layout, activeSelectedId);
  }, [layout, activeSelectedId, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;
    const next = `?${encodeSpecParams(spec, bedPreset, customBed, open, exploded)}`;
    if (window.location.search !== next) {
      window.history.replaceState(null, "", next || window.location.pathname);
    }
  }, [spec, bedPreset, customBed, open, exploded, hasHydrated]);

  const previewCache = useRef(new Map<string, MeshPart[]>());

  useEffect(() => {
    previewCache.current.clear();
  }, [m]);

  const getCubeParts = (cubeSpec: CubeSpec, isOpen: boolean): MeshPart[] => {
    if (!m) return [];
    const normalized = normalize(cubeSpec);
    const key = `${JSON.stringify(normalized)}:${isOpen ? "open" : "closed"}`;
    const cached = previewCache.current.get(key);
    if (cached) return cached;
    const cubePanels = buildCube(m, normalized);
    const meshParts = previewParts(cubePanels, isOpen);
    previewCache.current.set(key, meshParts);
    return meshParts;
  };

  const selectCube = (id: string) => {
    setSelectedId(id);
    const target = layout.cubes.find((c) => c.id === id);
    if (target) {
      setSpec(target.spec);
    }
  };

  const applySpec = (newSpec: CubeSpec) => {
    const next = normalize(newSpec);
    setSpec(next);
    if (activeSelectedId) {
      setLayout((prev) => ({
        cubes: prev.cubes.map((c) =>
          c.id === activeSelectedId ? { ...c, spec: next } : c
        ),
      }));
    }
  };

  const set = (patch: Partial<CubeSpec>) => {
    applySpec({ ...spec, ...patch });
  };

  const [fitView, setFitView] = useState(false);

  const { singlePanels, renderMs } = useMemo(() => {
    if (!m) return { singlePanels: [], renderMs: 0 };
    const t0 = performance.now();
    const panels = fitView ? buildJointFit(m, spec) : buildCube(m, spec);
    const ms = Math.round(performance.now() - t0);
    return { singlePanels: panels, renderMs: ms };
  }, [m, spec, fitView]);

  const singleParts = useMemo(
    () => previewParts(singlePanels, open),
    [singlePanels, open]
  );

  const placements = useMemo(() => layoutPlacements(layout), [layout]);

  const viewerCubes = useMemo(() => {
    if (!m || layout.cubes.length === 0) return [];
    return placements.map((p) => {
      const cubeParts = getCubeParts(p.cube.spec, open);
      const s = cubeSizeMm(p.cube.spec);
      return {
        id: p.id,
        parts: cubeParts,
        offset: p.offset,
        size: [s.w, s.d, s.h] as [number, number, number],
        isSelected: p.id === activeSelectedId,
      };
    });
  }, [m, layout.cubes, placements, open, activeSelectedId]);

  const layoutSize = useMemo(() => layoutSizeMm(layout), [layout]);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);

  const viewerSize: [number, number, number] = useMemo(() => {
    if (layout.cubes.length > 0) {
      return [layoutSize.w, layoutSize.d, layoutSize.h];
    }
    return [spec.w * UNIT, spec.d * UNIT, spec.h * UNIT];
  }, [layout.cubes.length, layoutSize, spec.w, spec.d, spec.h]);

  const [unitMode, setUnitMode] = useState<UnitMode>("u");
  const [view, setView] = useState<ViewMode>("perspective");

  const bedSize = useMemo(() => {
    if (bedPreset === "mini") return 180;
    if (bedPreset === "custom") return customBed;
    return 256;
  }, [bedPreset, customBed]);

  const bedLabel = useMemo(() => {
    if (bedPreset === "mini") return "A1 mini (180×180)";
    if (bedPreset === "p1s") return "P1S (256×256)";
    if (bedPreset === "custom") return `Custom (${customBed}×${customBed})`;
    return "A1 (256×256)";
  }, [bedPreset, customBed]);

  const printedParts = useMemo(
    () => (singlePanels.length > 0 ? printParts(singlePanels) : []),
    [singlePanels]
  );

  const bedFitResults = useMemo(
    () => (bedSize ? partsFitBed(printedParts, bedSize) : []),
    [printedParts, bedSize]
  );

  const allFit = bedFitResults.length === 0 || bedFitResults.every((p) => p.fits);
  const failCount = bedFitResults.filter((p) => !p.fits).length;

  const suggestions = useMemo(() => {
    if (allFit || bedFitResults.length === 0) return [];
    const list: { label: string; onClick: () => void }[] = [];
    if (bedPreset === "mini" || bedSize < 256) {
      list.push({
        label: "Switch to A1 bed (256×256)",
        onClick: () => setBedPreset("a1"),
      });
    }
    const maxU = Math.max(1, Math.floor(bedSize / UNIT));
    if (spec.w > maxU || spec.d > maxU) {
      list.push({
        label: `Fit to bed (${maxU}×${maxU}u)`,
        onClick: () => applySpec({ ...spec, w: Math.min(spec.w, maxU), d: Math.min(spec.d, maxU) }),
      });
    }
    if (bedPreset !== "custom") {
      const needed = Math.max(...bedFitResults.map((r) => Math.min(r.w, r.d)));
      const rec = Math.ceil(needed / 10) * 10;
      list.push({
        label: `Custom bed (${rec} mm)`,
        onClick: () => {
          setCustomBed(rec);
          setBedPreset("custom");
        },
      });
    }
    return list;
  }, [allFit, bedFitResults, bedPreset, bedSize, spec]);

  const projectParts = useMemo(
    () => (m ? (layout.cubes.length > 1 ? layoutPrintParts(m, layout) : printedParts) : []),
    [m, layout, printedParts]
  );

  const projectPlates = useMemo(() => {
    if (projectParts.length === 0) return 1;
    const arranged = arrangeOnBed(projectParts, bedSize);
    return arranged.reduce((max, p) => Math.max(max, p.plate + 1), 1);
  }, [projectParts, bedSize]);

  const stem = `acmie-brick-${spec.w}x${spec.d}x${spec.h}`;
  const ready = !!m;

  async function copyLink() {
    const query = encodeSpecParams(spec, bedPreset, customBed, open, exploded);
    const url = `${window.location.origin}${window.location.pathname}?${query}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    show("Link copied");
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadA1Profile() {
    try {
      const json = JSON.stringify(
        {
          type: "process",
          name: "Brick Shelf @A1",
          from: "User",
          inherits: "0.20mm Standard @BBL A1",
          version: "2.4.0.9",
          print_settings_id: "Brick Shelf @A1",
          layer_height: "0.2",
          wall_loops: "3",
          top_shell_layers: "4",
          bottom_shell_layers: "3",
          sparse_infill_density: "15%",
          sparse_infill_pattern: "gyroid",
          enable_support: "0",
          brim_type: "no_brim",
          seam_position: "aligned",
          detect_thin_wall: "1",
        },
        null,
        4
      );
      const info =
        "sync_info = \nuser_id = \nsetting_id = \nbase_id = GP004\nupdated_time = 1793030400\n";
      const files: Record<string, Uint8Array> = {
        "process/Brick Shelf @A1.json": strToU8(json),
        "process/Brick Shelf @A1.info": strToU8(info),
      };
      save(zipSync(files, { level: 6 }), "brick-shelf-a1-presets.zip", "application/zip");
      show("Bambu A1 print profile downloaded");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Failed to generate print profile");
    }
  }

  async function saveExport(kind: "stl" | "3mf" | "project") {
    setExporting(kind);
    setExportError(null);
    try {
      if (!m) throw new Error("Geometry engine not ready");
      if (kind === "stl") {
        const full = fitView ? buildJointFit(m, spec) : singlePanels;
        saveStls(printParts(full), stem);
        show(`${stem} STL downloaded`);
      } else if (kind === "3mf") {
        const full = fitView ? buildJointFit(m, spec) : singlePanels;
        save(meshTo3mf(printParts(full), bedSize, "Brick cube"), `${stem}.3mf`, "model/3mf");
        show(`${stem} 3MF downloaded`);
      } else if (kind === "project") {
        const parts = layout.cubes.length > 1 ? layoutPrintParts(m, layout) : printedParts;
        save(
          meshTo3mf(parts, bedSize, "Brick shelf layout"),
          "acmie-brick-project.3mf",
          "model/3mf"
        );
        show("acmie-brick-project.3mf downloaded");
      }
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const fitTest = () => {
    if (!m) return;
    const parts = [
      ...buildFitTile(m),
      ...printParts(buildJointFit(m, spec)).map((p) => ({ ...p, name: `fit-${p.name}` })),
    ];
    save(meshTo3mf(parts, bedSize, "Fit test"), `acmie-brick-fit-${spec.joint}.3mf`, "model/3mf");
    show("Fit test downloaded");
  };

  const downloadAll = () => {
    if (!m || layout.cubes.length === 0) return;
    save(
      meshTo3mf(layoutPrintParts(m, layout), bedSize, "Brick shelf layout"),
      "acmie-brick-layout.3mf",
      "model/3mf"
    );
    show("Layout 3MF downloaded");
  };

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("acme-theme", next ? "dark" : "light");
  }

  const stats: Stat[] = [
    {
      label: "Outer size",
      value: `${spec.w * UNIT} × ${spec.d * UNIT} × ${spec.h * UNIT} mm`,
      badge: `${spec.w}×${spec.d}×${spec.h}u`,
      note: "outer",
      hint: "External cube dimensions",
    },
    {
      label: "Parts",
      value: String(singlePanels.length),
      badge: `${singlePanels.length} panels`,
      note: "parts to print",
      hint: "Total printable components",
    },
    {
      label: "Fit",
      value: `${spec.clearance} mm`,
      badge: spec.joint,
      note: "clearance",
      hint: "Tolerance gap between mating joints",
    },
    {
      label: "Bed fit",
      value: allFit ? "Fits" : `${failCount} exceed`,
      badge: `${bedSize} mm bed`,
      note: allFit ? "on bed" : "too large",
      hint: "Fit on the active printer bed",
    },
  ];

  const displayGrid =
    layout.cubes.length > 1 ? `${bounds.cols} × ${bounds.rows}` : `${spec.w} × ${spec.d}`;
  const displaySize =
    layout.cubes.length > 1
      ? `${layoutSize.w} × ${layoutSize.d} mm`
      : `${spec.w * UNIT} × ${spec.d * UNIT} mm`;
  const displayHeight =
    layout.cubes.length > 1 ? `${layoutSize.h} mm` : `${spec.h * UNIT} mm`;

  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "22.5rem", "--header-height": "3rem" } as React.CSSProperties}
    >
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="gap-3">
          <div className="px-2 pt-1.5 pb-0.5">
            <Wordmark />
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 pt-1 pb-4">
          <div className="motion-stagger flex shrink-0 flex-col gap-3">
            <BrickPresetsCard spec={spec} onChange={applySpec} />
            <CanvasCard
              layout={layout}
              spec={spec}
              selectedId={activeSelectedId}
              onSelectCube={selectCube}
              onAddCube={() => {
                const next = addCube(layout, spec);
                if (next !== layout) {
                  setLayout(next);
                  const added = next.cubes[next.cubes.length - 1];
                  if (added) {
                    setSelectedId(added.id);
                    setSpec(added.spec);
                  }
                  show("Cube added to canvas");
                }
              }}
              onMoveCube={(id, dx, dz) => {
                const res = moveCube(layout, id, dx, dz);
                if (res.error) {
                  show(res.error);
                  return;
                }
                setLayout(res.layout);
                setSelectedId(id);
                const target = res.layout.cubes.find((c) => c.id === id);
                if (target) setSpec(target.spec);
              }}
              onRemoveCube={(id) => {
                if (layout.cubes.length <= 1) {
                  show("Keep at least one cube");
                  return;
                }
                const next = removeCube(layout, id);
                if (next === layout || next.cubes.length === layout.cubes.length) {
                  show("Keep at least one cube");
                  return;
                }
                setLayout(next);
                if (activeSelectedId === id) {
                  const nextCube = next.cubes[0];
                  setSelectedId(nextCube?.id ?? null);
                  if (nextCube) setSpec(nextCube.spec);
                }
                show("Cube removed from canvas");
              }}
              onLoadCube={(id) => {
                selectCube(id);
                show("Loaded cube into editor");
              }}
              onApplyTemplate={(id) => {
                const t = LAYOUT_TEMPLATES.find((tpl) => tpl.id === id);
                if (!t) return;
                const next = t.build(spec);
                setLayout(next);
                const first = next.cubes[0];
                if (first) {
                  setSelectedId(first.id);
                  setSpec(first.spec);
                }
                show(`Applied "${t.name}" template`);
              }}
              onUseGrid={(newLayout) => {
                setLayout(newLayout);
                const first = newLayout.cubes[0];
                if (first) {
                  setSelectedId(first.id);
                  setSpec(first.spec);
                }
                show("Grid layout applied");
              }}
              onDownloadAll={downloadAll}
              ready={ready}
            />
            <Controls
              spec={spec}
              set={set}
              exploded={exploded}
              setExploded={setExploded}
              open={open}
              setOpen={setOpen}
              onFitTest={fitTest}
              ready={ready}
              fitView={fitView}
              setFitView={setFitView}
              unitMode={unitMode}
              setUnitMode={setUnitMode}
              bedPreset={bedPreset}
              setBedPreset={setBedPreset}
              customBed={customBed}
              setCustomBed={setCustomBed}
              bedFitResults={bedFitResults}
            />
          </div>
          <div className="motion-rise mt-3 flex-none [--motion-i:4]">
            <HorrorBanner />
          </div>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-y-auto md:overflow-hidden md:ring-1 md:ring-border">
        <div className="hidden md:contents">
          <HalloweenBanner />
        </div>
        <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:rounded-t-xl lg:px-5">
          <h1 className="sr-only">{APP_NAME}</h1>
          <div className="md:hidden">
            <Wordmark />
          </div>
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-border md:block" />
          <span className="hidden font-heading text-base font-semibold md:inline">Cube</span>
          <span aria-hidden className="mx-2 hidden h-4 w-px bg-border lg:block" />
          <StatBar stats={stats} inline />
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => void copyLink()}
            >
              <Link2 data-icon="inline-start" />
              <span className="hidden sm:inline lg:hidden xl:inline">
                {copied ? "Copied" : "Copy link"}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Switch theme"
              onClick={toggleTheme}
            >
              <Sun className="hidden dark:block" />
              <Moon className="dark:hidden" />
            </Button>
            <Button
              type="button"
              size="sm"
              className="hidden rounded-full md:inline-flex"
              disabled={!ready || exporting !== null}
              onClick={() => void saveExport("stl")}
            >
              {exporting === "stl" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Download data-icon="inline-start" />
              )}
              STL
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden rounded-full md:inline-flex"
              disabled={!ready || exporting !== null}
              onClick={() => void saveExport("3mf")}
            >
              {exporting === "3mf" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Download data-icon="inline-start" />
              )}
              3MF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden rounded-full md:inline-flex"
              disabled={!ready || exporting !== null}
              aria-label={`Download project (${projectPlates} plates)`}
              title={`All panels arranged across ${projectPlates} plate${
                projectPlates === 1 ? "" : "s"
              }`}
              onClick={() => void saveExport("project")}
            >
              {exporting === "project" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Download data-icon="inline-start" />
              )}
              <span className="hidden sm:inline">
                Project ({projectPlates} plate{projectPlates === 1 ? "" : "s"})
              </span>
              <span className="sm:hidden">Project</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden rounded-full md:inline-flex"
              aria-label="Download Bambu A1 print profile"
              title="ⓘ Bambu Studio: New Project → A1 0.4 nozzle → File → Import → Import Configs"
              onClick={() => void downloadA1Profile()}
            >
              <Download data-icon="inline-start" />
              <span className="hidden xl:inline">Bambu A1 print profile</span>
              <span className="xl:hidden">A1 profile</span>
              <span aria-hidden className="text-muted-foreground">
                ⓘ
              </span>
            </Button>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-3 p-3 pb-24 md:min-h-0 md:gap-4 md:pb-3 lg:p-5">
          <StatBar stats={stats} />
          {exportError ? (
            <Alert variant="destructive">
              <AlertTitle>Export failed</AlertTitle>
              <AlertDescription>{exportError}</AlertDescription>
            </Alert>
          ) : null}
          <Card className="relative -mx-3 min-h-[62svh] flex-1 gap-0 rounded-none border-0 p-0 shadow-none ring-0 md:mx-0 md:min-h-0 md:rounded-xl md:border md:shadow-sm md:ring-1">
            <div className="absolute inset-0">
              {m ? (
                <Viewer
                  parts={singleParts}
                  cubes={viewerCubes}
                  size={viewerSize}
                  explode={exploded ? 30 : 0}
                  onSelectCube={selectCube}
                  view={view}
                  onViewChange={setView}
                  bed={bedSize}
                  bedLabel={bedLabel}
                />
              ) : (
                <div className="grid h-full place-items-center font-mono text-[10px] tracking-[0.22em] text-muted-foreground">
                  DRAWING
                </div>
              )}
            </div>
            <div className="pointer-events-none absolute top-3 right-4 hidden font-mono md:block text-[10px] tracking-[0.18em] text-muted-foreground">
              {!ready ? "DRAWING" : renderMs > 0 ? `${renderMs} ms` : ""}
            </div>
            <div className="pointer-events-none absolute right-4 bottom-4 hidden max-w-[min(80%,42rem)] flex-col items-end gap-2 md:flex">
              {suggestions.length > 0 ? (
                <div
                  data-testid="view-suggestions"
                  className="pointer-events-auto flex flex-col items-end gap-1.5"
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={s.onClick}
                      className="suggest-pill"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-2 pointer-events-auto">
                <ViewButtons view={view} onViewChange={setView} />
                <button
                  type="button"
                  onClick={() => setExploded(!exploded)}
                  className="flex h-7 items-center gap-1 rounded-full border border-border bg-background/80 px-2.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {exploded ? <Minimize2 className="size-3.5" /> : <Expand className="size-3.5" />}
                  {exploded ? "Assemble" : "Explode"}
                </button>
              </div>
              <PlateStats
                grid={displayGrid}
                size={displaySize}
                height={displayHeight}
                fits={allFit}
                failCount={failCount}
              />
            </div>
          </Card>
        </div>
      </SidebarInset>
      <MobileBar
        disabled={!ready}
        exporting={exporting}
        projectPlates={projectPlates}
        on3mf={() => void saveExport("3mf")}
        onStl={() => void saveExport("stl")}
        onProject={() => void saveExport("project")}
        onProfile={() => void downloadA1Profile()}
        onFit={fitTest}
      />
      <Toast message={toast.message} open={toast.open} />
    </SidebarProvider>
  );
}

/** Phone-only bottom bar: Edit opens the settings sheet, Download opens a short list. */
function MobileBar({
  disabled,
  exporting,
  projectPlates,
  on3mf,
  onStl,
  onProject,
  onProfile,
  onFit,
}: {
  disabled: boolean;
  exporting: string | null;
  projectPlates: number;
  on3mf: () => void;
  onStl: () => void;
  onProject: () => void;
  onProfile: () => void;
  onFit: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  const [menu, setMenu] = useState(false);
  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const items: [string, string, () => void, boolean][] = [
    [
      `Project (${projectPlates} plates)`,
      `All panels across ${projectPlates} plate${projectPlates === 1 ? "" : "s"}`,
      onProject,
      disabled,
    ],
    ["3MF", "Panels laid flat, for Bambu Studio", on3mf, disabled],
    ["STL", "One file per panel, any slicer", onStl, disabled],
    ["Fit test print", "Clearance tile + your joint, print first", onFit, disabled],
    ["A1 print profile", "Presets for Bambu Studio", onProfile, false],
  ];
  return (
    <>
      {menu ? (
        <button
          type="button"
          aria-label="Close"
          className="fixed inset-0 z-20 md:hidden"
          onClick={() => setMenu(false)}
        />
      ) : null}
      {menu ? (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 overflow-hidden rounded-2xl border bg-popover shadow-lg md:hidden"
        >
          {items.map(([label, note, fn, off]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={off}
              onClick={pick(fn)}
              className="flex min-h-14 w-full flex-col items-start justify-center border-b px-4 text-left last:border-b-0 disabled:opacity-50"
            >
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </button>
          ))}
        </div>
      ) : null}
      <nav
        aria-label="Actions"
        data-testid="mobile-bar"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t bg-background/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 rounded-full"
          onClick={() => setOpenMobile(true)}
        >
          <SlidersHorizontal data-icon="inline-start" />
          Edit
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-12 rounded-full"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          {exporting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Download data-icon="inline-start" />
          )}
          Download
        </Button>
      </nav>
    </>
  );
}

function GridfinityInfo({ spec, onSnap }: { spec: CubeSpec; onSnap: (w: number) => void }) {
  const g = gridfinityLayout(spec);
  let fix: number | null = null;
  if (g.warn)
    for (let w = spec.w + 1; w <= 8; w++)
      if (!gridfinityLayout({ ...spec, w }).warn) {
        fix = w;
        break;
      }
  return (
    <div
      data-testid="gf-info"
      className="flex flex-col gap-1 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground"
    >
      <span>
        <b className="text-foreground">
          {g.cells} cell{g.cells === 1 ? "" : "s"}
        </b>{" "}
        per drawer · {g.comps.map((c) => `${c.cols}×${g.rows}`).join(" | ")}
      </span>
      <span>
        Interior {g.inner[0].toFixed(1)} × {g.inner[1].toFixed(1)} mm
      </span>
      {g.warn ? <span className="text-destructive">{g.warn}</span> : null}
      {fix ? (
        <button
          type="button"
          className="self-start underline text-foreground"
          onClick={() => onSnap(fix)}
        >
          Widen to {fix}u so it fits
        </button>
      ) : null}
    </div>
  );
}
