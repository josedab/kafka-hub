import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { KRaftClient } from "./kraft-client";

export const metadata: Metadata = {
  title: "KRaft Transition and Kafka 4.x Readiness",
  description:
    "Plan ZooKeeper-to-KRaft migration and Kafka 4.x upgrade readiness. Get phase navigation, preflight checklist, version analysis, and observability recommendations. No live cluster connection.",
};

export default function KRaftPlannerPage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /workbench/kraft
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            KRaft transition and Kafka 4.x readiness
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Plan your ZooKeeper-to-KRaft migration. Enter cluster parameters to
            get phase navigation, readiness findings, a preflight checklist, and
            observability recommendations. Everything runs locally.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-fd-muted-foreground">
            <strong>Safety:</strong> ZooKeeper-to-KRaft migration must complete
            on a supported Kafka 3.x release before upgrading to 4.x. Kafka 4.x
            is KRaft-only. Finalization is irreversible. This tool does NOT
            execute commands, change any cluster, or automatically finalize any
            migration.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <KRaftClient />
      </section>
    </SiteShell>
  );
}
