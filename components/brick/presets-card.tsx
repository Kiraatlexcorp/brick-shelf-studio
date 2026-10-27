"use client";

import { Box, Check, ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { SectionCard } from "@/components/studio/section-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_CUBE, type CubeSpec } from "@/lib/brick/spec";
import { BRICK_PRESETS, sameSpec } from "@/components/brick/presets";

/** Same look as Studio's Presets card: one dropdown of preset cards plus reset. */
export function BrickPresetsCard({ spec, onChange }: { spec: CubeSpec; onChange: (spec: CubeSpec) => void }) {
  const current = BRICK_PRESETS.find((p) => sameSpec(p.spec, spec));
  return (
    <SectionCard id="presets" title="Presets">
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="min-w-0 flex-1 justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {current ? <Box data-icon="inline-start" /> : <SlidersHorizontal data-icon="inline-start" />}
                  <span className="truncate">{current ? current.name : "Custom"}</span>
                </span>
                <ChevronDown data-icon="inline-end" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" data-presets-menu="" className="w-(--anchor-width) min-w-72">
            <DropdownMenuGroup>
              <DropdownMenuItem className="items-start" aria-current={!current ? "true" : undefined}>
                <SlidersHorizontal className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">Custom</span>
                  <span className="text-xs text-muted-foreground">No preset, your own values</span>
                </span>
                {!current ? <Check aria-label="Selected" className="mt-0.5 text-highlight" /> : null}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Shelves</DropdownMenuLabel>
              {BRICK_PRESETS.map((p) => (
                <DropdownMenuItem key={p.id} className="items-start" aria-current={current?.id === p.id ? "true" : undefined} onClick={() => onChange(p.spec)}>
                  <Box className="mt-0.5" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.tagline}</span>
                  </span>
                  {current?.id === p.id ? <Check aria-label="Selected" className="mt-0.5 text-highlight" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Reset to defaults" onClick={() => onChange(DEFAULT_CUBE)}>
                <RotateCcw />
              </Button>
            }
          />
          <TooltipContent>Reset to defaults</TooltipContent>
        </Tooltip>
      </div>
    </SectionCard>
  );
}
