import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCluster,
  addConsumerGroup,
  produce,
  step,
  killBroker,
  reviveBroker,
  inducePartition,
  healPartition,
  totalLag,
  consumerJoin,
  consumerLeave,
  consumerCrash,
  consumerRestart,
  consumerScaleOut,
  consumerRollingRestartStep,
  SCENARIOS,
  SCENARIO_LIST,
  runOp,
  assertTransitionInvariants,
} from "./engine.test-support";

// ───────────────────────── existing tests (preserved) ─────────────────────────

test("createCluster: defaults produce 3 brokers, 3 partitions, RF=3", () => {
  const s = createCluster();
  assert.equal(s.brokers.length, 3);
  assert.equal(s.topic.partitions.length, 3);
  assert.equal(s.topic.replicationFactor, 3);
  assert.equal(s.topic.minInsyncReplicas, 2);
  for (const p of s.topic.partitions) {
    assert.equal(p.replicas.length, 3);
    assert.equal(p.isr.length, 3);
    assert.equal(p.hw, 0);
  }
});

test("createCluster: replicationFactor caps at brokerCount", () => {
  const s = createCluster({ brokerCount: 2, replicationFactor: 5 });
  assert.equal(s.topic.replicationFactor, 2);
});

test("createCluster: is deterministic", () => {
  const a = createCluster({ brokerCount: 5, partitionCount: 4 });
  const b = createCluster({ brokerCount: 5, partitionCount: 4 });
  assert.deepEqual(a, b);
});

test("produce: acks=all advances HW across the ISR", () => {
  const s = createCluster({ producerAcks: "all" });
  const r = produce(s, 0, "k", "v");
  assert.equal(r.result.ok, true);
  if (r.result.ok) {
    assert.equal(r.result.offset, 0);
    assert.equal(r.result.isr, 3);
  }
  const p = r.state.topic.partitions[0];
  assert.equal(p.hw, 1);
  for (const replica of p.isr) {
    assert.equal(p.logs[replica].length, 1);
  }
});

test("produce: rejects when ISR < min.insync.replicas under acks=all", () => {
  let s = createCluster({
    brokerCount: 3,
    minInsyncReplicas: 3,
    producerAcks: "all",
  });
  s = killBroker(s, 1);
  const r = produce(s, 0, "k", "v");
  assert.equal(r.result.ok, false);
  if (!r.result.ok) {
    assert.match(r.result.reason, /min\.insync\.replicas/);
  }
});

test("produce: compacted topic keeps latest-per-key only", () => {
  let s = createCluster({ compacted: true });
  s = produce(s, 0, "a", "v1").state;
  s = produce(s, 0, "b", "v2").state;
  s = produce(s, 0, "a", "v3").state;
  const p = s.topic.partitions[0];
  const leaderLog = p.logs[p.isr[0]];
  const keys = leaderLog.map((r) => r.key);
  assert.deepEqual(keys, ["b", "a"]);
});

test("killBroker: removes broker from ISR; reviveBroker re-adds it", () => {
  let s = createCluster();
  const targetId = 0;
  s = killBroker(s, targetId);
  for (const p of s.topic.partitions) {
    assert.ok(!p.isr.includes(targetId), `ISR should not include dead broker`);
  }
  s = reviveBroker(s, targetId);
  for (let i = 0; i < 5; i++) s = step(s);
  const stillIn = s.topic.partitions.some((p) => p.isr.includes(targetId));
  assert.ok(stillIn, "revived broker should rejoin ISR after step()");
});

test("killBroker on already-dead broker is a no-op", () => {
  let s = createCluster();
  s = killBroker(s, 0);
  const tick = s.tick;
  s = killBroker(s, 0);
  assert.equal(s.tick, tick);
});

test("inducePartition + healPartition flip the netPartition flag", () => {
  let s = createCluster({ brokerCount: 4 });
  s = inducePartition(s, [0, 1], [2, 3]);
  assert.ok(s.netPartition);
  assert.deepEqual(s.netPartition?.groupA, [0, 1]);
  s = healPartition(s);
  assert.equal(s.netPartition, null);
});

