/**
 * Consumer Group lab.
 *
 * Classic protocol (FindCoordinator -> JoinGroup -> SyncGroup -> Heartbeat)
 * versus the KIP-848 consumer group protocol (ConsumerGroupHeartbeat), each
 * walked through an initial join, a scale-out, and a member crash/restart —
 * so the eager "stop-the-world" classic behavior can be compared directly
 * against cooperative-sticky and broker-coordinated incremental
 * reconciliation.
 */
import type { ProtocolActor, ProtocolLab, ProtocolStep, ProtocolVariant, WireFrame } from "../types";

const consumerA: ProtocolActor = { id: "consumer-a", label: "Consumer A", role: "client", detail: "group.instance.id=A" };
const consumerB: ProtocolActor = { id: "consumer-b", label: "Consumer B", role: "client", detail: "group.instance.id=B" };
const coordinator: ProtocolActor = { id: "coordinator", label: "Group Coordinator", role: "coordinator", detail: "orders-consumers" };
const bootstrap: ProtocolActor = { id: "broker-1", label: "Broker 1", role: "broker", detail: "bootstrap" };

const ACTORS: readonly ProtocolActor[] = [bootstrap, coordinator, consumerA, consumerB];

function findCoordinatorReq(cid: number, memberLabel: string): WireFrame {
  return {
    kind: "request",
    apiName: "FindCoordinator",
    apiKey: 10,
    apiVersion: 5,
    correlationId: cid,
    clientId: memberLabel,
    headerFields: [
      { name: "api_key", value: "10", type: "INT16" },
      { name: "api_version", value: "5", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "key", value: "orders-consumers", type: "COMPACT_STRING" },
      { name: "key_type", value: "0", type: "INT8", note: "GROUP" },
    ],
    hexBytes: ["00 0A", "00 05", String(cid).padStart(2, "0"), "00"],
    hexLabels: ["api_key=10", "api_version=5", "correlation_id", "key_type=GROUP"],
  };
}

function findCoordinatorResp(cid: number): WireFrame {
  return {
    kind: "response",
    apiName: "FindCoordinator",
    apiKey: 10,
    apiVersion: 5,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "node_id", value: "1", type: "INT32" },
      { name: "host", value: "broker-1.kafka-hub.lab", type: "COMPACT_STRING" },
      { name: "port", value: "9092", type: "INT32" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: ["00 00", "00 00 00 01", "00 00 23 84"],
    hexLabels: ["error_code=NONE", "node_id=1", "port=9092"],
  };
}

