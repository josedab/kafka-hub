import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parseProperties, rules } from "./index";
import { allRules } from "./rules/index";
import { bool } from "./rules/helpers";

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
      ["validation", "broker", "topic", "producer", "consumer", "security", "transactions", "performance"].includes(
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
  // With lossless parser: "this line has no equals" is parsed as key="this" value="line has no equals" (whitespace separator per Java spec)
  assert.equal(r.parsedKeys, 3);
});

test("bool: accepts only normalized true and false literals", () => {
  assert.equal(bool("true"), true);
  assert.equal(bool(" FALSE "), false);
  assert.equal(bool("TrUe"), true);
  assert.equal(bool("flase"), undefined);
  assert.equal(bool("1"), undefined);
  assert.equal(bool("yes"), undefined);
  assert.equal(bool(""), undefined);
});

test("evaluate: malformed known boolean settings get a validation diagnostic", () => {
  const report = evaluate(`
    auto.leader.rebalance.enable=flase
    enable.auto.commit=yes
  `);
  const malformed = report.findings.filter(
    (finding) => finding.ruleId === "malformed-boolean-literal",
  );

  assert.equal(malformed.length, 2);
  assert.ok(malformed.every((finding) => finding.category === "validation"));
  assert.ok(
    !report.findings.some(
      (finding) => finding.ruleId === "auto-leader-rebalance-disabled",
    ),
    "a typo must not be interpreted as false",
  );
});

test("evaluate: valid normalized booleans do not get malformed diagnostics", () => {
  const report = evaluate(`
    auto.leader.rebalance.enable= FALSE
    enable.auto.commit=TrUe
  `);

  assert.ok(
    !report.findings.some(
      (finding) => finding.ruleId === "malformed-boolean-literal",
    ),
  );
});

test("evaluate: fixableCount counts findings with structured fixes", () => {
  const r = evaluate("unclean.leader.election.enable=true\nauto.create.topics.enable=true");
  assert.ok(r.fixableCount >= 2, `expected fixableCount >= 2, got ${r.fixableCount}`);
});

test("evaluate: at least 20 rules have structured fixes", () => {
  // Count distinct rules that CAN produce a structured fix
  // We trigger various configs to check
  const configs = [
    "unclean.leader.election.enable=true",
    "default.replication.factor=2",
    "auto.create.topics.enable=true",
    "auto.leader.rebalance.enable=false",
    "log.flush.interval.messages=1",
    "cleanup.policy=compact",
    "cleanup.policy=compact\nmin.cleanable.dirty.ratio=0.95",
    "cleanup.policy=compact\ndelete.retention.ms=1000",
    "acks=all\nmin.insync.replicas=1",
    "enable.idempotence=true\nacks=1",
    "enable.idempotence=true\nmax.in.flight.requests.per.connection=10",
    "compression.type=none",
    "compression.type=gzip",
    "linger.ms=0",
    "batch.size=100",
    "request.timeout.ms=30000\ndelivery.timeout.ms=10000",
    "enable.auto.commit=true",
    "ssl.endpoint.identification.algorithm=",
    "allow.everyone.if.no.acl.found=true",
    "transaction.state.log.replication.factor=2",
    "offsets.topic.replication.factor=2",
  ];

  const rulesWithFixes = new Set<string>();
  for (const config of configs) {
    const r = evaluate(config);
    for (const f of r.findings) {
      if (f.structuredFix) rulesWithFixes.add(f.ruleId);
    }
  }

  assert.ok(
    rulesWithFixes.size >= 20,
    `Expected at least 20 rules with structured fixes, got ${rulesWithFixes.size}: ${[...rulesWithFixes].join(", ")}`,
  );
});

test("evaluate: total rule count is 37", () => {
  assert.equal(allRules.length, 37);
});
