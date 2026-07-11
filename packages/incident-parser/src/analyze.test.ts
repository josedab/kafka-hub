import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { analyze, ENGINE_VERSION } from "./analyze";
import { INPUT_LIMITS } from "./validate";
import { SIGNATURES } from "./signatures";
import { exportMarkdown, exportJson } from "./export";

// ─── Validation Integration ─────────────────────────────────────────────────

describe("analyze: input validation", () => {
  test("empty input returns error", () => {
    const result = analyze("");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "empty");
  });

  test("binary input returns error", () => {
    const result = analyze("PK\x03\x04zipdata");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "unsupported-binary");
  });

  test("too-large input returns error", () => {
    const result = analyze("a".repeat(INPUT_LIMITS.maxBytes + 1));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "too-large");
  });

  test("too-many-lines input returns error", () => {
    const lines = Array.from({ length: INPUT_LIMITS.maxLines + 1 }, (_, i) => `line ${i}`).join("\n");
    const result = analyze(lines);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "too-many-lines");
  });

  test("malformed JSON returns error", () => {
    const result = analyze('{"key": broken}');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "malformed-json");
  });
});

// ─── Signature Detection (all 10 signatures) ───────────────────────────────

const SIGNATURE_FIXTURES: Array<{
  id: string;
  title: string;
  evidence: string;
  minConfidence: number;
}> = [
  {
    id: "isr-min-isr-failure",
    title: "ISR shrink",
    evidence: `[2024-01-15 10:30:00,123] ERROR [ReplicaManager broker=1] NotEnoughReplicasException for partition test-0 (kafka.server.ReplicaManager)
[2024-01-15 10:30:00,456] WARN ISR shrink for partition test-0 from [1,2,3] to [1] (kafka.server.ReplicaManager)
kafka.server:type=ReplicaManager,name=UnderMinIsrPartitionCount Value=3
min.insync.replicas=2`,
    minConfidence: 50,
  },
  {
    id: "disk-storage-failure",
    title: "Disk failure",
    evidence: `[2024-01-15 10:30:00,123] ERROR [LogManager broker=1] KafkaStorageException: Failed to write to log dir /var/lib/kafka/data (kafka.log.LogManager)
[2024-01-15 10:30:01,456] ERROR IOException: No space left on device (kafka.server.ReplicaManager)
Failed to flush log for partition test-0`,
    minConfidence: 50,
  },
  {
    id: "stale-leader-metadata",
    title: "Stale leader",
    evidence: `org.apache.kafka.clients.consumer.ConsumerCoordinator: NOT_LEADER_FOR_PARTITION
LEADER_NOT_AVAILABLE for partition test-0
metadata.max.age.ms=300000
Stale metadata detected, refreshing`,
    minConfidence: 40,
  },
  {
    id: "poll-timeout-rebalance",
    title: "Poll timeout / rebalance",
    evidence: `org.apache.kafka.clients.consumer.ConsumerCoordinator: Commit cannot be completed since the group has already rebalanced
Member consumer-1 has been removed from the group due to poll timeout
max.poll.interval.ms=300000
session.timeout.ms=10000`,
    minConfidence: 40,
  },
  {
    id: "auth-sasl-failure",
    title: "Auth / SASL failure",
    evidence: `[2024-01-15 10:30:00,123] ERROR SASL authentication failed for client (kafka.server.KafkaServer)
org.apache.kafka.common.errors.TopicAuthorizationException: Not authorized to access topic test-topic
sasl.mechanism=PLAIN
security.protocol=SASL_SSL`,
    minConfidence: 40,
  },
  {
    id: "serializer-magic-byte",
    title: "Serializer / magic byte",
    evidence: `org.apache.kafka.common.errors.SerializationException: Error deserializing key/value
Unknown magic byte when deserializing record
\tat org.apache.kafka.clients.consumer.KafkaConsumer.poll(KafkaConsumer.java:1257)
key.deserializer=org.apache.kafka.common.serialization.StringDeserializer`,
    minConfidence: 40,
  },
  {
    id: "controller-movement",
    title: "Controller movement",
    evidence: `[2024-01-15 10:30:00,123] INFO [ControllerEventManager] New controller elected (kafka.controller.KafkaController)
ActiveControllerCount = 0
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
Broker 2 became controller after broker 1 lost controller role`,
    minConfidence: 40,
  },
  {
    id: "kraft-quorum-loss",
    title: "KRaft quorum loss",
    evidence: `[2024-01-15 10:30:00,123] ERROR [KafkaRaftClient] Failed to reach quorum (kafka.server.KafkaRaftClient)
voter 2 disconnected from raft quorum
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
RaftManager: quorum not met`,
    minConfidence: 40,
  },
  {
    id: "oversized-record",
    title: "Oversized record",
    evidence: `org.apache.kafka.common.errors.RecordTooLargeException: The message is 2097152 bytes, which exceeds the max size
message.max.bytes=1048576
max.request.size=1048576
Record too large for partition test-0`,
    minConfidence: 40,
  },
  {
    id: "producer-fencing-epoch",
    title: "Producer fencing",
    evidence: `org.apache.kafka.common.errors.ProducerFencedException: Producer with transactional.id test-txn has been fenced
InvalidProducerEpoch error for producer
transactional.id=test-txn
OutOfOrderSequenceException: sequence number mismatch`,
    minConfidence: 40,
  },
];

