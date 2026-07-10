import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets, containsSecrets, redactRecord, classifyKey, classifyValue } from "./redact";

// ─── Key classification tests ───────────────────────────────────────────────

test("classifyKey: password keys detected", () => {
  assert.equal(classifyKey("ssl.keystore.password"), "password");
  assert.equal(classifyKey("ssl.truststore.password"), "password");
  assert.equal(classifyKey("sasl.password"), "password");
  assert.equal(classifyKey("keypass"), "password");
  assert.equal(classifyKey("schema.registry.basic.auth.user.info"), "password");
  assert.equal(classifyKey("http.authentication.credentials"), "password");
});

test("classifyKey: JAAS keys detected", () => {
  assert.equal(classifyKey("sasl.jaas.config"), "jaas");
  assert.equal(classifyKey("listener.name.sasl_ssl.plain.sasl.jaas.config"), "jaas");
});

test("classifyKey: token keys detected", () => {
  assert.equal(classifyKey("api.key"), "token");
  assert.equal(classifyKey("access.key"), "token");
  assert.equal(classifyKey("auth.token"), "token");
});

test("classifyKey: cloud credential keys detected", () => {
  assert.equal(classifyKey("aws.secret.access.key"), "cloud-credential");
  assert.equal(classifyKey("azure.storage.secret"), "cloud-credential");
  assert.equal(classifyKey("gcp.service.key"), "cloud-credential");
  assert.equal(classifyKey("connection.string"), "cloud-credential");
});

test("classifyKey: secret-like-key pattern detected", () => {
  assert.equal(classifyKey("my.client.secret"), "secret-like-key");
  assert.equal(classifyKey("signing.key"), "secret-like-key");
  assert.equal(classifyKey("encryption.key"), "secret-like-key");
  assert.equal(classifyKey("private.key.path"), "secret-like-key");
});

test("classifyKey: normal Kafka settings are NOT classified", () => {
  assert.equal(classifyKey("broker.id"), null);
  assert.equal(classifyKey("acks"), null);
  assert.equal(classifyKey("retries"), null);
  assert.equal(classifyKey("compression.type"), null);
  assert.equal(classifyKey("security.protocol"), null);
  assert.equal(classifyKey("ssl.endpoint.identification.algorithm"), null);
  assert.equal(classifyKey("ssl.keystore.location"), null);
  assert.equal(classifyKey("ssl.keystore.type"), null);
  assert.equal(classifyKey("listeners"), null);
  assert.equal(classifyKey("max.poll.records"), null);
  assert.equal(classifyKey("sasl.oauthbearer.token.endpoint.url"), null);
  assert.equal(classifyKey("basic.auth.credentials.source"), null);
});

// ─── Value classification tests ─────────────────────────────────────────────

test("classifyValue: private key block detected", () => {
  assert.equal(classifyValue("-----BEGIN PRIVATE KEY-----\nMII..."), "private-key");
  assert.equal(classifyValue("-----BEGIN RSA PRIVATE KEY-----\nMII..."), "private-key");
  assert.equal(classifyValue("-----BEGIN EC PRIVATE KEY-----\nMII..."), "private-key");
  assert.equal(
    classifyValue("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA..."),
    "private-key",
  );
});

test("classifyValue: JAAS config string detected", () => {
  assert.equal(
    classifyValue("org.apache.kafka.common.security.plain.PlainLoginModule required;"),
    "jaas",
  );
  assert.equal(classifyValue("com.example.MyLoginModule required"), "jaas");
});

test("classifyValue: AWS key pattern detected", () => {
  assert.equal(classifyValue("AKIAIOSFODNN7EXAMPLE"), "cloud-credential");
  assert.equal(
    classifyValue('{"type":"service_account","private_key":"value"}'),
    "cloud-credential",
  );
  assert.equal(
    classifyValue("DefaultEndpointsProtocol=https;AccountKey=abc123"),
    "cloud-credential",
  );
});

