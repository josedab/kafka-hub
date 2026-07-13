import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { CapacityClient } from "./capacity-client";

export const metadata: Metadata = {
  title: "Capacity and N-1 Headroom Planner",
  description:
    "Model Kafka cluster capacity: storage, network, partition throughput, average and N-1 broker load. Get headroom analysis, warnings, and observability recommendations. No live cluster connection.",
};

export default function CapacityPlannerPage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench/capacity
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Capacity and N-1 headroom planner
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Model storage, network, and partition throughput for your Kafka
            cluster. Compare average broker load against N-1 failure scenarios.
            Get headroom analysis, warnings, and observability recommendations.
            Everything runs locally.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <CapacityClient />
      </section>
    </SiteShell>
  );
}
