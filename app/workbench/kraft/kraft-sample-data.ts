/**
 * Sample data for the KRaft transition planner workbench tool.
 * Represents a production Kafka 3.9.1 cluster preparing for KRaft migration
 * using static quorum mode.
 */
import type { KRaftPlannerInput } from "@kafka-hub/kafka-planners/kraft";

export const SAMPLE_INPUT: KRaftPlannerInput = {
  kafkaVersion: "3.9.1",
  metadataMode: "zookeeper",
  vendor: "apache",
  controllerCount: 3,
  controllerNodeIds: [1, 2, 3],
  brokerNodeIds: [4, 5, 6],
  controllerListenerNames: ["CONTROLLER"],
  quorumMode: "static",
  quorumVoters: [
    { nodeId: 1, host: "ctrl1.example.com", port: 9093 },
    { nodeId: 2, host: "ctrl2.example.com", port: 9093 },
    { nodeId: 3, host: "ctrl3.example.com", port: 9093 },
  ],
  bootstrapServers: [],
  interBrokerConfigPresent: true,
  controllerConfigPresent: true,
  aclHealth: "healthy",
  logDirHealth: "healthy",
  failedLogDirCount: 0,
  migrationPhase: "preflight-zookeeper",
  production: true,
};

/** Dynamic quorum sample for demonstration. */
export const SAMPLE_INPUT_DYNAMIC: KRaftPlannerInput = {
  kafkaVersion: "3.9.2",
  metadataMode: "zookeeper",
  vendor: "apache",
  controllerCount: 3,
  controllerNodeIds: [1, 2, 3],
  brokerNodeIds: [4, 5, 6],
  controllerListenerNames: ["CONTROLLER"],
  quorumMode: "dynamic",
  quorumVoters: [],
  bootstrapServers: [
    { host: "ctrl1.example.com", port: 9093 },
    { host: "ctrl2.example.com", port: 9093 },
    { host: "ctrl3.example.com", port: 9093 },
  ],
  interBrokerConfigPresent: true,
  controllerConfigPresent: true,
  aclHealth: "healthy",
  logDirHealth: "healthy",
  failedLogDirCount: 0,
  migrationPhase: "preflight-zookeeper",
  production: true,
};
