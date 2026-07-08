import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { evaluate, rules, type Category, type Severity } from "@/lib/diagnostic-rules";
import { RULE_METADATA } from "@/lib/diagnostic-rules-metadata";

export const metadata: Metadata = {
  title: "Diagnostic rules",
  description:
    "Canonical reference pages for every Kafka Hub Diagnose rule.",
};

type BadgeTone = "danger" | "warning" | "info" | "neutral";

const categoryOrder: Category[] = [
  "broker",
  "topic",
  "producer",
  "consumer",
  "transactions",
  "security",
  "performance",
];

const severityTone: Record<Severity, BadgeTone> = {
  danger: "danger",
  warning: "warning",
  info: "info",
};

function titleFor(ruleId: string) {
  return RULE_METADATA[ruleId]?.title ?? ruleId.replaceAll("-", " ");
}

function severityFor(ruleId: string) {
  const rule = rules.find((candidate) => candidate.id === ruleId);
  const example = RULE_METADATA[ruleId]?.example;
  if (!rule || !example) return null;
  return evaluate(example, [rule]).findings[0]?.severity ?? null;
}

export default function DiagnosticRulesIndexPage() {
  const grouped = new Map<Category, typeof rules>();
  for (const category of categoryOrder) {
    grouped.set(
      category,
      rules.filter((rule) => rule.category === category),
    );
  }

  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /diagnose/rules
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Diagnostic rulebook
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Every static Kafka configuration rule has a canonical URL, trigger
            example, remediation guidance, and links back to related Learn or
            Simulator content.
          </p>
          <Link
            href="/diagnose"
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-card px-3 py-2 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to Diagnose
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="space-y-8">
          {categoryOrder.map((category) => {
            const categoryRules = grouped.get(category) ?? [];
            if (categoryRules.length === 0) return null;

            return (
              <section key={category} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold capitalize">
                    {category}
                  </h2>
                  <Badge tone="neutral">{categoryRules.length} rules</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {categoryRules.map((rule) => {
                    const severity = severityFor(rule.id);
                    return (
                      <Link
                        key={rule.id}
                        href={`/diagnose/rules/${rule.id}`}
                        className="group rounded-2xl border border-fd-border bg-fd-card p-4 shadow-sm transition-colors hover:border-fd-foreground/40 hover:bg-fd-accent/40"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{rule.id}</Badge>
                          {severity ? (
                            <Badge tone={severityTone[severity]}>{severity}</Badge>
                          ) : (
                            <Badge tone="neutral">varies</Badge>
                          )}
                        </div>
                        <h3 className="mt-3 text-sm font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">
                          {titleFor(rule.id)}
                        </h3>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </SiteShell>
  );
}
