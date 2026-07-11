import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  detectEvidenceKinds,
  parseEvidence,
  indexLines,
  findMatchingLines,
} from "./detect";
import { detectFormat } from "./validate";

// ─── Evidence Kind Detection ────────────────────────────────────────────────

describe("detectEvidenceKinds", () => {
  test("broker log", () => {
    const input = `[2024-01-15 10:30:00,123] ERROR [ReplicaManager broker=1] ISR shrink (kafka.server.ReplicaManager)
[2024-01-15 10:30:01,456] WARN Controller election (kafka.controller.KafkaController)`;
    const kinds = detectEvidenceKinds(input);
    assert.ok(kinds.includes("broker-log"), `expected broker-log, got: ${kinds}`);
  });

  test("client log", () => {
    const input = `org.apache.kafka.clients.consumer.ConsumerCoordinator: Revoking partitions
kafka.clients.producer.ProducerConfig: ProducerConfig values`;
    const kinds = detectEvidenceKinds(input);
    assert.ok(kinds.includes("client-log"), `expected client-log, got: ${kinds}`);
  });

  test("consumer-groups output", () => {
    const input = `GROUP           TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
my-group        my-topic        0          100             150             50`;
    const kinds = detectEvidenceKinds(input);
    assert.ok(kinds.includes("consumer-groups-output"), `expected consumer-groups-output, got: ${kinds}`);
  });

  test("stack trace", () => {
    const input = `org.apache.kafka.common.errors.SerializationException: Error deserializing
\tat org.apache.kafka.clients.consumer.KafkaConsumer.poll(KafkaConsumer.java:1257)
\tat com.example.MyApp.process(MyApp.java:42)
Caused by: java.io.IOException: Unknown magic byte`;
    const kinds = detectEvidenceKinds(input);
    assert.ok(kinds.includes("stack-trace"), `expected stack-trace, got: ${kinds}`);
  });

  test("config", () => {
    const input = `broker.id = 1
listeners = PLAINTEXT://0.0.0.0:9092
log.dirs = /var/lib/kafka/data
acks = all`;
    const kinds = detectEvidenceKinds(input);
    assert.ok(kinds.includes("config"), `expected config, got: ${kinds}`);
  });

  test("metric snapshot", () => {
    const input = `kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions
Value = 5
kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec
Count = 12345
OneMinuteRate = 456.78`;
    const kinds = detectEvidenceKinds(input);
    assert.ok(kinds.includes("metric-snapshot"), `expected metric-snapshot, got: ${kinds}`);
  });

  test("unknown for unrecognized input", () => {
    const input = "just some random text\nthat doesn't match anything";
    const kinds = detectEvidenceKinds(input);
    assert.deepEqual(kinds, ["unknown"]);
  });

  test("multiple kinds detected in mixed input", () => {
    const input = `[2024-01-15 10:30:00,123] ERROR [ReplicaManager broker=1] ISR shrink (kafka.server.ReplicaManager)
GROUP  TOPIC  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
my-group my-topic 0 100 150 50`;
    const kinds = detectEvidenceKinds(input);
    assert.ok(kinds.length >= 2, `expected multiple kinds, got: ${kinds}`);
  });
});

// ─── Input Type Detection (text vs JSON) ────────────────────────────────────

describe("input type detection", () => {
  test("plain text", () => assert.equal(detectFormat("broker.id=1"), "text"));
  test("JSON object", () => assert.equal(detectFormat('{"a":1}'), "json"));
  test("JSON array", () => assert.equal(detectFormat("[1,2,3]"), "json"));
  test("leading whitespace + JSON", () => assert.equal(detectFormat("  {\"a\":1}"), "json"));
  test("log line", () => assert.equal(detectFormat("[2024] ERROR something"), "text"));
});

// ─── Source Line Indexing ───────────────────────────────────────────────────

describe("indexLines", () => {
  test("indexes lines with 1-based numbers", () => {
    const lines = indexLines("a\nb\nc");
    assert.equal(lines.length, 3);
    assert.equal(lines[0].line, 1);
    assert.equal(lines[0].text, "a");
    assert.equal(lines[2].line, 3);
    assert.equal(lines[2].text, "c");
  });

  test("trims trailing whitespace from lines", () => {
    const lines = indexLines("hello  \nworld\t");
    assert.equal(lines[0].text, "hello");
    assert.equal(lines[1].text, "world");
  });
});

// ─── findMatchingLines ─────────────────────────────────────────────────────

describe("findMatchingLines", () => {
  test("finds matching lines", () => {
    const lines = indexLines("foo\nbar ERROR\nbaz ERROR\nqux");
    const matches = findMatchingLines(lines, /ERROR/);
    assert.equal(matches.length, 2);
    assert.equal(matches[0].line, 2);
    assert.equal(matches[1].line, 3);
  });

  test("returns empty for no matches", () => {
    const lines = indexLines("foo\nbar\nbaz");
    const matches = findMatchingLines(lines, /ERROR/);
    assert.equal(matches.length, 0);
  });
});

// ─── parseEvidence ─────────────────────────────────────────────────────────

describe("parseEvidence", () => {
  test("returns metadata for text input", () => {
    const input = "broker.id=1\nlisteners=PLAINTEXT://:9092\nlog.dirs=/data";
    const evidence = parseEvidence(input);
    assert.equal(evidence.format, "text");
    assert.equal(evidence.lineCount, 3);
    assert.ok(evidence.byteCount > 0);
    assert.ok(evidence.kinds.length > 0);
  });

  test("returns metadata for JSON input", () => {
    const input = '{"UnderReplicatedPartitions": 5, "kafka.server:type=ReplicaManager,name=Count": 10}';
    const evidence = parseEvidence(input);
    assert.equal(evidence.format, "json");
    assert.equal(evidence.lineCount, 1);
  });
});
