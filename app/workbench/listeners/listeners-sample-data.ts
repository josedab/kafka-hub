/**
 * Sample topologies for the listener topology wizard.
 * Each sample demonstrates a common Kafka deployment pattern.
 */
import type { ListenerTopologyInput } from "@kafka-hub/kafka-planners/listeners";

export interface SampleTopology {
  readonly label: string;
  readonly description: string;
  readonly input: ListenerTopologyInput;
}

export const SAMPLE_TOPOLOGIES: readonly SampleTopology[] = [
  {
    label: "Same-host development",
    description: "Single listener for local development. Client runs on the same machine as the broker.",
    input: {
      listeners: [
        {
          name: "PLAINTEXT",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "localhost",
          advertisedPort: 9092,
          role: "internal",
        },
      ],
      clientLocation: "same-host",
    },
  },
  {
    label: "LAN internal + external",
    description: "Separate internal (inter-broker) and external (client-facing) listeners on a LAN.",
    input: {
      listeners: [
        {
          name: "INTERNAL",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "broker1.internal.local",
          advertisedPort: 9092,
          role: "internal",
          securityProtocol: "PLAINTEXT",
        },
        {
          name: "EXTERNAL",
          bindHost: "0.0.0.0",
          bindPort: 9093,
          advertisedHost: "broker1.example.com",
          advertisedPort: 9093,
          role: "external",
          securityProtocol: "SASL_SSL",
          saslMechanism: "SCRAM-SHA-256",
        },
      ],
      clientLocation: "lan",
      interBrokerListenerName: "INTERNAL",
    },
  },
  {
    label: "Docker Compose (host access)",
    description: "Kafka in Docker Compose with host access via published ports. Common for local dev with Docker.",
    input: {
      listeners: [
        {
          name: "BROKER",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "kafka",
          advertisedPort: 9092,
          role: "internal",
          securityProtocol: "PLAINTEXT",
        },
        {
          name: "HOST",
          bindHost: "0.0.0.0",
          bindPort: 29092,
          advertisedHost: "localhost",
          advertisedPort: 29092,
          role: "external",
          securityProtocol: "PLAINTEXT",
        },
      ],
      clientLocation: "docker-host",
      interBrokerListenerName: "BROKER",
      topologyContext: {
        hostPortPublished: true,
      },
    },
  },
  {
    label: "Docker Compose (container access)",
    description: "Kafka in Docker Compose, client is another container on the same Docker network.",
    input: {
      listeners: [
        {
          name: "BROKER",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "kafka",
          advertisedPort: 9092,
          role: "internal",
          securityProtocol: "PLAINTEXT",
        },
        {
          name: "CONTAINER",
          bindHost: "0.0.0.0",
          bindPort: 29092,
          advertisedHost: "kafka",
          advertisedPort: 29092,
          role: "external",
          securityProtocol: "PLAINTEXT",
        },
      ],
      clientLocation: "docker-container",
      interBrokerListenerName: "BROKER",
    },
  },
  {
    label: "Kubernetes in-cluster",
    description: "Kafka on Kubernetes, client pod in the same cluster using service DNS.",
    input: {
      listeners: [
        {
          name: "INTERNAL",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "kafka-0.kafka-headless.default.svc.cluster.local",
          advertisedPort: 9092,
          role: "internal",
          securityProtocol: "PLAINTEXT",
        },
        {
          name: "CLIENT",
          bindHost: "0.0.0.0",
          bindPort: 9093,
          advertisedHost: "kafka-0.kafka-headless.default.svc.cluster.local",
          advertisedPort: 9093,
          role: "external",
          securityProtocol: "SASL_PLAINTEXT",
          saslMechanism: "SCRAM-SHA-512",
        },
      ],
      clientLocation: "kubernetes-in-cluster",
      interBrokerListenerName: "INTERNAL",
      topologyContext: {
        serviceDns: "kafka-0.kafka-headless.default.svc.cluster.local",
      },
    },
  },
  {
    label: "Kubernetes external (LoadBalancer)",
    description: "Kafka on Kubernetes, client is external accessing via LoadBalancer IP.",
    input: {
      listeners: [
        {
          name: "INTERNAL",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "kafka-0.kafka-headless.default.svc.cluster.local",
          advertisedPort: 9092,
          role: "internal",
          securityProtocol: "PLAINTEXT",
        },
        {
          name: "EXTERNAL",
          bindHost: "0.0.0.0",
          bindPort: 9094,
          advertisedHost: "kafka-0.example.com",
          advertisedPort: 9094,
          role: "external",
          securityProtocol: "SASL_SSL",
          saslMechanism: "SCRAM-SHA-256",
        },
      ],
      clientLocation: "kubernetes-external",
      interBrokerListenerName: "INTERNAL",
      topologyContext: {
        hostPortPublished: true,
        publicHostname: "kafka-0.example.com",
        serviceDns: "kafka-0.kafka-headless.default.svc.cluster.local",
      },
    },
  },
  {
    label: "NAT / Cloud (public access)",
    description: "Broker behind NAT with port mapping. External clients use public hostname.",
    input: {
      listeners: [
        {
          name: "INTERNAL",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "10.0.0.5",
          advertisedPort: 9092,
          role: "internal",
          securityProtocol: "PLAINTEXT",
        },
        {
          name: "EXTERNAL",
          bindHost: "0.0.0.0",
          bindPort: 9093,
          advertisedHost: "kafka.example.com",
          advertisedPort: 29093,
          role: "external",
          securityProtocol: "SASL_SSL",
          saslMechanism: "OAUTHBEARER",
        },
      ],
      clientLocation: "nat",
      interBrokerListenerName: "INTERNAL",
      topologyContext: {
        hostPortPublished: true,
        publicHostname: "kafka.example.com",
        natMappedPort: 29093,
      },
    },
  },
  {
    label: "Misconfigured: localhost for LAN",
    description: "Common mistake: advertising localhost for LAN clients. Demonstrates the most frequent listener misconfiguration.",
    input: {
      listeners: [
        {
          name: "PLAINTEXT",
          bindHost: "0.0.0.0",
          bindPort: 9092,
          advertisedHost: "localhost",
          advertisedPort: 9092,
          role: "external",
        },
      ],
      clientLocation: "lan",
    },
  },
] as const;
