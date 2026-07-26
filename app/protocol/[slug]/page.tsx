import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, FlaskConical, ScrollText, Wrench } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { ProtocolLabPlayer } from "@/components/protocol/protocol-lab-player";
import { PROTOCOL_LABS, REVIEWED_AGAINST_TEXT, findProtocolLab } from "@/lib/protocol-lab";
import { errors } from "@/lib/errors-data";
import { kips } from "@/lib/kips-data";
import { SCENARIO_LIST } from "@kafka-hub/kafka-sim";

type Params = { slug: string };

export function generateStaticParams() {
  return PROTOCOL_LABS.map((lab) => ({ slug: lab.slug }));
}

export async function generateMetadata(props: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const lab = findProtocolLab(slug);
  if (!lab) return {};

  return {
    title: `${lab.title} — Protocol Lab`,
    description: lab.blurb,
  };
}

export default async function ProtocolLabDetailPage(props: { params: Promise<Params> }) {
  const { slug } = await props.params;
  const lab = findProtocolLab(slug);
  if (!lab) notFound();

  const learnLinks = (lab.links.learnSlugs ?? []).map((s) => ({ slug: s, href: `/learn/${s}` }));
  const errorLinks = (lab.links.errorIds ?? [])
    .map((id) => errors.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const kipLinks = (lab.links.kipIds ?? [])
    .map((id) => kips.find((k) => k.id === id))
    .filter((k): k is NonNullable<typeof k> => Boolean(k));
  const scenarioLinks = (lab.links.scenarioSlugs ?? [])
    .map((s) => SCENARIO_LIST.find((entry) => entry.slug === s))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const runbookLinks = lab.links.runbookSlugs ?? [];

  const hasCrossLinks =
    learnLinks.length > 0 || errorLinks.length > 0 || kipLinks.length > 0 || scenarioLinks.length > 0 || runbookLinks.length > 0;

  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <Link
            href="/protocol"
            className="inline-flex items-center gap-2 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to Protocol Lab
          </Link>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /protocol/{lab.slug}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{lab.title}</h1>
          <p className="mt-3 max-w-3xl text-fd-muted-foreground">{lab.blurb}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{REVIEWED_AGAINST_TEXT}</Badge>
            {lab.focusAreas.map((area) => (
              <Badge key={area} tone="info">
                {area}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <ProtocolLabPlayer lab={lab} />
        </div>

        <aside className="h-fit space-y-4">
          {hasCrossLinks ? (
            <div className="rounded-2xl border border-fd-border bg-fd-card p-5">
              <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground">
                Cross-links
              </h2>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                {learnLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-2 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <BookOpen className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">Learn: {link.slug.replaceAll("-", " ")}</span>
                  </Link>
                ))}
                {errorLinks.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/errors/${entry.id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-2 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <ScrollText className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{entry.name}</span>
                  </Link>
                ))}
                {kipLinks.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/kips#kip-${entry.id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-2 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <FlaskConical className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">KIP-{entry.id}: {entry.title}</span>
                  </Link>
                ))}
                {scenarioLinks.map((entry) => (
                  <Link
                    key={entry.slug}
                    href={`/simulate?scenario=${entry.slug}`}
                    className="inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-2 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <FlaskConical className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">Simulate: {entry.title}</span>
                  </Link>
                ))}
                {runbookLinks.map((slug) => (
                  <Link
                    key={slug}
                    href={`/runbooks/${slug}`}
                    className="inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-2 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <Wrench className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">Runbook: {slug.replaceAll("-", " ")}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-fd-border bg-fd-card p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground">
              About this lab
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
              Every step is precomputed and deterministic — the same scenario always
              plays back identically. Nothing here connects to a live broker.
            </p>
          </div>
        </aside>
      </section>
    </SiteShell>
  );
}
