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
  totalLag,
  SCENARIOS,
  SCENARIO_LIST,
  runOp,
  assertOwnershipUniqueness,
  assertAssignedExist,
  assertAllInvariants,
  assertTransitionInvariants,
} from "./engine.test-support";

// ───────────────────────── determinism ─────────────────────────

test("determinism: same ops produce same state", () => {
  function runSequence() {
    let s = createCluster({ partitionCount: 4 });
    s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
    s = produce(s, 0, null, "v1").state;
    s = step(s);
    s = consumerJoin(s, "g", "c");
    s = step(s);
    s = consumerCrash(s, "g", "a");
    s = step(s);
    s = consumerRestart(s, "g", "a");
    return s;
  }
  const a = runSequence();
  const b = runSequence();
  // Compare key state (not events array for brevity)
  assert.equal(a.tick, b.tick);
  assert.equal(a.groups[0].groupEpoch, b.groups[0].groupEpoch);
  for (const m of a.groups[0].members) {
    const mb = b.groups[0].members.find((x) => x.id === m.id);
    assert.ok(mb);
    assert.deepEqual(m.assigned.sort(), mb!.assigned.sort());
    assert.deepEqual(m.committed, mb!.committed);
    assert.equal(m.alive, mb!.alive);
    assert.equal(m.memberEpoch, mb!.memberEpoch);
  }
});

// ───────────────────────── scenario invariants ─────────────────────────

test("scenario: rebalance-eager-classic — all invariants hold at every step", () => {
  const scenario = SCENARIOS["rebalance-eager-classic"];
  assert.ok(scenario, "scenario should exist");
  let s = createCluster(scenario.cluster);
  if (scenario.consumerGroup) s = addConsumerGroup(s, scenario.consumerGroup);
  assertAllInvariants(s, "rebalance-eager-classic:init");
  for (let i = 0; i < scenario.script.length; i++) {
    const prev = s;
    const out = runOp(s, scenario.script[i]);
    s = out.state;
    assertTransitionInvariants(prev, s, `rebalance-eager-classic:op${i}`);
  }
  // After completion, verify group state
  const g = s.groups[0];
  assert.equal(g.groupProtocol, "classic");
  assert.equal(g.classicAssignmentBehavior, "eager");
  assert.ok(g.rebalanceEvents.length > 0, "should have rebalance events");
  // Verify crash event had elevated risk
  const crashEvents = g.rebalanceEvents.filter((e) => e.operation === "crash");
  for (const ce of crashEvents) {
    assert.equal(ce.duplicateRisk.level, "elevated");
  }
});

test("scenario: rebalance-cooperative-classic — all invariants hold at every step", () => {
  const scenario = SCENARIOS["rebalance-cooperative-classic"];
  assert.ok(scenario, "scenario should exist");
  let s = createCluster(scenario.cluster);
  if (scenario.consumerGroup) s = addConsumerGroup(s, scenario.consumerGroup);
  assertAllInvariants(s, "rebalance-cooperative-classic:init");
  for (let i = 0; i < scenario.script.length; i++) {
    const prev = s;
    const out = runOp(s, scenario.script[i]);
    s = out.state;
    assertTransitionInvariants(prev, s, `rebalance-cooperative-classic:op${i}`);
  }
  const g = s.groups[0];
  assert.equal(g.groupProtocol, "classic");
  assert.equal(g.classicAssignmentBehavior, "cooperative");
  assert.ok(g.rebalanceEvents.length > 0);
  // Cooperative should have had scale-out events where only moved partitions revoked
  const scaleEvents = g.rebalanceEvents.filter((e) => e.operation === "scale-out");
  for (const se of scaleEvents) {
    assert.equal(se.classicAssignmentBehavior, "cooperative");
  }
});

test("scenario: rebalance-consumer-protocol — all invariants hold at every step", () => {
  const scenario = SCENARIOS["rebalance-consumer-protocol"];
  assert.ok(scenario, "scenario should exist");
  let s = createCluster(scenario.cluster);
  if (scenario.consumerGroup) s = addConsumerGroup(s, scenario.consumerGroup);
  assertAllInvariants(s, "rebalance-consumer-protocol:init");
  for (let i = 0; i < scenario.script.length; i++) {
    const prev = s;
    const out = runOp(s, scenario.script[i]);
    s = out.state;
    assertTransitionInvariants(prev, s, `rebalance-consumer-protocol:op${i}`);
  }
  const g = s.groups[0];
  assert.equal(g.groupProtocol, "consumer");
  assert.equal(g.classicAssignmentBehavior, undefined);
  // Consumer protocol should never have classicAssignmentBehavior in events
  for (const evt of g.rebalanceEvents) {
    assert.equal(evt.classicAssignmentBehavior, undefined);
    assert.equal(evt.groupProtocol, "consumer");
    assert.equal(evt.pauseTicks, 0, "consumer protocol should never pause");
  }
});

