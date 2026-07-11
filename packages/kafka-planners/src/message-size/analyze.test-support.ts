import {
  analyzeMessageSize,
  validateUnknownMessageSizeInput,
  exportMessageSizeMarkdown,
  exportMessageSizeJson,
  redactMessageSizeLabel,
  DEFAULT_SAFETY_HEADROOM_FRACTION,
  DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES,
} from "./index";
import { RESOURCE_LINKS } from "./analyze";
import type { MessageSizeInput } from "./types";
export { analyzeMessageSize, validateUnknownMessageSizeInput, exportMessageSizeMarkdown, exportMessageSizeJson, redactMessageSizeLabel, DEFAULT_SAFETY_HEADROOM_FRACTION, DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES, RESOURCE_LINKS };
export type { MessageSizeInput };


// ─── Helpers ────────────────────────────────────────────────────────────────

export function makeInput(overrides?: Partial<MessageSizeInput>): MessageSizeInput {
  return {
    recordSizeBytes: 1000,
    batchSizeBytes: 1100,
    producerMaxRequestSize: 1_048_576,     // 1 MiB
    brokerMessageMaxBytes: 1_048_576,      // 1 MiB
    replicaFetchMaxBytes: 1_048_576,       // 1 MiB
    consumerMaxPartitionFetchBytes: 1_048_576,
    consumerFetchMaxBytes: 52_428_800,     // 50 MiB
    safetyHeadroomFraction: 0.10,          // 10%
    blobStorageThresholdBytes: 1_048_576,  // 1 MiB
    ...overrides,
  };
}

