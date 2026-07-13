/**
 * Sample data for the lag triage workbench tool.
 * Used for the "Load sample" button. Represents a typical growing-lag scenario.
 */
import type { LagTriageInput } from "@kafka-hub/kafka-planners/lag";

export const SAMPLE_INPUT: LagTriageInput = {
  snapshotBefore: {
    partitions: [
      { partitionId: "orders-0", committedOffset: 50000, currentOffset: 50000, logEndOffset: 55000 },
      { partitionId: "orders-1", committedOffset: 48000, currentOffset: 48000, logEndOffset: 53000 },
      { partitionId: "orders-2", committedOffset: 51000, currentOffset: 51000, logEndOffset: 54000 },
      { partitionId: "orders-3", committedOffset: 49000, currentOffset: 49000, logEndOffset: 52000 },
      { partitionId: "orders-4", committedOffset: 47000, currentOffset: 47000, logEndOffset: 70000 },
      { partitionId: "orders-5", committedOffset: 52000, currentOffset: 52000, logEndOffset: 56000 },
    ],
    groupState: "stable",
  },
  snapshotAfter: {
    partitions: [
      { partitionId: "orders-0", committedOffset: 52000, currentOffset: 52000, logEndOffset: 58000 },
      { partitionId: "orders-1", committedOffset: 50000, currentOffset: 50000, logEndOffset: 57000 },
      { partitionId: "orders-2", committedOffset: 53000, currentOffset: 53000, logEndOffset: 58000 },
      { partitionId: "orders-3", committedOffset: 51000, currentOffset: 51000, logEndOffset: 56000 },
      { partitionId: "orders-4", committedOffset: 49000, currentOffset: 49000, logEndOffset: 78000 },
      { partitionId: "orders-5", committedOffset: 54000, currentOffset: 54000, logEndOffset: 60000 },
    ],
    groupState: "stable",
  },
  intervalSeconds: 60,
  assumptions: {
    perConsumerThroughput: 500,
    drainTargetSeconds: 600,
  },
};

export function sampleInputToJson(): string {
  return JSON.stringify(
    {
      snapshotBefore: SAMPLE_INPUT.snapshotBefore,
      snapshotAfter: SAMPLE_INPUT.snapshotAfter,
    },
    null,
    2,
  );
}