test("scenario: all existing scenarios still work unchanged", () => {
  for (const scenario of SCENARIO_LIST) {
    let s = createCluster(scenario.cluster);
    if (scenario.consumerGroup) s = addConsumerGroup(s, scenario.consumerGroup);
    assertAllInvariants(s, `${scenario.slug}:init`);
    for (let i = 0; i < scenario.script.length; i++) {
      const out = runOp(s, scenario.script[i]);
      s = out.state;
      assertOwnershipUniqueness(s, `${scenario.slug}:op${i}`);
      assertAssignedExist(s, `${scenario.slug}:op${i}`);
    }
  }
});

// ───────────────────────── content-wave behavioral scenarios ─────────────────────────

test("scenario: hot-partition exposes skew while a third group member is idle", () => {
  const scenario = SCENARIOS["hot-partition"];
  assert.ok(scenario, "hot-partition scenario should exist");
  let state = createCluster(scenario.cluster);
  if (scenario.consumerGroup) state = addConsumerGroup(state, scenario.consumerGroup);

  for (const [index, operation] of scenario.script.entries()) {
    const previous = state;
    state = runOp(state, operation).state;
    assertTransitionInvariants(previous, state, `hot-partition:op${index}`);
  }

  const group = state.groups[0];
  const idleMember = group.members.find((member) => member.id === "c-3");
  const partitionLag = (partitionId: number) => {
    const partition = state.topic.partitions[partitionId];
    return partition.hw - (group.groupCommitted[partitionId] ?? 0);
  };

  assert.equal(idleMember?.assigned.length, 0, "spare member cannot own a partition");
  assert.ok(
    partitionLag(0) > partitionLag(1),
    `hot partition must have more lag (p0=${partitionLag(0)}, p1=${partitionLag(1)})`,
  );
  assert.ok(partitionLag(0) > 0, "heavy partition should retain a visible backlog");
});

test("scenario: rebalance-storm accumulates eager pauses, duplicate risk, and lag", () => {
  const scenario = SCENARIOS["rebalance-storm"];
  assert.ok(scenario, "rebalance-storm scenario should exist");

  function replay() {
    let state = createCluster(scenario.cluster);
    if (scenario.consumerGroup) state = addConsumerGroup(state, scenario.consumerGroup);
    for (const [index, operation] of scenario.script.entries()) {
      const previous = state;
      state = runOp(state, operation).state;
      assertTransitionInvariants(previous, state, `rebalance-storm:op${index}`);
    }
    return state;
  }

  const state = replay();
  const duplicateReplay = replay();
  const group = state.groups[0];
  const churn = group.rebalanceEvents.filter((event) => event.operation !== "join");
  const totalPauseTicks = churn.reduce((total, event) => total + event.pauseTicks, 0);

  assert.equal(group.groupProtocol, "classic");
  assert.equal(group.classicAssignmentBehavior, "eager");
  assert.ok(churn.length >= 5, `expected repeated churn, got ${churn.length} events`);
  assert.ok(totalPauseTicks >= 5, `expected accumulated eager pauses, got ${totalPauseTicks}`);
  assert.ok(
    churn.some(
      (event) =>
        event.operation === "crash" && event.duplicateRisk.level === "elevated",
    ),
    "crash must expose elevated duplicate risk",
  );
  assert.ok(totalLag(state) > 0, "backlog should remain after the scripted storm");
  assert.deepEqual(state, duplicateReplay, "scenario replay must be deterministic");
});

test("scenario: offline-partition loses all RF=2 replicas then restores leadership and ISR", () => {
  const scenario = SCENARIOS["offline-partition"];
  assert.ok(scenario, "offline-partition scenario should exist");
  let state = createCluster(scenario.cluster);

  for (const [index, operation] of scenario.script.slice(0, 6).entries()) {
    const previous = state;
    state = runOp(state, operation).state;
    assertTransitionInvariants(previous, state, `offline-partition:failure-op${index}`);
  }

  const offline = state.topic.partitions[0];
  assert.equal(offline.replicas.length, 2);
  assert.equal(offline.isr.length, 0, "partition 0 must have no live replica");
  assert.ok(
    state.events.some((event) => event.message.includes("produce p0: rejected")),
    "produce during no-leader interval must be rejected",
  );

  for (const [index, operation] of scenario.script.slice(6).entries()) {
    const previous = state;
    state = runOp(state, operation).state;
    assertTransitionInvariants(previous, state, `offline-partition:recovery-op${index}`);
  }

  const recovered = state.topic.partitions[0];
  assert.deepEqual(recovered.isr, recovered.replicas, "RF=2 ISR should fully restore");
  assert.ok(
    state.events.some((event) => event.message.includes("broker 1 recovered")),
    "recovery should expose broker return in the event log",
  );
});

// ───────────────────────── scale-out partition movement ─────────────────────────

test("scale-out: partitions move to new members", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic" });
  s = consumerScaleOut(s, "g", ["c"]);
  const g = s.groups[0];
  const memberC = g.members.find((m) => m.id === "c");
  assert.ok(memberC);
  assert.ok(memberC!.assigned.length > 0, "new member should have partitions after scale-out");
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  assert.ok(lastEvent.movedPartitions.length > 0, "should have moved partitions");
});

