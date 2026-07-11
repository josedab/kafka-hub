/**
 * Static listener guidance, connection-flow explanation, and resource links.
 */

import type {
  ConnectionFlowExplanation,
  ListenerObservabilityRecommendation,
  ListenerResourceLink,
} from "./types";

// ─── Resource Links ─────────────────────────────────────────────────────────

export const RESOURCE_LINKS: readonly ListenerResourceLink[] = [
  {
    label: "Controller and Metadata",
    href: "/learn/controller-and-metadata",
    surface: "learn",
  },
  {
    label: "Broker Won't Restart Runbook",
    href: "/runbooks/broker-wont-restart",
    surface: "runbooks",
  },
  {
    label: "Diagnose Configuration",
    href: "/diagnose",
    surface: "diagnose",
  },
  {
    label: "Connection Errors Catalog",
    href: "/errors",
    surface: "errors",
  },
  {
    label: "Incident Triage Workbench",
    href: "/workbench/incident",
    surface: "workbench",
  },
  {
    label: "Kafka Simulator",
    href: "/simulate",
    surface: "simulate",
  },
];

/**
 * Shipped content routes for route integrity validation.
 * Maps each resource link href to a known content path or app route.
 */
export const SHIPPED_ROUTES: ReadonlySet<string> = new Set([
  "/learn/controller-and-metadata",
  "/runbooks/broker-wont-restart",
  "/diagnose",
  "/errors",
  "/workbench/incident",
  "/simulate",
]);

// ─── Observability Recommendations ──────────────────────────────────────────

export const OBSERVABILITY_RECOMMENDATIONS: readonly ListenerObservabilityRecommendation[] = [
  {
    metric: "kafka.server:type=socket-server-metrics,listener=*,networkProcessor=*:connection-creation-rate",
    description:
      "Rate of new TCP connections per listener per second (connections/sec). " +
      "Spikes indicate clients repeatedly reconnecting, often due to metadata-advertised " +
      "endpoints being unreachable.",
    rationale:
      "When advertised listeners point to unreachable endpoints, clients successfully " +
      "bootstrap but fail when following metadata to partition leaders. Each failure " +
      "triggers a reconnect, causing connection creation rate spikes.",
    caveat:
      "Do not alert on this alone. Connection creation rate spikes also occur during " +
      "rolling restarts, consumer group rebalances, and normal scaling events. Correlate " +
      "with request error rates and metadata response latency.",
  },
  {
    metric: "kafka.network:type=RequestMetrics,name=RequestsPerSec,request=Metadata",
    description:
      "Rate of metadata requests per second (requests/sec). High sustained rates " +
      "indicate clients are aggressively refreshing metadata, often because the " +
      "advertised endpoints in metadata responses are not reachable.",
    rationale:
      "Clients that cannot connect to partition leaders via advertised endpoints " +
      "repeatedly request fresh metadata hoping for different endpoints. This is " +
      "a key signal for listener misconfiguration.",
    caveat:
      "Do not alert on this alone. Metadata request spikes also occur during " +
      "topic creation, partition reassignment, and consumer group initialization. " +
      "Check whether the spike correlates with client-side connection errors.",
  },
  {
    metric: "kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce|Fetch",
    description:
      "End-to-end request latency for produce and fetch requests in milliseconds (ms). " +
      "Elevated P99 latency on specific listeners may indicate network path issues " +
      "between clients and the advertised endpoint.",
    rationale:
      "When listeners are misconfigured, clients may route through unexpected " +
      "network paths (e.g., hairpin NAT), increasing latency even when connections " +
      "eventually succeed.",
    caveat:
      "Do not alert on this alone. Latency increases also result from disk I/O " +
      "pressure, garbage collection pauses, consumer rebalances, and network " +
      "congestion unrelated to listener configuration.",
  },
  {
    metric: "kafka.server:type=socket-server-metrics,listener=*:connection-count",
    description:
      "Current number of active TCP connections per listener (connections). " +
      "A listener with zero connections when clients should be connected " +
      "indicates the listener is unreachable or misconfigured.",
    rationale:
      "Monitoring per-listener connection counts helps identify which listeners " +
      "are actually receiving traffic versus sitting idle due to misconfiguration.",
    caveat:
      "Do not alert on this alone. Internal listeners may legitimately have low " +
      "connection counts in small clusters. Compare expected versus actual counts " +
      "based on your known client count and cluster topology.",
  },
  {
    metric: "kafka.network:type=RequestMetrics,name=ErrorsPerSec,request=Produce|Fetch",
    description:
      "Rate of errors on produce and fetch requests per second (errors/sec). " +
      "Sustained non-zero error rates, especially NETWORK_EXCEPTION or " +
      "NOT_LEADER_OR_FOLLOWER, may indicate listener/advertised listener mismatches.",
    rationale:
      "When clients connect to a broker via one listener but the metadata " +
      "advertises a different, unreachable endpoint for the partition leader, " +
      "produce/fetch requests fail with network or leadership errors.",
    caveat:
      "Do not alert on this alone. Transient errors occur during leader elections, " +
      "broker restarts, and ISR shrink/expand. Sustained error rates beyond the " +
      "duration of a rolling restart window warrant investigation.",
  },
  {
    metric: "DNS resolution and TCP connectivity checks",
    description:
      "Periodic DNS resolution of advertised hostnames and TCP connection " +
      "attempts to advertised host:port pairs from each client network zone. " +
      "Measure resolution time (ms) and connection success rate (%).",
    rationale:
      "Listener misconfigurations often manifest as DNS resolution failures or " +
      "TCP connection timeouts from specific network zones. Probing from each " +
      "zone where clients run identifies zone-specific reachability issues.",
    caveat:
      "Do not alert on this alone. DNS TTLs, caching resolvers, and transient " +
      "network issues can cause intermittent failures. Use multi-probe consensus " +
      "and correlate with client-side error logs.",
  },
];

