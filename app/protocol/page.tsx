import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { PROTOCOL_LABS, REVIEWED_AGAINST_TEXT } from "@/lib/protocol-lab";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { serializeJsonLd } from "@/lib/json-ld";

export const metadata: Metadata = {
  title: "Protocol Lab",
  description:
    "Curated, deterministic walkthroughs of the Kafka wire protocol: Produce, Consumer Group rebalancing, Share Groups (KIP-932), Transactions, and Replication/Failover. Sequence and Wire modes. No live brokers.",
};

function ProtocolLabJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Kafka Protocol Lab",
    description: "Deterministic, curated walkthroughs of Kafka wire protocol exchanges.",
    numberOfItems: PROTOCOL_LABS.length,
    itemListElement: PROTOCOL_LABS.map((lab, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: lab.title,
      url: `${CANONICAL_ORIGIN}/protocol/${lab.slug}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

export default function ProtocolLabIndexPage() {
  return (
    <SiteShell>
      <ProtocolLabJsonLd />
      <section className="relative overflow-hidden border-b border-fd-border">
        <div aria-hidden className="absolute inset-0 -z-10 surface-grid" />
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /protocol
          </p>
          <h1 className="mt-2 flex items-center gap-2.5 text-3xl font-semibold tracking-tight sm:text-4xl">
            <Radio className="size-7 text-fd-muted-foreground" aria-hidden />
            Protocol Lab
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Curated, deterministic walkthroughs of the Kafka wire protocol. Step through
            an intuitive actor sequence, or flip to decoded request/response frames with
            API keys, correlation IDs, and framed hex bytes. Fixed scenarios, no live
            brokers, no accounts.
          </p>
          <div className="mt-5">
            <Badge tone="neutral">{REVIEWED_AGAINST_TEXT}</Badge>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROTOCOL_LABS.map((lab) => (
            <Link
              key={lab.slug}
              href={`/protocol/${lab.slug}`}
              className="group flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-foreground/30"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  /protocol/{lab.slug}
                </span>
                <ArrowRight
                  className="size-4 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fd-foreground"
                  aria-hidden
                />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">{lab.title}</h2>
              <p className="text-sm text-fd-muted-foreground">{lab.tagline}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {lab.focusAreas.slice(0, 4).map((area) => (
                  <span
                    key={area}
                    className="rounded-full border border-fd-border bg-fd-muted/40 px-2 py-0.5 font-mono text-[10px] text-fd-muted-foreground"
                  >
                    {area}
                  </span>
                ))}
              </div>
              <span className="mt-1 font-mono text-[11px] text-fd-muted-foreground">
                {lab.variants.length} scenario{lab.variants.length === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
            Keep exploring
          </h2>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href="/learn"
              className="inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-card px-4 py-2 font-medium transition-colors hover:border-fd-foreground/30"
            >
              Learn the internals →
            </Link>
            <Link
              href="/simulate"
              className="inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-card px-4 py-2 font-medium transition-colors hover:border-fd-foreground/30"
            >
              Simulate a cluster →
            </Link>
            <Link
              href="/errors"
              className="inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-card px-4 py-2 font-medium transition-colors hover:border-fd-foreground/30"
            >
              Exception catalog →
            </Link>
            <Link
              href="/kips"
              className="inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-card px-4 py-2 font-medium transition-colors hover:border-fd-foreground/30"
            >
              KIP index →
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
