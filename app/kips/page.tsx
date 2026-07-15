import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/site-shell";
import { kips } from "@/lib/kips-data";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { serializeJsonLd } from "@/lib/json-ld";
import { KipsFilterClient } from "./kips-filter-client";

export const metadata: Metadata = {
  title: "Kafka Improvement Proposal Index",
  description:
    "A searchable map of high-leverage KIPs that changed Kafka's replication, transactions, consumer groups, KRaft, protocol, and operational behavior.",
};

function KipsJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Kafka Improvement Proposals (KIPs)",
    description: "Index of high-leverage Kafka Improvement Proposals.",
    numberOfItems: kips.length,
    itemListElement: kips.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `KIP-${entry.id}: ${entry.title}`,
      url: `${CANONICAL_ORIGIN}/kips#kip-${entry.id}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

export default function KipsPage() {
  return (
    <SiteShell>
      <KipsJsonLd />
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /kips
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Kafka Improvement Proposal index
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            A searchable map of high-leverage KIPs that changed Kafka&apos;s
            replication, transactions, consumer groups, KRaft, protocol, and
            operational behavior.
          </p>
        </div>
      </section>

      <Suspense fallback={<div className="mx-auto w-full max-w-6xl px-6 py-10">Loading filters...</div>}>
        <KipsFilterClient />
      </Suspense>
    </SiteShell>
  );
}
