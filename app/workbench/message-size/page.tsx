import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { MessageSizeClient } from "./message-size-client";

export const metadata: Metadata = {
  title: "Message Size Chain Checker",
  description:
    "Validate Kafka message size limits across the entire produce → replicate → consume pipeline. Get stage-by-stage analysis, aligned configuration patches, and observability recommendations. No live cluster connection.",
};

export default function MessageSizePlannerPage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench/message-size
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Message size chain checker
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Validate that your record and batch sizes fit within every limit
            in the Kafka pipeline: producer request, broker/topic acceptance,
            follower fetch, and consumer fetch. Get an aligned configuration
            patch and observability recommendations. Everything runs locally.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <MessageSizeClient />
      </section>
    </SiteShell>
  );
}