function joinGroupReq(cid: number, memberId: string, generation: number): WireFrame {
  return {
    kind: "request",
    apiName: "JoinGroup",
    apiKey: 11,
    apiVersion: 9,
    correlationId: cid,
    clientId: memberId,
    headerFields: [
      { name: "api_key", value: "11", type: "INT16" },
      { name: "api_version", value: "9", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "group_id", value: "orders-consumers", type: "COMPACT_STRING" },
      { name: "member_id", value: memberId, type: "COMPACT_STRING", note: generation === 0 ? "empty on first join" : undefined },
      { name: "protocol_type", value: "consumer", type: "COMPACT_STRING" },
      { name: "protocols[0].name", value: "range", type: "COMPACT_STRING" },
    ],
    hexBytes: ["00 0B", "00 09", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=11", "api_version=9", "correlation_id"],
  };
}

function joinGroupResp(
  cid: number,
  opts: { generationId: number; leaderId: string; memberId: string; members?: readonly string[]; errorCode?: number; errorName?: string },
): WireFrame {
  const errorCode = opts.errorCode ?? 0;
  return {
    kind: "response",
    apiName: "JoinGroup",
    apiKey: 11,
    apiVersion: 9,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields:
      errorCode === 0
        ? [
            { name: "error_code", value: "0", type: "INT16", note: "NONE" },
            { name: "generation_id", value: String(opts.generationId), type: "INT32" },
            { name: "protocol_name", value: "range", type: "COMPACT_STRING" },
            { name: "leader", value: opts.leaderId, type: "COMPACT_STRING" },
            { name: "member_id", value: opts.memberId, type: "COMPACT_STRING" },
            { name: "members[]", value: (opts.members ?? [opts.memberId]).join(", "), type: "ARRAY" },
          ]
        : [{ name: "error_code", value: String(errorCode), type: "INT16", note: opts.errorName }],
    errorCode,
    errorName: opts.errorName ?? "NONE",
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`, "00 00 00 " + opts.generationId.toString(16).padStart(2, "0").toUpperCase()],
    hexLabels: [`error_code=${opts.errorName ?? "NONE"}`, "generation_id"],
  };
}

function syncGroupReq(cid: number, memberId: string, generationId: number, assignmentNote: string): WireFrame {
  return {
    kind: "request",
    apiName: "SyncGroup",
    apiKey: 14,
    apiVersion: 5,
    correlationId: cid,
    clientId: memberId,
    headerFields: [
      { name: "api_key", value: "14", type: "INT16" },
      { name: "api_version", value: "5", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "group_id", value: "orders-consumers", type: "COMPACT_STRING" },
      { name: "generation_id", value: String(generationId), type: "INT32" },
      { name: "member_id", value: memberId, type: "COMPACT_STRING" },
      { name: "assignments[]", value: assignmentNote, type: "ARRAY", note: "leader computes for all members; followers send empty" },
    ],
    hexBytes: ["00 0E", "00 05", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=14", "api_version=5", "correlation_id"],
  };
}

function syncGroupResp(cid: number, assignment: string): WireFrame {
  return {
    kind: "response",
    apiName: "SyncGroup",
    apiKey: 14,
    apiVersion: 5,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "assignment", value: assignment, type: "COMPACT_BYTES" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: ["00 00"],
    hexLabels: ["error_code=NONE"],
  };
}

function heartbeatReq(cid: number, memberId: string, generationId: number): WireFrame {
  return {
    kind: "request",
    apiName: "Heartbeat",
    apiKey: 12,
    apiVersion: 4,
    correlationId: cid,
    clientId: memberId,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "group_id", value: "orders-consumers", type: "COMPACT_STRING" },
      { name: "generation_id", value: String(generationId), type: "INT32" },
      { name: "member_id", value: memberId, type: "COMPACT_STRING" },
    ],
    hexBytes: ["00 0C", "00 04", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=12", "api_version=4", "correlation_id"],
  };
}

function heartbeatResp(cid: number, errorCode = 0, errorName = "NONE"): WireFrame {
  return {
    kind: "response",
    apiName: "Heartbeat",
    apiKey: 12,
    apiVersion: 4,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [{ name: "error_code", value: String(errorCode), type: "INT16", note: errorName }],
    errorCode,
    errorName,
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`],
    hexLabels: [`error_code=${errorName}`],
  };
}

function consumerGroupHeartbeatReq(
  cid: number,
  memberId: string,
  opts: { memberEpoch: number; ownedPartitions: string; rebalanceTimeoutMs?: number },
): WireFrame {
  return {
    kind: "request",
    apiName: "ConsumerGroupHeartbeat",
    apiKey: 68,
    apiVersion: 1,
    correlationId: cid,
    clientId: memberId,
    headerFields: [
      { name: "api_key", value: "68", type: "INT16" },
      { name: "api_version", value: "1", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "group_id", value: "orders-consumers", type: "COMPACT_STRING" },
      { name: "member_id", value: memberId, type: "COMPACT_STRING" },
      { name: "member_epoch", value: String(opts.memberEpoch), type: "INT32", note: opts.memberEpoch === 0 ? "0 == joining" : undefined },
      { name: "subscribed_topic_names[]", value: "orders", type: "ARRAY" },
      { name: "topic_partitions[]", value: opts.ownedPartitions, type: "ARRAY", note: "currently-owned partitions" },
    ],
    hexBytes: ["00 44", "00 01", String(cid).padStart(2, "0"), "00 00 00 " + opts.memberEpoch.toString(16).padStart(2, "0").toUpperCase()],
    hexLabels: ["api_key=68", "api_version=1", "correlation_id", "member_epoch"],
  };
}

