import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, BookOpen, FlaskConical } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { cheatsheets, type Cheatsheet } from "@/lib/cheatsheet-data";
import { PrintButton } from "./print-button";

type Params = { slug: string };

export const dynamicParams = false;

function findCheatsheet(slug: string) {
  return cheatsheets.find((sheet) => sheet.slug === slug);
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-fd-border pb-3">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-fd-muted-foreground">
          {kicker}
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      </div>
    </div>
  );
}

function KeySettingsTable({ sheet }: { sheet: Cheatsheet }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-fd-border bg-fd-card shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-fd-border bg-fd-muted/50 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            <th scope="col" className="w-[34%] px-4 py-3 font-semibold">
              Key / typical
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.keySettings.map((setting) => (
            <tr key={setting.key} className="border-b border-fd-border last:border-0">
              <th scope="row" className="align-top px-4 py-3 text-left">
                <code className="font-mono text-[13px] font-semibold text-fd-foreground">
                  {setting.key}
                </code>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-fd-muted-foreground">
                  {setting.typicalValue}
                </p>
              </th>
              <td className="px-4 py-3 align-top leading-relaxed text-fd-muted-foreground">
                <p>{setting.note}</p>
                {setting.dangerIfWrong ? (
                  <p className="mt-2 border-l-2 border-amber-500/60 pl-3 text-fd-foreground">
                    <span className="font-semibold">If wrong:</span>{" "}
                    {setting.dangerIfWrong}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelatedLinks({ sheet }: { sheet: Cheatsheet }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Link
        href={`/learn/${sheet.slug}`}
        className="group rounded-2xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-foreground/30"
      >
        <div className="flex items-center justify-between gap-3">
          <Badge tone="info">Article</Badge>
          <BookOpen className="size-4 text-fd-muted-foreground group-hover:text-fd-foreground" aria-hidden />
        </div>
        <p className="mt-3 text-sm font-medium">Read the full article</p>
        <p className="mt-1 font-mono text-[11px] text-fd-muted-foreground">
          /learn/{sheet.slug}
        </p>
      </Link>

      {sheet.relatedRules.map((ruleId) => (
        <Link
          key={ruleId}
          href={`/diagnose/rules/${ruleId}`}
          className="group rounded-2xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-foreground/30"
        >
          <div className="flex items-center justify-between gap-3">
            <Badge tone="warning">Rule</Badge>
            <ArrowRight className="size-4 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fd-foreground" aria-hidden />
          </div>
          <p className="mt-3 break-words font-mono text-sm font-semibold">
            {ruleId}
          </p>
        </Link>
      ))}

      {sheet.relatedScenarios?.map((scenario) => (
        <Link
          key={scenario}
          href={`/simulate?scenario=${scenario}`}
          className="group rounded-2xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-foreground/30"
        >
          <div className="flex items-center justify-between gap-3">
            <Badge tone="success">Scenario</Badge>
            <FlaskConical className="size-4 text-fd-muted-foreground group-hover:text-fd-foreground" aria-hidden />
          </div>
          <p className="mt-3 break-words font-mono text-sm font-semibold">
            {scenario}
          </p>
        </Link>
      ))}
    </div>
  );
}

export function generateStaticParams() {
  return cheatsheets.map((sheet) => ({ slug: sheet.slug }));
}

export async function generateMetadata(props: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const sheet = findCheatsheet(slug);

  if (!sheet) return { title: "Cheatsheet" };

  return {
    title: `Cheatsheet: ${sheet.title}`,
    description: sheet.oneliner,
  };
}

export default async function CheatsheetPage(props: { params: Promise<Params> }) {
  const { slug } = await props.params;
  const sheet = findCheatsheet(slug);
  if (!sheet) notFound();

  return (
    <SiteShell>
      <article className="cheatsheet-print-target relative overflow-hidden bg-fd-background">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 surface-grid opacity-40" />

        <header className="border-b border-fd-border bg-fd-muted/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-fd-muted-foreground">
                  /learn/cheatsheet
                </p>
                <h1 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  {sheet.title} Cheatsheet
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-relaxed text-fd-muted-foreground sm:text-lg">
                  {sheet.oneliner}
                </p>
              </div>
              <PrintButton />
            </div>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-6xl gap-7 px-6 py-8">
          <section className="space-y-4">
            <SectionHeading kicker="01" title="Key settings" />
            <KeySettingsTable sheet={sheet} />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-fd-border bg-fd-card p-5 shadow-sm">
              <SectionHeading kicker="02" title="Heuristics" />
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-fd-muted-foreground">
                {sheet.heuristics.map((heuristic) => (
                  <li key={heuristic} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    <span>{heuristic}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-sm">
              <SectionHeading kicker="03" title="Dangers" />
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-fd-muted-foreground">
                {sheet.dangerList.map((danger) => (
                  <li key={danger} className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                    <span>{danger}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeading kicker="04" title="Related" />
            <RelatedLinks sheet={sheet} />
          </section>

          <footer className="border-t border-fd-border pt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-fd-muted-foreground">
            Generated from kafka-hub.dev/learn/{sheet.slug}
          </footer>
        </div>
      </article>
    </SiteShell>
  );
}
