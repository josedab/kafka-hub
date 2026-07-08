import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { runbookSource } from "@/lib/source";

const runbooksDescription =
  "Five-minute Kafka incident playbooks for the symptoms that page senior engineers.";

type Params = { slug?: string[] };

type RunbookPage = ReturnType<typeof runbookSource.getPages>[number];

function runbookDate(page: RunbookPage) {
  return page.data.date ? new Date(page.data.date) : new Date(0);
}

function getRunbooks() {
  return runbookSource
    .getPages()
    .filter((page) => page.slugs.length > 0)
    .sort((a, b) => runbookDate(b).getTime() - runbookDate(a).getTime());
}

function RunbooksIndex() {
  const pages = getRunbooks();

  return (
    <DocsPage toc={[]} full={false}>
      <DocsTitle>Runbooks</DocsTitle>
      <DocsDescription>{runbooksDescription}</DocsDescription>
      <DocsBody>
        <p>
          Start here when production is already noisy. Each runbook is ordered
          for the first five minutes: confirm the blast radius, isolate the
          likely failure mode, and apply the smallest safe fix.
        </p>
        <div className="not-prose mt-8 grid gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <Link
              key={page.url}
              href={page.url}
              className="group flex h-full flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-foreground/30"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fd-muted-foreground">
                /runbooks/{page.slugs.join("/")}
              </span>
              <h2 className="text-lg font-semibold leading-snug tracking-tight text-fd-foreground">
                {page.data.title}
              </h2>
              {page.data.description ? (
                <p className="text-sm leading-relaxed text-fd-muted-foreground">
                  {page.data.description}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      </DocsBody>
    </DocsPage>
  );
}

export default async function Page(props: { params: Promise<Params> }) {
  const params = await props.params;
  if (!params.slug?.length) return <RunbooksIndex />;

  const page = runbookSource.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return [{ slug: [] }, ...runbookSource.generateParams()];
}

export async function generateMetadata(props: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const params = await props.params;
  if (!params.slug?.length) {
    return {
      title: "Runbooks",
      description: runbooksDescription,
    };
  }

  const page = runbookSource.getPage(params.slug);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
