import type { StateField } from "@/lib/protocol-lab";
import { cn } from "@/lib/cn";

const toneClass: Record<NonNullable<StateField["tone"]>, string> = {
  neutral: "border-fd-border bg-fd-muted/40 text-fd-muted-foreground",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

/**
 * Renders a point-in-time state snapshot (leader, ISR, acks, epoch, etc.)
 * as a grid of labeled fields. Fields marked `changed` get a highlight ring
 * so a viewer's eye is drawn to what this step actually altered.
 */
export function StatePanel({ state }: { state: readonly StateField[] }) {
  if (state.length === 0) return null;

  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Current state">
      {state.map((field) => (
        <div
          key={field.label}
          className={cn(
            "rounded-md border px-3 py-2 transition-shadow motion-reduce:transition-none",
            toneClass[field.tone ?? "neutral"],
            field.changed && "ring-2 ring-fd-foreground/40",
          )}
        >
          <dt className="font-mono text-[10px] uppercase tracking-wider opacity-80">{field.label}</dt>
          <dd className="mt-0.5 truncate font-mono text-sm font-medium" title={field.value}>
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
