"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Copy,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SanitizationWarning } from "@/components/sanitization-warning";
import { cn } from "@/lib/cn";
import type { Severity } from "@/lib/diagnostic-rules";
import {
  prepareForClipboard,
  type DiagnosticFindingWithFix,
  type RedactionReport,
} from "@kafka-hub/kafka-diagnose";

const severityMeta: Record<
  Severity,
  { label: string; icon: typeof Info; tone: "danger" | "warning" | "info" }
> = {
  danger: { label: "Danger", icon: XCircle, tone: "danger" },
  warning: { label: "Warning", icon: AlertTriangle, tone: "warning" },
  info: { label: "Info", icon: Info, tone: "info" },
};

function prefixDiffLine(prefix: "-" | "+", value: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix} ${line}`)
    .join("\n");
}

function FindingFix({ fix }: { fix: { before: string; after: string } }) {
  const [copied, setCopied] = useState(false);
  const [redactionReport, setRedactionReport] =
    useState<RedactionReport | null>(null);

  const copyFix = useCallback(async () => {
    const { payload, report } = prepareForClipboard(fix.after);
    setRedactionReport(report);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [fix.after]);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-fd-border bg-fd-background">
      <div className="flex items-center justify-between gap-2 border-b border-fd-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
          Suggested fix
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={copyFix}
        >
          <Copy className="size-3" aria-hidden />
          {copied ? "Copied!" : "Copy fix"}
        </Button>
      </div>
      <div className="font-mono text-xs leading-relaxed">
        <pre className="overflow-x-auto whitespace-pre-wrap bg-red-500/5 px-3 py-2 text-red-700 dark:text-red-300">
          {prefixDiffLine("-", fix.before)}
        </pre>
        <pre className="overflow-x-auto whitespace-pre-wrap border-t border-fd-border bg-emerald-500/5 px-3 py-2 text-emerald-700 dark:text-emerald-300">
          {prefixDiffLine("+", fix.after)}
        </pre>
      </div>
      {redactionReport && redactionReport.count > 0 ? (
        <div
          className="flex items-start gap-1.5 border-t border-fd-border px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
          role="status"
          aria-live="polite"
        >
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {redactionReport.summary} Keys:{" "}
            {redactionReport.keys.join(", ")}
          </span>
        </div>
      ) : null}
      <SanitizationWarning compact className="border-t border-fd-border" />
    </div>
  );
}

interface FindingCardProps {
  finding: DiagnosticFindingWithFix;
  selected?: boolean;
  onToggleSelect?: (ruleId: string) => void;
  selectable?: boolean;
}

export function FindingCard({
  finding: f,
  selected = false,
  onToggleSelect,
  selectable = false,
}: FindingCardProps) {
  const meta = severityMeta[f.severity];
  const Icon = meta.icon;

  return (
    <article
      className={cn(
        "rounded-xl border bg-fd-card p-4 shadow-sm",
        f.severity === "danger" && "border-red-500/30",
        f.severity === "warning" && "border-amber-500/30",
        f.severity === "info" && "border-sky-500/30",
        selected && "ring-2 ring-fd-ring",
      )}
    >
      <header className="flex items-start gap-3">
        {selectable && f.structuredFix ? (
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(f.ruleId)}
              className="size-[18px] min-h-[44px] min-w-[44px] cursor-pointer rounded border-fd-border accent-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
              aria-label={`Select fix for ${f.title}`}
            />
          </label>
        ) : null}
        <Icon
          className={cn(
            "mt-0.5 size-4 flex-none",
            f.severity === "danger" && "text-red-500",
            f.severity === "warning" && "text-amber-500",
            f.severity === "info" && "text-sky-500",
          )}
          aria-hidden
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <div className="flex gap-1.5">
              <Badge tone="neutral">{f.category}</Badge>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {f.structuredFix ? (
                <Badge tone="info">
                  {f.structuredFix.safe ? "auto-fixable" : "fixable (review)"}
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
            {f.detail}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fd-muted-foreground">
            <span className="font-mono">{f.ruleId}</span>
            <Link
              href={`/diagnose/rules/${f.ruleId}`}
              className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
            >
              Details
            </Link>
            {f.learnSlug ? (
              <Link
                href={`/learn/${f.learnSlug}`}
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
              >
                Read the explainer
              </Link>
            ) : null}
            {f.simulateSlug ? (
              <Link
                href={`/simulate?scenario=${encodeURIComponent(f.simulateSlug)}`}
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
              >
                Reproduce in simulator
              </Link>
            ) : null}
          </div>
          {f.fix ? <FindingFix fix={f.fix} /> : null}
        </div>
      </header>
    </article>
  );
}