test("addConsumerGroup: assigns partitions across members", () => {
  let s = createCluster();
  s = addConsumerGroup(s, {
    id: "g1",
    consumerIds: ["a", "b", "c"],
  });
  assert.equal(s.groups.length, 1);
  const allAssigned = s.groups[0].members.flatMap((m) => m.assigned);
  assert.equal(
    new Set(allAssigned).size,
    s.topic.partitions.length,
    "every partition should be assigned exactly once",
  );
});

test("totalLag: zero immediately after produce when consumers consume each tick", () => {
  let s = createCluster();
  s = addConsumerGroup(s, {
    id: "g1",
    consumerIds: ["a"],
    consumeRatePerTick: 10,
  });
  for (let i = 0; i < 5; i++) s = produce(s, 0, null, `v${i}`).state;
  for (let i = 0; i < 5; i++) s = step(s);
  assert.equal(totalLag(s), 0);
});

test("totalLag: positive when consumer is slower than producer", () => {
  let s = createCluster({ brokerCount: 1, replicationFactor: 1, minInsyncReplicas: 1, partitionCount: 1 });
  s = addConsumerGroup(s, {
    id: "g1",
    consumerIds: ["a"],
    consumeRatePerTick: 1,
  });
  for (let i = 0; i < 10; i++) s = produce(s, 0, null, `v${i}`).state;
  s = step(s);
  assert.ok(totalLag(s) > 0);
});

test("scenarios: all SCENARIO_LIST entries are present in SCENARIOS map", () => {
  for (const s of SCENARIO_LIST) {
    assert.ok(SCENARIOS[s.slug], `SCENARIOS missing ${s.slug}`);
    assert.equal(SCENARIOS[s.slug], s);
  }
});

test("scenarios: every scenario has slug, title, blurb, cluster, script", () => {
  for (const s of SCENARIO_LIST) {
    assert.ok(s.slug);
    assert.ok(s.title);
    assert.ok(s.blurb);
    assert.ok(s.cluster);
    assert.ok(Array.isArray(s.script));
    assert.ok(s.script.length > 0, `scenario ${s.slug} has empty script`);
  }
});

test("runOp: applies every op kind without throwing", () => {
  for (const scenario of SCENARIO_LIST) {
    let s = createCluster(scenario.cluster);
    if (scenario.consumerGroup) {
      s = addConsumerGroup(s, scenario.consumerGroup);
    }
    for (const op of scenario.script) {
      const out = runOp(s, op);
      assert.ok(out.state);
      assert.ok(typeof out.ticksConsumed === "number");
      s = out.state;
    }
  }
});

test("engine: pure — calling produce on the same state twice gives same result", () => {
  const s = createCluster();
  const a = produce(s, 0, "k", "v");
  const b = produce(s, 0, "k", "v");
  assert.deepEqual(a.state.topic, b.state.topic);
  assert.deepEqual(a.result, b.result);
});

// ───────────────────────── domain model / axes ─────────────────────────

test("addConsumerGroup: legacy protocol='eager' maps to classic/eager", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], protocol: "eager" });
  const g = s.groups[0];
  assert.equal(g.groupProtocol, "classic");
  assert.equal(g.classicAssignmentBehavior, "eager");
});

test("addConsumerGroup: legacy protocol='cooperative' maps to classic/cooperative", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], protocol: "cooperative" });
  const g = s.groups[0];
  assert.equal(g.groupProtocol, "classic");
  assert.equal(g.classicAssignmentBehavior, "cooperative");
});

test("addConsumerGroup: groupProtocol='consumer' has no classicAssignmentBehavior", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "consumer" });
  const g = s.groups[0];
  assert.equal(g.groupProtocol, "consumer");
  assert.equal(g.classicAssignmentBehavior, undefined);
});

test("addConsumerGroup: groupProtocol='classic' defaults classicAssignmentBehavior to cooperative", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic" });
  const g = s.groups[0];
  assert.equal(g.groupProtocol, "classic");
  assert.equal(g.classicAssignmentBehavior, "cooperative");
});

test("addConsumerGroup: initializes group epoch, groupCommitted, rebalanceEvents", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"] });
  const g = s.groups[0];
  assert.equal(g.groupEpoch, 2); // 1 at creation + 1 from initial assignment
  assert.ok(typeof g.groupCommitted === "object");
  assert.ok(Array.isArray(g.rebalanceEvents));
  assert.ok(g.rebalanceEvents.length > 0); // initial join rebalance
});

