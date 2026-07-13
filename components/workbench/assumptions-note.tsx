import { cn } from "@/lib/cn";

interface AssumptionsNoteProps {
  items: readonly string[];
  className?: string;
}

/**
 * Displays assumptions and source notes for transparency.
 */
export function AssumptionsNote({ items, className }: AssumptionsNoteProps) {
  if (items.length === 0) return null;

  return (
    <aside
      aria-label="Assumptions and source notes"
      className={cn(
        "rounded-lg border border-fd-border bg-fd-muted/30 p-4",
        className,
      )}
    >
      <h4 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
        Assumptions and source notes
      </h4>
      <ul className="mt-2 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs text-fd-muted-foreground">
            <span aria-hidden className="font-mono text-fd-foreground/40">·</span>
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}
