import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { ListenersClient } from "./listeners-client";

export const metadata: Metadata = {
  title: "Listener Topology Wizard",
  description:
    "Model Kafka listener configurations and validate client connectivity for same-host, LAN, Docker, Kubernetes, NAT, and internet topologies. Get broker/client config snippets, connection flow explanations, and observability recommendations. No live cluster connection.",
};

export default function ListenerTopologyPage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench/listeners
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Listener topology wizard
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Define Kafka listener configurations and validate that clients can
            reach advertised endpoints from their network location. Get
            generated broker and client configuration snippets, connection flow
            explanations, and observability recommendations. Everything runs
            locally — no live cluster, no account, no network.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <ListenersClient />
      </section>
    </SiteShell>
  );
}
