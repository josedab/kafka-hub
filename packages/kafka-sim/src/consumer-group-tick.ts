import type { ClusterState } from "./engine-types";
import { appendClusterEvent } from "./state";

export function advanceConsumerGroups(state: ClusterState): void {
  for (const group of state.groups) {
    if (
      group.groupProtocol === "consumer" &&
      group.reconciliationState === "reconciling"
    ) {
      for (const member of group.members) {
        if (!member.alive) continue;
        for (const partitionId of member.pendingAssigned) {
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
        member.pendingAssigned = [];
      }
      group.reconciliationState = "stable";
      appendClusterEvent(
        state,
        "info",
        `[${group.id}] KIP-848 reconciliation complete — pending assignments activated, group stable`,
      );
    }

    for (const member of group.members) {
      if (!member.alive) continue;
      if (member.paused) {
        member.paused = false;
        appendClusterEvent(
          state,
          "info",
          `consumer ${member.id} resumed after rebalance pause`,
        );
        continue;
      }

      for (const partitionId of member.assigned) {
        const partition = state.topic.partitions.find(
          (candidate) => candidate.id === partitionId,
        );
        if (!partition || partition.isr.length === 0) continue;

        const committed = member.committed[partitionId] ?? 0;
        const advance = Math.min(
          group.consumeRatePerTick,
          partition.hw - committed,
        );
        if (advance <= 0) continue;

        member.committed[partitionId] = committed + advance;
        group.groupCommitted[partitionId] = Math.max(
          group.groupCommitted[partitionId] ?? 0,
          member.committed[partitionId],
        );
      }
    }
  }
}
