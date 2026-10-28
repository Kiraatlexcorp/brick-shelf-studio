"use client";

import { useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { InfoTip } from "@/components/studio/info-tip";
const formatMm = (v: number) => String(Number(v.toFixed(2)));
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { UNIT } from "@/lib/brick/spec";
import { SIZE_PRESET_UNITS, type UnitMode } from "@/lib/brick/units";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function SwitchField({
  id,
  label,
  hint,
  warning,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  /** Stays visible inline, unlike the hint. */
  warning?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <FieldContent>
        <div className="flex items-center">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {hint ? <InfoTip id={`${id}-hint`} label={label} text={hint} /> : null}
        </div>
        <FieldWarning text={warning} />
      </FieldContent>
      <Switch
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next)}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
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
  onChange: (value: T) => void;
}) {
  const hintId = useId();
  return (
    <Field className="gap-1">
      <div data-slot="tune-row" className="tune-row">
      <span className="flex items-center">
        <FieldLabel className="tune-row-label">{label}</FieldLabel>
        {hint ? <InfoTip id={hintId} label={label} text={hint} /> : null}
      </span>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next != null) onChange(next as T);
        }}
      >
        <SelectTrigger size="sm" className="tune-select" aria-describedby={hint ? hintId : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      </div>
    </Field>
  );
}

/**
 * Fine-tune number field (beautifului.dev FineTuneCard ScrubField): an inset filled
 * box with a muted inline label prefix and unit suffix. Drag the label to scrub,
 * use the arrow keys on it (Shift for x10), or type in the value.
 */
