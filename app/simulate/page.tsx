import type { Metadata } from "next";
import { ScenarioDeepLinkClient } from "./scenario-from-url";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Simulate",
  description:
    "Deterministic in-browser Kafka. Step time, kill brokers, watch ISR shrink, compare rebalance protocols. Play scripted scenarios for the most common failure modes.",
};

export default function SimulatePage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /simulate
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            In-browser broker simulator
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            A deterministic teaching tool. Pick a scenario, hit play, and watch
            ISR, leadership, consumer lag, and rebalance behavior react. Compare
            eager classic, cooperative classic, and KIP-848 consumer protocol
            rebalance strategies. Or drive it freeform — click a broker to kill
            it, hit produce to fire a record, step time manually.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <ScenarioDeepLinkClient />
      </section>
    </SiteShell>
  );
}