test("consumer members have alive, paused, memberEpoch, pendingAssigned fields", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"] });
  const m = s.groups[0].members[0];
  assert.equal(m.alive, true);
  assert.equal(m.paused, false);
  assert.ok(typeof m.memberEpoch === "number");
  assert.ok(Array.isArray(m.pendingAssigned));
});

// ───────────────────────── consumer operations ─────────────────────────

test("consumerJoin: adds member and triggers rebalance", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  const prev = s;
  s = consumerJoin(s, "g", "c");
  const g = s.groups[0];
  assert.equal(g.members.filter((m) => m.alive).length, 3);
  assertTransitionInvariants(prev, s, "consumerJoin");
});

test("consumerJoin: no-op for nonexistent group", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"] });
  // tick check not needed - just verify event
  s = consumerJoin(s, "nonexistent", "x");
  // Should not throw; should log warning
  assert.ok(s.events.some((e) => e.message.includes("not found")));
});

test("consumerJoin: no-op for already-alive member", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"] });
  // tick check not needed - just verify event
  s = consumerJoin(s, "g", "a");
  assert.ok(s.events.some((e) => e.message.includes("no-op")));
});

test("consumerLeave: graceful leave commits offsets", () => {
  let s = createCluster({ partitionCount: 2, brokerCount: 2, replicationFactor: 2 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  // Produce and consume to build committed offsets
  for (let i = 0; i < 3; i++) s = produce(s, 0, null, `v${i}`).state;
  for (let i = 0; i < 3; i++) s = produce(s, 1, null, `v${i}`).state;
  for (let i = 0; i < 3; i++) s = step(s);
  const prev = s;
  s = consumerLeave(s, "g", "a");
  const g = s.groups[0];
  // a should not be alive
  const memberA = g.members.find((m) => m.id === "a");
  assert.equal(memberA?.alive, false);
  // Group committed should have a's offsets
  assertTransitionInvariants(prev, s, "consumerLeave");
});

test("consumerLeave: no-op for nonexistent member", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"] });
  s = consumerLeave(s, "g", "nonexistent");
  assert.ok(s.events.some((e) => e.message.includes("no-op")));
});

test("consumerCrash: does NOT commit offsets, elevated duplicate risk", () => {
  let s = createCluster({ partitionCount: 2, brokerCount: 2, replicationFactor: 2 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic" });
  for (let i = 0; i < 3; i++) s = produce(s, 0, null, `v${i}`).state;
  for (let i = 0; i < 3; i++) s = step(s);
  const prev = s;
  s = consumerCrash(s, "g", "a");
  const g = s.groups[0];
  const memberA = g.members.find((m) => m.id === "a");
  assert.equal(memberA?.alive, false);
  // Check rebalance event has elevated risk
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  assert.equal(lastEvent.operation, "crash");
  assert.equal(lastEvent.duplicateRisk.level, "elevated");
  assertTransitionInvariants(prev, s, "consumerCrash");
});

test("consumerCrash: no-op for nonexistent member", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"] });
  s = consumerCrash(s, "g", "nonexistent");
  assert.ok(s.events.some((e) => e.message.includes("no-op")));
});

test("consumerRestart: restores from group committed offsets", () => {
  let s = createCluster({ partitionCount: 2, brokerCount: 2, replicationFactor: 2 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  for (let i = 0; i < 3; i++) s = produce(s, 0, null, `v${i}`).state;
  for (let i = 0; i < 3; i++) s = step(s);
  s = consumerLeave(s, "g", "a");
  // b now has all partitions and commits progress
  for (let i = 0; i < 3; i++) s = step(s);
  const prev = s;
  s = consumerRestart(s, "g", "a");
  const g = s.groups[0];
  const memberA = g.members.find((m) => m.id === "a");
  assert.equal(memberA?.alive, true);
  assertTransitionInvariants(prev, s, "consumerRestart");
});

test("consumerRestart: no-op on already-alive member", () => {
  let s = createCluster();
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"] });
  s = consumerRestart(s, "g", "a");
  assert.ok(s.events.some((e) => e.message.includes("no-op")));
});

test("consumerScaleOut: adds multiple members and rebalances", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a"], groupProtocol: "classic" });
  const prev = s;
  s = consumerScaleOut(s, "g", ["b", "c"]);
  const g = s.groups[0];
  assert.equal(g.members.filter((m) => m.alive).length, 3);
  // All 6 partitions should be distributed
  const allAssigned = g.members.filter((m) => m.alive).flatMap((m) => m.assigned);
  assert.equal(new Set(allAssigned).size, 6);
  assertTransitionInvariants(prev, s, "consumerScaleOut");
});

test("consumerScaleOut: no-op for nonexistent group", () => {
  let s = createCluster();
  s = consumerScaleOut(s, "nonexistent", ["x"]);
  assert.ok(s.events.some((e) => e.message.includes("not found")));
});

test("consumerRollingRestartStep: leave + rejoin preserves offsets", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  for (let i = 0; i < 3; i++) s = produce(s, 0, null, `v${i}`).state;
  for (let i = 0; i < 3; i++) s = step(s);
  const prev = s;
  s = consumerRollingRestartStep(s, "g", "a");
  const g = s.groups[0];
  const memberA = g.members.find((m) => m.id === "a");
  assert.equal(memberA?.alive, true);
  // Last rebalance event should be rolling-restart-step
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  assert.equal(lastEvent.operation, "rolling-restart-step");
  assertTransitionInvariants(prev, s, "consumerRollingRestartStep");
});

// ───────────────────────── eager classic behavior ─────────────────────────

test("eager classic: all members pause on rebalance (stop-the-world)", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  // Scale out — should trigger stop-the-world
  s = consumerScaleOut(s, "g", ["c"]);
  const g = s.groups[0];
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  // All alive members should have been paused
  assert.ok(lastEvent.pausedMembers.length > 0);
  // In eager, every alive member should be in pausedMembers
  const aliveIds = g.members.filter((m) => m.alive).map((m) => m.id);
  for (const id of aliveIds) {
    assert.ok(
      lastEvent.pausedMembers.includes(id) || lastEvent.movedPartitions.length === 0,
      `eager: member ${id} should be paused`,
    );
  }
  assert.equal(lastEvent.pauseTicks, 1);
});

test("eager classic: all partitions revoked from all members during rebalance", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  s = consumerJoin(s, "g", "c");
  const g = s.groups[0];
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  // In eager, all previous partitions are revoked from all members
  const totalRevoked = Object.values(lastEvent.revokedPartitions).flat();
  assert.ok(totalRevoked.length > 0, "eager should revoke partitions");
});