function consumerGroupHeartbeatResp(
  cid: number,
  opts: { memberEpoch: number; assignment: string; heartbeatIntervalMs?: number },
): WireFrame {
  return {
    kind: "response",
    apiName: "ConsumerGroupHeartbeat",
    apiKey: 68,
    apiVersion: 1,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "member_epoch", value: String(opts.memberEpoch), type: "INT32" },
      { name: "heartbeat_interval_ms", value: String(opts.heartbeatIntervalMs ?? 5000), type: "INT32" },
      { name: "assignment.topic_partitions[]", value: opts.assignment, type: "ARRAY" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: ["00 00", "00 00 00 " + opts.memberEpoch.toString(16).padStart(2, "0").toUpperCase()],
    hexLabels: ["error_code=NONE", "member_epoch"],
  };
}

/* ---------------------------------------------------------------------- */
/* Classic eager (stop-the-world)                                          */
/* ---------------------------------------------------------------------- */

function classicEagerVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "find-coord-req",
      title: "FindCoordinator request",
      fromActorId: "consumer-a",
      toActorId: "broker-1",
      direction: "request",
      narrative: "Consumer A asks any broker which node is the group coordinator for \"orders-consumers\".",
      state: [{ label: "Group protocol", value: "classic (range assignor)", tone: "neutral" }],
      frames: [findCoordinatorReq(1, "consumer-a")],
    },
    {
      id: "find-coord-resp",
      title: "FindCoordinator response",
      fromActorId: "broker-1",
      toActorId: "consumer-a",
      direction: "response",
      narrative: "Broker 1 answers: the coordinator for this group's hash is itself.",
      state: [{ label: "Coordinator", value: "broker-1", tone: "info", changed: true }],
      frames: [findCoordinatorResp(1)],
    },
    {
      id: "join-a-req",
      title: "JoinGroup request (A, first member)",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "request",
      narrative: "Consumer A joins with an empty member ID — this is its first time joining.",
      state: [{ label: "Members", value: "{}", tone: "neutral" }],
      frames: [joinGroupReq(2, "", 0)],
    },
    {
      id: "join-a-resp",
      title: "JoinGroup response — A becomes leader",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative:
        "With no other members waiting, the coordinator closes the join window immediately: A is the sole member and the group leader at generation 1.",
      state: [
        { label: "Generation", value: "1", tone: "success", changed: true },
        { label: "Members", value: "{A}", tone: "success", changed: true },
        { label: "Leader", value: "A", tone: "info", changed: true },
      ],
      frames: [joinGroupResp(2, { generationId: 1, leaderId: "A", memberId: "A", members: ["A"] })],
    },
    {
      id: "sync-a-req",
      title: "SyncGroup request (A computes assignment)",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "request",
      narrative: "As leader, A runs the range assignor client-side and sends the full assignment map to the coordinator.",
      state: [],
      frames: [syncGroupReq(3, "A", 1, "A -> [orders-0, orders-1, orders-2, orders-3]")],
    },
    {
      id: "sync-a-resp",
      title: "SyncGroup response — A owns all 4 partitions",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative: "The coordinator distributes the computed assignment back to each member (only A, so far).",
      state: [{ label: "A owns", value: "orders-{0,1,2,3}", tone: "success", changed: true }],
      frames: [syncGroupResp(3, "orders-0, orders-1, orders-2, orders-3")],
    },
    {
      id: "heartbeat-steady",
      title: "Heartbeat (steady state)",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "request",
      narrative: "A heartbeats every session interval to tell the coordinator it is alive and keep its assignment.",
      state: [{ label: "Generation", value: "1", tone: "success" }],
      frames: [heartbeatReq(4, "A", 1), heartbeatResp(4)],
    },
    {
      id: "scale-out-join-b",
      title: "Scale-out: B sends JoinGroup",
      fromActorId: "consumer-b",
      toActorId: "coordinator",
      direction: "request",
      narrative: "A new process, Consumer B, starts up and joins the same group.",
      state: [{ label: "Members", value: "{A, B (joining)}", tone: "info", changed: true }],
      frames: [joinGroupReq(5, "", 0)],
    },
    {
      id: "stop-the-world-heartbeat-error",
      title: "A's next heartbeat is rejected: REBALANCE_IN_PROGRESS",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative:
        "Classic eager rebalancing is stop-the-world: the moment B's join is seen, the coordinator invalidates the current generation. A's very next heartbeat comes back REBALANCE_IN_PROGRESS, forcing it to revoke every partition it owns and rejoin — even though none of A's partitions are moving to a new owner yet.",
      state: [
        { label: "A's partitions", value: "revoked (all 4)", tone: "danger", changed: true },
        { label: "Processing", value: "paused cluster-wide during rebalance", tone: "danger", changed: true },
      ],
      frames: [heartbeatReq(6, "A", 1), heartbeatResp(6, 27, "REBALANCE_IN_PROGRESS")],
      annotation: {
        tone: "danger",
        text: "Eager rebalancing revokes the full assignment for every member on every rebalance, even members whose partitions won't actually move — hence \"stop-the-world.\"",
      },
    },
    {
      id: "rejoin-a",
      title: "A rejoins for the new generation",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "request",
      narrative: "A calls JoinGroup again, now with zero owned partitions.",
      state: [],
      frames: [joinGroupReq(7, "A", 1)],
    },
    {
      id: "join-resp-gen2",
      title: "JoinGroup response — generation 2, both members present",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative: "Both A and B are now in the join window together; the coordinator advances to generation 2 and elects A leader again.",
      state: [
        { label: "Generation", value: "2", tone: "success", changed: true },
        { label: "Members", value: "{A, B}", tone: "success", changed: true },
      ],
      frames: [joinGroupResp(7, { generationId: 2, leaderId: "A", memberId: "A", members: ["A", "B"] })],
    },
    {
      id: "sync-gen2-resp",
      title: "SyncGroup response — partitions split 2/2",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative:
        "The range assignor recomputes from scratch: A keeps orders-{0,1}, B gets orders-{2,3}. Both members had a window with zero assigned partitions between revoke and this response.",
      state: [
        { label: "A owns", value: "orders-{0,1}", tone: "success", changed: true },
        { label: "B owns", value: "orders-{2,3}", tone: "success", changed: true },
      ],
      frames: [syncGroupResp(8, "orders-0, orders-1")],
    },
    {
      id: "crash-b",
      title: "Crash: B stops sending heartbeats",
      fromActorId: "consumer-b",
      toActorId: "coordinator",
      direction: "internal",
      narrative: "Consumer B crashes without a clean LeaveGroup. The coordinator only notices after B's session timeout expires.",
      state: [{ label: "B", value: "unresponsive — session timer running", tone: "warning", changed: true }],
    },
    {
      id: "session-timeout-expels-b",
      title: "Session timeout expels B — full rebalance again",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "broadcast",
      narrative:
        "Once B's session times out, the coordinator forces generation 3: A's next heartbeat again gets REBALANCE_IN_PROGRESS, A revokes orders-{0,1}, rejoins, and only then is reassigned all 4 partitions — another full stop for a change that only affected B's two partitions.",
      state: [
        { label: "Generation", value: "3", tone: "warning", changed: true },
        { label: "Members", value: "{A}", tone: "warning", changed: true },
        { label: "A owns", value: "orders-{0,1,2,3} (after full rejoin)", tone: "success", changed: true },
      ],
      frames: [heartbeatResp(9, 27, "REBALANCE_IN_PROGRESS")],
      annotation: {
        tone: "warning",
        text: "Even a single member's crash forces every remaining member through a full revoke-rejoin-reassign cycle under the classic eager protocol.",
      },
    },
  ];
  return {
    id: "classic-eager",
    label: "Classic — eager (stop-the-world)",
    summary: "Every rebalance revokes every member's full assignment first, then reassigns from scratch.",
    steps,
  };
}

