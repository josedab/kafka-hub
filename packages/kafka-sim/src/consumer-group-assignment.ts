import type {
  ClusterState,
  ConsumerInstance,
  PartitionId,
  RebalanceEvent,
} from "./engine-types";
import { appendClusterEvent } from "./state";

export function assignGroup(
  state: ClusterState,
  groupId: string,
  operation: RebalanceEvent["operation"],
): RebalanceEvent | null {
  const group = state.groups.find((candidate) => candidate.id === groupId);
  if (!group) return null;

  const aliveMembers = group.members.filter((member) => member.alive);
  if (aliveMembers.length === 0) {
    for (const member of group.members) {
      member.assigned = [];
      member.pendingAssigned = [];
    }
    group.reconciliationState = "stable";
    return null;
  }

  const partitionIds = state.topic.partitions.map((partition) => partition.id);
  const previousAssignment = new Map<PartitionId, string>();
  for (const member of group.members) {
    for (const partitionId of member.assigned) {
      previousAssignment.set(partitionId, member.id);
    }
  }

  const targetAssignment = computeStickyAssignment(partitionIds, aliveMembers);
  const movedPartitions: Array<[PartitionId, string | null, string | null]> = [];
  const revokedPartitions: Record<string, PartitionId[]> = {};
  const assignedPartitions: Record<string, PartitionId[]> = {};
  const unassignedPartitions: PartitionId[] = [];

  for (const member of group.members) revokedPartitions[member.id] = [];
  for (const member of aliveMembers) assignedPartitions[member.id] = [];

  for (const partitionId of partitionIds) {
    const previousOwner = previousAssignment.get(partitionId) ?? null;
    const nextOwner = targetAssignment.get(partitionId) ?? null;
    if (previousOwner !== nextOwner) {
      movedPartitions.push([partitionId, previousOwner, nextOwner]);
      if (previousOwner) revokedPartitions[previousOwner].push(partitionId);
      if (nextOwner && assignedPartitions[nextOwner]) {
        assignedPartitions[nextOwner].push(partitionId);
      }
    }
  }

  group.groupEpoch += 1;

  const pausedMembers: string[] = [];
  let pauseTicks = 0;
  let reconciliationState: "stable" | "reconciling" | undefined;
  let duplicateRisk: RebalanceEvent["duplicateRisk"];

  if (group.groupProtocol === "classic") {
    if (group.classicAssignmentBehavior === "eager") {
      for (const member of aliveMembers) {
        if (member.assigned.length > 0 || movedPartitions.length > 0) {
          member.paused = true;
          pausedMembers.push(member.id);
        }
        for (const partitionId of member.assigned) {
          if (!revokedPartitions[member.id].includes(partitionId)) {
            revokedPartitions[member.id].push(partitionId);
          }
        }
        member.assigned = [];
      }
      for (const member of aliveMembers) {
        const newPartitions = partitionIds.filter(
          (partitionId) => targetAssignment.get(partitionId) === member.id,
        );
        member.assigned = newPartitions;
        member.memberEpoch = group.groupEpoch;
        for (const partitionId of newPartitions) {
          if (
            member.committed[partitionId] === undefined &&
            group.groupCommitted[partitionId] !== undefined
          ) {
            member.committed[partitionId] = group.groupCommitted[partitionId];
          }
        }
      }
      pauseTicks = 1;
      duplicateRisk = operation === "crash"
        ? { level: "elevated", reason: "Crash without offset commit — new owner replays from last committed offset" }
        : { level: "low", reason: "Eager rebalance: all members pause, but graceful commit reduces duplicates" };
      group.reconciliationState = "stable";
      appendClusterEvent(state, "warn", `[${groupId}] eager rebalance: all ${pausedMembers.length} members paused (stop-the-world)`);
    } else {
      for (const member of aliveMembers) {
        const revoked = revokedPartitions[member.id] ?? [];
        if (revoked.length > 0) {
          member.paused = true;
          pausedMembers.push(member.id);
          member.assigned = member.assigned.filter(
            (partitionId) => !revoked.includes(partitionId),
          );
        }
      }
      for (const member of aliveMembers) {
        const newPartitions = assignedPartitions[member.id] ?? [];
        for (const partitionId of newPartitions) {
          if (!member.assigned.includes(partitionId)) {
            member.assigned.push(partitionId);
            if (
              member.committed[partitionId] === undefined &&
              group.groupCommitted[partitionId] !== undefined
            ) {
              member.committed[partitionId] =
                group.groupCommitted[partitionId];
            }
          }
        }
        member.memberEpoch = group.groupEpoch;
      }
      pauseTicks = pausedMembers.length > 0 ? 1 : 0;
      duplicateRisk = operation === "crash"
        ? { level: "elevated", reason: "Crash without offset commit — new owner replays from last committed offset" }
        : { level: "low", reason: "Cooperative rebalance: only moved partitions revoked, processing continues for unaffected" };
      group.reconciliationState = "stable";
      if (pausedMembers.length > 0) {
        appendClusterEvent(state, "info", `[${groupId}] cooperative rebalance: ${pausedMembers.length} member(s) paused for revoked partitions only`);
      }
    }
  } else {
    if (movedPartitions.length > 0) {
      reconciliationState = "reconciling";

      for (const member of aliveMembers) {
        const revoked = revokedPartitions[member.id] ?? [];
        const newlyAssigned = assignedPartitions[member.id] ?? [];
        member.assigned = member.assigned.filter(
          (partitionId) => !revoked.includes(partitionId),
        );
        member.pendingAssigned = newlyAssigned.filter(
          (partitionId) => !member.assigned.includes(partitionId),
        );
        member.memberEpoch = group.groupEpoch;
      }

      for (const member of aliveMembers) {
        for (const partitionId of member.pendingAssigned) {
          if (!unassignedPartitions.includes(partitionId)) {
            unassignedPartitions.push(partitionId);
          }
        }
      }

      group.reconciliationState = "reconciling";
    } else {
      reconciliationState = "stable";
      for (const member of aliveMembers) {
        member.memberEpoch = group.groupEpoch;
      }
      group.reconciliationState = "stable";
    }

    pauseTicks = 0;
    duplicateRisk = operation === "crash"
      ? { level: "elevated", reason: "Crash without offset commit — broker reconciles assignment but new owner replays from last committed offset" }
      : { level: "low", reason: "Consumer protocol (KIP-848): broker-coordinated incremental reconciliation, no stop-the-world pause" };

    if (movedPartitions.length > 0) {
      appendClusterEvent(state, "info", `[${groupId}] KIP-848 consumer protocol rebalance: broker-coordinated, ${movedPartitions.length} partition(s) moved via epochs (group epoch ${group.groupEpoch}, reconciling)`);
    }
  }

  for (const member of group.members) {
    if (!member.alive) {
      member.assigned = [];
      member.pendingAssigned = [];
    }
  }

  for (const member of aliveMembers) {
    for (const partitionId of member.assigned) {
      if (member.committed[partitionId] !== undefined) {
        group.groupCommitted[partitionId] = Math.max(
          group.groupCommitted[partitionId] ?? 0,
          member.committed[partitionId],
        );
      }
    }
  }

  const memberEpochs: Record<string, number> = {};
  for (const member of aliveMembers) {
    memberEpochs[member.id] = member.memberEpoch;
  }

  return {
    operation,
    groupProtocol: group.groupProtocol,
    classicAssignmentBehavior: group.groupProtocol === "classic"
      ? group.classicAssignmentBehavior
      : undefined,
    assignor: group.assignor,
    groupEpoch: group.groupEpoch,
    memberEpochs,
    movedPartitions,
    revokedPartitions,
    assignedPartitions,
    pausedMembers,
    pauseTicks,
    duplicateRisk,
    reconciliationState,
    unassignedPartitions,
  };
}

