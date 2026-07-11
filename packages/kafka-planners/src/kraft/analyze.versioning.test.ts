import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeKRaft,
  parseKafkaVersion,
  compareVersions,
  isKRaftOnlyVersion,
  isFinalZookeeperLine,
  supportsMigration,
  isKRaftBridgeCandidate,
  KRAFT_MIGRATION_PHASES,
  MIN_MIGRATION_VERSION,
  MIN_KRAFT_BRIDGE_VERSION,
  RECOMMENDED_MIGRATION_VERSION,
  makeInput,
  getResult,
  hasFinding,
  findingById,
} from "./analyze.test-support";
import type {
  KRaftMigrationPhaseId,
} from "./analyze.test-support";

// ═══════════════════════════════════════════════════════════════════════════
// Semver Parsing
// ═══════════════════════════════════════════════════════════════════════════

describe("parseKafkaVersion", () => {
  test("parses 3.9.1", () => {
    const v = parseKafkaVersion("3.9.1");
    assert.ok(v);
    assert.equal(v.major, 3);
    assert.equal(v.minor, 9);
    assert.equal(v.patch, 1);
    assert.equal(v.preRelease, null);
  });

  test("parses 4.0.0", () => {
    const v = parseKafkaVersion("4.0.0");
    assert.ok(v);
    assert.equal(v.major, 4);
    assert.equal(v.minor, 0);
    assert.equal(v.patch, 0);
  });

  test("parses 4.3.1", () => {
    const v = parseKafkaVersion("4.3.1");
    assert.ok(v);
    assert.equal(v.major, 4);
    assert.equal(v.minor, 3);
    assert.equal(v.patch, 1);
  });

  test("parses pre-release 4.0.0-rc1", () => {
    const v = parseKafkaVersion("4.0.0-rc1");
    assert.ok(v);
    assert.equal(v.preRelease, "rc1");
  });

  test("parses 3.9.0 (final ZK line)", () => {
    const v = parseKafkaVersion("3.9.0");
    assert.ok(v);
    assert.equal(v.major, 3);
    assert.equal(v.minor, 9);
  });

  test("returns null for empty string", () => {
    assert.equal(parseKafkaVersion(""), null);
  });

  test("returns null for non-semver", () => {
    assert.equal(parseKafkaVersion("abc"), null);
    assert.equal(parseKafkaVersion("3.7"), null);
    assert.equal(parseKafkaVersion("3"), null);
  });

  test("handles whitespace", () => {
    const v = parseKafkaVersion("  3.9.1  ");
    assert.ok(v);
    assert.equal(v.major, 3);
  });

  test("boundary: 3.3.0 (min KRaft bridge)", () => {
    const v = parseKafkaVersion("3.3.0");
    assert.ok(v);
    assert.equal(v.major, 3);
    assert.equal(v.minor, 3);
  });

  test("boundary: 3.2.9 (below min bridge)", () => {
    const v = parseKafkaVersion("3.2.9");
    assert.ok(v);
    assert.equal(v.major, 3);
    assert.equal(v.minor, 2);
  });
});

