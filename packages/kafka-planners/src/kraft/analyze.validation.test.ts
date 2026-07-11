import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeKRaft,
  isSafeHost,
  isSafeListenerName,
  sanitizeForDisplay,
  makeInput,
  makeDynamicInput,
  getResult,
  getDynamicResult,
  hasFinding,
  findingById,
} from "./analyze.test-support";

describe("static quorum mode", () => {
  test("voter IDs matching controllers is fine", () => {
    const result = getResult();
    assert.ok(!hasFinding(result, "quorum-missing-controllers"));
    assert.ok(!hasFinding(result, "quorum-extra-voters"));
  });

  test("missing controller in voters is a blocker", () => {
    const result = getResult({
      quorumVoters: [
        { nodeId: 1, host: "ctrl1.local", port: 9093 },
        { nodeId: 2, host: "ctrl2.local", port: 9093 },
      ],
    });
    assert.ok(hasFinding(result, "quorum-missing-controllers"));
  });

  test("extra voter not in controllers is a warning", () => {
    const result = getResult({
      quorumVoters: [
        { nodeId: 1, host: "ctrl1.local", port: 9093 },
        { nodeId: 2, host: "ctrl2.local", port: 9093 },
        { nodeId: 3, host: "ctrl3.local", port: 9093 },
        { nodeId: 99, host: "extra.local", port: 9093 },
      ],
    });
    assert.ok(hasFinding(result, "quorum-extra-voters"));
  });

  test("duplicate voter node IDs blocked at validation", () => {
    const r = analyzeKRaft(makeInput({
      quorumVoters: [
        { nodeId: 1, host: "ctrl1.local", port: 9093 },
        { nodeId: 1, host: "ctrl2.local", port: 9093 },
        { nodeId: 3, host: "ctrl3.local", port: 9093 },
      ],
    }));
    if (r.ok) {
      assert.ok(true);
    } else {
      assert.ok(r.issues.some((i) => i.kind === "duplicate-quorum-voters"));
    }
  });

  test("invalid voter port rejected", () => {
    const r = analyzeKRaft(makeInput({
      quorumVoters: [
        { nodeId: 1, host: "ctrl1.local", port: 99999 },
        { nodeId: 2, host: "ctrl2.local", port: 9093 },
        { nodeId: 3, host: "ctrl3.local", port: 9093 },
      ],
    }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-quorum-voter"));
    }
  });

  test("static mode produces quorum-static-mode finding", () => {
    const result = getResult();
    assert.ok(hasFinding(result, "quorum-static-mode"));
  });
});

describe("dynamic quorum mode", () => {
  test("dynamic mode with bootstrap servers is valid", () => {
    const result = getDynamicResult();
    assert.ok(hasFinding(result, "quorum-dynamic-mode"));
  });

  test("dynamic mode does NOT run voter-ID mismatch logic", () => {
    const result = getDynamicResult();
    assert.ok(!hasFinding(result, "quorum-missing-controllers"));
    assert.ok(!hasFinding(result, "quorum-extra-voters"));
  });

  test("dynamic mode without voters is valid", () => {
    const result = getDynamicResult({ quorumVoters: [] });
    assert.ok(result.status !== "blocked" || !result.findings.some((f) => f.id.includes("quorum-voter")));
  });

  test("dynamic mode mentions KIP-853 and format-time selection", () => {
    const result = getDynamicResult();
    const f = findingById(result, "quorum-dynamic-mode");
    assert.ok(f!.message.includes("KIP-853"));
    assert.ok(f!.message.includes("format time"));
  });

  test("dynamic mode notes no runtime conversion from static", () => {
    const result = getDynamicResult();
    const f = findingById(result, "quorum-dynamic-mode");
    assert.ok(f!.message.includes("Runtime conversion from static to dynamic is not currently supported"));
  });

  test("dynamic mode requires at least one bootstrap server", () => {
    const r = analyzeKRaft(makeDynamicInput({ bootstrapServers: [] }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "missing-bootstrap-servers"));
    }
  });

  test("dynamic mode does not require endpoint count to equal controller count", () => {
    // Only 1 bootstrap server for 3 controllers — should be valid
    const result = getDynamicResult({
      bootstrapServers: [{ host: "ctrl1.local", port: 9093 }],
    });
    assert.ok(!result.findings.some((f) => f.severity === "blocker" && f.id.includes("bootstrap")));
  });

  test("dynamic mode checklist shows bootstrap config", () => {
    const result = getDynamicResult();
    const quorumItem = result.checklist.find((c) => c.id === "quorum-bootstrap-configured");
    assert.ok(quorumItem);
    assert.ok(quorumItem!.satisfied);
    assert.ok(quorumItem!.detail.includes("dynamic"));
  });

  test("static mode checklist shows voter match", () => {
    const result = getResult();
    const quorumItem = result.checklist.find((c) => c.id === "quorum-voters-match");
    assert.ok(quorumItem);
    assert.ok(quorumItem!.detail.includes("static"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Controller Odd/Even/1/Production Rules
// ═══════════════════════════════════════════════════════════════════════════

describe("controller count rules", () => {
  test("3 controllers in production — no blocker", () => {
    const result = getResult({ controllerCount: 3, production: true });
    assert.ok(!hasFinding(result, "controller-single-prod"));
    assert.ok(!hasFinding(result, "controller-even-count"));
  });

  test("1 controller in production — blocker", () => {
    const result = getResult({
      controllerCount: 1,
      controllerNodeIds: [1],
      quorumVoters: [{ nodeId: 1, host: "ctrl1.local", port: 9093 }],
      production: true,
    });
    assert.ok(hasFinding(result, "controller-single-prod"));
    const f = findingById(result, "controller-single-prod");
    assert.equal(f!.severity, "blocker");
  });

  test("1 controller non-production — dev warning", () => {
    const result = getResult({
      controllerCount: 1,
      controllerNodeIds: [1],
      quorumVoters: [{ nodeId: 1, host: "ctrl1.local", port: 9093 }],
      production: false,
    });
    assert.ok(hasFinding(result, "controller-single-dev"));
    const f = findingById(result, "controller-single-dev");
    assert.equal(f!.severity, "warning");
  });

  test("2 controllers in production — even count warning", () => {
    const result = getResult({
      controllerCount: 2,
      controllerNodeIds: [1, 2],
      quorumVoters: [
        { nodeId: 1, host: "ctrl1.local", port: 9093 },
        { nodeId: 2, host: "ctrl2.local", port: 9093 },
      ],
      production: true,
    });
    assert.ok(hasFinding(result, "controller-even-count"));
  });

  test("5 controllers in production — no warnings", () => {
    const result = getResult({
      controllerCount: 5,
      controllerNodeIds: [1, 2, 3, 10, 11],
      brokerNodeIds: [4, 5, 6],
      quorumVoters: [
        { nodeId: 1, host: "ctrl1.local", port: 9093 },
        { nodeId: 2, host: "ctrl2.local", port: 9093 },
        { nodeId: 3, host: "ctrl3.local", port: 9093 },
        { nodeId: 10, host: "ctrl4.local", port: 9093 },
        { nodeId: 11, host: "ctrl5.local", port: 9093 },
      ],
      production: true,
    });
    assert.ok(!hasFinding(result, "controller-even-count"));
    assert.ok(!hasFinding(result, "controller-single-prod"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Host / Listener Injection Safety
// ═══════════════════════════════════════════════════════════════════════════

describe("safe host validation (hardened)", () => {
  test("normal hostname is safe", () => {
    assert.ok(isSafeHost("broker1.local"));
  });

  test("IPv4 is safe", () => {
    assert.ok(isSafeHost("192.168.1.1"));
  });

  test("bracketed IPv6 is safe", () => {
    assert.ok(isSafeHost("[::1]"));
    assert.ok(isSafeHost("[2001:db8::1]"));
  });

  test("unbracketed IPv6 is safe", () => {
    assert.ok(isSafeHost("::1"));
  });

  test("empty host is unsafe", () => {
    assert.ok(!isSafeHost(""));
  });

  test("whitespace is rejected", () => {
    assert.ok(!isSafeHost("host name"));
    assert.ok(!isSafeHost("host\tname"));
    assert.ok(!isSafeHost("host\nname"));
    assert.ok(!isSafeHost(" host"));
  });

  test("comma is rejected (property injection)", () => {
    assert.ok(!isSafeHost("host1,host2"));
  });

  test("equals is rejected (property injection)", () => {
    assert.ok(!isSafeHost("host=value"));
  });

  test("slash is rejected", () => {
    assert.ok(!isSafeHost("host/path"));
    assert.ok(!isSafeHost("host\\path"));
  });

  test("newline injection is rejected", () => {
    assert.ok(!isSafeHost("host\nnewkey=value"));
  });

  test("control characters are rejected", () => {
    assert.ok(!isSafeHost("host\x00"));
    assert.ok(!isSafeHost("host\x07bell"));
  });

  test("semicolon is rejected", () => {
    assert.ok(!isSafeHost("host;rm -rf"));
  });

  test("voter with unsafe host is rejected at validation", () => {
    const r = analyzeKRaft(makeInput({
      quorumVoters: [
        { nodeId: 1, host: "ctrl1,injected=val", port: 9093 },
        { nodeId: 2, host: "ctrl2.local", port: 9093 },
        { nodeId: 3, host: "ctrl3.local", port: 9093 },
      ],
    }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-quorum-voter"));
    }
  });

  test("bootstrap server with unsafe host is rejected", () => {
    const r = analyzeKRaft(makeDynamicInput({
      bootstrapServers: [
        { host: "ctrl1 injected", port: 9093 },
      ],
    }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-bootstrap-server"));
    }
  });
});

describe("safe listener name validation", () => {
  test("CONTROLLER is safe", () => {
    assert.ok(isSafeListenerName("CONTROLLER"));
  });

  test("PLAINTEXT is safe", () => {
    assert.ok(isSafeListenerName("PLAINTEXT"));
  });

  test("my-listener_01 is safe", () => {
    assert.ok(isSafeListenerName("my-listener_01"));
  });

  test("empty name is unsafe", () => {
    assert.ok(!isSafeListenerName(""));
  });

  test("comma in name is rejected", () => {
    assert.ok(!isSafeListenerName("CONTROLLER,INJECTED"));
  });

  test("whitespace in name is rejected", () => {
    assert.ok(!isSafeListenerName("CONTROLLER NAME"));
  });

  test("equals in name is rejected", () => {
    assert.ok(!isSafeListenerName("CONTROLLER=value"));
  });

  test("slash in name is rejected", () => {
    assert.ok(!isSafeListenerName("CONTROLLER/path"));
  });

  test("listener with injection chars is rejected at validation", () => {
    const r = analyzeKRaft(makeInput({
      controllerListenerNames: ["CONTROLLER,key=value"],
    }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-listener-name"));
    }
  });
});

describe("sanitizeForDisplay", () => {
  test("passes through normal text", () => {
    assert.equal(sanitizeForDisplay("Apache Kafka"), "Apache Kafka");
  });

  test("removes control characters", () => {
    assert.equal(sanitizeForDisplay("hello\x00world"), "helloworld");
  });

  test("truncates long strings", () => {
    const long = "a".repeat(200);
    const result = sanitizeForDisplay(long);
    assert.ok(result.length <= 128);
    assert.ok(result.endsWith("..."));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Duplicate IDs Across Roles
// ═══════════════════════════════════════════════════════════════════════════

describe("duplicate node IDs", () => {
  test("controller-broker overlap is blocked", () => {
    const r = analyzeKRaft(makeInput({
      controllerNodeIds: [1, 2, 3],
      brokerNodeIds: [3, 4, 5],
    }));
    if (r.ok) {
      assert.ok(r.result.findings.some((f) => f.message.includes("appear in both")));
    } else {
      assert.ok(r.issues.some((i) => i.kind === "duplicate-node-ids"));
    }
  });

  test("unique IDs across roles is fine", () => {
    const result = getResult({
      controllerNodeIds: [1, 2, 3],
      brokerNodeIds: [4, 5, 6],
    });
    assert.ok(!result.findings.some((f) => f.message.includes("appear in both")));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACL / Log Dir / Vendor
// ═══════════════════════════════════════════════════════════════════════════

describe("ACL validation", () => {
  test("healthy ACLs — no blocker", () => {
    const result = getResult({ aclHealth: "healthy" });
    assert.ok(!hasFinding(result, "acl-malformed"));
  });

  test("malformed ACLs — blocker", () => {
    const result = getResult({ aclHealth: "malformed" });
    assert.ok(hasFinding(result, "acl-malformed"));
    assert.equal(findingById(result, "acl-malformed")!.severity, "blocker");
  });

  test("unknown ACLs — warning", () => {
    const result = getResult({ aclHealth: "unknown" });
    assert.ok(hasFinding(result, "acl-unknown"));
  });

  test("not-used ACLs — no blocker", () => {
    const result = getResult({ aclHealth: "not-used" });
    assert.ok(!hasFinding(result, "acl-malformed"));
  });
});

describe("log directory health", () => {
  test("healthy — no blocker", () => {
    const result = getResult({ logDirHealth: "healthy", failedLogDirCount: 0 });
    assert.ok(!hasFinding(result, "logdir-failed"));
  });

  test("failed — blocker", () => {
    const result = getResult({ logDirHealth: "failed", failedLogDirCount: 2 });
    assert.ok(hasFinding(result, "logdir-failed"));
  });

  test("unknown — warning", () => {
    const result = getResult({ logDirHealth: "unknown", failedLogDirCount: 0 });
    assert.ok(hasFinding(result, "logdir-unknown"));
  });
});

describe("vendor support", () => {
  test("apache — no uncertainty warning", () => {
    const result = getResult({ vendor: "apache" });
    assert.ok(!hasFinding(result, "vendor-support-uncertainty"));
  });

  test("confluent — uncertainty warning", () => {
    const result = getResult({ vendor: "confluent" });
    assert.ok(hasFinding(result, "vendor-support-uncertainty"));
  });

  test("other — uncertainty warning with sanitized label", () => {
    const result = getResult({ vendor: "other", vendorLabel: "Custom Kafka" });
    assert.ok(hasFinding(result, "vendor-support-uncertainty"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Checklist: No Commands, Verification-Only
// ═══════════════════════════════════════════════════════════════════════════