function computeStickyAssignment(
  partitionIds: PartitionId[],
  members: ConsumerInstance[],
): Map<PartitionId, string> {
  const aliveMembers = members.filter((member) => member.alive);
  if (aliveMembers.length === 0) return new Map();

  const currentAssignment = new Map<PartitionId, string>();
  for (const member of aliveMembers) {
    for (const partitionId of member.assigned) {
      currentAssignment.set(partitionId, member.id);
    }
  }

  const memberPartitionCount = new Map<string, number>();
  for (const member of aliveMembers) memberPartitionCount.set(member.id, 0);

  const target = Math.ceil(partitionIds.length / aliveMembers.length);
  const newAssignment = new Map<PartitionId, string>();

  for (const [partitionId, memberId] of currentAssignment) {
    if (
      aliveMembers.some((member) => member.id === memberId) &&
      (memberPartitionCount.get(memberId) ?? 0) < target
    ) {
      newAssignment.set(partitionId, memberId);
      memberPartitionCount.set(
        memberId,
        (memberPartitionCount.get(memberId) ?? 0) + 1,
      );
    }
  }

  for (const partitionId of partitionIds) {
    if (newAssignment.has(partitionId)) continue;
    const sorted = [...aliveMembers].sort(
      (a, b) =>
        (memberPartitionCount.get(a.id) ?? 0) -
        (memberPartitionCount.get(b.id) ?? 0),
    );
    const least = sorted[0];
    newAssignment.set(partitionId, least.id);
    memberPartitionCount.set(
      least.id,
      (memberPartitionCount.get(least.id) ?? 0) + 1,
    );
  }

  return newAssignment;
}