test("classifyValue: bearer/JWT/GitHub tokens detected", () => {
  assert.equal(classifyValue("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig"), "token");
  assert.equal(classifyValue("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), "token");
  assert.equal(classifyValue("gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), "token");
  assert.equal(classifyValue("github_pat_xxxxxxxxxxxx"), "token");
  assert.equal(classifyValue("xoxb-1234-5678-abcdef"), "token");
  assert.equal(classifyValue("sk-abc123def456"), "token");
  assert.equal(
    classifyValue("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"),
    "token",
  );
});

test("classifyValue: normal values NOT classified", () => {
  assert.equal(classifyValue("PLAINTEXT://0.0.0.0:9092"), null);
  assert.equal(classifyValue("all"), null);
  assert.equal(classifyValue("true"), null);
  assert.equal(classifyValue("3"), null);
  assert.equal(classifyValue("/var/ssl/kafka.keystore.jks"), null);
});

test("classifyValue: conservative auth and token forms are detected", () => {
  assert.equal(
    classifyValue("postgresql://service:correct-horse@db.internal/app"),
    "password",
  );
  assert.equal(classifyValue("glpat-abcdefghijklmnopqrstuvwxyz"), "token");
  assert.equal(classifyValue("npm_abcdefghijklmnopqrstuvwxyz"), "token");
  assert.equal(
    classifyValue("AIzaSyA12345678901234567890123456789012"),
    "token",
  );
});

// ─── Redaction tests ────────────────────────────────────────────────────────

test("redactSecrets: redacts password keys", () => {
  const input = "ssl.keystore.password=mysecret123\nbroker.id=1\n";
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("mysecret123"));
  assert.ok(redacted.includes("***REDACTED***"));
  assert.ok(redacted.includes("broker.id=1"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "password");
  assert.equal(entries[0].key, "ssl.keystore.password");
});

test("redactSecrets: redacts JAAS config", () => {
  const input = `sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="secret";
broker.id=1
`;
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("PlainLoginModule"));
  assert.ok(!redacted.includes("secret"));
  assert.ok(redacted.includes("broker.id=1"));
  assert.equal(entries[0].category, "jaas");
});

test("redactSecrets: redacts JAAS with continuation lines", () => {
  const input = `sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required \\
  username="admin" \\
  password="supersecret";
broker.id=1
`;
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("PlainLoginModule"));
  assert.ok(!redacted.includes("supersecret"));
  assert.ok(!redacted.includes("admin"));
  assert.ok(redacted.includes("broker.id=1"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "jaas");
});

test("redactSecrets: redacts token/API key values", () => {
  const input = "api.key=sk-1234567890abcdef\nacks=all\n";
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("sk-1234567890abcdef"));
  assert.equal(entries[0].category, "token");
});

test("redactSecrets: redacts private key blocks", () => {
  const input = `-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALRiMLAHudeSA/x3hB2f
-----END RSA PRIVATE KEY-----
broker.id=1
`;
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("MIIBogIBAAJBALRiMLAHudeSA"));
  assert.ok(redacted.includes("***REDACTED***"));
  assert.ok(redacted.includes("broker.id=1"));
  assert.equal(entries[0].category, "private-key");
});

test("redactSecrets: redacts inline private key in value", () => {
  const input = "some.key=-----BEGIN PRIVATE KEY-----\\nMII...\\n-----END PRIVATE KEY-----\nbroker.id=1\n";
  const { redacted, entries } = redactSecrets(input);
  // The value contains escaped private key markers — classified by value
  assert.ok(!redacted.includes("MII..."));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "private-key");
});

test("redactSecrets: consumes a physical PEM block that starts in a property value", () => {
  const input = [
    "ssl.key=-----BEGIN PRIVATE KEY-----",
    "sensitive-base64-material",
    "-----END PRIVATE KEY-----",
    "broker.id=1",
    "",
  ].join("\n");
  const { redacted, entries } = redactSecrets(input);

  assert.ok(!redacted.includes("sensitive-base64-material"));
  assert.ok(!redacted.includes("-----END PRIVATE KEY-----"));
  assert.ok(redacted.includes("ssl.key=***REDACTED***"));
  assert.ok(redacted.includes("broker.id=1"));
  assert.equal(entries[0].category, "private-key");
});

test("redactSecrets: standalone PEM block without a final newline remains separated", () => {
  const input = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "sensitive-base64-material",
    "-----END RSA PRIVATE KEY-----",
  ].join("\n");
  const { redacted } = redactSecrets(input);

  assert.ok(!redacted.includes("sensitive-base64-material"));
  assert.match(
    redacted,
    /-----BEGIN RSA PRIVATE KEY-----\n\*\*\*REDACTED\*\*\*\n-----END RSA PRIVATE KEY-----$/,
  );
});

test("redactSecrets: redacts cloud credential keys", () => {
  const input = "aws.secret.access.key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nretries=3\n";
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("wJalrXUtnFEMI"));
  assert.equal(entries[0].category, "cloud-credential");
});

test("redactSecrets: preserves non-secret values", () => {
  const input = "broker.id=1\nacks=all\nretries=3\n";
  const { redacted, entries } = redactSecrets(input);
  assert.equal(entries.length, 0);
  assert.ok(redacted.includes("broker.id=1"));
  assert.ok(redacted.includes("acks=all"));
});

test("redactSecrets: preserves comments and blanks", () => {
  const input = "# comment\n\nbroker.id=1\n";
  const { redacted } = redactSecrets(input);
  assert.ok(redacted.includes("# comment"));
});

