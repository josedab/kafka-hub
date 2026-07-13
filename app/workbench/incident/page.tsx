import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { IncidentClient } from "./incident-client";

export const metadata: Metadata = {
  title: "Incident Triage",
  description:
    "Paste Kafka incident evidence — logs, configs, stack traces, consumer-groups output, or metric snapshots. Get structured triage hypotheses with confidence scores. No live cluster connection.",
};

export default function IncidentTriagePage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench/incident
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Incident triage
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Paste Kafka evidence — broker logs, client logs, stack traces,{" "}
            <code className="font-mono">kafka-consumer-groups</code> output,
            config snippets, or metric snapshots. The pattern engine matches
            against 10 known failure signatures and returns structured
            hypotheses. Everything runs locally.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <IncidentClient />
      </section>
    </SiteShell>
  );
}