describe("compareVersions", () => {
  test("equal versions", () => {
    const a = parseKafkaVersion("3.9.1")!;
    assert.equal(compareVersions(a, a), 0);
  });

  test("major difference", () => {
    const a = parseKafkaVersion("3.9.1")!;
    const b = parseKafkaVersion("4.0.0")!;
    assert.ok(compareVersions(a, b) < 0);
    assert.ok(compareVersions(b, a) > 0);
  });

  test("minor difference", () => {
    const a = parseKafkaVersion("3.7.1")!;
    const b = parseKafkaVersion("3.9.0")!;
    assert.ok(compareVersions(a, b) < 0);
  });

  test("patch difference", () => {
    const a = parseKafkaVersion("3.9.0")!;
    const b = parseKafkaVersion("3.9.1")!;
    assert.ok(compareVersions(a, b) < 0);
  });

  test("pre-release is older than release", () => {
    const rc = parseKafkaVersion("4.0.0-rc1")!;
    const ga = parseKafkaVersion("4.0.0")!;
    assert.ok(compareVersions(rc, ga) < 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Version Constants
// ═══════════════════════════════════════════════════════════════════════════

describe("version constants", () => {
  test("MIN_KRAFT_BRIDGE_VERSION is 3.3.0", () => {
    assert.equal(MIN_KRAFT_BRIDGE_VERSION.raw, "3.3.0");
    assert.equal(MIN_KRAFT_BRIDGE_VERSION.major, 3);
    assert.equal(MIN_KRAFT_BRIDGE_VERSION.minor, 3);
    assert.equal(MIN_KRAFT_BRIDGE_VERSION.patch, 0);
  });

  test("MIN_MIGRATION_VERSION is 3.9.1", () => {
    assert.equal(MIN_MIGRATION_VERSION.raw, "3.9.1");
    assert.equal(MIN_MIGRATION_VERSION.major, 3);
    assert.equal(MIN_MIGRATION_VERSION.minor, 9);
    assert.equal(MIN_MIGRATION_VERSION.patch, 1);
  });

  test("RECOMMENDED_MIGRATION_VERSION is 3.9.2", () => {
    assert.equal(RECOMMENDED_MIGRATION_VERSION.raw, "3.9.2");
    assert.equal(RECOMMENDED_MIGRATION_VERSION.major, 3);
    assert.equal(RECOMMENDED_MIGRATION_VERSION.minor, 9);
    assert.equal(RECOMMENDED_MIGRATION_VERSION.patch, 2);
  });
});

describe("version helpers", () => {
  test("isKRaftOnlyVersion: 3.x is false", () => {
    assert.equal(isKRaftOnlyVersion(parseKafkaVersion("3.9.0")!), false);
  });

  test("isKRaftOnlyVersion: 4.0.0 is true", () => {
    assert.equal(isKRaftOnlyVersion(parseKafkaVersion("4.0.0")!), true);
  });

  test("isKRaftOnlyVersion: 4.3.1 is true", () => {
    assert.equal(isKRaftOnlyVersion(parseKafkaVersion("4.3.1")!), true);
  });

  test("isFinalZookeeperLine: 3.9.x is true", () => {
    assert.equal(isFinalZookeeperLine(parseKafkaVersion("3.9.0")!), true);
    assert.equal(isFinalZookeeperLine(parseKafkaVersion("3.9.2")!), true);
  });

  test("isFinalZookeeperLine: 3.8.x is false", () => {
    assert.equal(isFinalZookeeperLine(parseKafkaVersion("3.8.0")!), false);
  });

  test("supportsMigration: 3.9.1 is true (documented min)", () => {
    assert.equal(supportsMigration(parseKafkaVersion("3.9.1")!), true);
  });

  test("supportsMigration: 3.9.2 is true", () => {
    assert.equal(supportsMigration(parseKafkaVersion("3.9.2")!), true);
  });

  test("supportsMigration: 3.9.0 is false (below documented min)", () => {
    assert.equal(supportsMigration(parseKafkaVersion("3.9.0")!), false);
  });

  test("supportsMigration: 3.3.0 is false (only KRaft bridge, not migration-ready)", () => {
    assert.equal(supportsMigration(parseKafkaVersion("3.3.0")!), false);
  });

  test("supportsMigration: 3.7.1 is false", () => {
    assert.equal(supportsMigration(parseKafkaVersion("3.7.1")!), false);
  });

  test("supportsMigration: 4.0.0 is false (kraft-only)", () => {
    assert.equal(supportsMigration(parseKafkaVersion("4.0.0")!), false);
  });

  test("isKRaftBridgeCandidate: 3.3.0 is true", () => {
    assert.equal(isKRaftBridgeCandidate(parseKafkaVersion("3.3.0")!), true);
  });

  test("isKRaftBridgeCandidate: 3.8.0 is true", () => {
    assert.equal(isKRaftBridgeCandidate(parseKafkaVersion("3.8.0")!), true);
  });

  test("isKRaftBridgeCandidate: 3.9.1 is false (already migration-ready)", () => {
    assert.equal(isKRaftBridgeCandidate(parseKafkaVersion("3.9.1")!), false);
  });

  test("isKRaftBridgeCandidate: 3.2.0 is false (too old)", () => {
    assert.equal(isKRaftBridgeCandidate(parseKafkaVersion("3.2.0")!), false);
  });

  test("isKRaftBridgeCandidate: 4.0.0 is false (4.x)", () => {
    assert.equal(isKRaftBridgeCandidate(parseKafkaVersion("4.0.0")!), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Migration Version Readiness
// ═══════════════════════════════════════════════════════════════════════════

describe("migration version readiness", () => {
  test("3.3.0 with zookeeper mode produces blocker (migration-version-insufficient)", () => {
    const r = analyzeKRaft(makeInput({ kafkaVersion: "3.3.0" }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "migration-version-insufficient"));
    }
  });

  test("3.7.1 with zookeeper mode produces blocker", () => {
    const r = analyzeKRaft(makeInput({ kafkaVersion: "3.7.1" }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "migration-version-insufficient"));
    }
  });

  test("3.9.0 with zookeeper mode produces blocker (below documented 3.9.1)", () => {
    const r = analyzeKRaft(makeInput({ kafkaVersion: "3.9.0" }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "migration-version-insufficient"));
      const iss = r.issues.find((i) => i.kind === "migration-version-insufficient");
      assert.ok(iss!.message.includes("3.9.1"));
    }
  });

  test("3.9.1 with zookeeper mode passes (documented minimum)", () => {
    const result = getResult({ kafkaVersion: "3.9.1" });
    assert.ok(!result.findings.some((f) => f.id.includes("migration-version-insufficient")));
  });

  test("3.9.2 with zookeeper mode passes", () => {
    const result = getResult({ kafkaVersion: "3.9.2" });
    assert.ok(!result.findings.some((f) => f.id.includes("migration-version-insufficient")));
  });

  test("3.9.1 produces 3.9.2 advisory (KIP-1252)", () => {
    const result = getResult({ kafkaVersion: "3.9.1" });
    assert.ok(hasFinding(result, "version-3.9.2-advisory"));
    const f = findingById(result, "version-3.9.2-advisory");
    assert.ok(f!.message.includes("KIP-1252"));
    assert.ok(f!.message.includes("3.9.2"));
  });

  test("3.9.2 does NOT produce 3.9.2 advisory (already at recommended)", () => {
    const result = getResult({ kafkaVersion: "3.9.2" });
    assert.ok(!hasFinding(result, "version-3.9.2-advisory"));
  });

  test("already-KRaft 3.5.0 cluster with kraft mode gets bridge advisory", () => {
    const result = getResult({
      kafkaVersion: "3.5.0",
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(hasFinding(result, "version-kraft-bridge-advisory"));
    const f = findingById(result, "version-kraft-bridge-advisory");
    assert.ok(f!.message.includes("3.9.x"));
    assert.ok(f!.message.includes("4.x"));
  });

  test("already-KRaft 3.3.0 cluster with kraft mode gets bridge advisory", () => {
    const result = getResult({
      kafkaVersion: "3.3.0",
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(hasFinding(result, "version-kraft-bridge-advisory"));
  });

  test("already-KRaft 3.9.1 does not get bridge advisory (already at migration-ready)", () => {
    const result = getResult({
      kafkaVersion: "3.9.1",
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(!hasFinding(result, "version-kraft-bridge-advisory"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3.9 Bridge Identification
// ═══════════════════════════════════════════════════════════════════════════

describe("3.9.x bridge identification", () => {
  test("3.9.0 is identified as bridge with upgrade note", () => {
    // 3.9.0 with kraft mode (not zookeeper/migration, which would block)
    const result = getResult({
      kafkaVersion: "3.9.0",
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(hasFinding(result, "version-3.9-bridge"));
    const f = findingById(result, "version-3.9-bridge");
    assert.ok(f!.message.includes("below the documented migration minimum"));
  });

  test("3.9.1 is identified as bridge (migration-ready)", () => {
    const result = getResult({ kafkaVersion: "3.9.1" });
    assert.ok(hasFinding(result, "version-3.9-bridge"));
  });

  test("3.9.2 is identified as bridge", () => {
    const result = getResult({ kafkaVersion: "3.9.2" });
    assert.ok(hasFinding(result, "version-3.9-bridge"));
  });

  test("3.8.0 is not bridge", () => {
    const result = getResult({
      kafkaVersion: "3.8.0",
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(!hasFinding(result, "version-3.9-bridge"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ZooKeeper on 4.x Blocker
// ═══════════════════════════════════════════════════════════════════════════

describe("ZooKeeper on 4.x blocker", () => {
  test("4.0.0 with zookeeper mode is blocked at validation", () => {
    const r = analyzeKRaft(makeInput({
      kafkaVersion: "4.0.0",
      metadataMode: "zookeeper",
    }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "version-4x-zookeeper"));
    }
  });

  test("4.3.1 with migration mode is blocked at validation", () => {
    const r = analyzeKRaft(makeInput({
      kafkaVersion: "4.3.1",
      metadataMode: "migration",
    }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "version-4x-migration"));
    }
  });

  test("4.3.1 with kraft mode succeeds", () => {
    const r = analyzeKRaft(makeInput({
      kafkaVersion: "4.3.1",
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    }));
    assert.ok(r.ok);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Official Five Phases
// ═══════════════════════════════════════════════════════════════════════════

describe("migration phases", () => {
  test("exactly five phases defined", () => {
    assert.equal(KRAFT_MIGRATION_PHASES.length, 5);
  });

  test("official phase IDs are stable and ordered", () => {
    const ids = KRAFT_MIGRATION_PHASES.map((p) => p.id);
    assert.deepEqual(ids, [
      "preflight-zookeeper",
      "initial-metadata-load",
      "hybrid-migration",
      "dual-write-migration",
      "finalized-kraft",
    ]);
  });

  test("official phase labels match", () => {
    const labels = KRAFT_MIGRATION_PHASES.map((p) => p.label);
    assert.deepEqual(labels, [
      "Initial ZooKeeper",
      "Initial Metadata Load",
      "Hybrid Migration",
      "Dual-Write Migration",
      "Finalized KRaft",
    ]);
  });

  test("orders are 1-5", () => {
    const orders = KRAFT_MIGRATION_PHASES.map((p) => p.order);
    assert.deepEqual(orders, [1, 2, 3, 4, 5]);
  });

  test("phases 1-4 support rollback", () => {
    for (const phase of KRAFT_MIGRATION_PHASES.slice(0, 4)) {
      assert.equal(phase.rollbackSupported, true, `${phase.id} should support rollback`);
    }
  });

  test("phase 5 (finalized) does NOT support rollback", () => {
    const finalized = KRAFT_MIGRATION_PHASES[4];
    assert.equal(finalized.rollbackSupported, false);
    assert.ok(finalized.rollbackNote.includes("irreversible"));
  });

  test("phase 4 (dual-write) says controller still writes ZooKeeper", () => {
    const dualWrite = KRAFT_MIGRATION_PHASES[3];
    assert.equal(dualWrite.id, "dual-write-migration");
    assert.ok(dualWrite.description.includes("controller continues writing"));
    assert.ok(dualWrite.description.includes("ZooKeeper"));
    assert.ok(dualWrite.description.includes("last rollback boundary"));
  });

  test("rollback notes mention controller-epoch caveat", () => {
    const phase2 = KRAFT_MIGRATION_PHASES[1];
    assert.ok(phase2.rollbackNote.includes("controller-epoch"));
    const phase3 = KRAFT_MIGRATION_PHASES[2];
    assert.ok(phase3.rollbackNote.includes("controller-epoch"));
    const phase4 = KRAFT_MIGRATION_PHASES[3];
    assert.ok(phase4.rollbackNote.includes("controller-epoch"));
  });
});

describe("phase navigation", () => {
  const phaseIds: KRaftMigrationPhaseId[] = [
    "preflight-zookeeper",
    "initial-metadata-load",
    "hybrid-migration",
    "dual-write-migration",
    "finalized-kraft",
  ];

  for (let i = 0; i < phaseIds.length; i++) {
    test(`phase ${phaseIds[i]} navigates correctly`, () => {
      const mode = i === 0 ? "zookeeper" as const : i === 4 ? "kraft" as const : "migration" as const;
      const result = getResult({
        metadataMode: mode,
        migrationPhase: phaseIds[i],
      });
      assert.equal(result.phaseNavigation.currentPhase.id, phaseIds[i]);
      if (i < phaseIds.length - 1) {
        assert.equal(result.phaseNavigation.nextPhase?.id, phaseIds[i + 1]);
      } else {
        assert.equal(result.phaseNavigation.nextPhase, null);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase/Mode Combinations
// ═══════════════════════════════════════════════════════════════════════════

describe("phase/mode combinations", () => {
  test("zookeeper mode + preflight-zookeeper is valid", () => {
    const result = getResult({
      metadataMode: "zookeeper",
      migrationPhase: "preflight-zookeeper",
    });
    assert.ok(!result.findings.some((f) => f.id.includes("phase-mode-mismatch")));
  });

  test("zookeeper mode + dual-write is a warning", () => {
    const result = getResult({
      metadataMode: "zookeeper",
      migrationPhase: "dual-write-migration",
    });
    assert.ok(result.findings.some((f) => f.id === "validation-phase-mode-mismatch"));
  });

  test("kraft mode + finalized-kraft is valid", () => {
    const result = getResult({
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(!result.findings.some((f) => f.id === "validation-phase-mode-mismatch"));
  });

  test("kraft mode + preflight-zookeeper is a warning", () => {
    const result = getResult({
      metadataMode: "kraft",
      migrationPhase: "preflight-zookeeper",
    });
    assert.ok(result.findings.some((f) => f.id === "validation-phase-mode-mismatch"));
  });

  test("migration mode + finalized-kraft is a warning", () => {
    const result = getResult({
      metadataMode: "migration",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(result.findings.some((f) => f.id === "validation-phase-mode-mismatch"));
  });

  test("migration mode + hybrid-migration is valid", () => {
    const result = getResult({
      metadataMode: "migration",
      migrationPhase: "hybrid-migration",
    });
    assert.ok(!result.findings.some((f) => f.id === "validation-phase-mode-mismatch"));
  });

  test("migration mode + dual-write-migration is valid", () => {
    const result = getResult({
      metadataMode: "migration",
      migrationPhase: "dual-write-migration",
    });
    assert.ok(!result.findings.some((f) => f.id === "validation-phase-mode-mismatch"));
  });

  test("kraft mode + dual-write-migration is valid (all brokers KRaft)", () => {
    const result = getResult({
      metadataMode: "kraft",
      migrationPhase: "dual-write-migration",
    });
    assert.ok(!result.findings.some((f) => f.id === "validation-phase-mode-mismatch"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dual-Write Phase 4 Semantics
// ═══════════════════════════════════════════════════════════════════════════

describe("dual-write phase semantics", () => {
  test("dual-write phase has pre-finalization warning mentioning ZooKeeper still written", () => {
    const result = getResult({
      metadataMode: "kraft",
      migrationPhase: "dual-write-migration",
    });
    assert.ok(hasFinding(result, "phase-pre-finalization"));
    const f = findingById(result, "phase-pre-finalization");
    assert.ok(f!.message.includes("continues writing to ZooKeeper"));
    assert.ok(f!.message.includes("LAST ROLLBACK"));
  });

  test("dual-write phase mentions controller-epoch caveat", () => {
    const result = getResult({
      metadataMode: "kraft",
      migrationPhase: "dual-write-migration",
    });
    const f = findingById(result, "phase-pre-finalization");
    assert.ok(f!.message.includes("controller-epoch caveat"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Finalization Irreversibility
// ═══════════════════════════════════════════════════════════════════════════

describe("finalization irreversibility", () => {
  test("finalized phase has finding about irreversibility", () => {
    const result = getResult({
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.ok(hasFinding(result, "phase-finalized"));
    const f = findingById(result, "phase-finalized");
    assert.ok(f!.message.includes("IRREVERSIBLE"));
  });

  test("rollback not supported from finalized", () => {
    const result = getResult({
      metadataMode: "kraft",
      migrationPhase: "finalized-kraft",
    });
    assert.equal(result.phaseNavigation.rollbackSupported, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Static/Dynamic Quorum Validation
// ═══════════════════════════════════════════════════════════════════════════

