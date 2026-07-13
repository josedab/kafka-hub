import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

type Tone = "critical" | "high" | "medium" | "low";

const toneColors: Record<Tone, { badge: "danger" | "warning" | "info" | "neutral"; border: string }> = {
  critical: { badge: "danger", border: "border-red-500/20" },
  high: { badge: "warning", border: "border-amber-500/20" },
  medium: { badge: "info", border: "border-sky-500/20" },
  low: { badge: "neutral", border: "border-fd-border" },
};

interface ResultCardProps {
  /** Card heading. */
  title: string;
  /** Severity tone. */
  tone: Tone;
  /** Badge content (e.g., confidence %). */
  badge?: string;
  /** Optional subheading. */
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A result card for displaying triage hypotheses.
 */
export function ResultCard({
  title,
  tone,
  badge,
  subtitle,
  children,
  className,
}: ResultCardProps) {
  const colors = toneColors[tone];

  return (
    <article
      className={cn(
        "rounded-xl border bg-fd-card shadow-sm",
        colors.border,
        className,
      )}
    >
      <div className="flex flex-col gap-1.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={colors.badge}>{tone}</Badge>
          {badge && (
            <span className="font-mono text-xs text-fd-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        {subtitle && (
          <p className="text-xs text-fd-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="border-t border-fd-border/50 p-4 sm:p-5">
        {children}
      </div>
    </article>
  );
}

// ─── Section within a result card ───────────────────────────────────────────

interface ResultSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function ResultSection({ title, children, className }: ResultSectionProps) {
  return (
    <div className={cn("mt-3 first:mt-0", className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