// ───────────────────────── rolling restart ─────────────────────────

test("rolling restart: member leaves then rejoins, no partition left unassigned", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic" });
  s = consumerRollingRestartStep(s, "g", "a");
  const g = s.groups[0];
  // All partitions should be assigned
  const allAssigned = g.members.filter((m) => m.alive).flatMap((m) => m.assigned);
  assert.equal(new Set(allAssigned).size, 4, "all partitions should be assigned after rolling restart");
  // a should be alive
  assert.ok(g.members.find((m) => m.id === "a")?.alive);
});

// ───────────────────────── rebalance events structure ─────────────────────────

test("rebalance events have all required fields", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  s = consumerJoin(s, "g", "c");
  const g = s.groups[0];
  for (const evt of g.rebalanceEvents) {
    assert.ok(["join", "leave", "crash", "restart", "scale-out", "rolling-restart-step"].includes(evt.operation));
    assert.ok(["classic", "consumer"].includes(evt.groupProtocol));
    assert.ok(typeof evt.groupEpoch === "number");
    assert.ok(typeof evt.memberEpochs === "object");
    assert.ok(Array.isArray(evt.movedPartitions));
    assert.ok(typeof evt.revokedPartitions === "object");
    assert.ok(typeof evt.assignedPartitions === "object");
    assert.ok(Array.isArray(evt.pausedMembers));
    assert.ok(typeof evt.pauseTicks === "number");
    assert.ok(typeof evt.duplicateRisk === "object");
    assert.ok(["low", "elevated", "high"].includes(evt.duplicateRisk.level));
    assert.ok(typeof evt.duplicateRisk.reason === "string");
    assert.ok(Array.isArray(evt.unassignedPartitions));
    assert.ok(typeof evt.assignor === "string", "rebalance event should have assignor");
  }
});

// ───────────────────────── epoch monotonicity across operations ─────────────────────────

test("epoch monotonicity: group epoch never decreases across operations", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  let lastEpoch = s.groups[0].groupEpoch;
  const ops = [
    () => { s = consumerJoin(s, "g", "c"); },
    () => { s = consumerLeave(s, "g", "c"); },
    () => { s = consumerJoin(s, "g", "c"); },
    () => { s = consumerCrash(s, "g", "c"); },
    () => { s = consumerRestart(s, "g", "c"); },
    () => { s = consumerScaleOut(s, "g", ["d"]); },
    () => { s = consumerRollingRestartStep(s, "g", "a"); },
  ];
  for (const op of ops) {
    op();
    const currentEpoch = s.groups[0].groupEpoch;
    assert.ok(currentEpoch >= lastEpoch, `epoch should not decrease: was ${lastEpoch}, now ${currentEpoch}`);
    lastEpoch = currentEpoch;
  }
});

// ───────────────────────── group committed offsets preserved ─────────────────────────

test("group committed offsets preserved across leave/restart", () => {
  let s = createCluster({ partitionCount: 2, brokerCount: 2, replicationFactor: 2 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic" });
  // Produce and consume
  for (let i = 0; i < 5; i++) s = produce(s, 0, null, `v${i}`).state;
  for (let i = 0; i < 5; i++) s = produce(s, 1, null, `v${i}`).state;
  for (let i = 0; i < 5; i++) s = step(s);
  // Save group committed
  const committedBefore = { ...s.groups[0].groupCommitted };
  // Leave a
  s = consumerLeave(s, "g", "a");
  // Group committed should still have offsets
  for (const [pId, offset] of Object.entries(committedBefore)) {
    assert.ok(
      (s.groups[0].groupCommitted[Number(pId)] ?? 0) >= offset,
      `group committed offset for p${pId} should not decrease after leave`,
    );
  }
  // Restart a
  s = consumerRestart(s, "g", "a");
  for (const [pId, offset] of Object.entries(committedBefore)) {
    assert.ok(
      (s.groups[0].groupCommitted[Number(pId)] ?? 0) >= offset,
      `group committed offset for p${pId} should not decrease after restart`,
    );
  }
});

// ───────────────────────── step consumes with alive check ─────────────────────────

test("step: dead consumers do not consume", () => {
  let s = createCluster({ partitionCount: 2, brokerCount: 2, replicationFactor: 2 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic" });
  for (let i = 0; i < 3; i++) s = produce(s, 0, null, `v${i}`).state;
  for (let i = 0; i < 3; i++) s = produce(s, 1, null, `v${i}`).state;
  s = consumerCrash(s, "g", "a");
  const memberA = s.groups[0].members.find((m) => m.id === "a")!;
  const committedBefore = { ...memberA.committed };
  s = step(s);
  const memberAAfter = s.groups[0].members.find((m) => m.id === "a")!;
  // Dead consumer should not have advanced
  assert.deepEqual(memberAAfter.committed, committedBefore);
});

// ═══════════════════════════════════════════════════════════════════════
//  NEW TESTS: Feature hardening for KIP-848 lab
// ═══════════════════════════════════════════════════════════════════════
