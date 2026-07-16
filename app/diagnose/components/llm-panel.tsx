"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Severity } from "@/lib/diagnostic-rules";

const severityMeta: Record<
  Severity,
  { label: string; tone: "danger" | "warning" | "info" }
> = {
  danger: { label: "Danger", tone: "danger" },
  warning: { label: "Warning", tone: "warning" },
  info: { label: "Info", tone: "info" },
};

export interface LlmFinding {
  title: string;
  detail: string;
  severity: Severity;
}

export interface LlmResponse {
  configured: boolean;
  cached: boolean;
  findings: LlmFinding[];
  rationale?: string;
  error?: string;
  /** Whether common-pattern redaction matched anything before LLM egress. */
  redacted?: boolean;
  /** Number of potential secrets matched and redacted. */
  redactedCount?: number;
}

export function LlmPanel({ response }: { response: LlmResponse }) {
  if (response.error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
        <div className="font-semibold">LLM pass failed</div>
        <p className="mt-1 text-xs opacity-80">{response.error}</p>
      </div>
    );
  }

  if (!response.configured) {
    return (
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-700 dark:text-sky-300">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          <span className="font-semibold">
            LLM analysis is not configured on this deployment.
          </span>
        </div>
        <p className="mt-1 text-xs opacity-80">
          Set <code className="font-mono">ANTHROPIC_API_KEY</code> in the
          environment to enable free-form recommendations on top of the static
          rule engine.
        </p>
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
          <Sparkles className="size-4" aria-hidden />
          <span className="text-sm font-semibold">LLM recommendations</span>
        </div>
        <div className="flex gap-1.5">
          {response.cached ? (
            <Badge tone="info">cached</Badge>
          ) : (
            <Badge tone="neutral">fresh</Badge>
          )}
          {response.redacted ? (
            <Badge tone="warning">
              {response.redactedCount ?? 0} potential secret{(response.redactedCount ?? 0) !== 1 ? "s" : ""} redacted
            </Badge>
          ) : null}
        </div>
      </header>
      <p className="mt-2 text-[11px] text-fd-muted-foreground">
        Network egress: your config was sent to an external LLM API after
        best-effort redaction of common secret patterns. Review what you submit;
        unconventional keys or formats may not be recognized.
      </p>
      <div className="mt-3 space-y-3">
        {response.findings.map((f, i) => {
          const meta = severityMeta[f.severity];
          return (
            <div
              key={i}
              className="rounded-lg border border-violet-500/20 bg-fd-background p-3"
            >
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-semibold">{f.title}</h4>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
                {f.detail}
              </p>
            </div>
          );
        })}
        {response.rationale ? (
          <p className="text-xs italic text-fd-muted-foreground">
            {response.rationale}
          </p>
        ) : null}
      </div>
    </article>
  );
}
