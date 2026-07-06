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
} from "./index";
import { SCENARIOS, SCENARIO_LIST } from "./scenarios";
import { runOp } from "./runner";

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
  // After revive + a few ticks, broker should rejoin ISR.
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
  // step a few times so the consumer drains.
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
