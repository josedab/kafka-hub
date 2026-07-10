import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCluster,
  addConsumerGroup,
  produce,
  step,
  consumerJoin,
  consumerLeave,
  consumerCrash,
  consumerRestart,
  consumerScaleOut,
  consumerRollingRestartStep,
  SCENARIOS,
  SCENARIO_LIST,
  runOp,
  assertOwnershipUniquenessWithPending,
  assertAllInvariants,
} from "./engine.test-support";
import type {
  Assignor,
} from "./engine.test-support";

// ─── 1. Accurate leave/crash event metadata ───

test("consumerLeave: movedPartitions reports departed member as 'from' source (eager)", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  // Record what "a" owned before leave
  const aPartitions = [...s.groups[0].members.find((m) => m.id === "a")!.assigned];
  assert.ok(aPartitions.length > 0, "a should own partitions before leave");
  s = consumerLeave(s, "g", "a");
  const g = s.groups[0];
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  // Every partition that was owned by a should appear in movedPartitions with from="a"
  for (const pId of aPartitions) {
    const moved = lastEvent.movedPartitions.find(([id]) => id === pId);
    assert.ok(moved, `partition ${pId} should be in movedPartitions`);
    assert.equal(moved![1], "a", `partition ${pId} should show from='a', got '${moved![1]}'`);
    assert.ok(moved![2] !== null, `partition ${pId} should be reassigned to someone`);
  }
  // revokedPartitions should include "a"
  assert.ok(lastEvent.revokedPartitions["a"], "revokedPartitions should include departed member 'a'");
  assert.ok(lastEvent.revokedPartitions["a"].length > 0, "departed member should have revoked partitions");
});

test("consumerLeave: movedPartitions reports departed member as 'from' source (cooperative)", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  const aPartitions = [...s.groups[0].members.find((m) => m.id === "a")!.assigned];
  assert.ok(aPartitions.length > 0);
  s = consumerLeave(s, "g", "a");
  const lastEvent = s.groups[0].rebalanceEvents[s.groups[0].rebalanceEvents.length - 1];
  for (const pId of aPartitions) {
    const moved = lastEvent.movedPartitions.find(([id]) => id === pId);
    assert.ok(moved, `partition ${pId} should be in movedPartitions`);
    assert.equal(moved![1], "a", `partition ${pId} should show from='a'`);
  }
  assert.ok(lastEvent.revokedPartitions["a"]?.length > 0, "departed member 'a' should have revoked partitions");
});

test("consumerLeave: movedPartitions reports departed member as 'from' source (consumer protocol)", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  // For consumer protocol, initial assignment may be pending
  // Step to let reconciliation activate
  s = step(s);
  const aPartitionsAfterStep = [...s.groups[0].members.find((m) => m.id === "a")!.assigned];
  assert.ok(aPartitionsAfterStep.length > 0, "a should own partitions");
  s = consumerLeave(s, "g", "a");
  const lastEvent = s.groups[0].rebalanceEvents[s.groups[0].rebalanceEvents.length - 1];
  for (const pId of aPartitionsAfterStep) {
    const moved = lastEvent.movedPartitions.find(([id]) => id === pId);
    assert.ok(moved, `partition ${pId} should be in movedPartitions`);
    assert.equal(moved![1], "a", `partition ${pId} should show from='a'`);
  }
  assert.ok(lastEvent.revokedPartitions["a"]?.length > 0, "departed member 'a' should have revoked partitions");
});

test("consumerCrash: movedPartitions reports crashed member as 'from' source (eager)", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  const aPartitions = [...s.groups[0].members.find((m) => m.id === "a")!.assigned];
  assert.ok(aPartitions.length > 0);
  s = consumerCrash(s, "g", "a");
  const lastEvent = s.groups[0].rebalanceEvents[s.groups[0].rebalanceEvents.length - 1];
  for (const pId of aPartitions) {
    const moved = lastEvent.movedPartitions.find(([id]) => id === pId);
    assert.ok(moved, `partition ${pId} should be in movedPartitions after crash`);
    assert.equal(moved![1], "a", `partition ${pId} should show from='a' after crash`);
  }
  assert.ok(lastEvent.revokedPartitions["a"]?.length > 0, "crashed member 'a' should appear in revokedPartitions");
});

test("consumerCrash: movedPartitions reports crashed member as 'from' source (cooperative)", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  const aPartitions = [...s.groups[0].members.find((m) => m.id === "a")!.assigned];
  assert.ok(aPartitions.length > 0);
  s = consumerCrash(s, "g", "a");
  const lastEvent = s.groups[0].rebalanceEvents[s.groups[0].rebalanceEvents.length - 1];
  for (const pId of aPartitions) {
    const moved = lastEvent.movedPartitions.find(([id]) => id === pId);
    assert.ok(moved, `partition ${pId} should be in movedPartitions`);
    assert.equal(moved![1], "a", `partition ${pId} should show from='a'`);
  }
  assert.ok(lastEvent.revokedPartitions["a"]?.length > 0);
});