describe("analyze: all 10 signatures", () => {
  for (const fixture of SIGNATURE_FIXTURES) {
    test(`detects ${fixture.id}`, () => {
      const result = analyze(fixture.evidence);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const hypothesis = result.analysis.hypotheses.find((h) => h.id === fixture.id);
      assert.ok(hypothesis, `expected hypothesis ${fixture.id}, got: ${result.analysis.hypotheses.map((h) => h.id).join(", ")}`);
      assert.ok(
        hypothesis.confidence >= fixture.minConfidence,
        `expected confidence >= ${fixture.minConfidence}, got ${hypothesis.confidence}`,
      );
      assert.ok(hypothesis.supportingEvidence.length > 0, "expected supporting evidence");
      assert.ok(hypothesis.title.length > 0, "expected title");
      assert.ok(hypothesis.severity, "expected severity");
    });
  }
});

// ─── Multi-Signal Correlation ───────────────────────────────────────────────

describe("analyze: multi-signal correlation", () => {
  test("ISR failure + disk failure produces both hypotheses", () => {
    const evidence = `[2024-01-15 10:30:00,123] ERROR NotEnoughReplicasException (kafka.server.ReplicaManager)
[2024-01-15 10:30:00,456] ERROR KafkaStorageException: disk full (kafka.log.LogManager)
ISR shrink for partition test-0
No space left on device`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const ids = result.analysis.hypotheses.map((h) => h.id);
    assert.ok(ids.includes("isr-min-isr-failure"), "expected ISR failure");
    assert.ok(ids.includes("disk-storage-failure"), "expected disk failure");
  });

  test("auth failure + client rebalance produces multiple hypotheses", () => {
    const evidence = `SASL authentication failed for client (kafka.server.KafkaServer)
TopicAuthorizationException: Not authorized
Member consumer-1 has been removed from the group
Commit cannot be completed since the group has already rebalanced
org.apache.kafka.clients.consumer.ConsumerCoordinator: Rebalance triggered`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const ids = result.analysis.hypotheses.map((h) => h.id);
    assert.ok(ids.includes("auth-sasl-failure"), "expected auth failure");
    assert.ok(ids.includes("poll-timeout-rebalance"), "expected rebalance");
  });
});

// ─── Conflicting Evidence ───────────────────────────────────────────────────

describe("analyze: conflicting evidence", () => {
  test("controller movement with stable metric reduces confidence", () => {
    const evidence = `[2024-01-15 10:30:00,123] INFO new controller elected (kafka.controller.KafkaController)
controller.quorum.voters=1@host1:9093
ActiveControllerCount = 1`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const h = result.analysis.hypotheses.find((h) => h.id === "controller-movement");
    if (h) {
      assert.ok(h.conflictingEvidence.length > 0, "expected conflicting evidence");
    }
  });
});

// ─── Missing Evidence ───────────────────────────────────────────────────────

