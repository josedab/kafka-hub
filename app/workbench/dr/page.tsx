import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { DrClient } from "./dr-client";

export const metadata: Metadata = {
  title: "DR Tabletop Planner",
  description:
    "Plan Kafka disaster-recovery failover scenarios. Enter replication timing parameters to get RPO/RTO estimates, duplicate exposure analysis, phase checklists, and observability recommendations. No live cluster connection.",
};

export default function DrPlannerPage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench/dr
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            DR tabletop planner
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Model Kafka disaster-recovery failover scenarios. Enter replication
            timing parameters to get RPO/RTO estimates, duplicate exposure
            analysis, phase checklists, and observability recommendations.
            Everything runs locally.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-fd-muted-foreground">
            <strong>Safety:</strong> This tool does NOT execute commands,
            automate failover, or claim vendor control-plane behavior. It is a
            deterministic planning aid for tabletop exercises.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <DrClient />
      </section>
    </SiteShell>
  );
}
