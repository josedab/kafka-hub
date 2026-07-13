import { cn } from "@/lib/cn";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

/**
 * Loading state indicator for workbench tools.
 */
export function LoadingState({ message = "Analyzing...", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={cn(
        "flex items-center justify-center gap-3 rounded-xl border border-fd-border bg-fd-card p-8",
        className,
      )}
    >
      <span
        className="inline-block size-4 animate-spin rounded-full border-2 border-fd-muted-foreground border-t-transparent"
        aria-hidden
      />
      <span className="text-sm text-fd-muted-foreground">{message}</span>
    </div>
  );
}