test("consumerCrash: movedPartitions reports crashed member as 'from' source (consumer protocol)", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = step(s); // activate pending
  const aPartitions = [...s.groups[0].members.find((m) => m.id === "a")!.assigned];
  assert.ok(aPartitions.length > 0);
  s = consumerCrash(s, "g", "a");
  const lastEvent = s.groups[0].rebalanceEvents[s.groups[0].rebalanceEvents.length - 1];
  for (const pId of aPartitions) {
    const moved = lastEvent.movedPartitions.find(([id]) => id === pId);
    assert.ok(moved, `partition ${pId} should be in movedPartitions`);
    assert.equal(moved![1], "a", `partition ${pId} should show from='a'`);
  }
});

test("leave/crash: dead members own nothing after rebalance", () => {
  for (const protocol of ["classic", "consumer"] as const) {
    let s = createCluster({ partitionCount: 4 });
    s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: protocol, classicAssignmentBehavior: protocol === "classic" ? "cooperative" : undefined });
    s = consumerLeave(s, "g", "a");
    const memberA = s.groups[0].members.find((m) => m.id === "a")!;
    assert.equal(memberA.assigned.length, 0, `[${protocol}] dead member 'a' should own nothing after leave`);
    assert.equal(memberA.pendingAssigned.length, 0, `[${protocol}] dead member 'a' should have no pending after leave`);

    // Restart, then crash b
    s = consumerRestart(s, "g", "a");
    s = step(s); // activate any pending
    s = consumerCrash(s, "g", "b");
    const memberB = s.groups[0].members.find((m) => m.id === "b")!;
    assert.equal(memberB.assigned.length, 0, `[${protocol}] dead member 'b' should own nothing after crash`);
    assert.equal(memberB.pendingAssigned.length, 0, `[${protocol}] dead member 'b' should have no pending after crash`);
  }
});

// ─── 2. Observable KIP-848 reconciliation ───

test("consumer protocol: pending assignments observable before step()", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = step(s); // activate initial assignment
  // Scale out — should create pending
  s = consumerScaleOut(s, "g", ["c"]);
  const g = s.groups[0];
  // Group should be reconciling
  assert.equal(g.reconciliationState, "reconciling", "group should be in reconciling state after scale-out");
  // c should have pending partitions
  const memberC = g.members.find((m) => m.id === "c")!;
  assert.ok(memberC.pendingAssigned.length > 0, "new member should have pending partitions");
  // Pending should not be in assigned yet
  for (const pId of memberC.pendingAssigned) {
    assert.ok(!memberC.assigned.includes(pId), `pending partition ${pId} should not be in assigned yet`);
  }
  // RebalanceEvent should report reconciling
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  assert.equal(lastEvent.reconciliationState, "reconciling");
  assert.ok(lastEvent.unassignedPartitions.length > 0, "should report unassigned partitions during reconciliation");
  // Ownership uniqueness with pending should hold
  assertOwnershipUniquenessWithPending(s, "consumer-pending-before-step");
});

test("consumer protocol: step() activates pending, group becomes stable", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = step(s);
  s = consumerScaleOut(s, "g", ["c"]);
  assert.equal(s.groups[0].reconciliationState, "reconciling");
  // Step activates pending
  s = step(s);
  const g = s.groups[0];
  assert.equal(g.reconciliationState, "stable", "group should be stable after step");
  // c's pending should now be empty, assigned should have partitions
  const memberC = g.members.find((m) => m.id === "c")!;
  assert.equal(memberC.pendingAssigned.length, 0, "pending should be cleared after step");
  assert.ok(memberC.assigned.length > 0, "c should have active partitions after reconciliation");
  // All partitions assigned
  const allAssigned = g.members.filter((m) => m.alive).flatMap((m) => m.assigned);
  assert.equal(new Set(allAssigned).size, 6, "all 6 partitions should be assigned after reconciliation");
  assertAllInvariants(s, "consumer-after-step-reconciliation");
});

test("consumer protocol: reconciliationState in ConsumerGroup model", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "consumer" });
  const g = s.groups[0];
  assert.ok("reconciliationState" in g, "ConsumerGroup should have reconciliationState");
  assert.ok(
    g.reconciliationState === "stable" || g.reconciliationState === "reconciling",
    "reconciliationState must be 'stable' or 'reconciling'",
  );
});

test("consumer protocol: no classicAssignmentBehavior in events or group", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = consumerScaleOut(s, "g", ["c"]);
  s = step(s);
  s = consumerCrash(s, "g", "a");
  s = step(s);
  const g = s.groups[0];
  assert.equal(g.classicAssignmentBehavior, undefined);
  for (const evt of g.rebalanceEvents) {
    assert.equal(evt.classicAssignmentBehavior, undefined);
  }
});

