/**
 * Authoritative Workbench tool registry.
 *
 * Single source of truth for all Workbench tools. Used by:
 * - /workbench page (rendering)
 * - Sitemap generation
 * - Search index
 * - Displayed tool counts
 */

export interface WorkbenchTool {
  slug: string;
  title: string;
  description: string;
}

export const WORKBENCH_TOOLS: readonly WorkbenchTool[] = [
  {
    slug: "incident",
    title: "Incident Triage",
    description:
      "Paste logs, configs, stack traces, consumer-groups output, or metric snapshots. Get structured hypotheses with confidence scores, evidence references, and observability recommendations.",
  },
  {
    slug: "lag",
    title: "Consumer Lag Triage",
    description:
      "Provide two offset snapshots. Get lag classification, partition skew analysis, drain ETA, throughput requirements, capacity planning, and observability recommendations.",
  },
  {
    slug: "capacity",
    title: "Capacity and N-1 Headroom",
    description:
      "Model cluster storage, network, and partition throughput. Compare average broker load against N-1 failure scenarios. Get headroom analysis, warnings, and observability recommendations.",
  },
  {
    slug: "listeners",
    title: "Listener Topology Wizard",
    description:
      "Validate Kafka listener configurations for same-host, LAN, Docker, Kubernetes, NAT, and internet topologies. Get broker/client config snippets, connection flow explanations, and observability recommendations.",
  },
  {
    slug: "kraft",
    title: "KRaft Transition Planner",
    description:
      "Plan ZooKeeper-to-KRaft migration and Kafka 4.x upgrade readiness. Get phase navigation, preflight checklist, version analysis, and observability recommendations.",
  },
  {
    slug: "message-size",
    title: "Message Size Chain Checker",
    description:
      "Validate Kafka message size limits across the produce → replicate → consume pipeline. Get stage-by-stage analysis, aligned configuration patches, blob storage recommendations, and observability guidance.",
  },
  {
    slug: "dr",
    title: "DR Tabletop Planner",
    description:
      "Model Kafka disaster-recovery failover scenarios. Get RPO/RTO estimates, duplicate exposure analysis, phase checklists, and observability recommendations.",
  },
] as const;

export const WORKBENCH_TOOL_COUNT = WORKBENCH_TOOLS.length;
