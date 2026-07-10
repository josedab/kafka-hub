import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareForUrl,
  prepareForHistory,
  prepareForClipboard,
  prepareForJsonExport,
  prepareForPropertiesDownload,
  prepareForLlm,
  assertNoSecrets,
} from "./egress";

const SECRET_CONFIG = `broker.id=1
ssl.keystore.password=supersecret123
sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="s3cr3t";
api.key=sk-abcdefghij1234567890
aws.secret.access.key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
acks=all
retries=3
`;

const CLEAN_CONFIG = "broker.id=1\nacks=all\nretries=3\n";

// ─── URL egress ─────────────────────────────────────────────────────────────

test("prepareForUrl: redacts all secrets", () => {
  const { payload, report } = prepareForUrl(SECRET_CONFIG);
  assert.ok(!payload.includes("supersecret123"));
  assert.ok(!payload.includes("s3cr3t"));
  assert.ok(!payload.includes("sk-abcdefghij"));
  assert.ok(!payload.includes("wJalrXUtnFEMI"));
  assert.ok(payload.includes("broker.id=1"));
  assert.ok(payload.includes("acks=all"));
  assert.ok(report.count > 0);
  assert.ok(report.summary.includes("Redacted"));
});

test("prepareForUrl: clean config has no redaction", () => {
  const { payload, report } = prepareForUrl(CLEAN_CONFIG);
  assert.equal(payload, CLEAN_CONFIG);
  assert.equal(report.count, 0);
  assert.equal(
    report.summary,
    "No common secret patterns detected; review before sharing.",
  );
});

// ─── History egress ─────────────────────────────────────────────────────────

test("prepareForHistory: redacts all secrets", () => {
  const { payload, report } = prepareForHistory(SECRET_CONFIG);
  assert.ok(!payload.includes("supersecret123"));
  assert.ok(!payload.includes("s3cr3t"));
  assert.ok(report.count > 0);
});

// ─── Clipboard egress ───────────────────────────────────────────────────────

test("prepareForClipboard: redacts all secrets", () => {
  const { payload, report } = prepareForClipboard(SECRET_CONFIG);
  assert.ok(!payload.includes("supersecret123"));
  assert.ok(!payload.includes("s3cr3t"));
  assert.ok(!payload.includes("wJalrXUtnFEMI"));
  assert.ok(report.count >= 4);
});

// ─── JSON export egress ─────────────────────────────────────────────────────

test("prepareForJsonExport: JSON contains no secret values", () => {
  const generatedAt = "2026-07-26T06:00:00.000Z";
  const { payload, report } = prepareForJsonExport(SECRET_CONFIG, {
    generatedAt,
  });
  assert.ok(!payload.includes("supersecret123"));
  assert.ok(!payload.includes("s3cr3t"));
  assert.ok(!payload.includes("sk-abcdefghij"));
  assert.ok(!payload.includes("wJalrXUtnFEMI"));
  // Is valid JSON
  const parsed = JSON.parse(payload);
  assert.equal(parsed.generatedAt, generatedAt);
  assert.ok(parsed.stats);
  assert.ok(report.count > 0);
});

test("prepareForJsonExport: injected clock makes the full payload deterministic", () => {
  const now = () => new Date("2026-07-26T06:00:00.000Z");
  const first = prepareForJsonExport(CLEAN_CONFIG, { now });
  const second = prepareForJsonExport(CLEAN_CONFIG, { now });

  assert.deepEqual(second, first);
});

// ─── Properties download egress ─────────────────────────────────────────────

test("prepareForPropertiesDownload: redacts secrets", () => {
  const { payload, report } = prepareForPropertiesDownload(SECRET_CONFIG);
  assert.ok(!payload.includes("supersecret123"));
  assert.ok(!payload.includes("s3cr3t"));
  assert.ok(payload.includes("broker.id=1"));
  assert.ok(report.count > 0);
});

test("all text egress paths remove physical inline PEM body lines", () => {
  const config = [
    "ssl.key=-----BEGIN PRIVATE KEY-----",
    "sensitive-base64-material",
    "-----END PRIVATE KEY-----",
    "broker.id=1",
  ].join("\n");
  const textEgressFunctions = [
    prepareForUrl,
    prepareForHistory,
    prepareForClipboard,
    prepareForPropertiesDownload,
    prepareForLlm,
  ];

  for (const prepare of textEgressFunctions) {
    const { payload } = prepare(config);
    assert.ok(!payload.includes("sensitive-base64-material"));
    assert.ok(payload.includes("broker.id=1"));
  }

  const { payload: json } = prepareForJsonExport(config);
  assert.ok(!json.includes("sensitive-base64-material"));
});

