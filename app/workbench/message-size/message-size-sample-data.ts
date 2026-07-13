/**
 * Sample data for the message-size chain checker workbench tool.
 * Represents a typical scenario with moderate-size messages and
 * standard Kafka defaults.
 */
import type { MessageSizeInput } from "@kafka-hub/kafka-planners/message-size";

export const SAMPLE_INPUT: MessageSizeInput = {
  recordSizeBytes: 51_200,              // 50 KiB record
  batchSizeBytes: 55_000,               // ~53.7 KiB batch (record + overhead)
  producerMaxRequestSize: 1_048_576,    // 1 MiB (default)
  brokerMessageMaxBytes: 1_048_588,     // ~1 MiB (default, includes 12 bytes log overhead)
  replicaFetchMaxBytes: 1_048_576,      // 1 MiB (default)
  consumerMaxPartitionFetchBytes: 1_048_576, // 1 MiB (default)
  consumerFetchMaxBytes: 52_428_800,    // 50 MiB (default)
  safetyHeadroomFraction: 0.10,         // 10% headroom
  blobStorageThresholdBytes: 1_048_576, // 1 MiB
};
