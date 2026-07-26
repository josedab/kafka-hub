/**
 * Share Groups (KIP-932) lab.
 *
 * ShareGroupHeartbeat -> ShareFetch -> ShareAcknowledge. Unlike a classic
 * consumer group, share groups do not assign exclusive partition ownership:
 * many consumers can read the same partition concurrently, and individual
 * records are leased out and acknowledged (or released, rejected, or left
 * to expire) independently. Modeled here as a small AI-agent worker pool
 * pulling tool-call jobs off a "tasks" topic.
 */
import type { ProtocolActor, ProtocolLab, ProtocolStep, ProtocolVariant, WireFrame } from "../types";

const workerA: ProtocolActor = { id: "worker-a", label: "Agent Worker A", role: "worker", detail: "share.group=agent-pool" };
const workerB: ProtocolActor = { id: "worker-b", label: "Agent Worker B", role: "worker", detail: "share.group=agent-pool" };
const workerC: ProtocolActor = { id: "worker-c", label: "Agent Worker C", role: "worker", detail: "share.group=agent-pool" };
const coordinator: ProtocolActor = { id: "share-coordinator", label: "Share Coordinator", role: "coordinator", detail: "tasks-0 lease state" };

const ACTORS: readonly ProtocolActor[] = [coordinator, workerA, workerB, workerC];

