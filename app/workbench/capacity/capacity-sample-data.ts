/**
 * Sample data for the capacity planner workbench tool.
 * Represents a typical mid-size Kafka cluster with moderate load.
 */
import type { CapacityPlannerInput } from "@kafka-hub/kafka-planners/capacity";

export const SAMPLE_INPUT: CapacityPlannerInput = {
  peakIngressRate: 10000,                 // 10k records/sec
  avgRecordSizeBytes: 1024,               // 1 KiB/record
  compressionRatio: 0.5,                  // 50% compression (lz4-like)
  retentionSeconds: 604800,               // 7 days
  replicationFactor: 3,
  partitionCount: 30,
  brokerCount: 5,
  fullReadConsumerGroupCount: 2,
  perPartitionTargetThroughput: 1048576,  // 1 MiB/s per partition
  perBrokerStorageBytes: 1099511627776,   // 1 TiB per broker
  perBrokerNetworkBytesPerSec: 125000000, // ~1 Gbps
};
