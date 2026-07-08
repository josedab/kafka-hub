import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, FlaskConical } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  evaluate,
  rules,
  type DiagnosticFinding,
  type Rule,
  type Severity,
} from "@/lib/diagnostic-rules";
import {
  RULE_METADATA,
  type DiagnosticRuleMetadata,
} from "@/lib/diagnostic-rules-metadata";
import { CopyFixButton } from "./copy-fix-button";

export const dynamicParams = false;

type Params = { id: string };
type BadgeTone = "neutral" | "danger" | "warning" | "info";

const severityTone: Record<Severity, BadgeTone> = {
  danger: "danger",
  warning: "warning",
  info: "info",
};

function titleFromId(id: string) {
  return id.replaceAll("-", " ");
}

function findRule(id: string) {
  return rules.find((rule) => rule.id === id);
}

function metadataFor(rule: Rule): DiagnosticRuleMetadata {
  return (
    RULE_METADATA[rule.id] ?? {
      title: titleFromId(rule.id),
      example: `# ${rule.id}\n# Apply this rule's trigger conditions in a config.\n# Paste the config into Diagnose to verify the finding.\n# See the rule source for exact thresholds.`,
      whyItMatters:
        "This rule captures a Kafka configuration shape that commonly creates operational risk. Trigger it with the relevant broker, topic, producer, or consumer settings to see the exact diagnostic detail and remediation guidance.",
    }
  );
}

function findingTone(finding: DiagnosticFinding | undefined): BadgeTone {
  return finding ? severityTone[finding.severity] : "neutral";
}

function findingLabel(finding: DiagnosticFinding | undefined) {
  return finding ? finding.severity : "varies";
}

function diffRows(before: string, after: string) {
  return [
    ...before.split("\n").map((line) => ({ marker: "-", line, tone: "remove" })),
    ...after.split("\n").map((line) => ({ marker: "+", line, tone: "add" })),
  ];
}

function FindingSummary({ finding }: { finding: DiagnosticFinding }) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-fd-background p-4",
        finding.severity === "danger" && "border-red-500/30",
        finding.severity === "warning" && "border-amber-500/30",
        finding.severity === "info" && "border-sky-500/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{finding.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
            {finding.detail}
          </p>
        </div>
        <Badge tone={severityTone[finding.severity]}>{finding.severity}</Badge>
      </div>
    </article>
  );
}

export function generateStaticParams() {
  return rules.map((rule) => ({ id: rule.id }));
}

export async function generateMetadata(props: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const rule = findRule(id);
  if (!rule) return { title: titleFromId(id) };

  const meta = metadataFor(rule);
  return {
    title: meta.title,
    description: meta.whyItMatters,
  };
}

export default async function RulePage(props: { params: Promise<Params> }) {
  const { id } = await props.params;
  const rule = findRule(id);
  if (!rule) notFound();

  const meta = metadataFor(rule);
  const report = evaluate(meta.example, [rule]);
  const primaryFinding = report.findings[0];
  const fix = primaryFinding?.fix;

  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground"
          >
            <Link href="/diagnose" className="hover:text-fd-foreground">
              Diagnose
            </Link>
            <span aria-hidden>/</span>
            <span>{rule.id}</span>
          </nav>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{rule.category}</Badge>
            <Badge tone={findingTone(primaryFinding)}>
              {findingLabel(primaryFinding)}
            </Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {meta.title}
          </h1>
          <p className="mt-4 max-w-3xl text-fd-muted-foreground">
            Canonical diagnostic rule page for{" "}
            <code className="font-mono text-fd-foreground">{rule.id}</code>.
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-fd-border bg-fd-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
                  What triggers this
                </p>
                <h2 className="mt-1 text-xl font-semibold">Example config</h2>
              </div>
              <Badge tone="neutral">{report.parsedKeys} parsed keys</Badge>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-fd-border bg-fd-background p-4 text-xs leading-relaxed">
              <code>{meta.example}</code>
            </pre>
            <div className="mt-4 space-y-3">
              {report.findings.length > 0 ? (
                report.findings.map((finding, index) => (
                  <FindingSummary
                    key={`${finding.ruleId}-${index}`}
                    finding={finding}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-fd-border bg-fd-background p-4 text-sm text-fd-muted-foreground">
                  The example is illustrative. Paste a config that satisfies this
                  rule&apos;s trigger conditions to see a concrete finding.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-fd-border bg-fd-card p-5 shadow-sm">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
              Why it matters
            </p>
            <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-fd-muted-foreground">
              {meta.whyItMatters.split("\n").map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-fd-border bg-fd-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
                  How to fix
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  Smallest safe change
                </h2>
              </div>
              {fix ? <CopyFixButton value={fix.after} /> : null}
            </div>

            {fix ? (
              <pre className="mt-4 overflow-x-auto rounded-xl border border-fd-border bg-fd-background p-4 text-xs leading-relaxed">
                <code>
                  {diffRows(fix.before, fix.after).map((row) => (
                    <span
                      key={`${row.marker}-${row.line}`}
                      className={cn(
                        "block whitespace-pre",
                        row.tone === "remove" && "text-red-500",
                        row.tone === "add" && "text-emerald-500",
                      )}
                    >
                      {row.marker} {row.line}
                    </span>
                  ))}
                </code>
              </pre>
            ) : (
              <p className="mt-4 rounded-xl border border-fd-border bg-fd-background p-4 text-sm leading-relaxed text-fd-muted-foreground">
                {primaryFinding?.detail ??
                  "Trigger this rule with a concrete config to see targeted remediation guidance."}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Link
            href="/diagnose"
            className="inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-card px-3 py-2 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to Diagnose
          </Link>

          <section className="rounded-2xl border border-fd-border bg-fd-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Learn more</h2>
            <div className="mt-3 space-y-2 text-sm">
              {primaryFinding?.learnSlug ? (
                <Link
                  href={`/learn/${primaryFinding.learnSlug}`}
                  className="flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background px-3 py-2 transition-colors hover:bg-fd-accent"
                >
                  <BookOpen className="size-4" aria-hidden />
                  Learn article
                </Link>
              ) : null}
              {primaryFinding?.simulateSlug ? (
                <Link
                  href={`/simulate?scenario=${encodeURIComponent(
                    primaryFinding.simulateSlug,
                  )}`}
                  className="flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background px-3 py-2 transition-colors hover:bg-fd-accent"
                >
                  <FlaskConical className="size-4" aria-hidden />
                  Simulator scenario
                </Link>
              ) : null}
              {!primaryFinding?.learnSlug && !primaryFinding?.simulateSlug ? (
                <p className="rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-fd-muted-foreground">
                  No companion article or simulator scenario is attached yet.
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </section>
    </SiteShell>
  );
}