/* ---------------------------------------------------------------------- */
/* Classic cooperative-sticky (incremental, client-driven)                 */
/* ---------------------------------------------------------------------- */

function classicCooperativeVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "join-a-req",
      title: "JoinGroup request (A, cooperative-sticky)",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "request",
      narrative: "Consumer A joins advertising the cooperative-sticky assignor instead of range/eager.",
      state: [{ label: "Group protocol", value: "classic (cooperative-sticky)", tone: "neutral" }],
      frames: [joinGroupReq(1, "", 0)],
    },
    {
      id: "join-a-resp",
      title: "JoinGroup response — A alone, generation 1",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative: "A is the sole member and leader.",
      state: [{ label: "Generation", value: "1", tone: "success", changed: true }],
      frames: [joinGroupResp(1, { generationId: 1, leaderId: "A", memberId: "A", members: ["A"] })],
    },
    {
      id: "sync-a-resp",
      title: "SyncGroup response — A owns all 4 partitions",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative: "A is assigned all four partitions and begins processing.",
      state: [{ label: "A owns", value: "orders-{0,1,2,3}", tone: "success", changed: true }],
      frames: [syncGroupResp(2, "orders-0, orders-1, orders-2, orders-3")],
    },
    {
      id: "scale-out-join-b",
      title: "Scale-out: B sends JoinGroup",
      fromActorId: "consumer-b",
      toActorId: "coordinator",
      direction: "request",
      narrative: "Consumer B starts and joins the group.",
      state: [{ label: "Members", value: "{A, B (joining)}", tone: "info", changed: true }],
      frames: [joinGroupReq(3, "", 0)],
    },
    {
      id: "join-resp-gen2-cooperative",
      title: "JoinGroup response — generation 2, A keeps its work",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative:
        "Cooperative-sticky does not force a blanket revoke. A rejoins reporting the partitions it currently owns; the coordinator only asks it to give up the ones that must move.",
      state: [
        { label: "Generation", value: "2", tone: "success", changed: true },
        { label: "A's reported ownership", value: "orders-{0,1,2,3} (still processing)", tone: "success" },
      ],
      frames: [joinGroupResp(3, { generationId: 2, leaderId: "A", memberId: "A", members: ["A", "B"] })],
    },
    {
      id: "sync-gen2-partial-revoke",
      title: "SyncGroup response — A revokes only orders-{2,3}",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative:
        "The sticky assignor computes a minimal diff: A keeps orders-{0,1} without interruption and only pauses/revokes orders-{2,3}, which move to B. orders-{0,1} are never rebalanced at all.",
      state: [
        { label: "A owns", value: "orders-{0,1} (uninterrupted)", tone: "success", changed: true },
        { label: "Revoked from A", value: "orders-{2,3}", tone: "info", changed: true },
      ],
      frames: [syncGroupResp(4, "orders-0, orders-1")],
      annotation: {
        tone: "success",
        text: "Cooperative rebalancing revokes only the partitions that are actually changing owners — orders-{0,1} keep flowing through A the whole time.",
      },
    },
    {
      id: "sync-gen2-b-assignment",
      title: "SyncGroup response — B is assigned orders-{2,3}",
      fromActorId: "coordinator",
      toActorId: "consumer-b",
      direction: "response",
      narrative: "In the same generation, B receives the two partitions A just released.",
      state: [{ label: "B owns", value: "orders-{2,3}", tone: "success", changed: true }],
      frames: [syncGroupResp(4, "orders-2, orders-3")],
    },
    {
      id: "crash-b",
      title: "Crash: B stops sending heartbeats",
      fromActorId: "consumer-b",
      toActorId: "coordinator",
      direction: "internal",
      narrative: "Consumer B crashes. Its session timeout starts running.",
      state: [{ label: "B", value: "unresponsive — session timer running", tone: "warning", changed: true }],
    },
    {
      id: "session-timeout-cooperative",
      title: "Session timeout — only B's partitions move",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "broadcast",
      narrative:
        "The coordinator advances to generation 3 and reassigns orders-{2,3} to A. A never revokes orders-{0,1} — they were never in scope for this rebalance.",
      state: [
        { label: "Generation", value: "3", tone: "warning", changed: true },
        { label: "A owns", value: "orders-{0,1,2,3}", tone: "success", changed: true },
        { label: "orders-{0,1} processing", value: "uninterrupted throughout", tone: "success" },
      ],
      frames: [syncGroupResp(5, "orders-0, orders-1, orders-2, orders-3")],
    },
  ];
  return {
    id: "classic-cooperative",
    label: "Classic — cooperative-sticky (incremental)",
    summary: "Only the partitions that actually change ownership are revoked; unaffected partitions keep flowing.",
    steps,
  };
}