function shareGroupHeartbeatReq(cid: number, memberId: string, memberEpoch: number): WireFrame {
  return {
    kind: "request",
    apiName: "ShareGroupHeartbeat",
    apiKey: 76,
    apiVersion: 0,
    correlationId: cid,
    clientId: memberId,
    headerFields: [
      { name: "api_key", value: "76", type: "INT16" },
      { name: "api_version", value: "0", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "group_id", value: "agent-pool", type: "COMPACT_STRING" },
      { name: "member_id", value: memberId, type: "COMPACT_STRING" },
      { name: "member_epoch", value: String(memberEpoch), type: "INT32", note: memberEpoch === 0 ? "0 == joining" : undefined },
      { name: "subscribed_topic_names[]", value: "tasks", type: "ARRAY" },
    ],
    hexBytes: ["00 4C", "00 00", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=76", "api_version=0", "correlation_id"],
  };
}

function shareGroupHeartbeatResp(cid: number, memberEpoch: number, assignedPartitions: string): WireFrame {
  return {
    kind: "response",
    apiName: "ShareGroupHeartbeat",
    apiKey: 76,
    apiVersion: 0,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "member_epoch", value: String(memberEpoch), type: "INT32" },
      { name: "assignment.topic_partitions[]", value: assignedPartitions, type: "ARRAY", note: "readable, not exclusive" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: ["00 00", "00 00 00 " + memberEpoch.toString(16).padStart(2, "0").toUpperCase()],
    hexLabels: ["error_code=NONE", "member_epoch"],
  };
}

interface ShareFetchOpts {
  acquiredRecords: string;
  deliveryCounts?: string;
}

function shareFetchReq(cid: number, memberId: string): WireFrame {
  return {
    kind: "request",
    apiName: "ShareFetch",
    apiKey: 78,
    apiVersion: 0,
    correlationId: cid,
    clientId: memberId,
    headerFields: [
      { name: "api_key", value: "78", type: "INT16" },
      { name: "api_version", value: "0", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "group_id", value: "agent-pool", type: "COMPACT_STRING" },
      { name: "topics[0].partitions[0].partition_index", value: "0", type: "INT32" },
      { name: "topics[0].partitions[0].max_records", value: "1", type: "INT32", note: "pull one job at a time" },
    ],
    hexBytes: ["00 4E", "00 00", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=78", "api_version=0", "correlation_id"],
  };
}

function shareFetchResp(cid: number, opts: ShareFetchOpts): WireFrame {
  return {
    kind: "response",
    apiName: "ShareFetch",
    apiKey: 78,
    apiVersion: 0,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "acquired_records[]", value: opts.acquiredRecords, type: "ARRAY" },
      { name: "delivery_count", value: opts.deliveryCounts ?? "1", type: "INT16", note: "increments on redelivery" },
      { name: "acquisition_lock_timeout_ms", value: "30000", type: "INT32" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: ["00 00", "00 01"],
    hexLabels: ["error_code=NONE", "acquired_records count"],
  };
}

function shareAcknowledgeReq(cid: number, memberId: string, offset: number, code: 0 | 1 | 2): WireFrame {
  const codeName = code === 0 ? "ACCEPT" : code === 1 ? "RELEASE" : "REJECT";
  return {
    kind: "request",
    apiName: "ShareAcknowledge",
    apiKey: 79,
    apiVersion: 0,
    correlationId: cid,
    clientId: memberId,
    headerFields: [
      { name: "api_key", value: "79", type: "INT16" },
      { name: "api_version", value: "0", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "group_id", value: "agent-pool", type: "COMPACT_STRING" },
      { name: "topics[0].partitions[0].acknowledgement_batches[0].first_offset", value: String(offset), type: "INT64" },
      { name: "topics[0].partitions[0].acknowledgement_batches[0].acknowledge_type", value: `${code} (${codeName})`, type: "INT8" },
    ],
    hexBytes: ["00 4F", "00 00", String(cid).padStart(2, "0"), `0${code}`],
    hexLabels: ["api_key=79", "api_version=0", "correlation_id", `acknowledge_type=${codeName}`],
  };
}

function shareAcknowledgeResp(cid: number, errorCode = 0, errorName = "NONE"): WireFrame {
  return {
    kind: "response",
    apiName: "ShareAcknowledge",
    apiKey: 79,
    apiVersion: 0,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [{ name: "error_code", value: String(errorCode), type: "INT16", note: errorName }],
    errorCode,
    errorName,
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`],
    hexLabels: [`error_code=${errorName}`],
  };
}

function joinSteps(memberId: string, actorId: string, cid: number): ProtocolStep[] {
  return [
    {
      id: `${actorId}-join-req`,
      title: `ShareGroupHeartbeat (${memberId} joins)`,
      fromActorId: actorId,
      toActorId: "share-coordinator",
      direction: "request",
      narrative: `${memberId} sends a ShareGroupHeartbeat with member_epoch=0 to join the "agent-pool" share group.`,
      state: [],
      frames: [shareGroupHeartbeatReq(cid, memberId, 0)],
    },
    {
      id: `${actorId}-join-resp`,
      title: `ShareGroupHeartbeat response (${memberId})`,
      fromActorId: "share-coordinator",
      toActorId: actorId,
      direction: "response",
      narrative: `The share coordinator admits ${memberId} to the group and grants it read access to tasks-0 — non-exclusively, alongside every other member reading the same partition.`,
      state: [{ label: `${memberId} access`, value: "tasks-0 (shared, non-exclusive)", tone: "success", changed: true }],
      frames: [shareGroupHeartbeatResp(cid, 1, "tasks-0")],
    },
  ];
}

/* ---------------------------------------------------------------------- */
/* Variant: work sharing pool                                              */
/* ---------------------------------------------------------------------- */

function workSharingVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...joinSteps("Worker A", "worker-a", 1),
    ...joinSteps("Worker B", "worker-b", 2),
    ...joinSteps("Worker C", "worker-c", 3),
    {
      id: "note-more-workers-than-partitions",
      title: "Three workers, one partition",
      fromActorId: "share-coordinator",
      toActorId: "share-coordinator",
      direction: "internal",
      narrative:
        "tasks-0 has only one partition, but the share group has three workers. A classic consumer group could only ever let one member read tasks-0 at a time — the other two would sit idle. A share group instead lets all three pull and lease individual records from it concurrently.",
      state: [
        { label: "Partitions", value: "1 (tasks-0)", tone: "neutral" },
        { label: "Workers", value: "3 (A, B, C)", tone: "info" },
        { label: "Ownership model", value: "record-level leases, not partition ownership", tone: "success", changed: true },
      ],
    },
    {
      id: "fetch-a",
      title: "ShareFetch (Worker A pulls a job)",
      fromActorId: "worker-a",
      toActorId: "share-coordinator",
      direction: "request",
      narrative: "Worker A asks for up to 1 record to process.",
      state: [],
      frames: [shareFetchReq(4, "Worker A")],
    },
    {
      id: "fetch-a-resp",
      title: "ShareFetch response — record leased to A",
      fromActorId: "share-coordinator",
      toActorId: "worker-a",
      direction: "response",
      narrative:
        "Offset 101 (a tool-call job) is leased to Worker A for 30 seconds. It stays in the log and is NOT hidden from other workers' fetch requests — it is simply marked \"in-flight\" and skipped until the lease expires or is resolved.",
      state: [
        { label: "Offset 101", value: "leased to Worker A (30s)", tone: "info", changed: true },
      ],
      frames: [shareFetchResp(4, { acquiredRecords: "offset=101 (tool_call: search_flights)" })],
    },
    {
      id: "fetch-b",
      title: "ShareFetch (Worker B pulls concurrently)",
      fromActorId: "worker-b",
      toActorId: "share-coordinator",
      direction: "request",
      narrative: "At the same time, Worker B fetches from the same partition.",
      state: [],
      frames: [shareFetchReq(5, "Worker B")],
    },
    {
      id: "fetch-b-resp",
      title: "ShareFetch response — next record leased to B",
      fromActorId: "share-coordinator",
      toActorId: "worker-b",
      direction: "response",
      narrative: "Worker B is leased offset 102, a different job — the coordinator hands out records round-robin among in-flight fetchers.",
      state: [{ label: "Offset 102", value: "leased to Worker B (30s)", tone: "info", changed: true }],
      frames: [shareFetchResp(5, { acquiredRecords: "offset=102 (tool_call: book_hotel)" })],
    },
    {
      id: "ack-a",
      title: "ShareAcknowledge (A: ACCEPT)",
      fromActorId: "worker-a",
      toActorId: "share-coordinator",
      direction: "request",
      narrative: "Worker A finishes the tool call successfully and acknowledges offset 101 as ACCEPT.",
      state: [],
      frames: [shareAcknowledgeReq(6, "Worker A", 101, 0)],
    },
    {
      id: "ack-a-resp",
      title: "ShareAcknowledge response — offset 101 resolved",
      fromActorId: "share-coordinator",
      toActorId: "worker-a",
      direction: "response",
      narrative: "The lease is released permanently; offset 101 will never be redelivered to any worker.",
      state: [{ label: "Offset 101", value: "acknowledged — done", tone: "success", changed: true }],
      frames: [shareAcknowledgeResp(6)],
    },
  ];
  return {
    id: "work-sharing-pool",
    label: "AI-agent worker pool — record-level sharing",
    summary: "Three workers, one partition: every worker leases and acknowledges individual records instead of owning exclusive partitions.",
    steps,
  };
}

/* ---------------------------------------------------------------------- */
/* Variant: release, reject, and poison-pill delivery count                */
/* ---------------------------------------------------------------------- */

function releaseRejectVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...joinSteps("Worker A", "worker-a", 1),
    ...joinSteps("Worker B", "worker-b", 2),
    {
      id: "fetch-a-transient",
      title: "ShareFetch — Worker A leases offset 201",
      fromActorId: "worker-a",
      toActorId: "share-coordinator",
      direction: "request",
      narrative: "Worker A fetches a job that calls an external, currently rate-limited API.",
      state: [],
      frames: [shareFetchReq(3, "Worker A"), shareFetchResp(3, { acquiredRecords: "offset=201 (tool_call: send_email)", deliveryCounts: "1" })],
    },
    {
      id: "release-201",
      title: "ShareAcknowledge (A: RELEASE)",
      fromActorId: "worker-a",
      toActorId: "share-coordinator",
      direction: "request",
      narrative:
        "The downstream API returned a transient rate-limit error. Worker A releases offset 201 instead of accepting or rejecting it — this is a hint that the job is fine, just not right now.",
      state: [{ label: "Offset 201 delivery count", value: "1", tone: "neutral" }],
      frames: [shareAcknowledgeReq(4, "Worker A", 201, 1)],
    },
    {
      id: "redelivery-to-b",
      title: "Immediate redelivery — Worker B fetches offset 201",
      fromActorId: "share-coordinator",
      toActorId: "worker-b",
      direction: "response",
      narrative:
        "A released record becomes immediately eligible for redelivery to any available worker — not just the one that released it. Worker B's next ShareFetch picks it up with delivery_count now at 2.",
      state: [{ label: "Offset 201 delivery count", value: "2", tone: "warning", changed: true }],
      frames: [shareFetchReq(5, "Worker B"), shareFetchResp(5, { acquiredRecords: "offset=201 (tool_call: send_email)", deliveryCounts: "2" })],
    },
    {
      id: "lock-expiry",
      title: "Lock expiry — B never acknowledges",
      fromActorId: "worker-b",
      toActorId: "share-coordinator",
      direction: "internal",
      narrative:
        "Worker B hangs (its process stalls). No ShareAcknowledge arrives before the 30-second acquisition lock expires. The share coordinator treats an expired lock exactly like an explicit RELEASE.",
      state: [{ label: "Offset 201 lease", value: "expired (30s elapsed, no ack)", tone: "warning", changed: true }],
    },
    {
      id: "redelivery-to-a-poison",
      title: "Redelivered again — now looks like a poison record",
      fromActorId: "share-coordinator",
      toActorId: "worker-a",
      direction: "response",
      narrative: "Offset 201 is redelivered again, now at delivery_count=3. Two release-equivalent outcomes in a row is the signal that this may be a poison record rather than a transient blip.",
      state: [{ label: "Offset 201 delivery count", value: "3", tone: "danger", changed: true }],
      frames: [shareFetchResp(6, { acquiredRecords: "offset=201 (tool_call: send_email)", deliveryCounts: "3" })],
      annotation: {
        tone: "warning",
        text: "group.share.delivery.count.limit (default 5) bounds how many times a record is redelivered before it is treated as poison.",
      },
    },
    {
      id: "reject-poison",
      title: "ShareAcknowledge (A: REJECT — poison record)",
      fromActorId: "worker-a",
      toActorId: "share-coordinator",
      direction: "request",
      narrative:
        "After inspecting the payload, Worker A determines the job is permanently malformed and rejects it outright rather than releasing it for another retry.",
      state: [],
      frames: [shareAcknowledgeReq(7, "Worker A", 201, 2)],
    },
    {
      id: "reject-resp",
      title: "ShareAcknowledge response — archived, not requeued",
      fromActorId: "share-coordinator",
      toActorId: "worker-a",
      direction: "response",
      narrative:
        "A REJECT (or hitting the delivery count limit) moves the record to the share group's terminal/dead state instead of redelivering it again — the equivalent of dead-lettering, without a separate dead-letter topic.",
      state: [{ label: "Offset 201", value: "rejected — terminal, no further redelivery", tone: "danger", changed: true }],
      frames: [shareAcknowledgeResp(8)],
    },
  ];
  return {
    id: "release-reject-poison",
    label: "Release, reject, and poison delivery",
    summary: "A transient failure releases a record for redelivery; a lock expiry does the same implicitly; repeated failure or an explicit reject stops redelivery for good.",
    steps,
  };
}

export const shareGroupsLab: ProtocolLab = {
  slug: "share-groups",
  title: "Share Groups",
  tagline: "KIP-932: ShareGroupHeartbeat -> ShareFetch -> ShareAcknowledge, with record-level leases instead of partition ownership.",
  blurb:
    "Model more consumers than partitions sharing work at the record level: accept, release, reject, lock expiry, redelivery, and delivery-count-based poison handling for an AI-agent worker pool.",
  focusAreas: ["ShareGroupHeartbeat", "ShareFetch", "ShareAcknowledge", "acquisition lock", "delivery count", "record-level sharing"],
  actors: ACTORS,
  variants: [workSharingVariant(), releaseRejectVariant()],
  links: {
    learnSlugs: ["kafka-for-ai", "agent-traces"],
    kipIds: [932, 848],
  },
};
