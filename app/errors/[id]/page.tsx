import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Wrench } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { errors, type ErrorEntry } from "@/lib/errors-data";

const whereTone: Record<
  ErrorEntry["where"],
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  broker: "info",
  producer: "neutral",
  consumer: "success",
  admin: "warning",
  transactions: "danger",
  security: "warning",
};

type Params = { id: string };

function findError(id: string) {
  return errors.find((entry) => entry.id === id);
}

export function generateStaticParams() {
  return errors.map((entry) => ({ id: entry.id }));
}

export async function generateMetadata(props: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const entry = findError(id);
  if (!entry) return {};

  return {
    title: entry.name,
    description: entry.summary,
  };
}

export default async function ErrorDetailPage(props: { params: Promise<Params> }) {
  const { id } = await props.params;
  const entry = findError(id);
  if (!entry) notFound();

  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <Link
            href="/errors"
            className="inline-flex items-center gap-2 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to catalog
          </Link>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /errors/{entry.id}
          </p>
          <h1 className="mt-2 break-words font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
            {entry.name}
          </h1>
          <p className="mt-3 max-w-3xl text-fd-muted-foreground">
            {entry.summary}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone={whereTone[entry.where]}>{entry.where}</Badge>
            <Badge tone={entry.retriable ? "success" : "warning"}>
              {entry.retriable ? "retriable" : "not retriable"}
            </Badge>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="rounded-2xl border border-fd-border bg-fd-card p-6">
          {entry.fqcn ? (
            <div className="mb-6 rounded-xl border border-fd-border bg-fd-background/60 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fd-muted-foreground">
                Fully qualified class
              </p>
              <p className="mt-2 break-all font-mono text-sm">{entry.fqcn}</p>
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="text-xl font-semibold tracking-tight">Cause</h2>
              <p className="mt-3 leading-relaxed text-fd-muted-foreground">
                {entry.cause}
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold tracking-tight">Fix</h2>
              <p className="mt-3 leading-relaxed text-fd-muted-foreground">
                {entry.fix}
              </p>
            </section>
          </div>
        </article>

        <aside className="h-fit rounded-2xl border border-fd-border bg-fd-card p-5">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground">
            Cross-links
          </h2>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            {entry.learnSlug ? (
              <Link
                href={`/learn/${entry.learnSlug}`}
                className="inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-2 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
              >
                <BookOpen className="size-4" aria-hidden /> Learn article
              </Link>
            ) : null}
            {entry.runbookSlug ? (
              <Link
                href={`/runbooks/${entry.runbookSlug}`}
                className="inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-2 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
              >
                <Wrench className="size-4" aria-hidden /> Runbook
              </Link>
            ) : null}
            {!entry.learnSlug && !entry.runbookSlug ? (
              <p className="text-sm leading-relaxed text-fd-muted-foreground">
                No local Learn or runbook page is linked for this exception yet.
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </SiteShell>
  );
}