// ─── 3. Assignor axis ───

test("assignor defaults: classic eager → range", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  assert.equal(s.groups[0].assignor, "range");
});

test("assignor defaults: classic cooperative → cooperative-sticky", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  assert.equal(s.groups[0].assignor, "cooperative-sticky");
});

test("assignor defaults: classic default (no behavior) → cooperative-sticky", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic" });
  assert.equal(s.groups[0].assignor, "cooperative-sticky");
});

test("assignor defaults: consumer protocol → uniform", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "consumer" });
  assert.equal(s.groups[0].assignor, "uniform");
});

test("assignor defaults: legacy eager → range", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], protocol: "eager" });
  assert.equal(s.groups[0].assignor, "range");
});

test("assignor defaults: legacy cooperative → cooperative-sticky", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], protocol: "cooperative" });
  assert.equal(s.groups[0].assignor, "cooperative-sticky");
});

test("assignor: consumer protocol forces uniform even if classic assignor specified", () => {
  let s = createCluster();
  // Explicitly pass a classic assignor — should be overridden to uniform
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "consumer", assignor: "range" as Assignor });
  assert.equal(s.groups[0].assignor, "uniform");
});

test("assignor: cooperative-sticky invalid with eager classic → fallback to range", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic", classicAssignmentBehavior: "eager", assignor: "cooperative-sticky" });
  assert.equal(s.groups[0].assignor, "range");
});

test("assignor: rebalance events carry the group's assignor", () => {
  for (const { groupProtocol, classicAssignmentBehavior, expectedAssignor } of [
    { groupProtocol: "classic" as const, classicAssignmentBehavior: "eager" as const, expectedAssignor: "range" },
    { groupProtocol: "classic" as const, classicAssignmentBehavior: "cooperative" as const, expectedAssignor: "cooperative-sticky" },
    { groupProtocol: "consumer" as const, classicAssignmentBehavior: undefined, expectedAssignor: "uniform" },
  ]) {
    let s = createCluster({ partitionCount: 4 });
    s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol, classicAssignmentBehavior });
    s = consumerJoin(s, "g", "c");
    const g = s.groups[0];
    for (const evt of g.rebalanceEvents) {
      assert.equal(evt.assignor, expectedAssignor, `[${groupProtocol}/${classicAssignmentBehavior}] event should have assignor=${expectedAssignor}`);
    }
  }
});

test("assignor: explicit roundrobin on eager classic is preserved", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic", classicAssignmentBehavior: "eager", assignor: "roundrobin" });
  assert.equal(s.groups[0].assignor, "roundrobin");
});

test("assignor: eager-only sticky on cooperative classic falls back to cooperative-sticky", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative", assignor: "sticky" });
  assert.equal(s.groups[0].assignor, "cooperative-sticky");
});

// ─── 4. Rolling restart contract ───

test("rolling restart: consumes exactly 2 ticks", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic" });
  const tickBefore = s.tick;
  const out = runOp(s, { kind: "consumerRollingRestartStep", groupId: "g", memberId: "a" });
  assert.equal(out.ticksConsumed, 2, "rolling restart runOp should report ticksConsumed=2");
  assert.equal(out.state.tick, tickBefore + 2, "state tick should advance by 2");
});

test("rolling restart: internal state has leave+restart rebalance events but last is overridden", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  s = consumerRollingRestartStep(s, "g", "a");
  const g = s.groups[0];
  // Should have at least the leave event and the restart event
  assert.ok(g.rebalanceEvents.length >= 3, "should have multiple rebalance events (init + leave + restart)");
  // The last event should be overridden to rolling-restart-step
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  assert.equal(lastEvent.operation, "rolling-restart-step");
  // The second-to-last should be the leave event
  const leaveEvent = g.rebalanceEvents[g.rebalanceEvents.length - 2];
  assert.equal(leaveEvent.operation, "leave");
});

// ─── 5. Deep-clone purity ───