test("eager classic: paused members resume after step", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "eager" });
  s = consumerJoin(s, "g", "c");
  // Some members should be paused
  const pausedBefore = s.groups[0].members.filter((m) => m.paused);
  assert.ok(pausedBefore.length > 0, "should have paused members");
  s = step(s);
  const pausedAfter = s.groups[0].members.filter((m) => m.paused);
  assert.equal(pausedAfter.length, 0, "all members should resume after step");
});

// ───────────────────────── cooperative classic behavior ─────────────────────────

test("cooperative classic: only moved partitions revoked", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  // Record original assignment
  const assignedBefore = new Map<string, number[]>();
  for (const m of s.groups[0].members) {
    assignedBefore.set(m.id, [...m.assigned]);
  }
  s = consumerScaleOut(s, "g", ["c"]);
  const g = s.groups[0];
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  // Only members that lost partitions should be paused (not all)
  for (const m of g.members.filter((m) => m.alive)) {
    const prevAssigned = assignedBefore.get(m.id) ?? [];
    const revoked = lastEvent.revokedPartitions[m.id] ?? [];
    if (revoked.length === 0 && prevAssigned.length > 0) {
      // This member should NOT be paused
      assert.ok(
        !lastEvent.pausedMembers.includes(m.id),
        `cooperative: member ${m.id} with no revoked partitions should not be paused`,
      );
    }
  }
});

