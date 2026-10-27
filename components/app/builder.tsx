"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type * as React from "react";
import dynamic from "next/dynamic";
import { zipSync } from "fflate";
import type { ManifoldToplevel } from "manifold-3d";
import { Download, Expand, Minimize2, Moon, Printer, SlidersHorizontal, Sun } from "lucide-react";
import { loadManifold } from "@/lib/geometry/manifold";
import { buildCube, buildFitTile, previewParts, printParts } from "@/lib/brick/cube";
import { A1_BED, CLEARANCES, DEFAULT_CUBE, UNIT, type CubeSpec, type Side } from "@/lib/brick/spec";
import type { MeshPart } from "@/lib/brick/mesh";
import { meshTo3mf } from "@/lib/export/threemf";
import { meshToStl } from "@/lib/export/stl";
import { MafiaLogo } from "@/components/studio/mafia-logo";
import { HorrorBanner } from "@/components/studio/horror-banner";
import { HalloweenBanner } from "@/components/studio/halloween-banner";
import { InfoTip } from "@/components/studio/info-tip";
import { Segmented } from "@/components/studio/segmented";
import { SectionCard } from "@/components/studio/section-card";
import { MeasureField, SwitchField } from "@/components/studio/fields";
import { Toast, useToast } from "@/components/studio/toast";
import { BrickPresetsCard } from "@/components/brick/presets-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

const Viewer = dynamic(() => import("@/components/app/viewer").then((x) => x.Viewer), { ssr: false });

export const APP_NAME = "Brick Shelf";

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
        <span className="truncate whitespace-nowrap text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
      </span>
    </div>
  );
}

function Choice<T extends string>({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <Field>
      <div className="flex items-center">
        <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
        {hint ? <InfoTip id={`${id}-hint`} label={label} text={hint} /> : null}
      </div>
      <Segmented aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} value={value} options={options} onChange={onChange} />
    </Field>
  );
}

const SIDES = ["front", "back", "left", "right"] as const;
const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: "wall", label: "Wall" },
  { value: "open", label: "Open" },
];

function Controls({ spec, set, exploded, setExploded, onFitTest, ready }: {
  spec: CubeSpec; set: (p: Partial<CubeSpec>) => void; exploded: boolean; setExploded: (v: boolean) => void; onFitTest: () => void; ready: boolean;
}) {
  return (
    <>
      <SectionCard id="bin" title="Cube size">
        <MeasureField label="Width" hint="Grid units across, 40 mm each." value={spec.w} min={1} max={4} step={1} digits={0} suffix="u" onChange={(w) => set({ w })} />
        <MeasureField label="Depth" hint="Grid units front to back, 40 mm each." value={spec.d} min={1} max={4} step={1} digits={0} suffix="u" onChange={(d) => set({ d })} />
        <MeasureField label="Height" hint="Grid units tall, 40 mm each." value={spec.h} min={1} max={4} step={1} digits={0} suffix="u" onChange={(h) => set({ h })} />
      </SectionCard>
      <SectionCard id="walls" title="Sides">
        {SIDES.map((side) => (
          <Choice
            key={side}
            label={side[0].toUpperCase() + side.slice(1)}
            hint={`Wall prints a ${side} panel. Open leaves the ${side} side empty.`}
            value={spec[side]}
            options={SIDE_OPTIONS}
            onChange={(v) => set({ [side]: v })}
          />
        ))}
      </SectionCard>
      <SectionCard id="drawer" title="Fit">
        <Choice
          label="Clearance"
          hint="Gap per side between stud and socket. Print the fit test and pick the snuggest slot that still goes in by hand."
          value={String(spec.clearance)}
          options={CLEARANCES.map((c) => ({ value: String(c), label: `${c} mm` }))}
          onChange={(v) => set({ clearance: Number(v) })}
        />
        <SwitchField id="explode" label="Explode view" hint="Pull the panels apart in the preview to see the joints." checked={exploded} onChange={setExploded} />
        <Button variant="outline" disabled={!ready} onClick={onFitTest}>
          <Printer data-icon="inline-start" />
          Fit test print
        </Button>
      </SectionCard>
    </>
  );
}

