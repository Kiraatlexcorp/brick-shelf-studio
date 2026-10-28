import { Suspense } from "react";
import { Builder } from "@/components/app/builder";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="grid h-dvh place-items-center bg-background font-mono text-[10px] tracking-[0.22em] text-muted-foreground">
          DRAWING
        </div>
      }
    >
      <Builder />
    </Suspense>
  );
}
