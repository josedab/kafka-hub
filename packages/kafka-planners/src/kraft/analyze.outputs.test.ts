import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeKRaft,
  validateUnknownKRaftInput,
  isSafeLabel,
  exportKRaftMarkdown,
  exportKRaftJson,
  exportKRaftChecklist,
  redactKRaftLabel,
  VERSION_BASELINE,
  SOURCES,
  RESOURCE_LINKS,
  makeInput,
  getResult,
  getDynamicResult,
} from "./analyze.test-support";

describe("preflight checklist", () => {
  test("checklist has expected categories", () => {
    const result = getResult();
    const categories = new Set(result.checklist.map((c) => c.category));
    assert.ok(categories.has("backup"));
    assert.ok(categories.has("vendor"));
    assert.ok(categories.has("controllers"));
    assert.ok(categories.has("node-ids"));
    assert.ok(categories.has("listeners"));
    assert.ok(categories.has("quorum"));
    assert.ok(categories.has("acl"));
    assert.ok(categories.has("log-dirs"));
    assert.ok(categories.has("version"));
    assert.ok(categories.has("monitoring"));
    assert.ok(categories.has("rollback"));
    assert.ok(categories.has("finalization"));
  });

  test("checklist has at least 12 items", () => {
    const result = getResult();
    assert.ok(result.checklist.length >= 12);
  });

  test("checklist items contain no shell commands", () => {
    const result = getResult();
    const shellPatterns = [
      /\$\(/,
      /`[^`]+`/,
      /\bsudo\b/,
      /\bkafka-configs\b/,
      /\bkafka-metadata\b/,
      /\bbin\//,
      /\bcurl\b/,
      /\bwget\b/,
      /\bapt\b/,
      /\byum\b/,
    ];
    for (const item of result.checklist) {
      for (const pattern of shellPatterns) {
        assert.ok(
          !pattern.test(item.text),
          `Checklist item "${item.id}" text should not contain commands: ${item.text}`,
        );
        assert.ok(
          !pattern.test(item.detail),
          `Checklist item "${item.id}" detail should not contain commands: ${item.detail}`,
        );
      }
    }
  });

  test("checklist items are verification-oriented", () => {
    const result = getResult();
    for (const item of result.checklist) {
      assert.ok(
        /\b(Verify|Confirm|Understand)\b/i.test(item.text),
        `Checklist item "${item.id}" should use verification language: ${item.text}`,
      );
    }
  });

  test("version checklist item references 3.9.1 minimum", () => {
    const result = getResult();
    const versionItem = result.checklist.find((c) => c.id === "version-compatible");
    assert.ok(versionItem);
    assert.ok(versionItem!.text.includes("3.9.1"));
  });

  test("monitoring checklist mentions KRaft quorum signals", () => {
    const result = getResult();
    const monItem = result.checklist.find((c) => c.id === "monitoring-configured");
    assert.ok(monItem);
    assert.ok(monItem!.text.includes("raft-metrics") || monItem!.text.includes("current-leader"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KRaft Quorum Observability Metrics
// ═══════════════════════════════════════════════════════════════════════════

describe("observability recommendations", () => {
  test("result has observability recommendations", () => {
    const result = getResult();
    assert.ok(result.observability.length >= 8);
  });

  test("includes current-leader raft metric", () => {
    const result = getResult();
    assert.ok(
      result.observability.some((r) => r.metric.includes("current-leader")),
      "Should include kafka.server:type=raft-metrics,name=current-leader",
    );
  });

  test("includes high-watermark-update-rate", () => {
    const result = getResult();
    assert.ok(result.observability.some((r) => r.metric.includes("high-watermark-update-rate")));
  });

  test("includes commit-latency-avg", () => {
    const result = getResult();
    assert.ok(result.observability.some((r) => r.metric.includes("commit-latency-avg")));
  });

  test("includes ActiveControllerCount (but not as sole signal)", () => {
    const result = getResult();
    const acc = result.observability.find((r) => r.metric.includes("ActiveControllerCount"));
    assert.ok(acc);
    assert.ok(acc!.caveat.includes("alone") || acc!.rationale.includes("complements"));
  });

  test("each recommendation has all fields", () => {
    const result = getResult();
    for (const rec of result.observability) {
      assert.ok(rec.metric.length > 0);
      assert.ok(rec.description.length > 0);
      assert.ok(rec.rationale.length > 0);
      assert.ok(rec.caveat.length > 0);
    }
  });

  test("caveats discourage alerting on signal alone", () => {
    const result = getResult();
    const withCaveat = result.observability.filter(
      (r) => /\b(alone|baseline|correlate|not\s+always|workload|universal)\b/i.test(r.caveat),
    );
    assert.ok(
      withCaveat.length >= 5,
      `At least 5 recommendations should have baseline/context caveats (got ${withCaveat.length})`,
    );
  });

  test("no universal thresholds in recommendations", () => {
    const result = getResult();
    for (const rec of result.observability) {
      assert.ok(
        !/alert\s+(?:if|when)\s*>\s*\d+/i.test(rec.description),
        `Recommendation "${rec.metric}" should not contain universal thresholds`,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Baseline / Review Dates / Sources
// ═══════════════════════════════════════════════════════════════════════════

describe("version baseline and sources", () => {
  test("reviewed release is 4.3.1", () => {
    assert.equal(VERSION_BASELINE.reviewedRelease, "4.3.1");
  });

  test("release date is 2026-06-25", () => {
    assert.equal(VERSION_BASELINE.releaseDate, "2026-06-25");
  });

  test("review date is 2026-07-25", () => {
    assert.equal(VERSION_BASELINE.reviewDate, "2026-07-25");
  });

  test("caveat mentions time-bounded", () => {
    assert.ok(VERSION_BASELINE.caveat.includes("time-bounded"));
    assert.ok(VERSION_BASELINE.caveat.includes("not a timeless latest-version claim"));
  });

  test("sources include official Apache URLs", () => {
    const urls = SOURCES.map((s) => s.url);
    assert.ok(urls.includes("https://kafka.apache.org/39/operations/kraft/"));
    assert.ok(urls.includes("https://kafka.apache.org/40/getting-started/upgrade/"));
    assert.ok(urls.includes("https://kafka.apache.org/43/getting-started/upgrade/"));
    assert.ok(urls.includes("https://downloads.apache.org/kafka/4.3.1/RELEASE_NOTES.html"));
    assert.ok(urls.includes("https://kafka.apache.org/community/downloads/"));
  });

  test("result includes version baseline", () => {
    const result = getResult();
    assert.equal(result.versionBaseline.reviewedRelease, "4.3.1");
  });

  test("result includes sources", () => {
    const result = getResult();
    assert.ok(result.sources.length >= 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Exports / Redaction / No NaN
// ═══════════════════════════════════════════════════════════════════════════

describe("exports", () => {
  test("Markdown export contains safety statement", () => {
    const result = getResult();
    const md = exportKRaftMarkdown(result);
    assert.ok(md.content.includes("does NOT execute commands"));
    assert.ok(md.content.includes("irreversible"));
  });

  test("Markdown export includes quorum mode", () => {
    const result = getResult();
    const md = exportKRaftMarkdown(result);
    assert.ok(md.content.includes("Quorum Mode"));
    assert.ok(md.content.includes("static"));
  });

  test("JSON export is valid JSON", () => {
    const result = getResult();
    const json = exportKRaftJson(result);
    const parsed = JSON.parse(json.content);
    assert.ok(parsed.generatedAt);
    assert.ok(parsed.safety);
    assert.equal(parsed.quorumMode, "static");
  });

  test("JSON export includes quorum mode", () => {
    const result = getDynamicResult();
    const json = exportKRaftJson(result);
    const parsed = JSON.parse(json.content);
    assert.equal(parsed.quorumMode, "dynamic");
    assert.ok(parsed.assumptions.bootstrapServers.length > 0);
  });

  test("JSON export has no NaN or Infinity", () => {
    const result = getResult();
    const json = exportKRaftJson(result);
    assert.ok(!json.content.includes("NaN"));
    assert.ok(!json.content.includes("Infinity"));
  });

  test("checklist export is plain text with safety and quorum mode", () => {
    const result = getResult();
    const cl = exportKRaftChecklist(result);
    assert.ok(cl.content.includes("KRAFT TRANSITION PREFLIGHT CHECKLIST"));
    assert.ok(cl.content.includes("does NOT execute commands"));
    assert.ok(cl.content.includes("Quorum Mode: static"));
  });

  test("checklist export applies the shared secret redaction boundary", () => {
    const result = getResult({
      vendor: "other",
      vendorLabel:
        'sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required ******;',
    });
    const checklist = exportKRaftChecklist(result);

    assert.ok(!checklist.content.includes("checklist-secret"));
    assert.ok(checklist.redactedCount > 0);
    assert.match(checklist.redactionSummary, /redacted/i);
  });

  test("redactKRaftLabel passes through safe text", () => {
    const safe = redactKRaftLabel("Apache Kafka");
    assert.equal(safe, "Apache Kafka");
  });

  test("Markdown export includes phase timeline with official labels", () => {
    const result = getResult();
    const md = exportKRaftMarkdown(result);
    assert.ok(md.content.includes("Migration Phase Timeline"));
    assert.ok(md.content.includes("Initial ZooKeeper"));
    assert.ok(md.content.includes("Initial Metadata Load"));
    assert.ok(md.content.includes("Hybrid Migration"));
    assert.ok(md.content.includes("Dual-Write Migration"));
    assert.ok(md.content.includes("Finalized KRaft"));
  });

  test("JSON export includes version baseline", () => {
    const result = getResult();
    const json = exportKRaftJson(result);
    const parsed = JSON.parse(json.content);
    assert.equal(parsed.versionBaseline.reviewedRelease, "4.3.1");
  });

  test("checklist export shows quorum voters for static mode", () => {
    const result = getResult();
    const cl = exportKRaftChecklist(result);
    assert.ok(cl.content.includes("Quorum Voters:"));
  });

  test("checklist export shows bootstrap servers for dynamic mode", () => {
    const result = getDynamicResult();
    const cl = exportKRaftChecklist(result);
    assert.ok(cl.content.includes("Bootstrap Servers:"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Resource Links
// ═══════════════════════════════════════════════════════════════════════════

describe("resource links", () => {
  test("result has resource links", () => {
    const result = getResult();
    assert.ok(result.resourceLinks.length >= 3);
  });

  test("resource links include shipped workbench pages", () => {
    const workbenchLinks = RESOURCE_LINKS.filter((l) => l.surface === "workbench");
    assert.ok(workbenchLinks.length >= 2);
  });

  test("resource links include external Apache docs", () => {
    const external = RESOURCE_LINKS.filter((l) => l.surface === "external");
    assert.ok(external.length >= 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Deterministic Ordering
// ═══════════════════════════════════════════════════════════════════════════

describe("deterministic ordering", () => {
  test("same input produces same findings order", () => {
    const r1 = getResult();
    const r2 = getResult();
    const ids1 = r1.findings.map((f) => f.id);
    const ids2 = r2.findings.map((f) => f.id);
    assert.deepEqual(ids1, ids2);
  });

  test("same input produces same checklist order", () => {
    const r1 = getResult();
    const r2 = getResult();
    const ids1 = r1.checklist.map((c) => c.id);
    const ids2 = r2.checklist.map((c) => c.id);
    assert.deepEqual(ids1, ids2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Malformed / Unknown Input Never Throws
// ═══════════════════════════════════════════════════════════════════════════

describe("malformed input never throws", () => {
  const badInputs: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["string", "not an object"],
    ["array", [1, 2, 3]],
    ["empty object", {}],
    ["partial object", { kafkaVersion: "3.9.1" }],
    ["NaN controllerCount", { ...makeInput(), controllerCount: NaN }],
    ["Infinity port in voter", { ...makeInput(), quorumVoters: [{ nodeId: 1, host: "x", port: Infinity }] }],
    ["non-string version", { ...makeInput(), kafkaVersion: 123 }],
    ["invalid phase", { ...makeInput(), migrationPhase: "nonexistent" }],
    ["invalid mode", { ...makeInput(), metadataMode: "zk" }],
    ["invalid vendor", { ...makeInput(), vendor: "foo" }],
    ["invalid quorum mode", { ...makeInput(), quorumMode: "semi" }],
  ];

  for (const [label, input] of badInputs) {
    test(`does not throw on ${label}`, () => {
      assert.doesNotThrow(() => analyzeKRaft(input));
      const r = analyzeKRaft(input);
      assert.equal(r.ok, false);
      assert.ok(r.issues.length > 0);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Structural Validation (validateUnknownKRaftInput)
// ═══════════════════════════════════════════════════════════════════════════

describe("structural validation", () => {
  test("valid input passes", () => {
    const r = validateUnknownKRaftInput(makeInput());
    assert.ok(r.ok);
  });

  test("null rejected", () => {
    const r = validateUnknownKRaftInput(null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.issues.some((i) => i.kind === "invalid-root"));
  });

  test("missing kafkaVersion", () => {
    const { kafkaVersion: _, ...rest } = makeInput(); // eslint-disable-line @typescript-eslint/no-unused-vars
    const r = validateUnknownKRaftInput(rest);
    assert.equal(r.ok, false);
  });

  test("invalid quorumMode", () => {
    const r = validateUnknownKRaftInput({ ...makeInput(), quorumMode: "hybrid" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.issues.some((i) => i.kind === "invalid-quorum-mode"));
  });

  test("missing bootstrapServers", () => {
    const input = makeInput();
    const { bootstrapServers: _, ...rest } = input; // eslint-disable-line @typescript-eslint/no-unused-vars
    const r = validateUnknownKRaftInput(rest);
    assert.equal(r.ok, false);
  });

  test("non-boolean production", () => {
    const r = validateUnknownKRaftInput({ ...makeInput(), production: "yes" });
    assert.equal(r.ok, false);
  });

  test("invalid aclHealth enum", () => {
    const r = validateUnknownKRaftInput({ ...makeInput(), aclHealth: "good" });
    assert.equal(r.ok, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Safe Label / Host Validation
// ═══════════════════════════════════════════════════════════════════════════

describe("safe string validation", () => {
  test("normal label is safe", () => {
    assert.ok(isSafeLabel("Apache Kafka"));
  });

  test("empty label is unsafe", () => {
    assert.ok(!isSafeLabel(""));
  });

  test("control chars are unsafe", () => {
    assert.ok(!isSafeLabel("hello\x00world"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Readiness Status
// ═══════════════════════════════════════════════════════════════════════════

describe("readiness status", () => {
  test("healthy input is ready or warnings (3.9.2 advisory may produce warnings)", () => {
    const result = getResult({ kafkaVersion: "3.9.2" });
    // With 3.9.2, no 3.9.2 advisory, so should be ready
    assert.equal(result.status, "ready");
  });

  test("malformed ACLs make it blocked", () => {
    const result = getResult({ aclHealth: "malformed" });
    assert.equal(result.status, "blocked");
  });

  test("failed log dirs make it blocked", () => {
    const result = getResult({ logDirHealth: "failed", failedLogDirCount: 1 });
    assert.equal(result.status, "blocked");
  });

  test("unknown ACLs make it warnings", () => {
    const result = getResult({ aclHealth: "unknown" });
    assert.equal(result.status, "warnings");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Assumptions Include Quorum Mode
// ═══════════════════════════════════════════════════════════════════════════

describe("assumptions", () => {
  test("static mode assumptions include quorumMode and quorumVoters", () => {
    const result = getResult();
    assert.equal(result.assumptions.quorumMode, "static");
    assert.ok(result.assumptions.quorumVoters.length > 0);
    assert.deepEqual(result.assumptions.bootstrapServers, []);
  });

  test("dynamic mode assumptions include quorumMode and bootstrapServers", () => {
    const result = getDynamicResult();
    assert.equal(result.assumptions.quorumMode, "dynamic");
    assert.ok(result.assumptions.bootstrapServers.length > 0);
    assert.deepEqual(result.assumptions.quorumVoters, []);
  });
});