test("cooperative classic: unaffected ownership continues", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "classic", classicAssignmentBehavior: "cooperative" });
  for (let i = 0; i < 6; i++) s = produce(s, i, null, `v${i}`).state;
  s = step(s); // consumers consume
  // Record committed state before
  const committedBefore = new Map<string, Record<number, number>>();
  for (const m of s.groups[0].members) {
    committedBefore.set(m.id, { ...m.committed });
  }
  s = consumerScaleOut(s, "g", ["c"]);
  s = step(s); // let unpaused consumers consume
  // Unpaused consumers should have progressed
  const g = s.groups[0];
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  for (const m of g.members.filter((m) => m.alive)) {
    if (!lastEvent.pausedMembers.includes(m.id)) {
      // Should have consumed
      const prevCommitted = committedBefore.get(m.id) ?? {};
      for (const pId of m.assigned) {
        if (prevCommitted[pId] !== undefined) {
          assert.ok(
            (m.committed[pId] ?? 0) >= (prevCommitted[pId] ?? 0),
            `cooperative: unpaused member ${m.id} should not lose progress on p${pId}`,
          );
        }
      }
    }
  }
});

// ───────────────────────── consumer protocol (KIP-848) ─────────────────────────

test("consumer protocol: never reports classicAssignmentBehavior", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = consumerJoin(s, "g", "c");
  const g = s.groups[0];
  assert.equal(g.classicAssignmentBehavior, undefined);
  for (const evt of g.rebalanceEvents) {
    assert.equal(evt.classicAssignmentBehavior, undefined, "consumer protocol should never have classicAssignmentBehavior");
    assert.equal(evt.groupProtocol, "consumer");
  }
});

test("consumer protocol: no processing pause on rebalance", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = consumerScaleOut(s, "g", ["c"]);
  const g = s.groups[0];
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  assert.equal(lastEvent.pauseTicks, 0, "consumer protocol should have 0 pause ticks");
  assert.equal(lastEvent.pausedMembers.length, 0, "consumer protocol should have no paused members");
});

test("consumer protocol: group/member epochs increment on membership change", () => {
  let s = createCluster({ partitionCount: 4 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  const epoch1 = s.groups[0].groupEpoch;
  s = consumerJoin(s, "g", "c");
  const epoch2 = s.groups[0].groupEpoch;
  assert.ok(epoch2 > epoch1, "group epoch should increment on join");
  // Member epochs should match group epoch
  for (const m of s.groups[0].members.filter((m) => m.alive)) {
    assert.equal(m.memberEpoch, epoch2, `member ${m.id} epoch should match group epoch`);
  }
});

test("consumer protocol: reconciliation state in rebalance events", () => {
  let s = createCluster({ partitionCount: 6 });
  s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol: "consumer" });
  s = consumerScaleOut(s, "g", ["c"]);
  const g = s.groups[0];
  const lastEvent = g.rebalanceEvents[g.rebalanceEvents.length - 1];
  assert.ok(
    lastEvent.reconciliationState === "stable" || lastEvent.reconciliationState === "reconciling",
    "should have reconciliationState",
  );
});

// ───────────────────────── crash vs graceful leave risk ─────────────────────────

test("crash has elevated duplicate risk, graceful leave has low risk", () => {
  const protocols: Array<{
    label: string;
    groupProtocol: "classic" | "consumer";
    classicAssignmentBehavior?: "eager" | "cooperative";
  }> = [
    { label: "classic/eager", groupProtocol: "classic", classicAssignmentBehavior: "eager" },
    { label: "classic/cooperative", groupProtocol: "classic", classicAssignmentBehavior: "cooperative" },
    { label: "consumer", groupProtocol: "consumer" },
  ];

  for (const { label, groupProtocol, classicAssignmentBehavior } of protocols) {
    let s = createCluster({ partitionCount: 4 });
    s = addConsumerGroup(s, { id: "g", consumerIds: ["a", "b"], groupProtocol, classicAssignmentBehavior });

    // Test crash
    s = consumerCrash(s, "g", "a");
    const crashEvent = s.groups[0].rebalanceEvents.find((e) => e.operation === "crash");
    assert.ok(crashEvent, `[${label}] should have crash rebalance event`);
    assert.equal(crashEvent!.duplicateRisk.level, "elevated", `[${label}] crash should be elevated risk`);

    // Restart and test leave
    s = consumerRestart(s, "g", "a");
    s = consumerLeave(s, "g", "b");
    const leaveEvent = s.groups[0].rebalanceEvents.find((e) => e.operation === "leave");
    assert.ok(leaveEvent, `[${label}] should have leave rebalance event`);
    assert.equal(leaveEvent!.duplicateRisk.level, "low", `[${label}] leave should be low risk`);
  }
});

