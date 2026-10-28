import { CircleCheck, TriangleAlert } from "lucide-react";

export type PlateStatsProps = {
  grid: string;
  size: string;
  height: string;
  fits: boolean;
  failCount?: number;
};

/** Model size and bed fit, shown as a strip over the bottom of the viewer. */
export function PlateStats({ grid, size, height, fits, failCount = 0 }: PlateStatsProps) {
  return (
    <div
      data-testid="plate-stats"
      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 rounded-xl border border-border bg-background/85 px-3 py-1.5 text-xs backdrop-blur pointer-events-auto"
    >
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {[
          ["Grid", grid],
          ["Size", size],
          ["Height", height],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono whitespace-nowrap tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p
        data-testid="plate-fit"
        className={`flex items-center gap-1 ${
          fits
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {fits ? (
          <CircleCheck aria-hidden className="size-3.5" />
        ) : (
          <TriangleAlert aria-hidden className="size-3.5" />
        )}
        {fits
          ? "Fits bed in one piece"
          : failCount > 0
            ? `Does not fit bed (${failCount} exceed)`
            : "Does not fit bed"}
      </p>
    </div>
  );
}
