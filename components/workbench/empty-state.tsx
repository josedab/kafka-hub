import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: string;
  description: string;
  className?: string;
}

/**
 * Empty state placeholder for workbench tools.
 */
export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-fd-border p-8 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-fd-muted-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-fd-muted-foreground/70">{description}</p>
    </div>
  );
}
