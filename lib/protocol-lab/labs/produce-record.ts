/**
 * Produce Record lab.
 *
 * ApiVersions -> Metadata -> Produce, with four deterministic variants that
 * vary acks (0 / 1 / all) and idempotence, plus a failure-injection variant
 * that walks through a leader move, a NOT_LEADER_OR_FOLLOWER rejection,
 * a metadata refresh, and a retry against the new leader.
 */
import type { ProtocolActor, ProtocolLab, ProtocolStep, ProtocolVariant, WireFrame } from "../types";

const producer: ProtocolActor = { id: "producer", label: "Producer", role: "client", detail: "acks + idempotence" };
const bootstrap: ProtocolActor = { id: "broker-1", label: "Broker 1", role: "broker", detail: "bootstrap / metadata" };
const leader: ProtocolActor = { id: "broker-2", label: "Broker 2", role: "broker", detail: "leader: orders-0" };
const follower: ProtocolActor = { id: "broker-3", label: "Broker 3", role: "broker", detail: "follower: orders-0" };

const ACTORS: readonly ProtocolActor[] = [producer, bootstrap, leader, follower];

function apiVersionsRequest(correlationId: number): WireFrame {
  return {
    kind: "request",
    apiName: "ApiVersions",
    apiKey: 18,
    apiVersion: 3,
    correlationId,
    clientId: "kafka-hub-produce-lab",
    headerFields: [
      { name: "api_key", value: "18", type: "INT16" },
      { name: "api_version", value: "3", type: "INT16" },
      { name: "correlation_id", value: String(correlationId), type: "INT32" },
      { name: "client_id", value: "kafka-hub-produce-lab", type: "NULLABLE_STRING" },
    ],
    bodyFields: [
      { name: "client_software_name", value: "kafka-hub-lab", type: "COMPACT_STRING" },
      { name: "client_software_version", value: "4.3.1", type: "COMPACT_STRING" },
    ],
    hexBytes: ["00 12", "00 03", padHex(correlationId), "00 15", "6B 61 66 6B 61 2D 68 75 62"],
    hexLabels: ["api_key=18", "api_version=3", "correlation_id", "client_id len", "client_id bytes"],
  };
}