test("deep-clone: rebalance events are deep-cloned, not shared", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  s = consumerJoin(s, "g", "c");
  // Clone the state
  const s2 = step(s);
  // Verify rebalance events are independent
  const evt1 = s.groups[0].rebalanceEvents[s.groups[0].rebalanceEvents.length - 1];
  const evt2 = s2.groups[0].rebalanceEvents[s2.groups[0].rebalanceEvents.length - 1];
  // They should be equal in content but different objects
  assert.deepEqual(evt1.movedPartitions, evt2.movedPartitions);
  assert.notEqual(evt1.movedPartitions, evt2.movedPartitions, "movedPartitions arrays should be different objects");
  assert.notEqual(evt1.revokedPartitions, evt2.revokedPartitions, "revokedPartitions should be different objects");
  assert.notEqual(evt1.assignedPartitions, evt2.assignedPartitions, "assignedPartitions should be different objects");
  assert.notEqual(evt1.duplicateRisk, evt2.duplicateRisk, "duplicateRisk should be different objects");
  assert.notEqual(evt1.pausedMembers, evt2.pausedMembers, "pausedMembers should be different objects");
  assert.notEqual(evt1.unassignedPartitions, evt2.unassignedPartitions, "unassignedPartitions should be different objects");
  // Mutating one should not affect the other
  evt1.movedPartitions.push([99, "x", "y"]);
  assert.ok(!evt2.movedPartitions.some(([id]) => id === 99), "mutation should not cross clone boundary");
});

test("deep-clone: mutating clone doesn't affect original", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic" });
  // Produce and step to create committed offsets
  s = produce(s, 0, null, "v1").state;
  s = step(s);
  // Clone via step
  const original = s;
  const cloned = step(s);
  // Mutate the clone
  cloned.groups[0].members[0].assigned.push(999);
  cloned.groups[0].groupCommitted[999] = 42;
  cloned.events.push({ tick: 0, level: "info", message: "mutated" });
  // Original should be untouched
  assert.ok(!original.groups[0].members[0].assigned.includes(999));
  assert.equal(original.groups[0].groupCommitted[999], undefined);
  assert.ok(!original.events.some((e) => e.message === "mutated"));
});

// ─── 6. Ownership uniqueness with pending ───

test("ownership uniqueness: pending partitions don't overlap active from other members", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = step(s); // activate initial
  s = consumerScaleOut(s, "g", ["c"]);
  // In reconciling state, pending should not overlap active from different members
  assertOwnershipUniquenessWithPending(s, "pending-uniqueness-reconciling");
  s = step(s); // activate
  assertOwnershipUniquenessWithPending(s, "pending-uniqueness-stable");
});

// ─── 7. Routing: simulate-routing helpers ───

test("SCENARIOS map: all rebalance scenario slugs are present and valid", () => {
  // Validates that the scenario map contains the rebalance slugs
  // used by deep-link routing (?scenario=...)
  for (const slug of ["rebalance-eager-classic", "rebalance-cooperative-classic", "rebalance-consumer-protocol"]) {
    assert.ok(SCENARIOS[slug], `SCENARIOS should contain ${slug}`);
    assert.equal(SCENARIOS[slug].slug, slug);
    assert.ok(SCENARIOS[slug].consumerGroup, `${slug} should have a consumerGroup`);
  }
  // Invalid slugs should not be in the map
  assert.equal(SCENARIOS["nonexistent"], undefined);
});

// ─── Additional comprehensive tests ───

test("all scenarios: assignor field is set on all consumer groups", () => {
  for (const scenario of SCENARIO_LIST) {
    if (!scenario.consumerGroup) continue;
    let s = createCluster(scenario.cluster);
    s = addConsumerGroup(s, scenario.consumerGroup);
    const g = s.groups[0];
    assert.ok(g.assignor, `[${scenario.slug}] group should have assignor set`);
    assert.ok(
      ["range", "roundrobin", "sticky", "cooperative-sticky", "uniform"].includes(g.assignor),
      `[${scenario.slug}] assignor '${g.assignor}' should be a valid value`,
    );
  }
});

test("all scenarios: reconciliationState is set on all groups", () => {
  for (const scenario of SCENARIO_LIST) {
    if (!scenario.consumerGroup) continue;
    let s = createCluster(scenario.cluster);
    s = addConsumerGroup(s, scenario.consumerGroup);
    const g = s.groups[0];
    assert.ok("reconciliationState" in g);
    assert.ok(g.reconciliationState === "stable" || g.reconciliationState === "reconciling");
  }
});

test("consumer protocol: crash leave with multiple members still covers all partitions", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b", "c"], groupProtocol: "consumer" });
  s = step(s); // activate
  s = consumerCrash(s, "g", "a");
  s = step(s); // activate pending from crash reassignment
  const g = s.groups[0];
  const allAssigned = g.members.filter((m) => m.alive).flatMap((m) => m.assigned);
  assert.equal(new Set(allAssigned).size, 6, "all partitions should be covered after crash + step");
  assertAllInvariants(s, "consumer-crash-coverage");
});

test("consumer protocol: leave then step covers all partitions", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b", "c"], groupProtocol: "consumer" });
  s = step(s);
  s = consumerLeave(s, "g", "a");
  s = step(s);
  const g = s.groups[0];
  const allAssigned = g.members.filter((m) => m.alive).flatMap((m) => m.assigned);
  assert.equal(new Set(allAssigned).size, 6, "all partitions should be covered after leave + step");
  assertAllInvariants(s, "consumer-leave-coverage");
});