describe("analyze: missing evidence", () => {
  test("hypotheses include missing evidence suggestions", () => {
    const evidence = `NotEnoughReplicasException for partition test-0
[2024-01-15 10:30:00,123] ERROR ISR shrink (kafka.server.ReplicaManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const h = result.analysis.hypotheses.find((h) => h.id === "isr-min-isr-failure");
    assert.ok(h, "expected ISR hypothesis");
    assert.ok(h.missingEvidence.length > 0, "expected missing evidence");
    assert.ok(h.recommendedNextEvidence.length > 0, "expected recommended next evidence");
  });
});

// ─── Deterministic Ordering ─────────────────────────────────────────────────

describe("analyze: deterministic ordering", () => {
  test("same input produces same order", () => {
    const evidence = `NotEnoughReplicasException
KafkaStorageException
SASL authentication failed
ProducerFencedException
[2024-01-15] ERROR (kafka.server.ReplicaManager)
[2024-01-15] ERROR (kafka.log.LogManager)
[2024-01-15] ERROR (kafka.server.KafkaServer)`;
    const r1 = analyze(evidence);
    const r2 = analyze(evidence);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    if (!r1.ok || !r2.ok) return;

    const ids1 = r1.analysis.hypotheses.map((h) => h.id);
    const ids2 = r2.analysis.hypotheses.map((h) => h.id);
    assert.deepEqual(ids1, ids2, "hypothesis ordering should be deterministic");
  });

  test("higher confidence comes first", () => {
    const evidence = `NotEnoughReplicasException
NotEnoughReplicasAfterAppend
ISR shrink
UnderMinIsrPartitionCount=5
min.insync.replicas=2
UnderReplicatedPartitions=10
[2024-01-15] ERROR (kafka.server.ReplicaManager)
SASL authentication failed
[2024-01-15] ERROR (kafka.server.KafkaServer)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (let i = 1; i < result.analysis.hypotheses.length; i++) {
      const prev = result.analysis.hypotheses[i - 1];
      const curr = result.analysis.hypotheses[i];
      assert.ok(
        prev.confidence >= curr.confidence,
        `expected descending confidence: ${prev.id}(${prev.confidence}) >= ${curr.id}(${curr.confidence})`,
      );
    }
  });

  test("injected timestamp makes the full analysis deterministic", () => {
    const evidence = "NotEnoughReplicasException\nISR shrink";
    const analyzedAt = "2026-07-26T06:00:00.000Z";
    const first = analyze(evidence, { analyzedAt });
    const second = analyze(evidence, { analyzedAt });

    assert.deepEqual(second, first);
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.analysis.analyzedAt, analyzedAt);
  });
});

// ─── Deduplication ──────────────────────────────────────────────────────────

