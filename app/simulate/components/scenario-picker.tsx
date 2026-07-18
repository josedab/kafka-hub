"use client";

import { cn } from "@/lib/cn";
import { SCENARIO_LIST } from "@kafka-hub/kafka-sim";

export function ScenarioPicker({
  active,
  onChange,
}: {
  active: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Select a scenario">
      {SCENARIO_LIST.map((s) => (
        <button
          key={s.slug}
          type="button"
          role="radio"
          onClick={() => onChange(s.slug)}
          aria-checked={active === s.slug}
          className={cn(
            "min-h-[44px] min-w-0 rounded-xl border p-3 text-left transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-foreground",
            active === s.slug
              ? "border-fd-foreground bg-fd-foreground/5"
              : "border-fd-border bg-fd-card hover:border-fd-foreground/30",
          )}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
            {s.slug}
          </div>
          <div className="mt-1 text-sm font-semibold leading-snug">
            {s.title}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fd-muted-foreground">
            {s.blurb}
          </p>
        </button>
      ))}
    </div>
  );
}
