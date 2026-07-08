import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimulateClient } from "@/app/simulate/simulate-client";
import { SCENARIOS } from "@kafka-hub/kafka-sim";

interface Props {
  params: Promise<{ scenario: string }>;
}

export async function generateStaticParams() {
  return Object.keys(SCENARIOS).map((scenario) => ({ scenario }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { scenario } = await params;
  const sc = SCENARIOS[scenario];
  if (!sc) return {};
  return {
    title: `${sc.title} · Embed`,
    description: sc.blurb,
    robots: { index: false, follow: false },
  };
}

export default async function EmbedScenarioPage({ params }: Props) {
  const { scenario } = await params;
  if (!SCENARIOS[scenario]) notFound();

  return (
    <div className="min-h-screen bg-fd-background text-fd-foreground">
      <SimulateClient fixedScenario={scenario} embed />
    </div>
  );
}
