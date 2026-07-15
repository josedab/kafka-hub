"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, BookOpen, ChevronDown, ExternalLink, Play, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { kips, type KipEntry } from "@/lib/kips-data";

type SortMode = "number" | "version";

const statusTone: Record<
  KipEntry["status"],
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  adopted: "success",
  draft: "neutral",
  wip: "warning",
  rejected: "danger",
};

// Derive available status filters from actual data — don't show empty categories
const availableStatuses = Array.from(new Set(kips.map((k) => k.status)));
const statusFilters: Array<KipEntry["status"] | "all"> = ["all", ...availableStatuses];

function versionKey(version: string | undefined) {
  if (!version) return -1;
  const [major = 0, minor = 0, patch = 0] =
    version.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
  return major * 1_000_000 + minor * 1_000 + patch;
}

function labelForStatus(value: KipEntry["status"] | "all") {
  return value === "all" ? "All" : value;
}

export function KipsFilterClient() {
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<KipEntry["status"] | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("number");

  const visibleKips = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return kips
      .filter((entry) => {
        const haystack = [
          `kip-${entry.id}`,
          entry.title,
          entry.plainSummary,
          entry.why,
          entry.versionShipped ?? "",
        ]
          .join(" ")
          .toLowerCase();
        const matchesQuery = normalized ? haystack.includes(normalized) : true;
        const matchesStatus = activeStatus === "all" || entry.status === activeStatus;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => {
        if (sortMode === "version") {
          const byVersion = versionKey(b.versionShipped) - versionKey(a.versionShipped);
          return byVersion || b.id - a.id;
        }
        return a.id - b.id;
      });
  }, [activeStatus, query, sortMode]);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="rounded-2xl border border-fd-border bg-fd-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block flex-1">
            <span className="sr-only">Search KIPs</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fd-muted-foreground"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, KIP number, version, or summary"
              className="h-11 w-full rounded-lg border border-fd-border bg-fd-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-fd-muted-foreground focus:border-fd-foreground/40 focus:ring-2 focus:ring-fd-ring"
            />
          </label>
          <p className="font-mono text-xs text-fd-muted-foreground">
            {visibleKips.length} / {kips.length} KIPs
          </p>
        </div>

        {statusFilters.length > 2 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {statusFilters.map((status) => (
              <Button
                key={status}
                variant={activeStatus === status ? "primary" : "secondary"}
                size="sm"
                onClick={() => setActiveStatus(status)}
                aria-pressed={activeStatus === status}
                className="min-h-[44px] capitalize"
              >
                {labelForStatus(status)}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-fd-border pt-4">
          <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground">
            <ArrowUpDown className="size-4" aria-hidden /> Sort
          </span>
          <Button
            variant={sortMode === "number" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setSortMode("number")}
            aria-pressed={sortMode === "number"}
            className="min-h-[44px]"
          >
            KIP number
          </Button>
          <Button
            variant={sortMode === "version" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setSortMode("version")}
            aria-pressed={sortMode === "version"}
            className="min-h-[44px]"
          >
            Version shipped
          </Button>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-fd-border overflow-hidden rounded-2xl border border-fd-border bg-fd-card">
        {visibleKips.map((entry) => (
          <li
            key={entry.id}
            id={`kip-${entry.id}`}
            className="scroll-mt-20 p-5 transition-colors hover:bg-fd-muted/30"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">KIP-{entry.id}</Badge>
                  <Badge tone={statusTone[entry.status]}>{entry.status}</Badge>
                  <Badge tone="neutral">
                    {entry.versionShipped ? `shipped ${entry.versionShipped}` : "version TBD"}
                  </Badge>
                </div>
                <h2 className="text-xl font-semibold leading-snug tracking-tight">
                  {entry.title}
                </h2>
                <p className="max-w-3xl text-sm leading-relaxed text-fd-muted-foreground">
                  {entry.plainSummary}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 text-sm">
                {entry.learnSlug ? (
                  <Link
                    href={`/learn/${entry.learnSlug}`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-fd-border px-3 py-1.5 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <BookOpen className="size-4" aria-hidden /> Learn
                  </Link>
                ) : null}
                {entry.scenarioSlug ? (
                  <Link
                    href={`/simulate?scenario=${entry.scenarioSlug}`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-fd-border px-3 py-1.5 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                  >
                    <Play className="size-4" aria-hidden /> Simulate
                  </Link>
                ) : null}
                <a
                  href={entry.kipUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-fd-border px-3 py-1.5 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
                >
                  Apache wiki <ExternalLink className="size-4" aria-hidden />
                </a>
              </div>
            </div>

            <details className="mt-4 rounded-xl border border-fd-border bg-fd-background/60 p-4 group/details">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring rounded-md px-1">
                Why this KIP matters
                <ChevronDown
                  className="size-4 transition-transform group-open/details:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-fd-muted-foreground">
                {entry.why}
              </p>
            </details>
          </li>
        ))}
      </ul>

      {visibleKips.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-fd-border p-10 text-center">
          <p className="font-mono text-sm text-fd-muted-foreground">
            No KIPs matched this query.
          </p>
        </div>
      ) : null}
    </section>
  );
}
