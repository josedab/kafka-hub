import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { LagClient } from "./lag-client";

export const metadata: Metadata = {
  title: "Consumer Lag Triage",
  description:
    "Paste two Kafka consumer-group offset snapshots. Get lag classification, partition skew analysis, drain ETA, capacity planning, and observability recommendations. No live cluster connection.",
};

export default function LagTriagePage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench/lag
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Consumer lag triage
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Provide two offset snapshots from{" "}
            <code className="font-mono">kafka-consumer-groups --describe</code>{" "}
            taken at different times. The planner computes lag classification,
            partition skew, drain ETA, throughput requirements, and capacity
            planning. Everything runs locally.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <LagClient />
      </section>
    </SiteShell>
  );
}