test("all egress paths redact secrets whose keys use Java escapes", () => {
  const config = [
    String.raw`ssl.keystore.p\u0061ssword=unicode-secret`,
    String.raw`ssl.keystore.pas\sword=escaped-secret`,
    "broker.id=1",
  ].join("\n");
  const textEgressFunctions = [
    prepareForUrl,
    prepareForHistory,
    prepareForClipboard,
    prepareForPropertiesDownload,
    prepareForLlm,
  ];

  for (const prepare of textEgressFunctions) {
    const { payload } = prepare(config);
    assert.ok(!payload.includes("unicode-secret"));
    assert.ok(!payload.includes("escaped-secret"));
  }

  const { payload: json } = prepareForJsonExport(config);
  assert.ok(!json.includes("unicode-secret"));
  assert.ok(!json.includes("escaped-secret"));
});

// ─── LLM egress ────────────────────────────────────────────────────────────

test("prepareForLlm: redacts all secrets before network", () => {
  const { payload, report } = prepareForLlm(SECRET_CONFIG);
  assert.ok(!payload.includes("supersecret123"));
  assert.ok(!payload.includes("s3cr3t"));
  assert.ok(!payload.includes("sk-abcdefghij"));
  assert.ok(!payload.includes("wJalrXUtnFEMI"));
  assert.ok(payload.includes("broker.id=1"));
  assert.ok(report.count >= 4);
  assert.ok(report.categories["password"] > 0);
  assert.ok(report.categories["jaas"] > 0);
  assert.ok(report.keys.includes("ssl.keystore.password"));
});

// ─── assertNoSecrets ────────────────────────────────────────────────────────

test("assertNoSecrets: passes for clean text", () => {
  assert.doesNotThrow(() => assertNoSecrets(CLEAN_CONFIG, "test-egress"));
});

test("assertNoSecrets: throws for text with secrets", () => {
  assert.throws(
    () => assertNoSecrets(SECRET_CONFIG, "test-egress"),
    /Egress "test-egress" contains.*unredacted secret/,
  );
});

// ─── No secret substrings in ANY egress output ──────────────────────────────

const SECRET_SUBSTRINGS = [
  "supersecret123",
  "s3cr3t",
  "sk-abcdefghij1234567890",
  "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "PlainLoginModule",
];

const egressFunctions = [
  { name: "URL", fn: prepareForUrl },
  { name: "History", fn: prepareForHistory },
  { name: "Clipboard", fn: prepareForClipboard },
  { name: "PropertiesDownload", fn: prepareForPropertiesDownload },
  { name: "LLM", fn: prepareForLlm },
];

for (const { name, fn } of egressFunctions) {
  test(`egress ${name}: no secret substrings in output`, () => {
    const { payload } = fn(SECRET_CONFIG);
    for (const secret of SECRET_SUBSTRINGS) {
      assert.ok(
        !payload.includes(secret),
        `Egress "${name}" leaks secret substring: "${secret.slice(0, 20)}..."`,
      );
    }
  });
}

test("egress JSON export: no secret substrings in output", () => {
  const { payload } = prepareForJsonExport(SECRET_CONFIG);
  for (const secret of SECRET_SUBSTRINGS) {
    assert.ok(
      !payload.includes(secret),
      `Egress "JSON" leaks secret substring: "${secret.slice(0, 20)}..."`,
    );
  }
});

// ─── Report accuracy ────────────────────────────────────────────────────────

test("report: categories are correctly counted", () => {
  const { report } = prepareForLlm(SECRET_CONFIG);
  assert.ok(report.categories["password"] >= 1);
  assert.ok(report.categories["jaas"] >= 1);
  assert.ok(report.categories["token"] >= 1);
  assert.ok(report.categories["cloud-credential"] >= 1);
});

test("report: keys list contains redacted key names", () => {
  const { report } = prepareForLlm(SECRET_CONFIG);
  assert.ok(report.keys.includes("ssl.keystore.password"));
  assert.ok(report.keys.includes("sasl.jaas.config"));
  assert.ok(report.keys.includes("api.key"));
  assert.ok(report.keys.includes("aws.secret.access.key"));
});
