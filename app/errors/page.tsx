import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/site-shell";
import { errors } from "@/lib/errors-data";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { serializeJsonLd } from "@/lib/json-ld";
import { ErrorsFilterClient } from "./errors-filter-client";

export const metadata: Metadata = {
  title: "Kafka Exception Catalog",
  description:
    "A searchable field guide to the Kafka exceptions senior engineers see during produce, consume, admin, security, and transaction incidents.",
};

function ErrorsJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Kafka Exception Catalog",
    description: "Searchable catalog of Kafka exceptions with root causes, fixes, and cross-links.",
    numberOfItems: errors.length,
    itemListElement: errors.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      url: `${CANONICAL_ORIGIN}/errors/${entry.id}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

export default function ErrorsPage() {
  return (
    <SiteShell>
      <ErrorsJsonLd />
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

      <Suspense fallback={<div className="mx-auto w-full max-w-6xl px-6 py-10">Loading filters...</div>}>
        <ErrorsFilterClient />
      </Suspense>
    </SiteShell>
  );
}
