import assert from "node:assert/strict";
import {
  analyzeDr,
  exportDrMarkdown,
  exportDrJson,
  exportDrChecklist,
} from "./index";
import type {
  DrTabletopInput,
  DrTabletopResult,
} from "./types";
export { analyzeDr, exportDrMarkdown, exportDrJson, exportDrChecklist };
export type { DrTabletopInput, DrTabletopResult };


// ─── Helpers ────────────────────────────────────────────────────────────────

export function makeInput(overrides?: Partial<DrTabletopInput>): DrTabletopInput {
  return {
    replicationLagSeconds: 5,
    checkpointIntervalSeconds: 60,
    incidentDetectionSeconds: 120,
    promotionSeconds: 30,
    dnsTtlSeconds: 60,
    clientReconnectSeconds: 30,
    validationSeconds: 60,
    duplicateToleranceSeconds: 120,
    ...overrides,
  };
}

export function analyzeOk(overrides?: Partial<DrTabletopInput>): DrTabletopResult {
  const r = analyzeDr(makeInput(overrides));
  assert.equal(r.ok, true, "Expected analysis to succeed");
  return (r as { ok: true; result: DrTabletopResult }).result;
}