export function Builder() {
  const [m, setM] = useState<ManifoldToplevel | null>(null);
  const [spec, setSpec] = useState<CubeSpec>(DEFAULT_CUBE);
  const [exploded, setExploded] = useState(false);
  const { toast, show } = useToast();
  useEffect(() => {
    loadManifold().then(setM);
  }, []);

  const panels = useMemo(() => (m ? buildCube(m, spec) : []), [m, spec]);
  const parts = useMemo(() => previewParts(panels), [panels]);
  const set = (patch: Partial<CubeSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const stem = `acmie-brick-${spec.w}x${spec.d}x${spec.h}`;
  const ready = !!m;

  const download = (kind: "3mf" | "stl") => {
    if (!m) return;
    if (kind === "3mf") save(meshTo3mf(printParts(panels), A1_BED, "Brick cube"), `${stem}.3mf`, "model/3mf");
    else saveStls(printParts(panels), stem);
    show(`${stem} ${kind.toUpperCase()} downloaded`);
  };
  const fitTest = () => {
    if (!m) return;
    save(meshTo3mf(buildFitTile(m), A1_BED, "Fit tile"), "acmie-brick-fit-tile.3mf", "model/3mf");
    show("Fit test downloaded");
  };

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("acme-theme", next ? "dark" : "light");
  }

  const stats = [
    { label: "Outer size", value: `${spec.w * UNIT} × ${spec.d * UNIT} × ${spec.h * UNIT} mm`, note: "outer" },
    { label: "Panels", value: String(panels.length), note: "panels to print" },
    { label: "Fit", value: `${spec.clearance} mm`, note: "clearance" },
  ];

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
            <BrickPresetsCard spec={spec} onChange={setSpec} />
            <Controls spec={spec} set={set} exploded={exploded} setExploded={setExploded} onFitTest={fitTest} ready={ready} />
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
          <div className="md:hidden"><Wordmark /></div>
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-border md:block" />
          <span className="hidden font-heading text-base font-semibold md:inline">Cube</span>
          <span aria-hidden className="mx-2 hidden h-4 w-px bg-border lg:block" />
          <div className="hidden min-w-0 flex-1 items-center gap-x-4 overflow-hidden text-xs lg:flex">
            {stats.map((s) => (
              <span key={s.label} title={s.label} className="whitespace-nowrap">
                <span className="font-heading font-semibold tabular-nums">{s.value}</span>
                <span className="hidden text-muted-foreground xl:inline"> {s.note}</span>
              </span>
            ))}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Switch theme" onClick={toggleTheme}>
              <Sun className="hidden dark:block" />
              <Moon className="dark:hidden" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" size="sm" className="hidden rounded-full md:inline-flex" disabled={!ready}>
                    <Download data-icon="inline-start" />
                    Download
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-60">
                <DropdownMenuItem className="items-start" onClick={() => download("3mf")}>
                  <Download className="mt-0.5" />
                  <span className="flex flex-col"><span className="font-medium">3MF</span><span className="text-xs text-muted-foreground">Panels laid flat, for Bambu Studio</span></span>
                </DropdownMenuItem>
                <DropdownMenuItem className="items-start" onClick={() => download("stl")}>
                  <Download className="mt-0.5" />
                  <span className="flex flex-col"><span className="font-medium">STL</span><span className="text-xs text-muted-foreground">One file per panel, any slicer</span></span>
                </DropdownMenuItem>
                <DropdownMenuItem className="items-start" onClick={fitTest}>
                  <Printer className="mt-0.5" />
                  <span className="flex flex-col"><span className="font-medium">Fit test print</span><span className="text-xs text-muted-foreground">Print first, pick a clearance</span></span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-3 p-3 pb-24 md:min-h-0 md:gap-4 md:pb-3 lg:p-5">
          <Card className="relative -mx-3 min-h-[62svh] flex-1 gap-0 rounded-none border-0 p-0 shadow-none ring-0 md:mx-0 md:min-h-0 md:rounded-xl md:border md:shadow-sm md:ring-1">
            <div className="absolute inset-0">
              {m ? (
                <Viewer parts={parts} size={[spec.w * UNIT, spec.d * UNIT, spec.h * UNIT]} explode={exploded ? 30 : 0} />
              ) : (
                <div className="grid h-full place-items-center font-mono text-[10px] tracking-[0.22em] text-muted-foreground">DRAWING</div>
              )}
            </div>
            <div className="absolute right-4 bottom-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExploded(!exploded)}
                className="flex h-7 items-center gap-1 rounded-full border border-border bg-background/80 px-2.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {exploded ? <Minimize2 className="size-3.5" /> : <Expand className="size-3.5" />}
                {exploded ? "Assemble" : "Explode"}
              </button>
            </div>
          </Card>
        </div>
      </SidebarInset>
      <MobileBar disabled={!ready} on3mf={() => download("3mf")} onStl={() => download("stl")} onFit={fitTest} />
      <Toast message={toast.message} open={toast.open} />
    </SidebarProvider>
  );
}

/** Phone-only bottom bar, same as Studio: Edit opens the settings sheet, Download opens a short list. */
function MobileBar({ disabled, on3mf, onStl, onFit }: { disabled: boolean; on3mf: () => void; onStl: () => void; onFit: () => void }) {
  const { setOpenMobile } = useSidebar();
  const [menu, setMenu] = useState(false);
  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const items: [string, string, () => void][] = [
    ["3MF", "Panels laid flat, for Bambu Studio", on3mf],
    ["STL", "One file per panel, any slicer", onStl],
    ["Fit test print", "Print first, pick a clearance", onFit],
  ];
  return (
    <>
      {menu ? <button type="button" aria-label="Close" className="fixed inset-0 z-20 md:hidden" onClick={() => setMenu(false)} /> : null}
      {menu ? (
        <div role="menu" className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 overflow-hidden rounded-2xl border bg-popover shadow-lg md:hidden">
          {items.map(([label, note, fn]) => (
            <button key={label} type="button" role="menuitem" disabled={disabled} onClick={pick(fn)} className="flex min-h-14 w-full flex-col items-start justify-center border-b px-4 text-left last:border-b-0 disabled:opacity-50">
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
        <Button type="button" variant="outline" size="lg" className="h-12 rounded-full" onClick={() => setOpenMobile(true)}>
          <SlidersHorizontal data-icon="inline-start" />
          Edit
        </Button>
        <Button type="button" size="lg" className="h-12 rounded-full" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <Download data-icon="inline-start" />
          Download
        </Button>
      </nav>
    </>
  );
}