function apiVersionsResponse(correlationId: number): WireFrame {
  return {
    kind: "response",
    apiName: "ApiVersions",
    apiKey: 18,
    apiVersion: 3,
    correlationId,
    headerFields: [{ name: "correlation_id", value: String(correlationId), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "api_keys[]", value: "ApiVersions=0-3, Metadata=0-12, Produce=0-11, InitProducerId=0-4", type: "ARRAY" },
      { name: "throttle_time_ms", value: "0", type: "INT32" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: [padHex(correlationId), "00 00", "00 04", "00 00 00 00"],
    hexLabels: ["correlation_id", "error_code=NONE", "api_keys count", "throttle_time_ms"],
  };
}

function metadataRequest(correlationId: number): WireFrame {
  return {
    kind: "request",
    apiName: "Metadata",
    apiKey: 3,
    apiVersion: 12,
    correlationId,
    clientId: "kafka-hub-produce-lab",
    headerFields: [
      { name: "api_key", value: "3", type: "INT16" },
      { name: "api_version", value: "12", type: "INT16" },
      { name: "correlation_id", value: String(correlationId), type: "INT32" },
    ],
    bodyFields: [
      { name: "topics[0].name", value: "orders", type: "COMPACT_STRING" },
      { name: "allow_auto_topic_creation", value: "false", type: "BOOLEAN" },
    ],
    hexBytes: ["00 03", "00 0C", padHex(correlationId), "01", "6F 72 64 65 72 73", "00"],
    hexLabels: ["api_key=3", "api_version=12", "correlation_id", "topics count", "\"orders\"", "allow_auto_topic_creation"],
  };
}

function metadataResponse(
  correlationId: number,
  opts: { leaderId: number; leaderEpoch: number; isr: readonly number[] },
): WireFrame {
  return {
    kind: "response",
    apiName: "Metadata",
    apiKey: 3,
    apiVersion: 12,
    correlationId,
    headerFields: [{ name: "correlation_id", value: String(correlationId), type: "INT32" }],
    bodyFields: [
      { name: "controller_id", value: "1", type: "INT32" },
      { name: "topics[0].partitions[0].partition_index", value: "0", type: "INT32" },
      { name: "topics[0].partitions[0].leader_id", value: String(opts.leaderId), type: "INT32" },
      { name: "topics[0].partitions[0].leader_epoch", value: String(opts.leaderEpoch), type: "INT32" },
      { name: "topics[0].partitions[0].replica_nodes", value: "[2, 3, 4]", type: "ARRAY[INT32]" },
      { name: "topics[0].partitions[0].isr_nodes", value: `[${opts.isr.join(", ")}]`, type: "ARRAY[INT32]" },
    ],
    hexBytes: [padHex(correlationId), "00 00 00 00", `00 00 00 ${hexByte(opts.leaderId)}`, `00 00 00 ${hexByte(opts.leaderEpoch)}`, "00 03"],
    hexLabels: ["correlation_id", "partition_index=0", "leader_id", "leader_epoch", "isr count"],
  };
}

function initProducerIdRequest(correlationId: number): WireFrame {
  return {
    kind: "request",
    apiName: "InitProducerId",
    apiKey: 22,
    apiVersion: 4,
    correlationId,
    clientId: "kafka-hub-produce-lab",
    headerFields: [
      { name: "api_key", value: "22", type: "INT16" },
      { name: "api_version", value: "4", type: "INT16" },
      { name: "correlation_id", value: String(correlationId), type: "INT32" },
    ],
    bodyFields: [
      { name: "transactional_id", value: "null", type: "COMPACT_NULLABLE_STRING", note: "idempotent, non-transactional producer" },
      { name: "transaction_timeout_ms", value: "60000", type: "INT32" },
    ],
    hexBytes: ["00 16", "00 04", padHex(correlationId), "00", "00 00 EA 60"],
    hexLabels: ["api_key=22", "api_version=4", "correlation_id", "transactional_id=null", "transaction_timeout_ms"],
  };
}

function initProducerIdResponse(correlationId: number): WireFrame {
  return {
    kind: "response",
    apiName: "InitProducerId",
    apiKey: 22,
    apiVersion: 4,
    correlationId,
    headerFields: [{ name: "correlation_id", value: String(correlationId), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "producer_id", value: "5001", type: "INT64" },
      { name: "producer_epoch", value: "0", type: "INT16" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: [padHex(correlationId), "00 00", "00 00 00 00 00 00 13 89", "00 00"],
    hexLabels: ["correlation_id", "error_code=NONE", "producer_id=5001", "producer_epoch=0"],
  };
}

interface ProduceRequestOpts {
  toLabel: string;
  acks: 0 | 1 | -1;
  idempotent?: boolean;
  baseSequence?: number;
}

function produceRequest(correlationId: number, opts: ProduceRequestOpts): WireFrame {
  const bodyFields = [
    { name: "transactional_id", value: "null", type: "COMPACT_NULLABLE_STRING" },
    { name: "acks", value: String(opts.acks), type: "INT16", note: opts.acks === -1 ? "-1 == all" : undefined },
    { name: "timeout_ms", value: "30000", type: "INT32" },
    { name: "topic_data[0].name", value: "orders", type: "COMPACT_STRING" },
    { name: "topic_data[0].partition_data[0].index", value: "0", type: "INT32" },
    { name: "topic_data[0].partition_data[0].records", value: "1 record batch (key=order-8841, 212 bytes)", type: "COMPACT_RECORDS" },
  ];
  if (opts.idempotent) {
    bodyFields.push(
      { name: "producer_id", value: "5001", type: "INT64" },
      { name: "producer_epoch", value: "0", type: "INT16" },
      { name: "base_sequence", value: String(opts.baseSequence ?? 0), type: "INT32" },
    );
  }
  return {
    kind: "request",
    apiName: "Produce",
    apiKey: 0,
    apiVersion: 11,
    correlationId,
    clientId: "kafka-hub-produce-lab",
    headerFields: [
      { name: "api_key", value: "0", type: "INT16" },
      { name: "api_version", value: "11", type: "INT16" },
      { name: "correlation_id", value: String(correlationId), type: "INT32" },
    ],
    bodyFields,
    hexBytes: ["00 00", "00 0B", padHex(correlationId), `00 ${hexByte(opts.acks & 0xff)}`, "00 00 75 30"],
    hexLabels: ["api_key=0", "api_version=11", "correlation_id", `acks=${opts.acks}`, "timeout_ms=30000"],
  };
}

interface ProduceResponseOpts {
  errorCode?: number;
  errorName?: string;
  baseOffset?: number;
}

function produceResponse(correlationId: number, opts: ProduceResponseOpts = {}): WireFrame {
  const errorCode = opts.errorCode ?? 0;
  const errorName = opts.errorName ?? "NONE";
  const bodyFields =
    errorCode === 0
      ? [
          { name: "error_code", value: "0", type: "INT16", note: "NONE" },
          { name: "base_offset", value: String(opts.baseOffset ?? 0), type: "INT64" },
          { name: "log_append_time_ms", value: "-1", type: "INT64", note: "CreateTime used" },
          { name: "log_start_offset", value: "0", type: "INT64" },
        ]
      : [
          { name: "error_code", value: String(errorCode), type: "INT16", note: errorName },
          { name: "base_offset", value: "-1", type: "INT64" },
        ];
  return {
    kind: "response",
    apiName: "Produce",
    apiKey: 0,
    apiVersion: 11,
    correlationId,
    headerFields: [{ name: "correlation_id", value: String(correlationId), type: "INT32" }],
    bodyFields,
    errorCode,
    errorName,
    hexBytes: [padHex(correlationId), `00 ${hexByte(errorCode)}`, `00 00 00 00 00 00 ${hexByte(opts.baseOffset ?? 0)}`],
    hexLabels: ["correlation_id", `error_code=${errorName}`, "base_offset"],
  };
}

function padHex(n: number): string {
  const hex = (n >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `${hex.slice(0, 2)} ${hex.slice(2, 4)} ${hex.slice(4, 6)} ${hex.slice(6, 8)}`;
}

function hexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

/** ApiVersions + Metadata steps shared by every variant (correlation IDs 1-4). */
function openingSteps(): ProtocolStep[] {
  return [
    {
      id: "apiversions-req",
      title: "ApiVersions request",
      fromActorId: "producer",
      toActorId: "broker-1",
      direction: "request",
      narrative:
        "The producer opens a connection to a bootstrap broker and asks which API versions it supports before sending anything else.",
      state: [
        { label: "Leader (orders-0)", value: "unknown", tone: "neutral" },
        { label: "Producer", value: "negotiating versions", tone: "info", changed: true },
      ],
      frames: [apiVersionsRequest(1)],
    },
    {
      id: "apiversions-resp",
      title: "ApiVersions response",
      fromActorId: "broker-1",
      toActorId: "producer",
      direction: "response",
      narrative:
        "Broker 1 replies with the highest version it supports per API. The producer will use the highest mutually-supported version for Metadata, Produce, and (if idempotent) InitProducerId.",
      state: [
        { label: "Leader (orders-0)", value: "unknown", tone: "neutral" },
        { label: "Producer", value: "versions negotiated", tone: "success", changed: true },
      ],
      frames: [apiVersionsResponse(1)],
    },
    {
      id: "metadata-req",
      title: "Metadata request",
      fromActorId: "producer",
      toActorId: "broker-1",
      direction: "request",
      narrative: "The producer asks any broker for the current leader, replica set, and ISR of topic \"orders\".",
      state: [
        { label: "Leader (orders-0)", value: "unknown", tone: "neutral" },
        { label: "Producer", value: "fetching metadata", tone: "info", changed: true },
      ],
      frames: [metadataRequest(2)],
    },
    {
      id: "metadata-resp",
      title: "Metadata response",
      fromActorId: "broker-1",
      toActorId: "producer",
      direction: "response",
      narrative:
        "Broker 1 answers from the metadata cache it keeps in sync with the controller: Broker 2 leads orders-0 at leader epoch 7, and the ISR is {2, 3, 4}.",
      state: [
        { label: "Leader (orders-0)", value: "broker-2", tone: "success", changed: true },
        { label: "Leader epoch", value: "7", tone: "neutral", changed: true },
        { label: "ISR", value: "{2, 3, 4}", tone: "success", changed: true },
      ],
      frames: [metadataResponse(2, { leaderId: 2, leaderEpoch: 7, isr: [2, 3, 4] })],
    },
  ];
}

function acksZeroVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...openingSteps(),
    {
      id: "produce-req-acks0",
      title: "Produce request (acks=0)",
      fromActorId: "producer",
      toActorId: "broker-2",
      direction: "request",
      narrative:
        "The producer writes the batch straight to the leader with acks=0. It will not wait for any acknowledgement — as far as the client is concerned, the write is already done the moment the bytes leave the socket buffer.",
      state: [
        { label: "Leader (orders-0)", value: "broker-2", tone: "success" },
        { label: "acks", value: "0", tone: "warning", changed: true },
        { label: "ack received", value: "n/a — not requested", tone: "warning", changed: true },
      ],
      frames: [produceRequest(3, { toLabel: "broker-2", acks: 0 })],
      annotation: {
        tone: "warning",
        text: "acks=0 risks silent data loss: a dropped connection, a leader crash, or a serialization error right after this write is invisible to the producer.",
      },
    },
    {
      id: "produce-internal-acks0",
      title: "Leader appends locally",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "Broker 2 appends the batch to its local log and advances its Log End Offset (LEO). Because acks=0, it never sends a Produce response — replication to the ISR proceeds independently, on its own schedule.",
      state: [
        { label: "Leader (orders-0)", value: "broker-2", tone: "success" },
        { label: "broker-2 LEO", value: "483", tone: "info", changed: true },
        { label: "acks", value: "0", tone: "warning" },
        { label: "Producer", value: "moved on — no confirmation ever arrives", tone: "warning", changed: true },
      ],
    },
  ];
  return {
    id: "acks-0",
    label: "acks=0 — fire and forget",
    summary: "Lowest latency, weakest durability: the producer never learns whether the broker accepted the batch.",
    steps,
  };
}

function acksOneVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...openingSteps(),
    {
      id: "produce-req-acks1",
      title: "Produce request (acks=1)",
      fromActorId: "producer",
      toActorId: "broker-2",
      direction: "request",
      narrative:
        "The producer sends the batch to the leader with acks=1: it will wait for the leader's own acknowledgement, but not for the followers.",
      state: [
        { label: "Leader (orders-0)", value: "broker-2", tone: "success" },
        { label: "acks", value: "1", tone: "info", changed: true },
      ],
      frames: [produceRequest(3, { toLabel: "broker-2", acks: 1 })],
    },
    {
      id: "produce-internal-acks1",
      title: "Leader appends locally",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "Broker 2 appends the batch to its local log at offset 482 and advances its LEO. It does not wait for Broker 3 or Broker 4 to fetch it before replying.",
      state: [
        { label: "Leader (orders-0)", value: "broker-2", tone: "success" },
        { label: "broker-2 LEO", value: "483", tone: "info", changed: true },
        { label: "acks", value: "1", tone: "info" },
      ],
    },
    {
      id: "produce-resp-acks1",
      title: "Produce response (acks=1)",
      fromActorId: "broker-2",
      toActorId: "producer",
      direction: "response",
      narrative:
        "The leader acknowledges as soon as its own log has the batch. Durability now depends entirely on Broker 2 surviving until followers replicate — if it crashes first, the record can be lost even though the producer received a success response.",
      state: [
        { label: "ack received", value: "yes — leader only", tone: "success", changed: true },
        { label: "Durability", value: "single point of failure until replicated", tone: "warning", changed: true },
      ],
      frames: [produceResponse(3, { baseOffset: 482 })],
      annotation: {
        tone: "warning",
        text: "acks=1 acknowledges after the leader's local append only. An unreplicated leader failure right after this response can still lose the record.",
      },
    },
  ];
  return {
    id: "acks-1",
    label: "acks=1 — leader acknowledgement",
    summary: "Leader-only durability: fast, but a leader crash before replication can still lose the record.",
    steps,
  };
}

function acksAllIdempotentVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...openingSteps(),
    {
      id: "initproducerid-req",
      title: "InitProducerId request",
      fromActorId: "producer",
      toActorId: "broker-1",
      direction: "request",
      narrative:
        "Before its first Produce, an idempotent producer requests a producer ID and epoch. These are used to fence duplicate deliveries caused by client-side retries.",
      state: [
        { label: "Idempotence", value: "enabling", tone: "info", changed: true },
      ],
      frames: [initProducerIdRequest(3)],
    },
    {
      id: "initproducerid-resp",
      title: "InitProducerId response",
      fromActorId: "broker-1",
      toActorId: "producer",
      direction: "response",
      narrative:
        "The transaction coordinator (co-located here on Broker 1) assigns producer_id=5001 at epoch 0. Every batch this producer sends will now carry a per-partition, monotonically increasing sequence number the leader can deduplicate on retry.",
      state: [
        { label: "Producer ID", value: "5001", tone: "success", changed: true },
        { label: "Producer epoch", value: "0", tone: "neutral", changed: true },
        { label: "Idempotence", value: "enabled", tone: "success", changed: true },
      ],
      frames: [initProducerIdResponse(3)],
    },
    {
      id: "produce-req-acksall",
      title: "Produce request (acks=all, idempotent)",
      fromActorId: "producer",
      toActorId: "broker-2",
      direction: "request",
      narrative:
        "The producer sends the batch to the leader with acks=all (-1) and base_sequence=0. The leader will only acknowledge once every ISR member has the batch.",
      state: [
        { label: "Leader (orders-0)", value: "broker-2", tone: "success" },
        { label: "ISR", value: "{2, 3, 4}", tone: "success" },
        { label: "acks", value: "all (-1)", tone: "info", changed: true },
        { label: "min.insync.replicas", value: "2", tone: "neutral" },
      ],
      frames: [produceRequest(4, { toLabel: "broker-2", acks: -1, idempotent: true, baseSequence: 0 })],
    },
    {
      id: "produce-internal-leader-append",
      title: "Leader appends and checks sequence",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "Broker 2 validates base_sequence=0 is the next expected sequence for producer 5001 (rejecting or deduplicating otherwise), appends the batch at offset 482, and advances its LEO. It now waits on the ISR before responding.",
      state: [
        { label: "broker-2 LEO", value: "483", tone: "info", changed: true },
        { label: "broker-2 HW", value: "482", tone: "neutral" },
        { label: "Sequence check", value: "0 == expected — accepted", tone: "success", changed: true },
      ],
    },
    {
      id: "follower-fetch-req",
      title: "Follower Fetch request",
      fromActorId: "broker-3",
      toActorId: "broker-2",
      direction: "request",
      narrative:
        "Broker 3, a follower for orders-0, issues its own Fetch request against the leader — replication is pull-based, driven by the followers, not pushed by the leader.",
      state: [
        { label: "broker-3 LEO", value: "482", tone: "neutral" },
      ],
      frames: [
        {
          kind: "request",
          apiName: "Fetch",
          apiKey: 1,
          apiVersion: 16,
          correlationId: 5,
          clientId: "replica-fetcher-3",
          headerFields: [
            { name: "api_key", value: "1", type: "INT16" },
            { name: "api_version", value: "16", type: "INT16" },
            { name: "correlation_id", value: "5", type: "INT32" },
          ],
          bodyFields: [
            { name: "replica_id", value: "3", type: "INT32" },
            { name: "topics[0].partitions[0].fetch_offset", value: "482", type: "INT64" },
            { name: "topics[0].partitions[0].partition_max_bytes", value: "1048576", type: "INT32" },
          ],
          hexBytes: ["00 01", "00 10", "00 00 00 05", "00 00 00 03"],
          hexLabels: ["api_key=1", "api_version=16", "correlation_id", "replica_id=3"],
        },
      ],
    },
    {
      id: "follower-fetch-resp",
      title: "Follower Fetch response",
      fromActorId: "broker-2",
      toActorId: "broker-3",
      direction: "response",
      narrative:
        "The leader returns the new record batch plus its current high watermark. Broker 3 appends it and advances its own LEO to 483.",
      state: [
        { label: "broker-3 LEO", value: "483", tone: "success", changed: true },
      ],
      frames: [
        {
          kind: "response",
          apiName: "Fetch",
          apiKey: 1,
          apiVersion: 16,
          correlationId: 5,
          headerFields: [{ name: "correlation_id", value: "5", type: "INT32" }],
          bodyFields: [
            { name: "error_code", value: "0", type: "INT16", note: "NONE" },
            { name: "high_watermark", value: "482", type: "INT64" },
            { name: "records", value: "1 record batch (offset 482)", type: "COMPACT_RECORDS" },
          ],
          errorCode: 0,
          errorName: "NONE",
          hexBytes: ["00 00 00 05", "00 00", "00 00 00 00 00 00 01 E2"],
          hexLabels: ["correlation_id", "error_code=NONE", "high_watermark=482"],
        },
      ],
    },
    {
      id: "isr-advance-hw",
      title: "ISR caught up — HW advances",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "Once broker-3 and broker-4 (not shown) both report LEO >= 483, the leader advances the partition's high watermark to 483. Records up to the HW are now considered committed and visible to consumers.",
      state: [
        { label: "broker-2 HW", value: "483", tone: "success", changed: true },
        { label: "ISR", value: "{2, 3, 4}", tone: "success" },
      ],
    },
    {
      id: "produce-resp-acksall",
      title: "Produce response (acks=all)",
      fromActorId: "broker-2",
      toActorId: "producer",
      direction: "response",
      narrative:
        "Only now — after the whole ISR has the batch — does the leader acknowledge. Combined with idempotence, the producer has both no-duplicate and no-silently-lost-write guarantees for this partition, as long as min.insync.replicas is satisfied on every write.",
      state: [
        { label: "ack received", value: "yes — full ISR", tone: "success", changed: true },
        { label: "Durability", value: "survives any single broker loss", tone: "success", changed: true },
      ],
      frames: [produceResponse(4, { baseOffset: 482 })],
      annotation: {
        tone: "success",
        text: "acks=all + idempotence: no data is acknowledged until the ISR has it, and retried sends are deduplicated by sequence number — not exactly-once across partitions, but no-loss and no-duplicate for this partition.",
      },
    },
  ];
  return {
    id: "acks-all-idempotent",
    label: "acks=all + idempotent producer",
    summary: "Strongest single-partition guarantee: leader waits for the full ISR, and sequence numbers dedupe retries.",
    steps,
  };
}

function leaderMoveVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...openingSteps(),
    {
      id: "controller-moves-leader",
      title: "Controller moves leadership (background)",
      fromActorId: "broker-2",
      toActorId: "broker-3",
      direction: "broadcast",
      narrative:
        "In the background — invisible to the producer, which is still holding metadata from a moment ago — the controller runs a preferred-leader election and moves leadership of orders-0 from Broker 2 to Broker 3, bumping the leader epoch from 7 to 8.",
      state: [
        { label: "Leader (orders-0)", value: "broker-3", tone: "info", changed: true },
        { label: "Leader epoch", value: "8", tone: "warning", changed: true },
        { label: "Producer's cached leader", value: "broker-2 (epoch 7) — now stale", tone: "danger", changed: true },
      ],
      annotation: {
        tone: "info",
        text: "This is an injected failure scenario: the producer's metadata cache is now stale, but it doesn't know that yet.",
      },
    },
    {
      id: "produce-req-stale",
      title: "Produce request (stale leader)",
      fromActorId: "producer",
      toActorId: "broker-2",
      direction: "request",
      narrative:
        "Using its cached metadata, the producer sends the batch to Broker 2 — which is no longer the leader.",
      state: [
        { label: "Leader (orders-0)", value: "broker-3", tone: "info" },
        { label: "Producer's cached leader", value: "broker-2 (epoch 7) — stale", tone: "danger" },
      ],
      frames: [produceRequest(3, { toLabel: "broker-2", acks: 1 })],
    },
    {
      id: "produce-resp-not-leader",
      title: "Produce response: NOT_LEADER_OR_FOLLOWER",
      fromActorId: "broker-2",
      toActorId: "producer",
      direction: "response",
      narrative:
        "Broker 2 checks the request's implied leader epoch against its own metadata cache, sees it is no longer the leader, and rejects the write with NOT_LEADER_OR_FOLLOWER instead of risking a split-brain append.",
      state: [
        { label: "ack received", value: "rejected", tone: "danger", changed: true },
      ],
      frames: [produceResponse(3, { errorCode: 6, errorName: "NOT_LEADER_OR_FOLLOWER" })],
      annotation: {
        tone: "danger",
        text: "NOT_LEADER_OR_FOLLOWER: the contacted broker knows it isn't (or is no longer) the partition leader for this epoch. The client must refresh metadata rather than retry blindly against the same broker.",
      },
    },
    {
      id: "metadata-refresh-req",
      title: "Metadata refresh request",
      fromActorId: "producer",
      toActorId: "broker-1",
      direction: "request",
      narrative: "The producer's client-side error handling triggers a metadata refresh before retrying.",
      state: [
        { label: "Producer", value: "refreshing metadata", tone: "info", changed: true },
      ],
      frames: [metadataRequest(5)],
    },
    {
      id: "metadata-refresh-resp",
      title: "Metadata refresh response",
      fromActorId: "broker-1",
      toActorId: "producer",
      direction: "response",
      narrative: "The refreshed metadata reflects the controller's leader move: Broker 3 now leads orders-0 at epoch 8.",
      state: [
        { label: "Leader (orders-0)", value: "broker-3", tone: "success", changed: true },
        { label: "Leader epoch", value: "8", tone: "success", changed: true },
      ],
      frames: [metadataResponse(5, { leaderId: 3, leaderEpoch: 8, isr: [2, 3, 4] })],
    },
    {
      id: "produce-req-retry",
      title: "Produce request (retry, new leader)",
      fromActorId: "producer",
      toActorId: "broker-3",
      direction: "request",
      narrative: "The producer retries the same logical batch against the correct, current leader.",
      state: [
        { label: "Leader (orders-0)", value: "broker-3", tone: "success" },
      ],
      frames: [produceRequest(6, { toLabel: "broker-3", acks: 1 })],
    },
    {
      id: "produce-resp-retry-ok",
      title: "Produce response: success",
      fromActorId: "broker-3",
      toActorId: "producer",
      direction: "response",
      narrative:
        "Broker 3 accepts the write and returns a base offset. The whole round trip — reject, refresh, retry — is handled entirely inside the producer's client library; application code never sees the transient error.",
      state: [
        { label: "ack received", value: "yes", tone: "success", changed: true },
      ],
      frames: [produceResponse(6, { baseOffset: 918 })],
      annotation: {
        tone: "success",
        text: "This retry-after-refresh loop is why producers should always treat NOT_LEADER_OR_FOLLOWER as retriable rather than fatal.",
      },
    },
  ];
  return {
    id: "leader-move",
    label: "Leader move -> stale metadata -> retry",
    summary: "Injected failure: a background leader election makes cached metadata stale, triggers a rejection, and forces a refresh-and-retry.",
    steps,
  };
}

export const produceRecordLab: ProtocolLab = {
  slug: "produce-record",
  title: "Produce Record",
  tagline: "ApiVersions -> Metadata -> Produce, with acks, idempotence, and a leader move.",
  blurb:
    "Walk a producer through version negotiation, metadata discovery, and a Produce call under acks=0, acks=1, and acks=all with idempotence. Then inject a leader move and watch NOT_LEADER_OR_FOLLOWER trigger a metadata refresh and retry.",
  focusAreas: ["ApiVersions", "Metadata", "Produce", "acks", "idempotence", "leader epoch", "NOT_LEADER_OR_FOLLOWER"],
  actors: ACTORS,
  variants: [acksZeroVariant(), acksOneVariant(), acksAllIdempotentVariant(), leaderMoveVariant()],
  links: {
    learnSlugs: ["isr-and-acks", "controller-and-metadata", "exactly-once"],
    errorIds: ["not-leader-or-follower-exception", "not-enough-replicas-exception"],
    kipIds: [101, 320],
    scenarioSlugs: ["isr-shrink", "network-partition"],
  },
};
