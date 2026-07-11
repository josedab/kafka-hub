import type {
  Assignor,
  ClassicAssignmentBehavior,
  ClusterState,
  ConsumerGroup,
  ConsumerInstance,
  GroupProtocol,
} from "./engine-types";
import { assignGroup } from "./consumer-group-assignment";
import { resolveProtocolAxes } from "./consumer-group-protocol";
import { appendClusterEvent, cloneClusterState } from "./state";

export function addConsumerGroup(
  state: ClusterState,
  group: {
    id: string;
    protocol?: "eager" | "cooperative";
    groupProtocol?: GroupProtocol;
    classicAssignmentBehavior?: ClassicAssignmentBehavior;
    assignor?: Assignor;
    consumerIds: string[];
    consumeRatePerTick?: number;
  },
): ClusterState {
  const next = cloneClusterState(state);
  const axes = resolveProtocolAxes(group);
  const members: ConsumerInstance[] = group.consumerIds.map((id) => ({
    id,
    assigned: [],
    pendingAssigned: [],
    committed: {},
    paused: false,
    memberEpoch: 0,
    alive: true,
  }));
  const newGroup: ConsumerGroup = {
    id: group.id,
    groupProtocol: axes.groupProtocol,
    classicAssignmentBehavior: axes.classicAssignmentBehavior,
    assignor: axes.assignor,
    members,
    consumeRatePerTick: group.consumeRatePerTick ?? 1,
    groupEpoch: 1,
    groupCommitted: {},
    rebalanceEvents: [],
    reconciliationState: "stable",
    protocol: group.protocol,
  };
  next.groups.push(newGroup);
  const rebalanceEvent = assignGroup(next, group.id, "join");
  if (rebalanceEvent) newGroup.rebalanceEvents.push(rebalanceEvent);
  appendClusterEvent(next, "info", `group ${group.id} created [${axes.groupProtocol}${axes.classicAssignmentBehavior ? `/${axes.classicAssignmentBehavior}` : ""}, assignor=${axes.assignor}] with ${members.length} consumers`);
  return next;
}

export function consumerJoin(
  state: ClusterState,
  groupId: string,
  memberId: string,
): ClusterState {
  const next = cloneClusterState(state);
  const group = next.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    appendClusterEvent(next, "warn", `consumerJoin: group ${groupId} not found`);
    return next;
  }
  if (group.members.some((member) => member.id === memberId && member.alive)) {
    appendClusterEvent(next, "info", `consumerJoin: ${memberId} already in group ${groupId} (no-op)`);
    return next;
  }
  const existing = group.members.find((member) => member.id === memberId);
  if (existing) {
    existing.alive = true;
    existing.paused = false;
    existing.pendingAssigned = [];
  } else {
    group.members.push({
      id: memberId,
      assigned: [],
      pendingAssigned: [],
      committed: {},
      paused: false,
      memberEpoch: 0,
      alive: true,
    });
  }
  next.tick += 1;
  const rebalanceEvent = assignGroup(next, groupId, "join");
  if (rebalanceEvent) group.rebalanceEvents.push(rebalanceEvent);
  appendClusterEvent(next, "info", `consumer ${memberId} joined group ${groupId}`);
  return next;
}

export function consumerLeave(
  state: ClusterState,
  groupId: string,
  memberId: string,
): ClusterState {
  const next = cloneClusterState(state);
  const group = next.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    appendClusterEvent(next, "warn", `consumerLeave: group ${groupId} not found`);
    return next;
  }
  const member = group.members.find(
    (candidate) => candidate.id === memberId && candidate.alive,
  );
  if (!member) {
    appendClusterEvent(next, "info", `consumerLeave: ${memberId} not in group ${groupId} (no-op)`);
    return next;
  }
  for (const partitionId of member.assigned) {
    if (member.committed[partitionId] !== undefined) {
      group.groupCommitted[partitionId] = Math.max(
        group.groupCommitted[partitionId] ?? 0,
        member.committed[partitionId],
      );
    }
  }
  member.alive = false;
  member.paused = false;
  next.tick += 1;
  const rebalanceEvent = assignGroup(next, groupId, "leave");
  if (rebalanceEvent) group.rebalanceEvents.push(rebalanceEvent);
  member.assigned = [];
  member.pendingAssigned = [];
  appendClusterEvent(next, "info", `consumer ${memberId} gracefully left group ${groupId}`);
  return next;
}

