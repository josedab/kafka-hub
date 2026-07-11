import assert from "node:assert/strict";
import {
  analyzeKRaft,
  validateUnknownKRaftInput,
  parseKafkaVersion,
  compareVersions,
  isKRaftOnlyVersion,
  isFinalZookeeperLine,
  supportsMigration,
  isKRaftBridgeCandidate,
  isSafeLabel,
  isSafeHost,
  isSafeListenerName,
  sanitizeForDisplay,
  exportKRaftMarkdown,
  exportKRaftJson,
  exportKRaftChecklist,
  redactKRaftLabel,
  VERSION_BASELINE,
  SOURCES,
  RESOURCE_LINKS,
  KRAFT_MIGRATION_PHASES,
  MIN_MIGRATION_VERSION,
  MIN_KRAFT_BRIDGE_VERSION,
  RECOMMENDED_MIGRATION_VERSION,
} from "./index";
import type {
  KRaftPlannerInput,
  KRaftAnalysisResult,
  KRaftMigrationPhaseId,
} from "./types";
export { analyzeKRaft, validateUnknownKRaftInput, parseKafkaVersion, compareVersions, isKRaftOnlyVersion, isFinalZookeeperLine, supportsMigration, isKRaftBridgeCandidate, isSafeLabel, isSafeHost, isSafeListenerName, sanitizeForDisplay, exportKRaftMarkdown, exportKRaftJson, exportKRaftChecklist, redactKRaftLabel, VERSION_BASELINE, SOURCES, RESOURCE_LINKS, KRAFT_MIGRATION_PHASES, MIN_MIGRATION_VERSION, MIN_KRAFT_BRIDGE_VERSION, RECOMMENDED_MIGRATION_VERSION };
export type { KRaftPlannerInput, KRaftAnalysisResult, KRaftMigrationPhaseId };


// ─── Helpers ────────────────────────────────────────────────────────────────

export function makeInput(overrides?: Partial<KRaftPlannerInput>): KRaftPlannerInput {
  return {
    kafkaVersion: "3.9.1",
    metadataMode: "zookeeper",
    vendor: "apache",
    controllerCount: 3,
    controllerNodeIds: [1, 2, 3],
    brokerNodeIds: [4, 5, 6],
    controllerListenerNames: ["CONTROLLER"],
    quorumMode: "static",
    quorumVoters: [
      { nodeId: 1, host: "ctrl1.local", port: 9093 },
      { nodeId: 2, host: "ctrl2.local", port: 9093 },
      { nodeId: 3, host: "ctrl3.local", port: 9093 },
    ],
    bootstrapServers: [],
    interBrokerConfigPresent: true,
    controllerConfigPresent: true,
    aclHealth: "healthy",
    logDirHealth: "healthy",
    failedLogDirCount: 0,
    migrationPhase: "preflight-zookeeper",
    production: true,
    ...overrides,
  };
}

export function makeDynamicInput(overrides?: Partial<KRaftPlannerInput>): KRaftPlannerInput {
  return makeInput({
    quorumMode: "dynamic",
    quorumVoters: [],
    bootstrapServers: [
      { host: "ctrl1.local", port: 9093 },
      { host: "ctrl2.local", port: 9093 },
      { host: "ctrl3.local", port: 9093 },
    ],
    ...overrides,
  });
}

export function getResult(overrides?: Partial<KRaftPlannerInput>): KRaftAnalysisResult {
  const r = analyzeKRaft(makeInput(overrides));
  assert.ok(r.ok, `Expected ok result, got issues: ${!r.ok ? JSON.stringify(r.issues) : "n/a"}`);
  return r.result;
}

export function getDynamicResult(overrides?: Partial<KRaftPlannerInput>): KRaftAnalysisResult {
  const r = analyzeKRaft(makeDynamicInput(overrides));
  assert.ok(r.ok, `Expected ok result, got issues: ${!r.ok ? JSON.stringify(r.issues) : "n/a"}`);
  return r.result;
}

export function hasFinding(result: KRaftAnalysisResult, id: string): boolean {
  return result.findings.some((f) => f.id === id);
}

export function findingById(result: KRaftAnalysisResult, id: string) {
  return result.findings.find((f) => f.id === id);
}

