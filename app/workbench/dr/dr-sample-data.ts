/**
 * Sample data for the DR Tabletop Planner workbench tool.
 * Represents a production Kafka cluster with MirrorMaker 2 replication.
 */
import type { DrTabletopInput } from "@kafka-hub/kafka-planners/dr";

/** Standard MM2 replication scenario with moderate parameters. */
export const SAMPLE_INPUT_MM2: DrTabletopInput = {
  replicationLagSeconds: 5,
  checkpointIntervalSeconds: 60,
  incidentDetectionSeconds: 120,
  promotionSeconds: 30,
  dnsTtlSeconds: 60,
  clientReconnectSeconds: 30,
  validationSeconds: 60,
  duplicateToleranceSeconds: 120,
  strategy: "mirror-maker-2",
};

/** MSK Replicator scenario with managed service parameters. */
export const SAMPLE_INPUT_MSK: DrTabletopInput = {
  replicationLagSeconds: 10,
  checkpointIntervalSeconds: 300,
  incidentDetectionSeconds: 180,
  promotionSeconds: 60,
  dnsTtlSeconds: 120,
  clientReconnectSeconds: 45,
  validationSeconds: 90,
  duplicateToleranceSeconds: 600,
  strategy: "msk-replicator",
};

/** Generic replication with tight parameters (aggressive DR). */
export const SAMPLE_INPUT_GENERIC: DrTabletopInput = {
  replicationLagSeconds: 2,
  checkpointIntervalSeconds: 30,
  incidentDetectionSeconds: 60,
  promotionSeconds: 15,
  dnsTtlSeconds: 30,
  clientReconnectSeconds: 15,
  validationSeconds: 30,
  duplicateToleranceSeconds: 60,
  strategy: "generic",
};
