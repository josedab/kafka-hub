import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { WORKBENCH_TOOLS } from "@/lib/workbench-registry";

export const metadata: Metadata = {
  title: "Workbench",
  description:
    "Interactive triage and analysis tools for Kafka incidents. Paste evidence, get structured hypotheses. No live cluster connection.",
};

export default function WorkbenchIndexPage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Workbench
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Interactive triage and analysis tools. Paste evidence, get
            structured hypotheses. Everything runs locally — no live cluster,
            no account, no network.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WORKBENCH_TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={`/workbench/${tool.slug}`}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-foreground/30"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  /workbench/{tool.slug}
                </span>
                <ArrowRight
                  className="size-4 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fd-foreground"
                  aria-hidden
                />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">{tool.title}</h2>
              <p className="text-sm text-fd-muted-foreground">{tool.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
