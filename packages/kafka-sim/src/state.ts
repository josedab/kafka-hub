/**
 * Cluster state construction, cloning, and bounded event logging.
 */

import type {
  Broker,
  BrokerId,
  ClusterEvent,
  ClusterOptions,
  ClusterState,
  LogRecord,
  Partition,
  PartitionId,
  RebalanceEvent,
} from "./engine-types";

// ───────────────────────── construction ─────────────────────────

export function createCluster(opts: ClusterOptions = {}): ClusterState {
  const brokerCount = opts.brokerCount ?? 3;
  const partitionCount = opts.partitionCount ?? 3;
  const replicationFactor = Math.min(
    opts.replicationFactor ?? 3,
    brokerCount,
  );
  const minInsyncReplicas = Math.min(
    opts.minInsyncReplicas ?? 2,
    replicationFactor,
  );

  const brokers: Broker[] = Array.from({ length: brokerCount }, (_, i) => ({
    id: i,
    alive: true,
  }));

  const partitions: Partition[] = Array.from(
    { length: partitionCount },
    (_, p) => {
      const replicas = Array.from(
        { length: replicationFactor },
        (_, r) => (p + r) % brokerCount,
      );
      const logs: Record<BrokerId, LogRecord[]> = {};
      const lag: Record<BrokerId, number> = {};
      for (const r of replicas) {
        logs[r] = [];
        lag[r] = 0;
      }
      return {
        id: p,
        replicas,
        isr: [...replicas],
        logs,
        hw: 0,
        followerLagMs: lag,
        compacted: opts.compacted ?? false,
      };
    },
  );

  return {
    tick: 0,
    brokers,
    topic: {
      name: opts.topicName ?? "events",
      partitions,
      replicationFactor,
      minInsyncReplicas,
    },
    groups: [],
    netPartition: null,
    producerAcks: opts.producerAcks ?? "all",
    events: [
      { tick: 0, level: "info", message: `cluster bootstrapped with ${brokerCount} brokers` },
    ],
  };
}

// ───────────────────────── mutation helpers ─────────────────────────

function deepCloneRebalanceEvent(evt: RebalanceEvent): RebalanceEvent {
  return {
    ...evt,
    memberEpochs: { ...evt.memberEpochs },
    movedPartitions: evt.movedPartitions.map((t) => [...t] as [PartitionId, string | null, string | null]),
    revokedPartitions: Object.fromEntries(
      Object.entries(evt.revokedPartitions).map(([k, v]) => [k, [...v]]),
    ),
    assignedPartitions: Object.fromEntries(
      Object.entries(evt.assignedPartitions).map(([k, v]) => [k, [...v]]),
    ),
    pausedMembers: [...evt.pausedMembers],
    duplicateRisk: { ...evt.duplicateRisk },
    unassignedPartitions: [...evt.unassignedPartitions],
  };
}

export function cloneClusterState(state: ClusterState): ClusterState {
  return {
    tick: state.tick,
    brokers: state.brokers.map((b) => ({ ...b })),
    topic: {
      ...state.topic,
      partitions: state.topic.partitions.map((p) => ({
        ...p,
        replicas: [...p.replicas],
        isr: [...p.isr],
        logs: Object.fromEntries(
          Object.entries(p.logs).map(([k, v]) => [Number(k), [...v]]),
        ) as Record<BrokerId, LogRecord[]>,
        followerLagMs: { ...p.followerLagMs },
      })),
    },
    groups: state.groups.map((g) => ({
      ...g,
      members: g.members.map((m) => ({
        ...m,
        assigned: [...m.assigned],
        pendingAssigned: [...m.pendingAssigned],
        committed: { ...m.committed },
      })),
      groupCommitted: { ...g.groupCommitted },
      rebalanceEvents: g.rebalanceEvents.map(deepCloneRebalanceEvent),
    })),
    netPartition: state.netPartition
      ? {
          groupA: [...state.netPartition.groupA],
          groupB: [...state.netPartition.groupB],
        }
      : null,
    producerAcks: state.producerAcks,
    events: [...state.events],
  };
}

export function appendClusterEvent(
  state: ClusterState,
  level: ClusterEvent["level"],
  message: string,
) {
  state.events.push({ tick: state.tick, level, message });
  if (state.events.length > 200) state.events.shift();
}