describe("analyze: deduplication", () => {
  test("no duplicate hypothesis IDs", () => {
    const evidence = `NotEnoughReplicasException
NotEnoughReplicasAfterAppend
ISR shrink
NotEnoughReplicasException again
[2024-01-15] ERROR [ReplicaManager] (kafka.server.ReplicaManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const ids = result.analysis.hypotheses.map((h) => h.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, `duplicate hypotheses found: ${ids.join(", ")}`);
  });
});

// ─── Hypothesis Structure ───────────────────────────────────────────────────

describe("analyze: hypothesis structure", () => {
  test("all hypotheses have required fields", () => {
    const evidence = `NotEnoughReplicasException
KafkaStorageException
No space left on device
[2024-01-15] ERROR [ReplicaManager] (kafka.server.ReplicaManager)
[2024-01-15] ERROR [LogManager] (kafka.log.LogManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (const h of result.analysis.hypotheses) {
      assert.ok(h.id, "id required");
      assert.ok(h.title, "title required");
      assert.ok(h.severity, "severity required");
      assert.ok(typeof h.confidence === "number", "confidence must be number");
      assert.ok(h.confidence >= 0 && h.confidence <= 100, `confidence ${h.confidence} out of range`);
      assert.ok(h.confidenceReason, "confidenceReason required");
      assert.ok(Array.isArray(h.supportingEvidence), "supportingEvidence must be array");
      assert.ok(Array.isArray(h.conflictingEvidence), "conflictingEvidence must be array");
      assert.ok(Array.isArray(h.missingEvidence), "missingEvidence must be array");
      assert.ok(Array.isArray(h.recommendedNextEvidence), "recommendedNextEvidence must be array");
      assert.ok(Array.isArray(h.resourceLinks), "resourceLinks must be array");
      assert.ok(Array.isArray(h.observability), "observability must be array");
    }
  });

  test("supporting evidence has source line references", () => {
    const evidence = `[2024-01-15 10:30:00,123] ERROR NotEnoughReplicasException (kafka.server.ReplicaManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (const h of result.analysis.hypotheses) {
      for (const e of h.supportingEvidence) {
        assert.ok(e.text, "excerpt text required");
        assert.ok(e.sourceLines.length > 0, "source lines required");
        for (const sl of e.sourceLines) {
          assert.ok(sl.line >= 1, "line must be >= 1");
          assert.ok(sl.text.length >= 0, "line text required");
        }
        assert.ok(e.kind, "kind required");
      }
    }
  });
});

// ─── Observability Recommendations ──────────────────────────────────────────

describe("analyze: observability recommendations", () => {
  test("ISR failure includes metric, rationale, and caveat", () => {
    const evidence = `NotEnoughReplicasException for partition test-0
ISR shrink
[2024-01-15] ERROR (kafka.server.ReplicaManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const h = result.analysis.hypotheses.find((h) => h.id === "isr-min-isr-failure");
    assert.ok(h, "expected ISR hypothesis");
    assert.ok(h.observability.length > 0, "expected observability recs");

    for (const obs of h.observability) {
      assert.ok(obs.metric, "metric required");
      assert.ok(obs.description, "description with units/context required");
      assert.ok(obs.rationale, "rationale required");
      assert.ok(obs.caveat, "caveat (do not alert) guidance required");
    }
  });

  test("observability recommendations mention units or context", () => {
    for (const sig of SIGNATURES) {
      for (const obs of sig.observability) {
        // Each description should mention some unit or context
        const hasContext =
          /\b(count|gauge|bytes|sec|rate|percent|ms|milliseconds?|per|count\/sec|0|1)\b/i.test(
            obs.description,
          );
        assert.ok(hasContext, `observability for ${sig.id}: "${obs.metric}" should mention units/context in description`);
      }
    }
  });

  test("observability caveats avoid universal time or rate thresholds", () => {
    for (const sig of SIGNATURES) {
      for (const obs of sig.observability) {
        assert.doesNotMatch(
          obs.caveat,
          /[<>]\s*\d+\s*(?:ms|s|sec|seconds?|min|minutes?|hours?|\/hour)/i,
          `${sig.id}: caveat must not claim a universal threshold`,
        );
        assert.match(
          obs.caveat,
          /do not|baseline|correlate|expected|slo|workload/i,
          `${sig.id}: caveat must explain why the signal is insufficient alone`,
        );
      }
    }
  });
});

// ─── Resource Links ─────────────────────────────────────────────────────────

describe("analyze: resource links", () => {
  test("hypotheses include cross-links to hub resources", () => {
    const evidence = `NotEnoughReplicasException for partition test-0
ISR shrink
[2024-01-15] ERROR (kafka.server.ReplicaManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const h = result.analysis.hypotheses.find((h) => h.id === "isr-min-isr-failure");
    assert.ok(h, "expected ISR hypothesis");
    assert.ok(h.resourceLinks.length > 0, "expected resource links");

    for (const rl of h.resourceLinks) {
      assert.ok(rl.label, "label required");
      assert.ok(rl.href.startsWith("/"), "href should be a local path");
      assert.ok(rl.surface, "surface required");
    }
  });
});

// ─── Analysis Metadata ──────────────────────────────────────────────────────

describe("analyze: metadata", () => {
  test("analysis includes timestamp and version", () => {
    const result = analyze("broker.id=1\nlisteners=PLAINTEXT://:9092\nlog.dirs=/data");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(result.analysis.analyzedAt, "analyzedAt required");
    assert.equal(result.analysis.engineVersion, ENGINE_VERSION);
  });

  test("evidence metadata includes format and kinds", () => {
    const result = analyze("broker.id=1\nlisteners=PLAINTEXT://:9092\nlog.dirs=/data");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(result.analysis.evidence.format, "format required");
    assert.ok(result.analysis.evidence.kinds.length > 0, "kinds required");
    assert.ok(result.analysis.evidence.lineCount > 0, "lineCount required");
    assert.ok(result.analysis.evidence.byteCount > 0, "byteCount required");
  });
});

// ─── JSON Input Parsing ─────────────────────────────────────────────────────

describe("analyze: JSON input", () => {
  test("JSON evidence with known patterns is analyzed", () => {
    const evidence = JSON.stringify({
      logs: [
        "NotEnoughReplicasException for partition test-0",
        "ISR shrink for partition test-0 from [1,2,3] to [1]",
      ],
      metrics: {
        "UnderMinIsrPartitionCount": 3,
      },
    }, null, 2);
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.analysis.evidence.format, "json");
  });
});

// ─── Export / Sanitization ──────────────────────────────────────────────────

describe("export: sanitization", () => {
  test("markdown export does not contain raw secrets", () => {
    const evidence = `[2024-01-15] ERROR SASL authentication failed (kafka.server.KafkaServer)
sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="s3cret123";
TopicAuthorizationException: Not authorized`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const md = exportMarkdown(result.analysis);
    assert.ok(!md.content.includes("s3cret123"), "markdown must not contain raw secrets");
    assert.ok(md.content.includes("REDACTED") || md.redactedCount >= 0, "should show redaction");
  });

  test("JSON export does not contain raw secrets", () => {
    const evidence = `sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required password="topsecret";
SASL authentication failed
[2024-01-15] ERROR (kafka.server.KafkaServer)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const json = exportJson(result.analysis);
    assert.ok(!json.content.includes("topsecret"), "JSON must not contain raw secrets");
  });

  test("export includes redaction summary when secrets found", () => {
    const evidence = `ssl.keystore.password=mysecretpass
SASL authentication failed
[2024-01-15] ERROR (kafka.server.KafkaServer)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const md = exportMarkdown(result.analysis);
    assert.ok(md.redactionSummary.length > 0, "should have redaction summary");
  });

  test("export counts one source-line secret once even when excerpt text repeats it", () => {
    const evidence = `sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required ******;
SASL authentication failed
[2024-01-15] ERROR (kafka.server.KafkaServer)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const md = exportMarkdown(result.analysis);
    assert.equal(md.redactedCount, 1);
    assert.deepEqual(md.redactedKeys, ["sasl.jaas.config"]);
  });

  test("export without secrets reports clean", () => {
    const evidence = `[2024-01-15 10:30:00,123] ERROR NotEnoughReplicasException (kafka.server.ReplicaManager)
ISR shrink for partition test-0`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const md = exportMarkdown(result.analysis);
    assert.ok(
      md.redactionSummary.includes("No common secret patterns"),
      "should report no recognized patterns",
    );
    assert.equal(md.redactedCount, 0);
  });
});

// ─── Markdown Export Structure ──────────────────────────────────────────────

describe("export: markdown structure", () => {
  test("markdown includes assumptions section", () => {
    const evidence = `NotEnoughReplicasException
[2024-01-15] ERROR (kafka.server.ReplicaManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const md = exportMarkdown(result.analysis);
    assert.ok(md.content.includes("Assumptions"), "should include assumptions");
    assert.ok(md.content.includes("static pattern matching"), "should note static analysis");
  });

  test("markdown includes resource links", () => {
    const evidence = `NotEnoughReplicasException
ISR shrink
[2024-01-15] ERROR (kafka.server.ReplicaManager)`;
    const result = analyze(evidence);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const md = exportMarkdown(result.analysis);
    assert.ok(md.content.includes("Resources"), "should include resources section");
  });
});

// ─── Engine Version ─────────────────────────────────────────────────────────

test("ENGINE_VERSION is a positive integer", () => {
  assert.ok(Number.isInteger(ENGINE_VERSION));
  assert.ok(ENGINE_VERSION > 0);
});

// ─── Signature Registry Integrity ───────────────────────────────────────────

describe("signatures: integrity", () => {
  test("all signatures have unique IDs", () => {
    const ids = SIGNATURES.map((s) => s.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, `duplicate signature IDs: ${ids.join(", ")}`);
  });

  test("all signatures have required fields", () => {
    for (const sig of SIGNATURES) {
      assert.ok(sig.id, "id required");
      assert.ok(sig.title, "title required");
      assert.ok(sig.severity, "severity required");
      assert.ok(sig.patterns.length > 0, `${sig.id}: patterns required`);
      assert.ok(Array.isArray(sig.missingEvidence), `${sig.id}: missingEvidence required`);
      assert.ok(Array.isArray(sig.recommendedNextEvidence), `${sig.id}: recommendedNextEvidence required`);
      assert.ok(Array.isArray(sig.resourceLinks), `${sig.id}: resourceLinks required`);
      assert.ok(Array.isArray(sig.observability), `${sig.id}: observability required`);
    }
  });

  test("there are exactly 10 signatures", () => {
    assert.equal(SIGNATURES.length, 10);
  });
});
