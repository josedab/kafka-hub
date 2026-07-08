"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ExternalLink, Search, Wrench } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errors, type ErrorEntry } from "@/lib/errors-data";

const whereFilters: Array<ErrorEntry["where"] | "all"> = [
  "all",
  "broker",
  "producer",
  "consumer",
  "admin",
  "transactions",
  "security",
];

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

function labelForWhere(value: ErrorEntry["where"] | "all") {
  return value === "all" ? "All" : value;
}

export default function ErrorsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [activeWhere, setActiveWhere] = useState<ErrorEntry["where"] | "all">(
    "all",
  );

  useEffect(() => {
    const readQuery = () => {
      setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    };
    const timer = window.setTimeout(readQuery, 0);
    window.addEventListener("popstate", readQuery);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", readQuery);
    };
  }, []);

  function updateQuery(value: string) {
    setQuery(value);

    const params = new URLSearchParams(window.location.search);
    const trimmed = value.trim();
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  const visibleErrors = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return errors.filter((entry) => {
      const matchesQuery = normalized
        ? entry.name.toLowerCase().includes(normalized)
        : true;
      const matchesWhere = activeWhere === "all" || entry.where === activeWhere;

      return matchesQuery && matchesWhere;
    });
  }, [activeWhere, query]);

  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /errors
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Kafka exception catalog
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            A searchable field guide to the Kafka exceptions senior engineers see
            during produce, consume, admin, security, and transaction incidents.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-fd-border bg-fd-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block flex-1">
              <span className="sr-only">Search exception name</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fd-muted-foreground"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Search by exception name, e.g. offset"
                className="h-11 w-full rounded-lg border border-fd-border bg-fd-background pl-9 pr-3 font-mono text-sm outline-none transition-colors placeholder:text-fd-muted-foreground focus:border-fd-foreground/40 focus:ring-2 focus:ring-fd-ring"
              />
            </label>
            <p className="font-mono text-xs text-fd-muted-foreground">
              {visibleErrors.length} / {errors.length} exceptions
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {whereFilters.map((where) => (
              <Button
                key={where}
                variant={activeWhere === where ? "primary" : "secondary"}
                size="sm"
                onClick={() => setActiveWhere(where)}
                aria-pressed={activeWhere === where}
                className="capitalize"
              >
                {labelForWhere(where)}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {visibleErrors.map((entry) => (
            <article
              key={entry.id}
              className="group rounded-2xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-foreground/30"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <Link
                    href={`/errors/${entry.id}`}
                    className="inline-flex items-center gap-2 font-mono text-lg font-semibold tracking-tight underline-offset-4 hover:underline"
                  >
                    {entry.name}
                    <ExternalLink className="size-4 text-fd-muted-foreground" aria-hidden />
                  </Link>
                  {entry.fqcn ? (
                    <p className="break-all font-mono text-xs text-fd-muted-foreground">
                      {entry.fqcn}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={whereTone[entry.where]}>{entry.where}</Badge>
                  <Badge tone={entry.retriable ? "success" : "warning"}>
                    {entry.retriable ? "retriable" : "not retriable"}
                  </Badge>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-fd-muted-foreground">
                {entry.summary}
              </p>

              <details className="mt-4 rounded-xl border border-fd-border bg-fd-background/60 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground">
                  Cause / Fix
                  <ChevronDown
                    className="size-4 transition-transform details-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Cause</h2>
                    <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                      {entry.cause}
                    </p>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Fix</h2>
                    <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                      {entry.fix}
                    </p>
                  </div>
                </div>
              </details>

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {entry.learnSlug ? (
                  <Link
                    href={`/learn/${entry.learnSlug}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-3 py-1.5 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <BookOpen className="size-4" aria-hidden /> Learn
                  </Link>
                ) : null}
                {entry.runbookSlug ? (
                  <Link
                    href={`/runbooks/${entry.runbookSlug}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-3 py-1.5 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <Wrench className="size-4" aria-hidden /> Runbook
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        {visibleErrors.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-fd-border p-10 text-center">
            <p className="font-mono text-sm text-fd-muted-foreground">
              No exceptions matched this query.
            </p>
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}
