"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "@/lib/geometry/manifold";
import { buildCube, buildFitTile, previewParts, printParts } from "@/lib/brick/cube";
import { A1_BED, CLEARANCES, DEFAULT_CUBE, UNIT, type CubeSpec, type Side } from "@/lib/brick/spec";
import { meshTo3mf } from "@/lib/export/threemf";

const Viewer = dynamic(() => import("@/components/app/viewer").then((x) => x.Viewer), { ssr: false });

function save(bytes: Uint8Array, name: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: "model/3mf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <div className="flex items-center gap-1">
        <button aria-label={`Less ${label}`} className="size-11 rounded-full bg-white text-xl shadow-sm disabled:opacity-30" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
        <span className="w-8 text-center tabular-nums">{value}</span>
        <button aria-label={`More ${label}`} className="size-11 rounded-full bg-white text-xl shadow-sm disabled:opacity-30" disabled={value >= 4} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

const SIDES = ["front", "back", "left", "right"] as const;

export function Builder() {
  const [m, setM] = useState<ManifoldToplevel | null>(null);
  const [spec, setSpec] = useState<CubeSpec>(DEFAULT_CUBE);
  const [exploded, setExploded] = useState(false);
  useEffect(() => {
    loadManifold().then(setM);
  }, []);

  const panels = useMemo(() => (m ? buildCube(m, spec) : []), [m, spec]);
  const parts = useMemo(() => previewParts(panels), [panels]);
  const set = (patch: Partial<CubeSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const toggle = (side: (typeof SIDES)[number]) => set({ [side]: (spec[side] === "wall" ? "open" : "wall") as Side });

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col md:flex-row">
      <section className="relative h-[55svh] md:h-svh md:flex-1">
        {m ? (
          <Viewer parts={parts} size={[spec.w * UNIT, spec.d * UNIT, spec.h * UNIT]} explode={exploded ? 30 : 0} />
        ) : (
          <p className="grid h-full place-items-center text-neutral-500">Loading…</p>
        )}
        <button
          className="absolute right-3 bottom-3 min-h-11 rounded-full bg-white px-4 shadow-sm"
          onClick={() => setExploded((e) => !e)}
        >
          {exploded ? "Assemble" : "Explode"}
        </button>
      </section>

      <aside className="flex flex-col gap-5 p-4 md:w-80 md:overflow-y-auto">
        <h1 className="text-xl font-semibold">Brick Shelf Studio</h1>

        <div className="flex flex-col gap-2">
          <Stepper label="Width" value={spec.w} onChange={(w) => set({ w })} />
          <Stepper label="Depth" value={spec.d} onChange={(d) => set({ d })} />
          <Stepper label="Height" value={spec.h} onChange={(h) => set({ h })} />
          <p className="text-sm text-neutral-500">
            {spec.w * UNIT} × {spec.d * UNIT} × {spec.h * UNIT} mm
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SIDES.map((side) => (
            <button
              key={side}
              onClick={() => toggle(side)}
              className={`min-h-11 rounded-xl capitalize ${spec[side] === "wall" ? "bg-neutral-900 text-white" : "border border-dashed border-neutral-400"}`}
            >
              {side}: {spec[side]}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span>Fit</span>
          <div className="flex gap-1">
            {CLEARANCES.map((c, i) => (
              <button
                key={c}
                onClick={() => set({ clearance: c })}
                className={`min-h-11 rounded-full px-3 ${spec.clearance === c ? "bg-neutral-900 text-white" : "bg-white"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!m}
          className="min-h-12 rounded-xl bg-[var(--accent)] font-medium text-white disabled:opacity-40"
          onClick={() => save(meshTo3mf(printParts(panels), A1_BED, "Brick cube"), `brick-cube-${spec.w}x${spec.d}x${spec.h}.3mf`)}
        >
          Download 3MF ({panels.length} panels)
        </button>
        <button
          disabled={!m}
          className="min-h-11 rounded-xl border border-neutral-300"
          onClick={() => m && save(meshTo3mf(buildFitTile(m), A1_BED, "Fit tile"), "brick-fit-tile.3mf")}
        >
          Fit test print
        </button>
        <p className="text-sm text-neutral-500">Print the fit test first. Press the key into slots 1, 2, 3 and pick the snuggest one that goes in by hand.</p>
      </aside>
    </main>
  );
}
