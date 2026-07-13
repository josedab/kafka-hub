import { cn } from "@/lib/cn";

interface ValidationSummaryProps {
  errors: readonly string[];
  className?: string;
}

/**
 * Displays a list of validation errors with accessible feedback.
 */
export function ValidationSummary({ errors, className }: ValidationSummaryProps) {
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "rounded-lg border border-red-500/20 bg-red-500/5 p-3",
        className,
      )}
    >
      <p className="text-xs font-semibold text-red-700 dark:text-red-300">
        {errors.length === 1
          ? "Validation error"
          : `${errors.length} validation errors`}
      </p>
      <ul className="mt-1 space-y-0.5">
        {errors.map((err, i) => (
          <li key={i} className="text-xs text-red-600 dark:text-red-400">
            {err}
          </li>
        ))}
      </ul>
    </div>
  );
}