test("redactSecrets: handles colon separator without leaking values", () => {
  const input = "ssl.keystore.password:mysecret\nlisteners:PLAINTEXT://localhost:9092\n";
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("mysecret"));
  assert.ok(redacted.includes("listeners"));
  assert.ok(redacted.includes("PLAINTEXT://localhost:9092"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "password");
});

test("redactSecrets: handles whitespace separator without leaking", () => {
  const input = "ssl.keystore.password mysecret\nbroker.id 1\n";
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("mysecret"));
  assert.ok(redacted.includes("broker.id"));
  assert.equal(entries.length, 1);
});

test("redactSecrets: Java escapes in secret key names cannot bypass redaction", () => {
  const input = [
    String.raw`ssl.keystore.p\u0061ssword=unicode-secret`,
    String.raw`ssl.keystore.pas\sword=escaped-secret`,
    "broker.id=1",
    "",
  ].join("\n");
  const { redacted, entries } = redactSecrets(input);

  assert.ok(!redacted.includes("unicode-secret"));
  assert.ok(!redacted.includes("escaped-secret"));
  assert.ok(
    redacted.includes(
      String.raw`ssl.keystore.p\u0061ssword=***REDACTED***`,
    ),
  );
  assert.ok(
    redacted.includes(
      String.raw`ssl.keystore.pas\sword=***REDACTED***`,
    ),
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, "ssl.keystore.password");
  assert.equal(entries[0].category, "password");
});

test("redactSecrets: preserves CRLF line endings", () => {
  const input = "broker.id=1\r\nssl.keystore.password=secret\r\nacks=all\r\n";
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("secret"));
  assert.ok(redacted.includes("broker.id=1\r\n"));
  assert.ok(redacted.includes("acks=all\r\n"));
  assert.equal(entries.length, 1);
});

test("redactSecrets: deduplicates entries by key+category", () => {
  // Same key appears multiple times (shouldn't happen in valid .properties but for robustness)
  const input = "ssl.keystore.password=secret1\nssl.keystore.password=secret2\n";
  const { entries } = redactSecrets(input);
  // Deduplicated: same key+category only reported once
  assert.equal(entries.length, 1);
});

test("containsSecrets: returns true when secrets present", () => {
  assert.ok(containsSecrets("ssl.keystore.password=secret\nbroker.id=1"));
  assert.ok(!containsSecrets("broker.id=1\nacks=all"));
});

test("redactRecord: redacts secret keys in record", () => {
  const record = {
    "broker.id": "1",
    "ssl.keystore.password": "secret123",
    "acks": "all",
  };
  const { redacted, entries } = redactRecord(record);
  assert.equal(redacted["ssl.keystore.password"], "***REDACTED***");
  assert.equal(redacted["broker.id"], "1");
  assert.equal(redacted["acks"], "all");
  assert.equal(entries.length, 1);
});

test("redactSecrets: handles all egress paths consistently", () => {
  const config = "ssl.truststore.password=changeit\nbroker.id=5\n";
  const result = redactSecrets(config);
  // Result must be safe for: URL/hash, localStorage, clipboard, network
  assert.ok(!result.redacted.includes("changeit"));
  assert.ok(result.redacted.includes("broker.id=5"));
});

// ─── Secret-like-key category test ──────────────────────────────────────────

test("redactSecrets: emits secret-like-key category", () => {
  const input = "my.client.secret=abc123\nbroker.id=1\n";
  const { redacted, entries } = redactSecrets(input);
  assert.ok(!redacted.includes("abc123"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "secret-like-key");
});

test("redactSecrets: broad Kafka prefixes do not exempt secret-like keys", () => {
  const input = [
    "transaction.api.token=secret-token-value",
    "controller.password=controller-secret",
    "log.signing.key=signing-secret",
    "",
  ].join("\n");
  const { redacted, entries } = redactSecrets(input);

  assert.ok(!redacted.includes("secret-token-value"));
  assert.ok(!redacted.includes("controller-secret"));
  assert.ok(!redacted.includes("signing-secret"));
  assert.equal(entries.length, 3);
});

// ─── AWS/GCP/Azure credential forms ─────────────────────────────────────────

test("redactSecrets: AWS access key in value detected", () => {
  const input = "some.config=AKIAIOSFODNN7EXAMPLE\n";
  const { entries } = redactSecrets(input);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "cloud-credential");
});

test("redactSecrets: bearer token in value detected", () => {
  const input = "auth.header=Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig\n";
  const { entries } = redactSecrets(input);
  assert.equal(entries.length, 1);
  // key matches token pattern already
  assert.ok(entries[0].category === "token");
});
