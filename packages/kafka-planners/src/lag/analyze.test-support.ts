import {
  analyzeLag,
  validateLagInput,
  validateUnknownInput,
  exportLagMarkdown,
  exportLagJson,
  redactLabel,
  DEFAULT_HOT_MULTIPLIER,
  DEFAULT_HOT_MIN_LAG,
} from "./index";
import { RESOURCE_LINKS } from "./analyze";
import type {
  LagTriageInput,
  PartitionSnapshot,
  LagCondition,
} from "./types";
export { analyzeLag, validateLagInput, validateUnknownInput, exportLagMarkdown, exportLagJson, redactLabel, DEFAULT_HOT_MULTIPLIER, DEFAULT_HOT_MIN_LAG, RESOURCE_LINKS };
export type { LagTriageInput, PartitionSnapshot, LagCondition };


// ─── Helpers ────────────────────────────────────────────────────────────────

export function makePartition(
  id: string,
  committed: number,
  logEnd: number,
  current?: number,
): PartitionSnapshot {
  return {
    partitionId: id,
    committedOffset: committed,
    currentOffset: current ?? committed,
    logEndOffset: logEnd,
  };
}

export function makeInput(overrides?: Partial<LagTriageInput>): LagTriageInput {
  return {
    snapshotBefore: {
      partitions: [
        makePartition("p0", 100, 200),
        makePartition("p1", 150, 250),
      ],
    },
    snapshotAfter: {
      partitions: [
        makePartition("p0", 150, 260),
        makePartition("p1", 200, 310),
      ],
    },
    intervalSeconds: 60,
    ...overrides,
  };
}