/* ---------------------------------------------------------------------- */
/* KIP-848 consumer group protocol (broker-coordinated)                    */
/* ---------------------------------------------------------------------- */

function kip848Variant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "cgh-a-join",
      title: "ConsumerGroupHeartbeat (A joins, epoch 0)",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "request",
      narrative:
        "There is no JoinGroup/SyncGroup round trip at all. A sends a single ConsumerGroupHeartbeat with member_epoch=0 to signal it wants to join.",
      state: [{ label: "Group protocol", value: "KIP-848 (broker-coordinated)", tone: "neutral" }],
      frames: [consumerGroupHeartbeatReq(1, "A", { memberEpoch: 0, ownedPartitions: "[]" })],
    },
    {
      id: "cgh-a-join-resp",
      title: "ConsumerGroupHeartbeat response — full assignment",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative:
        "The broker-side group coordinator computes the assignment itself (server-side assignor) and returns it directly in the response, at member epoch 1.",
      state: [
        { label: "A's epoch", value: "1", tone: "success", changed: true },
        { label: "A owns", value: "orders-{0,1,2,3}", tone: "success", changed: true },
      ],
      frames: [consumerGroupHeartbeatResp(1, { memberEpoch: 1, assignment: "orders-0, orders-1, orders-2, orders-3" })],
    },
    {
      id: "cgh-a-steady",
      title: "ConsumerGroupHeartbeat (steady state)",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "request",
      narrative: "A keeps heartbeating on its interval, reporting the partitions it currently owns.",
      state: [{ label: "A's epoch", value: "1", tone: "success" }],
      frames: [
        consumerGroupHeartbeatReq(2, "A", { memberEpoch: 1, ownedPartitions: "orders-0, orders-1, orders-2, orders-3" }),
        consumerGroupHeartbeatResp(2, { memberEpoch: 1, assignment: "orders-0, orders-1, orders-2, orders-3" }),
      ],
    },
    {
      id: "cgh-b-join",
      title: "Scale-out: ConsumerGroupHeartbeat (B joins, epoch 0)",
      fromActorId: "consumer-b",
      toActorId: "coordinator",
      direction: "request",
      narrative: "Consumer B starts and sends its own join heartbeat — entirely independent of A's heartbeat cycle.",
      state: [{ label: "Members", value: "{A, B (joining)}", tone: "info", changed: true }],
      frames: [consumerGroupHeartbeatReq(3, "B", { memberEpoch: 0, ownedPartitions: "[]" })],
    },
    {
      id: "cgh-group-epoch-bump",
      title: "Coordinator recomputes target assignment (group epoch 2)",
      fromActorId: "coordinator",
      toActorId: "coordinator",
      direction: "internal",
      narrative:
        "The coordinator bumps the group epoch and computes a new target assignment for the whole group, but does not stop anyone: it will converge each member to the new target on that member's own next heartbeat, one at a time.",
      state: [{ label: "Group epoch", value: "2", tone: "info", changed: true }],
    },
    {
      id: "cgh-a-revoke-partial",
      title: "A's next heartbeat: told to release orders-{2,3}",
      fromActorId: "coordinator",
      toActorId: "consumer-a",
      direction: "response",
      narrative:
        "A's regular heartbeat response now carries a smaller target assignment — orders-{0,1} only. A keeps processing orders-{0,1} without interruption and simply stops fetching orders-{2,3} once it acknowledges the new epoch.",
      state: [
        { label: "A's epoch", value: "2", tone: "success", changed: true },
        { label: "A owns", value: "orders-{0,1} (uninterrupted)", tone: "success", changed: true },
      ],
      frames: [
        consumerGroupHeartbeatReq(4, "A", { memberEpoch: 1, ownedPartitions: "orders-0, orders-1, orders-2, orders-3" }),
        consumerGroupHeartbeatResp(4, { memberEpoch: 2, assignment: "orders-0, orders-1" }),
      ],
      annotation: {
        tone: "success",
        text: "No stop-the-world barrier: reconciliation is per-member and incremental, driven entirely by the broker-side coordinator.",
      },
    },
    {
      id: "cgh-b-gets-assignment",
      title: "B's next heartbeat: assigned orders-{2,3}",
      fromActorId: "coordinator",
      toActorId: "consumer-b",
      direction: "response",
      narrative: "Once the coordinator sees A has released orders-{2,3} (its epoch advanced), it hands them to B.",
      state: [
        { label: "B's epoch", value: "2", tone: "success", changed: true },
        { label: "B owns", value: "orders-{2,3}", tone: "success", changed: true },
      ],
      frames: [
        consumerGroupHeartbeatReq(5, "B", { memberEpoch: 0, ownedPartitions: "[]" }),
        consumerGroupHeartbeatResp(5, { memberEpoch: 2, assignment: "orders-2, orders-3" }),
      ],
    },
    {
      id: "crash-a",
      title: "Crash: A stops heartbeating",
      fromActorId: "consumer-a",
      toActorId: "coordinator",
      direction: "internal",
      narrative: "Consumer A crashes. Because heartbeats are per-member, only A's session timer is affected — B keeps heartbeating and owning orders-{2,3} normally.",
      state: [{ label: "A", value: "unresponsive — session timer running", tone: "warning", changed: true }],
    },
    {
      id: "cgh-restart-a-reassign",
      title: "Session timeout: orders-{0,1} reassigned, B untouched",
      fromActorId: "coordinator",
      toActorId: "consumer-b",
      direction: "response",
      narrative:
        "After A's session times out, the coordinator bumps the group epoch again and hands orders-{0,1} to B on B's own next heartbeat. B's existing partitions, orders-{2,3}, are never revoked or re-fetched.",
      state: [
        { label: "Group epoch", value: "3", tone: "warning", changed: true },
        { label: "B owns", value: "orders-{0,1,2,3}", tone: "success", changed: true },
        { label: "orders-{2,3} processing", value: "uninterrupted throughout", tone: "success" },
      ],
      frames: [
        consumerGroupHeartbeatReq(6, "B", { memberEpoch: 2, ownedPartitions: "orders-2, orders-3" }),
        consumerGroupHeartbeatResp(6, { memberEpoch: 3, assignment: "orders-0, orders-1, orders-2, orders-3" }),
      ],
    },
  ];
  return {
    id: "kip-848",
    label: "KIP-848 — ConsumerGroupHeartbeat",
    summary: "One RPC, no JoinGroup/SyncGroup round trip. The broker computes and reconciles assignment per-member, incrementally.",
    steps,
  };
}

export const consumerGroupLab: ProtocolLab = {
  slug: "consumer-group",
  title: "Consumer Group",
  tagline: "Classic FindCoordinator -> JoinGroup -> SyncGroup -> Heartbeat vs. KIP-848 ConsumerGroupHeartbeat.",
  blurb:
    "Compare the classic eager (stop-the-world) protocol, classic cooperative-sticky, and the KIP-848 broker-coordinated protocol across the same scale-out and crash/restart sequence.",
  focusAreas: ["FindCoordinator", "JoinGroup", "SyncGroup", "Heartbeat", "ConsumerGroupHeartbeat", "generation/epoch", "rebalance"],
  actors: ACTORS,
  variants: [classicEagerVariant(), classicCooperativeVariant(), kip848Variant()],
  links: {
    learnSlugs: ["consumer-rebalance", "partition-assignment"],
    kipIds: [848, 345],
    scenarioSlugs: ["rebalance-eager-classic", "rebalance-cooperative-classic", "rebalance-consumer-protocol"],
  },
};