export function MeasureField({
  label,
  hint,
  value,
  min,
  max,
  step,
  digits,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const printed = digits === 0 ? String(Math.round(value)) : formatMm(value);
  const [focused, setFocused] = useState(false);
  const [override, setOverride] = useState(printed);
  const drag = useRef<{ x: number; v: number } | null>(null);
  const text = focused ? override : printed;
  const unit = suffix.toLowerCase();
  const hintId = useId();

  function commit(next: number) {
    if (!Number.isFinite(next)) return;
    const snapped = Math.round(next / step) * step;
    onChange(Math.min(max, Math.max(min, Number(snapped.toFixed(4)))));
  }

  return (
    <Field className="gap-1">
      <label data-slot="tune-field" className="tune-field">
        <span
          role="slider"
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          tabIndex={0}
          className="tune-field-label"
          onPointerDown={(event) => {
            (event.target as HTMLElement).setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, v: value };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            commit(drag.current.v + ((event.clientX - drag.current.x) / 2) * step);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(event) => {
            const mult = event.shiftKey ? 10 : 1;
            if (event.key === "ArrowUp" || event.key === "ArrowRight") {
              event.preventDefault();
              commit(value + step * mult);
            } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
              event.preventDefault();
              commit(value - step * mult);
            }
          }}
        >
          {label}
        </span>
        {hint ? <InfoTip id={hintId} label={label} text={hint} /> : null}
        <input
          aria-describedby={hint ? hintId : undefined}
          className="tune-field-input"
          inputMode="decimal"
          aria-label={`${label} value`}
          value={text}
          onFocus={() => {
            setOverride(printed);
            setFocused(true);
          }}
          onChange={(event) => {
            setOverride(event.target.value);
            const parsed = Number(event.target.value);
            if (event.target.value.trim() !== "" && Number.isFinite(parsed)) {
              onChange(Math.min(max, Math.max(min, parsed)));
            }
          }}
          onBlur={() => {
            const parsed = Number(override);
            setFocused(false);
            if (override.trim() !== "" && Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
          }}
        />
        {unit ? <span className="tune-field-unit">{unit}</span> : null}
      </label>
    </Field>
  );
}

/** Inline warning under a control; hints go behind the info icon instead. */
export function FieldWarning({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="note" className="field-warning">
      {text}
    </p>
  );
}

/**
 * Stepper, slider, and quick-preset size field for cube W/H/D.
 * Supports toggling between grid units (u) and millimetres (mm).
 * Canonical value is always kept in grid units (u).
 */
export function SizeStepperField({
  label,
  hint,
  value,
  unitMode = "u",
  min = 1,
  max = 4,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  unitMode?: UnitMode;
  min?: number;
  max?: number;
  onChange: (units: number) => void;
}) {
  const hintId = useId();
  const effectiveMax = Math.max(max, value);
  const mmVal = value * UNIT;
  const printed = unitMode === "mm" ? String(mmVal) : String(value);

  const [focused, setFocused] = useState(false);
  const [override, setOverride] = useState(printed);
  const drag = useRef<{ x: number; v: number } | null>(null);

  const text = focused ? override : printed;

  function commitUnits(next: number) {
    if (!Number.isFinite(next)) return;
    const clamped = Math.max(min, Math.min(effectiveMax, Math.round(next)));
    onChange(clamped);
  }

  function commitMm(next: number) {
    if (!Number.isFinite(next)) return;
    const units = Math.round(next / UNIT);
    const clamped = Math.max(min, Math.min(effectiveMax, units));
    onChange(clamped);
  }

  return (
    <Field className="gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <FieldLabel htmlFor={`${hintId}-input`}>{label}</FieldLabel>
          {hint ? <InfoTip id={hintId} label={label} text={hint} /> : null}
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {unitMode === "u" ? `${mmVal} mm` : `${value}u`}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => commitUnits(value - 1)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
        >
          <Minus className="size-3.5" />
        </button>

        <label data-slot="tune-field" className="tune-field flex-1 h-7">
          <span
            role="slider"
            aria-label={label}
            aria-valuenow={unitMode === "mm" ? mmVal : value}
            aria-valuemin={unitMode === "mm" ? min * UNIT : min}
            aria-valuemax={unitMode === "mm" ? effectiveMax * UNIT : effectiveMax}
            tabIndex={0}
            className="tune-field-label"
            onPointerDown={(event) => {
              (event.target as HTMLElement).setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, v: value };
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const delta = Math.round((event.clientX - drag.current.x) / 16);
              commitUnits(drag.current.v + delta);
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowRight") {
                event.preventDefault();
                commitUnits(value + 1);
              } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
                event.preventDefault();
                commitUnits(value - 1);
              }
            }}
          >
            {label}
          </span>
          <input
            id={`${hintId}-input`}
            aria-describedby={hint ? hintId : undefined}
            className="tune-field-input"
            inputMode="numeric"
            aria-label={`${label} value`}
            value={text}
            onFocus={() => {
              setOverride(printed);
              setFocused(true);
            }}
            onChange={(event) => {
              setOverride(event.target.value);
              const parsed = Number(event.target.value);
              if (event.target.value.trim() !== "" && Number.isFinite(parsed)) {
                if (unitMode === "mm") commitMm(parsed);
                else commitUnits(parsed);
              }
            }}
            onBlur={() => {
              setFocused(false);
              const parsed = Number(override);
              if (override.trim() !== "" && Number.isFinite(parsed)) {
                if (unitMode === "mm") commitMm(parsed);
                else commitUnits(parsed);
              }
            }}
          />
          <span className="tune-field-unit">{unitMode}</span>
        </label>

        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= effectiveMax}
          onClick={() => commitUnits(value + 1)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="px-1 py-1">
        <Slider
          value={[unitMode === "mm" ? mmVal : value]}
          min={unitMode === "mm" ? min * UNIT : min}
          max={unitMode === "mm" ? effectiveMax * UNIT : effectiveMax}
          step={unitMode === "mm" ? UNIT : 1}
          onValueChange={(vals) => {
            const raw = Array.isArray(vals) ? vals[0] : Number(vals);
            const next = unitMode === "mm" ? Math.round(raw / UNIT) : raw;
            commitUnits(next);
          }}
        />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        {SIZE_PRESET_UNITS.map((u) => {
          const isSelected = value === u;
          const mm = u * UNIT;
          const chipLabel = unitMode === "mm" ? `${mm} mm (${u}u)` : `${u}u (${mm} mm)`;
          return (
            <button
              key={u}
              type="button"
              onClick={() => commitUnits(u)}
              aria-pressed={isSelected}
              className={cn(
                "h-5.5 rounded-full px-2 text-[11px] font-medium transition-all cursor-pointer flex items-center justify-center",
                isSelected
                  ? "bg-foreground text-background shadow-xs font-semibold"
                  : "border border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {chipLabel}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

