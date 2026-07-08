import Link from "next/link";
import { SearchTrigger } from "fumadocs-ui/layouts/shared/slots/search-trigger";
import { SiteShell } from "@/components/site-shell";
import { source } from "@/lib/source";

function articleDate(page: { data: { date?: string } }) {
  return page.data.date ? new Date(page.data.date) : new Date(0);
}

function formatArticleDate(date: string | undefined) {
  if (!date) return null;

  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function NotFound() {
  const articles = source
    .getPages()
    .filter((p) => p.slugs.length > 0)
    .sort((a, b) => articleDate(b).getTime() - articleDate(a).getTime())
    .slice(0, 3);

  return (
    <SiteShell>
      <section className="relative overflow-hidden border-b border-fd-border">
        <div aria-hidden className="absolute inset-0 -z-10 surface-grid" />
        <div className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16 sm:py-24">
          <div className="rounded-2xl border border-fd-border bg-fd-card/85 p-6 shadow-sm backdrop-blur sm:p-8">
            <p className="font-mono text-6xl font-semibold leading-none tracking-tighter text-fd-foreground sm:text-7xl">
              404
            </p>
            <div className="mt-6 space-y-4">
              <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Lost in the broker topology?
              </h1>
              <p className="text-balance leading-relaxed text-fd-muted-foreground">
                The URL you requested does not match a page in Kafka Hub. Search
                the docs, return home, or browse the article index to get back on
                a known partition.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <SearchTrigger
                hideIfDisabled
                className="h-11 gap-2 rounded-md bg-fd-foreground px-5 text-sm font-medium text-fd-background transition-colors after:content-['Open_search'] hover:bg-fd-foreground/90 [&_svg]:size-4"
              />
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-md border border-fd-border px-5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
              >
                Back home
              </Link>
              <Link
                href="/learn"
                className="inline-flex h-11 items-center justify-center rounded-md border border-fd-border px-5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
              >
                All articles
              </Link>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
              Popular articles
            </h2>
            <ul className="mt-4 grid gap-3">
              {articles.map((page) => {
                const date = formatArticleDate(page.data.date);

                return (
                  <li key={page.url}>
                    <Link
                      href={page.url}
                      className="group flex h-full flex-col gap-2 rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-foreground/30"
                    >
                      <div className="flex items-center justify-between gap-4 text-[11px] text-fd-muted-foreground">
                        <span className="font-mono uppercase tracking-wider">
                          learn
                        </span>
                        {date ? (
                          <time className="font-mono" dateTime={page.data.date}>
                            {date}
                          </time>
                        ) : null}
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
        </div>
      </section>
    </SiteShell>
  );
}