// ─── Connection Flow ────────────────────────────────────────────────────────

export const CONNECTION_FLOW: ConnectionFlowExplanation = {
  steps: [
    {
      step: 1,
      label: "Bootstrap Connection",
      description:
        "The client opens a TCP connection to one of the bootstrap.servers " +
        "endpoints. This is the initial connection used only to discover the " +
        "cluster topology. The bootstrap server can be ANY broker in the cluster.",
    },
    {
      step: 2,
      label: "Metadata Request",
      description:
        "The client sends a Metadata request to the bootstrap broker. The broker " +
        "responds with the full cluster metadata, including the list of all brokers " +
        "and their ADVERTISED endpoints (advertised.listeners), plus partition " +
        "leadership assignments.",
    },
    {
      step: 3,
      label: "Partition Leader/Coordinator Selection",
      description:
        "The client identifies which broker is the leader for each partition it " +
        "needs to produce to or consume from, or which broker is the group " +
        "coordinator. The metadata response contains the advertised endpoint " +
        "(host:port) for each broker — NOT the bind endpoint.",
    },
    {
      step: 4,
      label: "New Connection to Advertised Endpoint",
      description:
        "The client opens a NEW TCP connection to the partition leader's or " +
        "coordinator's ADVERTISED endpoint. This is where misconfiguration " +
        "breaks: if the advertised endpoint is unreachable from the client's " +
        "network location, the client fails even though the bootstrap connection " +
        "succeeded.",
    },
  ],
  whyBootstrapIsInsufficient:
    "A reachable bootstrap endpoint only proves that the client can reach ONE " +
    "broker for initial metadata discovery. After metadata is received, the client " +
    "must connect to the ADVERTISED endpoint of whichever broker is the partition " +
    "leader or group coordinator. If advertised.listeners points to an address " +
    "that is unreachable from the client's network (e.g., an internal Docker hostname, " +
    "a Kubernetes pod IP, or localhost), the client will fail with connection timeouts " +
    "or refused connections — even though the initial bootstrap connection worked. " +
    "This is the single most common Kafka networking misconfiguration.",
};

