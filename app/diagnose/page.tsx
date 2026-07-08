import type { Metadata } from "next";
import Link from "next/link";
import { DiagnoseClient } from "./diagnose-client";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Diagnose",
  description:
    "Paste a Kafka broker, topic or client config. Get graded findings — no live cluster connection.",
};

const SAMPLE = `# broker (server.properties)
broker.id=1
listeners=PLAINTEXT://:9092
log.dirs=/var/lib/kafka/data
default.replication.factor=2
min.insync.replicas=1
unclean.leader.election.enable=true
auto.create.topics.enable=true
log.retention.ms=604800000
log.segment.ms=86400000000

# producer
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=10
`;

export default function DiagnosePage() {
  return (
    <SiteShell>
      <section className="border-b border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            /diagnose
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Configuration diagnostics
          </h1>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Paste broker, topic or client config (Java <code>.properties</code>{" "}
            format). The static rule engine flags known footguns and links each
            finding back to the relevant Learn article. Currently{" "}
            <span className="font-mono">36 rules</span> across 7 categories,
            plus optional LLM-augmented analysis when{" "}
            <code className="font-mono">ANTHROPIC_API_KEY</code> is set.
          </p>
          <Link
            href="/diagnose/rules"
            className="mt-5 inline-flex rounded-md border border-fd-border bg-fd-card px-3 py-2 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            Browse all rules
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <DiagnoseClient sample={SAMPLE} />
      </section>
    </SiteShell>
  );
}
