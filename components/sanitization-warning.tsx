import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export function SanitizationWarning({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200",
        compact
          ? "px-1 py-1"
          : "rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2",
        className,
      )}
      role="note"
    >
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {compact
          ? "Review before sharing; unconventional secret keys may not be recognized."
          : "Review sanitized output before sharing. Redaction covers common secret patterns; unconventional key names or formats may not be recognized."}
      </span>
    </div>
  );
}
