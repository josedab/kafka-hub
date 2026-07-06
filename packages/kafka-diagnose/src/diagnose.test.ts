import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parseProperties, rules } from "./index";

test("parseProperties: ignores comments and blanks, trims values", () => {
  const out = parseProperties(`
    # comment
    ! another comment
    broker.id = 1
    acks=all
    listeners:PLAINTEXT://0.0.0.0:9092
  `);
  assert.equal(out["broker.id"], "1");
  assert.equal(out.acks, "all");
  assert.equal(out.listeners, "PLAINTEXT://0.0.0.0:9092");
});

test("evaluate: every rule has an id, category, and evaluate function", () => {
  for (const r of rules) {
    assert.ok(r.id, `rule missing id: ${JSON.stringify(r)}`);
    assert.ok(r.category, `rule ${r.id} missing category`);
    assert.equal(typeof r.evaluate, "function", `rule ${r.id} evaluate not a function`);
  }
});

test("evaluate: rule ids are unique", () => {
  const ids = rules.map((r) => r.id);
  const seen = new Set<string>();
  for (const id of ids) {
    assert.ok(!seen.has(id), `duplicate rule id: ${id}`);
    seen.add(id);
  }
});

test("evaluate: unclean.leader.election.enable=true is flagged danger", () => {
  const r = evaluate("unclean.leader.election.enable=true");
  const f = r.findings.find((x) => x.ruleId === "unclean-leader-election");
  assert.ok(f, "expected unclean-leader-election finding");
  assert.equal(f.severity, "danger");
  assert.equal(f.category, "broker");
  assert.ok(r.stats.danger >= 1);
});

test("evaluate: acks=all + min.insync.replicas=1 is flagged", () => {
  const r = evaluate(`
    acks=all
    min.insync.replicas=1
    replication.factor=3
  `);
  const ids = r.findings.map((f) => f.ruleId);
  assert.ok(
    ids.some((id) => id.includes("min-isr") || id.includes("insync") || id.includes("isr-1")),
    `expected min-isr rule to fire; got: ${ids.join(", ")}`,
  );
});

test("evaluate: clean acks=all + idempotence config emits no danger", () => {
  const r = evaluate(`
    acks=all
    enable.idempotence=true
    max.in.flight.requests.per.connection=5
    retries=2147483647
    delivery.timeout.ms=120000
  `);
  assert.equal(r.stats.danger, 0, `unexpected danger: ${JSON.stringify(r.findings)}`);
});

test("evaluate: parsedKeys reflects number of unique config keys", () => {
  const r = evaluate("a=1\nb=2\nc=3");
  assert.equal(r.parsedKeys, 3);
});

test("evaluate: findings carry category from rule", () => {
  const r = evaluate("listeners=PLAINTEXT://0.0.0.0:9092\nbroker.id=1");
  for (const f of r.findings) {
    assert.ok(f.category, `finding ${f.ruleId} missing category`);
    assert.ok(
      ["broker", "topic", "producer", "consumer", "security", "transactions", "performance"].includes(
        f.category,
      ),
      `finding ${f.ruleId} has unexpected category ${f.category}`,
    );
  }
});

test("evaluate: empty input yields no findings", () => {
  const r = evaluate("");
  assert.equal(r.stats.danger, 0);
  assert.equal(r.stats.warning, 0);
  assert.equal(r.stats.info, 0);
});

test("evaluate: malformed lines are silently skipped", () => {
  const r = evaluate(`
    valid.key=valid.value
    this line has no equals
    another=ok
  `);
  assert.equal(r.parsedKeys, 2);
});