export function consumerCrash(
  state: ClusterState,
  groupId: string,
  memberId: string,
): ClusterState {
  const next = cloneClusterState(state);
  const group = next.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    appendClusterEvent(next, "warn", `consumerCrash: group ${groupId} not found`);
    return next;
  }
  const member = group.members.find(
    (candidate) => candidate.id === memberId && candidate.alive,
  );
  if (!member) {
    appendClusterEvent(next, "info", `consumerCrash: ${memberId} not in group ${groupId} (no-op)`);
    return next;
  }
  member.alive = false;
  member.paused = false;
  next.tick += 1;
  const rebalanceEvent = assignGroup(next, groupId, "crash");
  if (rebalanceEvent) group.rebalanceEvents.push(rebalanceEvent);
  member.assigned = [];
  member.pendingAssigned = [];
  appendClusterEvent(next, "error", `consumer ${memberId} crashed in group ${groupId} — offsets NOT committed, elevated duplicate risk`);
  return next;
}

export function consumerRestart(
  state: ClusterState,
  groupId: string,
  memberId: string,
): ClusterState {
  const next = cloneClusterState(state);
  const group = next.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    appendClusterEvent(next, "warn", `consumerRestart: group ${groupId} not found`);
    return next;
  }
  const member = group.members.find((candidate) => candidate.id === memberId);
  if (!member) {
    appendClusterEvent(next, "info", `consumerRestart: ${memberId} not in group ${groupId} (no-op)`);
    return next;
  }
  if (member.alive) {
    appendClusterEvent(next, "info", `consumerRestart: ${memberId} already alive (no-op)`);
    return next;
  }
  member.alive = true;
  member.paused = false;
  member.pendingAssigned = [];
  for (const [partitionIdText, offset] of Object.entries(group.groupCommitted)) {
    const partitionId = Number(partitionIdText);
    member.committed[partitionId] = Math.max(
      member.committed[partitionId] ?? 0,
      offset,
    );
  }
  next.tick += 1;
  const rebalanceEvent = assignGroup(next, groupId, "restart");
  if (rebalanceEvent) group.rebalanceEvents.push(rebalanceEvent);
  appendClusterEvent(next, "info", `consumer ${memberId} restarted in group ${groupId}`);
  return next;
}

export function consumerScaleOut(
  state: ClusterState,
  groupId: string,
  memberIds: string[],
): ClusterState {
  const next = cloneClusterState(state);
  const group = next.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    appendClusterEvent(next, "warn", `consumerScaleOut: group ${groupId} not found`);
    return next;
  }
  for (const memberId of memberIds) {
    if (!group.members.some((member) => member.id === memberId)) {
      group.members.push({
        id: memberId,
        assigned: [],
        pendingAssigned: [],
        committed: {},
        paused: false,
        memberEpoch: 0,
        alive: true,
      });
    }
  }
  next.tick += 1;
  const rebalanceEvent = assignGroup(next, groupId, "scale-out");
  if (rebalanceEvent) group.rebalanceEvents.push(rebalanceEvent);
  appendClusterEvent(next, "info", `scaled out group ${groupId} with ${memberIds.length} new consumers`);
  return next;
}

export function consumerRollingRestartStep(
  state: ClusterState,
  groupId: string,
  memberId: string,
): ClusterState {
  let next = consumerLeave(state, groupId, memberId);
  next = consumerRestart(next, groupId, memberId);
  const group = next.groups.find((candidate) => candidate.id === groupId);
  if (group && group.rebalanceEvents.length > 0) {
    group.rebalanceEvents[group.rebalanceEvents.length - 1].operation =
      "rolling-restart-step";
  }
  return next;
}
