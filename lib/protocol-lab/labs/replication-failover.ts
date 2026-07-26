/**
 * Replication / Failover lab.
 *
 * Follower fetch, LEO/HW advancement, and ISR maintenance in steady state;
 * a clean failover to an in-ISR replica; a clean-vs-unclean comparison when
 * every in-sync replica is gone; and a stale replica rejoin that uses
 * leader-epoch-based OffsetForLeaderEpoch (KIP-101 / KIP-279 / KIP-320) to
 * find the exact divergence point and truncate safely.
 */
import type { ProtocolActor, ProtocolLab, ProtocolStep, ProtocolVariant, WireFrame } from "../types";

const leader: ProtocolActor = { id: "broker-2", label: "Broker 2", role: "broker", detail: "leader: orders-0" };
const followerA: ProtocolActor = { id: "broker-3", label: "Broker 3", role: "broker", detail: "follower: orders-0" };
const followerB: ProtocolActor = { id: "broker-4", label: "Broker 4", role: "broker", detail: "follower: orders-0" };
const controller: ProtocolActor = { id: "controller", label: "Controller", role: "controller", detail: "KRaft active controller" };

const ACTORS: readonly ProtocolActor[] = [controller, leader, followerA, followerB];

function fetchReq(cid: number, fromId: string, fetchOffset: number, leaderEpoch: number): WireFrame {
  return {
    kind: "request",
    apiName: "Fetch",
    apiKey: 1,
    apiVersion: 16,
    correlationId: cid,
    clientId: `replica-fetcher-${fromId}`,
    headerFields: [
      { name: "api_key", value: "1", type: "INT16" },
      { name: "api_version", value: "16", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "replica_id", value: fromId, type: "INT32" },
      { name: "topics[0].partitions[0].fetch_offset", value: String(fetchOffset), type: "INT64" },
      { name: "topics[0].partitions[0].current_leader_epoch", value: String(leaderEpoch), type: "INT32" },
    ],
    hexBytes: ["00 01", "00 10", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=1", "api_version=16", "correlation_id"],
  };
}

function fetchResp(
  cid: number,
  opts: { highWatermark: number; recordsNote: string; errorCode?: number; errorName?: string },
): WireFrame {
  const errorCode = opts.errorCode ?? 0;
  const errorName = opts.errorName ?? "NONE";
  return {
    kind: "response",
    apiName: "Fetch",
    apiKey: 1,
    apiVersion: 16,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields:
      errorCode === 0
        ? [
            { name: "error_code", value: "0", type: "INT16", note: "NONE" },
            { name: "high_watermark", value: String(opts.highWatermark), type: "INT64" },
            { name: "records", value: opts.recordsNote, type: "COMPACT_RECORDS" },
          ]
        : [{ name: "error_code", value: String(errorCode), type: "INT16", note: errorName }],
    errorCode,
    errorName,
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`],
    hexLabels: [`error_code=${errorName}`],
  };
}

function brokerHeartbeatReq(cid: number, brokerId: number): WireFrame {
  return {
    kind: "request",
    apiName: "BrokerHeartbeat",
    apiKey: 63,
    apiVersion: 1,
    correlationId: cid,
    clientId: `broker-${brokerId}`,
    headerFields: [
      { name: "api_key", value: "63", type: "INT16" },
      { name: "api_version", value: "1", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "broker_id", value: String(brokerId), type: "INT32" },
      { name: "current_metadata_offset", value: "884213", type: "INT64" },
    ],
    hexBytes: ["00 3F", "00 01", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=63", "api_version=1", "correlation_id"],
  };
}

function offsetForLeaderEpochReq(cid: number, queryEpoch: number): WireFrame {
  return {
    kind: "request",
    apiName: "OffsetForLeaderEpoch",
    apiKey: 23,
    apiVersion: 4,
    correlationId: cid,
    clientId: "replica-fetcher-4",
    headerFields: [
      { name: "api_key", value: "23", type: "INT16" },
      { name: "api_version", value: "4", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "replica_id", value: "4", type: "INT32" },
      { name: "topics[0].partitions[0].current_leader_epoch", value: "9", type: "INT32" },
      { name: "topics[0].partitions[0].leader_epoch", value: String(queryEpoch), type: "INT32", note: "the follower's last known epoch" },
    ],
    hexBytes: ["00 17", "00 04", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=23", "api_version=4", "correlation_id"],
  };
}

function offsetForLeaderEpochResp(cid: number, endOffset: number): WireFrame {
  return {
    kind: "response",
    apiName: "OffsetForLeaderEpoch",
    apiKey: 23,
    apiVersion: 4,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "topics[0].partitions[0].leader_epoch", value: "7", type: "INT32" },
      { name: "topics[0].partitions[0].end_offset", value: String(endOffset), type: "INT64", note: "first offset NOT written under epoch 7" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: ["00 00", "00 00 00 " + endOffset.toString(16).padStart(2, "0").toUpperCase()],
    hexLabels: ["error_code=NONE", "end_offset"],
  };
}

/* ---------------------------------------------------------------------- */

function steadyStateVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "initial-state",
      title: "Steady state before this fetch round",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative: "Broker 2 leads orders-0 at leader epoch 12. Its LEO is 1000; the last-agreed high watermark (HW) is 997 while followers catch up on the newest batch.",
      state: [
        { label: "Leader", value: "broker-2", tone: "success" },
        { label: "Leader epoch", value: "12", tone: "neutral" },
        { label: "broker-2 LEO", value: "1000", tone: "info" },
        { label: "HW", value: "997", tone: "neutral" },
        { label: "ISR", value: "{2, 3, 4}", tone: "success" },
      ],
    },
    {
      id: "fetch-3-req",
      title: "Broker 3 Fetch request",
      fromActorId: "broker-3",
      toActorId: "broker-2",
      direction: "request",
      narrative: "Broker 3's replica fetcher asks for records starting at its own LEO, 997.",
      state: [{ label: "broker-3 LEO", value: "997", tone: "neutral" }],
      frames: [fetchReq(1, "3", 997, 12)],
    },
    {
      id: "fetch-3-resp",
      title: "Broker 3 Fetch response",
      fromActorId: "broker-2",
      toActorId: "broker-3",
      direction: "response",
      narrative: "The leader returns the 3 pending records (997-999) plus its current HW (997, not yet advanced).",
      state: [{ label: "broker-3 LEO", value: "1000", tone: "success", changed: true }],
      frames: [fetchResp(1, { highWatermark: 997, recordsNote: "offsets 997-999 (3 records)" })],
    },
    {
      id: "fetch-4-req",
      title: "Broker 4 Fetch request",
      fromActorId: "broker-4",
      toActorId: "broker-2",
      direction: "request",
      narrative: "Broker 4 fetches the same range independently, on its own schedule.",
      state: [{ label: "broker-4 LEO", value: "997", tone: "neutral" }],
      frames: [fetchReq(2, "4", 997, 12)],
    },
    {
      id: "fetch-4-resp",
      title: "Broker 4 Fetch response",
      fromActorId: "broker-2",
      toActorId: "broker-4",
      direction: "response",
      narrative: "Broker 4 also catches up to LEO 1000.",
      state: [{ label: "broker-4 LEO", value: "1000", tone: "success", changed: true }],
      frames: [fetchResp(2, { highWatermark: 997, recordsNote: "offsets 997-999 (3 records)" })],
    },
    {
      id: "hw-advances",
      title: "Every ISR member has caught up — HW advances",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "Once the leader observes that every ISR member's LEO has reached 1000, it advances the partition's high watermark to 1000. Only records at or below the HW are considered committed and visible to consumers.",
      state: [
        { label: "HW", value: "1000", tone: "success", changed: true },
        { label: "ISR", value: "{2, 3, 4}", tone: "success" },
      ],
    },
  ];
  return {
    id: "steady-state",
    label: "Steady-state replication",
    summary: "Pull-based follower Fetch, LEO/HW advancement, and ISR maintenance with no failures.",
    steps,
  };
}

function cleanFailoverVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "before-crash",
      title: "Before the crash",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative: "Broker 2 leads at epoch 12; Broker 3 and Broker 4 are both fully in the ISR, LEO 1000 == HW 1000 on all three.",
      state: [
        { label: "Leader", value: "broker-2", tone: "success" },
        { label: "ISR", value: "{2, 3, 4}", tone: "success" },
        { label: "HW (all replicas)", value: "1000", tone: "success" },
      ],
    },
    {
      id: "leader-crashes",
      title: "Broker 2 crashes",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative: "Broker 2's process dies. It stops sending BrokerHeartbeat requests to the controller.",
      state: [{ label: "Broker 2", value: "down", tone: "danger", changed: true }],
    },
    {
      id: "heartbeat-timeout",
      title: "Controller notices via missed BrokerHeartbeat",
      fromActorId: "broker-3",
      toActorId: "controller",
      direction: "request",
      narrative:
        "Broker 3's own BrokerHeartbeat continues arriving normally. The controller separately detects Broker 2's session has expired (no heartbeat within broker.session.timeout.ms) and fences it.",
      state: [{ label: "Broker 2 session", value: "expired — fenced by controller", tone: "danger", changed: true }],
      frames: [brokerHeartbeatReq(1, 3)],
    },
    {
      id: "controller-elects-in-isr",
      title: "Controller elects an in-ISR replica",
      fromActorId: "controller",
      toActorId: "broker-3",
      direction: "broadcast",
      narrative:
        "The controller picks Broker 3 — still fully in the ISR with LEO 1000 — as the new leader, bumps the leader epoch from 12 to 13, and records the change in the metadata log (__cluster_metadata). Brokers replicate this log and update their local view without any client-visible RPC.",
      state: [
        { label: "Leader", value: "broker-3", tone: "success", changed: true },
        { label: "Leader epoch", value: "13", tone: "success", changed: true },
        { label: "Data lost", value: "none — broker-3 had every committed record", tone: "success", changed: true },
      ],
      annotation: {
        tone: "success",
        text: "Clean failover: only a replica already in the ISR (fully caught up to the old HW) may become leader, so nothing committed is lost.",
      },
    },
    {
      id: "broker4-follows-new-leader",
      title: "Broker 4 starts fetching from the new leader",
      fromActorId: "broker-4",
      toActorId: "broker-3",
      direction: "request",
      narrative: "Broker 4 picks up the metadata change and redirects its replica fetcher to Broker 3 — no truncation is needed since its log already matches.",
      state: [{ label: "ISR", value: "{3, 4}", tone: "success", changed: true }],
      frames: [fetchReq(3, "4", 1000, 13)],
    },
  ];
  return {
    id: "clean-failover",
    label: "Clean failover (in-ISR election)",
    summary: "The leader crashes; the controller elects an already in-sync replica. No data is lost.",
    steps,
  };
}

function uncleanFailoverVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "isr-shrinks",
      title: "ISR shrinks to just the leader",
      fromActorId: "broker-2",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "Broker 3 and Broker 4 both fall behind — a slow disk on one, a network hiccup on the other — and drop out of the ISR for exceeding replica.lag.time.max.ms. Only Broker 2 remains in sync.",
      state: [
        { label: "Leader", value: "broker-2", tone: "success" },
        { label: "ISR", value: "{2} — shrunk", tone: "warning", changed: true },
        { label: "broker-2 HW/LEO", value: "1000", tone: "neutral" },
        { label: "broker-3 LEO", value: "960 (lagging)", tone: "warning" },
        { label: "broker-4 LEO", value: "975 (lagging, different point)", tone: "warning" },
      ],
    },
    {
      id: "leader-also-fails",
      title: "The leader fails too",
      fromActorId: "broker-2",
      toActorId: "controller",
      direction: "internal",
      narrative:
        "Broker 2 — the only remaining ISR member — now also goes down. No replica that is known to hold every committed record (up to HW 1000) is available anymore.",
      state: [
        { label: "Broker 2", value: "down", tone: "danger", changed: true },
        { label: "ISR", value: "{} — empty", tone: "danger", changed: true },
        { label: "Partition", value: "unavailable for produce", tone: "danger", changed: true },
      ],
    },
    {
      id: "default-behavior-explained",
      title: "Default (unclean.leader.election.enable=false): stay unavailable",
      fromActorId: "controller",
      toActorId: "controller",
      direction: "internal",
      narrative:
        "With Kafka's default setting, the controller refuses to elect any out-of-sync replica. orders-0 has no leader and rejects produce/fetch until Broker 2 (or another former-ISR member) comes back with its data intact. This is the safe default: zero data loss, at the cost of availability.",
      state: [{ label: "Safe default outcome", value: "partition offline until an in-ISR replica returns", tone: "info", changed: true }],
      annotation: {
        tone: "info",
        text: "This is the recommended posture for data where correctness matters more than availability — most transactional and financial pipelines.",
      },
    },
    {
      id: "operator-forces-unclean",
      title: "Operator explicitly triggers an unclean election",
      fromActorId: "controller",
      toActorId: "broker-4",
      direction: "broadcast",
      narrative:
        "An operator decides availability is more urgent than the risk (or has unclean.leader.election.enable=true configured) and forces an unclean leader election. The controller must pick a live replica even though none is fully in-sync. It picks Broker 4 (LEO 975), the least-far-behind survivor.",
      state: [
        { label: "Leader", value: "broker-4", tone: "warning", changed: true },
        { label: "Leader epoch", value: "13", tone: "warning", changed: true },
        { label: "New effective HW", value: "975", tone: "danger", changed: true },
      ],
    },
    {
      id: "data-loss-quantified",
      title: "Records 976-1000 are permanently lost",
      fromActorId: "broker-4",
      toActorId: "broker-4",
      direction: "internal",
      narrative:
        "Everything committed on the old leader between offset 975 and the old HW of 1000 — 25 records, already acknowledged to producers with acks=all — existed only on brokers that are either gone or being truncated to match the new leader. They cannot be recovered from this cluster.",
      state: [{ label: "Records lost", value: "25 (offsets 976-1000)", tone: "danger", changed: true }],
      annotation: {
        tone: "danger",
        text: "Unclean leader election trades data loss for availability. Records already acknowledged with acks=all can still be lost this way — the true cost is quantifiable, not hypothetical.",
      },
    },
    {
      id: "broker3-truncates",
      title: "Broker 3 rejoins and truncates to the new leader",
      fromActorId: "broker-3",
      toActorId: "broker-4",
      direction: "request",
      narrative:
        "When Broker 3 (LEO 960 at the old leader's epoch) eventually returns, it discovers Broker 4 is now leader at epoch 13 and must discard any of its own records beyond the new leader's log before it can rejoin the ISR.",
      state: [{ label: "broker-3", value: "truncating and resyncing", tone: "warning", changed: true }],
      frames: [fetchReq(4, "3", 960, 13)],
    },
  ];
  return {
    id: "unclean-failover",
    label: "Clean vs. unclean: no ISR survives",
    summary: "Every in-sync replica is gone. Compare staying unavailable (default, no loss) against forcing an unclean election (available, quantified data loss).",
    steps,
  };
}

function staleReplicaRejoinVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "partition-during-changes",
      title: "Broker 4 is network-partitioned during two leader changes",
      fromActorId: "broker-4",
      toActorId: "broker-4",
      direction: "internal",
      narrative:
        "Broker 4 loses network connectivity while still a replica for orders-0 at leader epoch 7, having replicated up to offset 500. While it is unreachable, the partition changes leaders twice (epoch 7 -> 8 -> 9) due to unrelated broker restarts, and the new leaders write beyond offset 500 under different epochs.",
      state: [
        { label: "broker-4 last known epoch", value: "7", tone: "warning" },
        { label: "broker-4 LEO", value: "500", tone: "warning" },
        { label: "Current leader epoch", value: "9", tone: "neutral" },
      ],
    },
    {
      id: "broker4-reconnects",
      title: "Broker 4 reconnects and resumes fetching blindly",
      fromActorId: "broker-4",
      toActorId: "broker-2",
      direction: "request",
      narrative: "Broker 4's replica fetcher comes back online and issues a normal Fetch at its old offset and epoch.",
      state: [],
      frames: [fetchReq(1, "4", 500, 7)],
    },
    {
      id: "leader-detects-epoch-mismatch",
      title: "Leader detects a stale epoch, asks it to reconcile first",
      fromActorId: "broker-2",
      toActorId: "broker-4",
      direction: "response",
      narrative:
        "The current leader (epoch 9) sees Broker 4's current_leader_epoch of 7 is behind. Rather than blindly serving records that might not follow from Broker 4's actual log, the replica fetcher is directed to reconcile via OffsetForLeaderEpoch first — this is the mechanism KIP-101, KIP-279, and KIP-320 introduced to prevent silent log divergence.",
      state: [{ label: "Reconciliation", value: "required before further fetches", tone: "warning", changed: true }],
      frames: [fetchResp(1, { highWatermark: 0, recordsNote: "", errorCode: 74, errorName: "FENCED_LEADER_EPOCH" })],
    },
    {
      id: "offset-for-leader-epoch-req",
      title: "OffsetForLeaderEpoch request",
      fromActorId: "broker-4",
      toActorId: "broker-2",
      direction: "request",
      narrative: "Broker 4 asks the current leader: \"where did epoch 7 end?\" — i.e., the first offset the leader wrote under a later epoch.",
      state: [],
      frames: [offsetForLeaderEpochReq(2, 7)],
    },
    {
      id: "offset-for-leader-epoch-resp",
      title: "OffsetForLeaderEpoch response: epoch 7 ended at 498",
      fromActorId: "broker-2",
      toActorId: "broker-4",
      direction: "response",
      narrative:
        "The leader's epoch cache shows epoch 7 ended at offset 498 — meaning offsets 498-500 that Broker 4 holds were never actually committed under epoch 7 by the replica that became leader afterward. Those two records are divergent.",
      state: [{ label: "Divergence point", value: "offset 498", tone: "danger", changed: true }],
      frames: [offsetForLeaderEpochResp(2, 498)],
    },
    {
      id: "broker4-truncates",
      title: "Broker 4 truncates its log to offset 498",
      fromActorId: "broker-4",
      toActorId: "broker-4",
      direction: "internal",
      narrative: "Broker 4 discards its own records at offsets 498-500 — they diverged from what the cluster actually committed — and now has a log that is a strict prefix of the current leader's.",
      state: [
        { label: "broker-4 LEO", value: "498 (truncated)", tone: "warning", changed: true },
        { label: "broker-4 log", value: "consistent prefix of leader's log", tone: "success", changed: true },
      ],
    },
    {
      id: "broker4-resumes-fetch",
      title: "Broker 4 resumes normal Fetch and catches up",
      fromActorId: "broker-4",
      toActorId: "broker-2",
      direction: "request",
      narrative: "With its log now a guaranteed prefix, Broker 4 fetches forward from offset 498 under epoch 9 and rejoins the ISR once caught up.",
      state: [{ label: "broker-4", value: "recovering — will rejoin ISR", tone: "success", changed: true }],
      frames: [fetchReq(3, "4", 498, 9)],
    },
  ];
  return {
    id: "stale-replica-rejoin",
    label: "Stale replica rejoin & truncation",
    summary: "A replica that missed two leader changes uses OffsetForLeaderEpoch to find the exact divergence point before truncating and resyncing.",
    steps,
  };
}

export const replicationFailoverLab: ProtocolLab = {
  slug: "replication-failover",
  title: "Replication & Failover",
  tagline: "Follower Fetch, LEO/HW, leader epoch, and clean vs. unclean leader election.",
  blurb:
    "Watch pull-based replication advance LEO and HW in steady state, then compare a clean in-ISR failover against a forced unclean election, and see leader-epoch-based truncation resolve a stale replica.",
  focusAreas: ["Fetch", "LEO", "HW", "ISR", "leader epoch", "unclean leader election", "OffsetForLeaderEpoch"],
  actors: ACTORS,
  variants: [steadyStateVariant(), cleanFailoverVariant(), uncleanFailoverVariant(), staleReplicaRejoinVariant()],
  links: {
    learnSlugs: ["isr-and-acks", "unclean-leader-election", "controller-and-metadata"],
    errorIds: ["not-leader-or-follower-exception", "leader-not-available-exception"],
    kipIds: [101, 279, 320],
    scenarioSlugs: ["quorum-loss", "isr-shrink", "network-partition"],
  },
};
