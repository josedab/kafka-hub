"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  evaluate,
  parseProperties,
  type DiagnosticFinding,
  type Severity,
} from "@kafka-hub/kafka-diagnose";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export interface Props {
  /** The literal .properties config text to analyze. */
  config: string;
  /** Optional: only show findings whose ruleId is in this list. */
  onlyRules?: string[];
  /** Optional: caption above the config block, e.g. "Producer config" */
  caption?: string;
}

interface DiagnosisState {
  parsedKeys: number;
  findings: DiagnosticFinding[];
  error?: string;
}

const severityMeta: Record<
  Severity,
  {
    label: string;
    tone: "danger" | "warning" | "info";
    border: string;
    dot: string;
  }
> = {
  danger: {
    label: "Danger",
    tone: "danger",
    border: "border-red-500/30",
    dot: "bg-red-500",
  },
  warning: {
    label: "Warning",
    tone: "warning",
    border: "border-amber-500/30",
    dot: "bg-amber-500",
  },
  info: {
    label: "Info",
    tone: "info",
    border: "border-sky-500/30",
    dot: "bg-sky-500",
  },
};

export function DiagnoseSnippet({ config, onlyRules, caption }: Props) {
  const [diagnosis, setDiagnosis] = useState<DiagnosisState | null>(null);
  const onlyRulesKey = onlyRules?.join("\u0000");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDiagnosis(analyzeConfig(config, onlyRulesKey));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [config, onlyRulesKey]);

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-sm">
      {caption ? (
        <figcaption className="bg-fd-muted/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}

      <pre
        className={cn(
          "m-0 overflow-x-auto bg-fd-background px-4 py-3 font-mono text-[13px] leading-relaxed text-fd-foreground",
          caption && "border-t border-fd-border",
        )}
      ><code className="language-properties">{config}</code></pre>

      <div className="border-t border-fd-border bg-fd-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-fd-muted-foreground">
            Diagnose says:
          </h3>
          {diagnosis ? (
            <span className="font-mono text-[11px] text-fd-muted-foreground">
              {diagnosis.parsedKeys} parsed keys
            </span>
          ) : (
            <span className="font-mono text-[11px] text-fd-muted-foreground">
              analyzing in browser…
            </span>
          )}
        </div>

        <DiagnosisResult diagnosis={diagnosis} />
      </div>
    </figure>
  );
}

function analyzeConfig(config: string, onlyRulesKey: string | undefined): DiagnosisState {
  try {
    const parsedConfig = parseProperties(config);
    const report = evaluate(config);
    const ruleFilter =
      onlyRulesKey === undefined
        ? null
        : new Set(onlyRulesKey === "" ? [] : onlyRulesKey.split("\u0000"));

    return {
      parsedKeys: Object.keys(parsedConfig).length,
      findings: ruleFilter
        ? report.findings.filter((finding) => ruleFilter.has(finding.ruleId))
        : report.findings,
    };
  } catch (err) {
    return {
      parsedKeys: 0,
      findings: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function DiagnosisResult({ diagnosis }: { diagnosis: DiagnosisState | null }) {
  if (!diagnosis) {
    return (
      <div className="rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm text-fd-muted-foreground">
        Running the static rule engine client-side…
      </div>
    );
  }

  if (diagnosis.error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        Unable to analyze config: {diagnosis.error}
      </div>
    );
  }

  if (diagnosis.findings.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        ✓ No issues found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {diagnosis.findings.map((finding) => (
        <FindingCard key={finding.ruleId} finding={finding} />
      ))}
    </div>
  );
}

function FindingCard({ finding: f }: { finding: DiagnosticFinding }) {
  const meta = severityMeta[f.severity];

  return (
    <article
      className={cn(
        "rounded-xl border bg-fd-background p-3 shadow-sm",
        meta.border,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-1.5 size-2 flex-none rounded-full", meta.dot)}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-snug text-fd-foreground">
              {f.title}
            </h4>
            <div className="flex flex-none gap-1.5">
              <Badge tone="neutral">{f.category}</Badge>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
          </div>

          <p
            className="mt-1 truncate text-sm text-fd-muted-foreground"
            title={f.detail}
          >
            {f.detail}
          </p>

          {f.fix ? <FindingFix fix={f.fix} /> : null}

          <Link
            href={`/diagnose/rules/${f.ruleId}`}
            className="mt-2 inline-flex font-mono text-xs text-fd-muted-foreground underline-offset-4 hover:text-fd-foreground hover:underline"
          >
            Full rule context →
          </Link>
        </div>
      </div>
    </article>
  );
}

function prefixDiffLine(prefix: "-" | "+", value: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix} ${line}`)
    .join("\n");
}

function FindingFix({ fix }: { fix: NonNullable<DiagnosticFinding["fix"]> }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-fd-border bg-fd-card">
      <div className="border-b border-fd-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
        Suggested fix
      </div>
      <div className="font-mono text-xs leading-relaxed">
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap bg-red-500/5 px-3 py-2 text-red-700 dark:text-red-300"><code>{prefixDiffLine("-", fix.before)}</code></pre>
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap border-t border-fd-border bg-emerald-500/5 px-3 py-2 text-emerald-700 dark:text-emerald-300"><code>{prefixDiffLine("+", fix.after)}</code></pre>
      </div>
    </div>
  );
}
