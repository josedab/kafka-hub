import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { site } from "@/lib/site";
import { source } from "@/lib/source";
import { surfaceCountLabel, getProjectVersion } from "@/lib/project-stats";

const surfaceAccent: Record<string, string> = {
  learn: "from-emerald-500/15 to-emerald-500/0",
  diagnose: "from-amber-500/15 to-amber-500/0",
  simulate: "from-sky-500/15 to-sky-500/0",
  runbooks: "from-rose-500/15 to-rose-500/0",
  errors: "from-orange-500/15 to-orange-500/0",
  kips: "from-cyan-500/15 to-cyan-500/0",
  workbench: "from-violet-500/15 to-violet-500/0",
};

function articleDate(page: { data: { date?: string } }) {
  return page.data.date ? new Date(page.data.date) : new Date(0);
}

export default function HomePage() {
  const articles = source
    .getPages()
    .filter((p) => p.slugs.length > 0)
    .sort((a, b) => articleDate(b).getTime() - articleDate(a).getTime())
    .slice(0, 6);

  const version = getProjectVersion();

  return (
    <SiteShell>
      <section className="relative overflow-hidden border-b border-fd-border">
        <div aria-hidden className="absolute inset-0 -z-10 surface-grid" />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-20 sm:py-28">
          <div className="flex max-w-3xl flex-col gap-6">
            <Badge tone="info" className="self-start">
              open source · v{version}
            </Badge>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              The Kafka resource you wish existed when you broke production.
            </h1>
            <p className="text-balance text-lg leading-relaxed text-fd-muted-foreground">
              Interactive articles on the internals that matter. A configuration
              diagnostic that actually catches the footguns. Incident runbooks
              for the first five minutes. A deterministic in-browser broker so
              you can build intuition without a cluster.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/learn"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-fd-foreground px-5 text-sm font-medium text-fd-background transition-colors hover:bg-fd-foreground/90"
              >
                Start with ISR &amp; acks
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/diagnose"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-fd-border px-5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
              >
                Diagnose a config
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
          {surfaceCountLabel()}
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {site.surfaces.map((s) => (
            <Link
              key={s.slug}
              href={s.href}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-foreground/30"
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br ${surfaceAccent[s.slug] ?? ""} opacity-0 transition-opacity group-hover:opacity-100`}
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  /{s.slug}
                </span>
                <ArrowRight
                  className="size-4 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fd-foreground"
                  aria-hidden
                />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="text-sm text-fd-muted-foreground">{s.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-fd-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
              Latest articles
            </h2>
            <div className="flex items-center gap-4 text-xs">
              <Link
                href="/learn"
                className="font-medium text-fd-foreground hover:underline"
              >
                All articles →
              </Link>
              <Link
                href="/rss.xml"
                className="font-mono text-fd-muted-foreground hover:text-fd-foreground"
              >
                RSS
              </Link>
            </div>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {articles.map((page) => {
              const date = page.data.date
                ? new Date(page.data.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : null;
              return (
                <li key={page.url}>
                  <Link
                    href={page.url}
                    className="group flex h-full flex-col gap-2 rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-foreground/30"
                  >
                    <div className="flex items-center justify-between text-[11px] text-fd-muted-foreground">
                      <span className="font-mono uppercase tracking-wider">
                        learn
                      </span>
                      {date ? <time>{date}</time> : null}
                    </div>
                    <h3 className="text-base font-semibold leading-snug tracking-tight group-hover:text-fd-foreground">
                      {page.data.title}
                    </h3>
                    {page.data.description ? (
                      <p className="line-clamp-2 text-sm text-fd-muted-foreground">
                        {page.data.description}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="border-t border-fd-border bg-fd-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              Why this exists
            </h2>
            <p className="text-fd-muted-foreground leading-relaxed">
              Most Kafka content on the public web is static blog posts, vendor
              marketing, or Stack Overflow threads. None of it lets you
              manipulate a partition assignment, an ISR set, or a rebalance to
              build intuition. None of it triages your config in under a minute.
              None of it lets you simulate a controller failure without a real
              cluster. That&apos;s the gap this site closes.
            </p>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              What it is not
            </h2>
            <ul className="space-y-2 text-fd-muted-foreground">
              <li className="flex gap-3">
                <span aria-hidden className="font-mono text-fd-foreground/60">
                  ·
                </span>
                Not a monitoring product. No live cluster connections, no
                agents, no metrics scraping.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="font-mono text-fd-foreground/60">
                  ·
                </span>
                Not a replacement for Confluent Cloud, Redpanda Console, or
                Kafka UI.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="font-mono text-fd-foreground/60">
                  ·
                </span>
                Not a SaaS. No accounts, no billing, no telemetry beyond
                anonymous page views.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
