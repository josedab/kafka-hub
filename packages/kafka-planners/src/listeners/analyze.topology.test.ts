import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeListeners,
  makeListener,
  makeInput,
  getResult,
  getDiagIds,
} from "./analyze.test-support";

// ─── Docker topology rules ─────────────────────────────────────────────────

describe("Docker topology rules", () => {
  test("Docker host: service name without host mapping flags warning", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "kafka",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "docker-host",
    });
    assert.ok(getDiagIds(result).includes("docker-host-service-name"));
    assert.ok(result.warningCount >= 1);
  });

  test("Docker container: localhost flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "docker-container",
    });
    assert.ok(getDiagIds(result).includes("docker-container-loopback"));
    assert.ok(result.errorCount >= 1);
  });

  test("Docker container: host.docker.internal flags warning", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "host.docker.internal",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "docker-container",
    });
    assert.ok(getDiagIds(result).includes("docker-container-host-internal"));
  });

  test("Docker host: loopback without port publish flags warning", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "docker-host",
    });
    assert.ok(getDiagIds(result).includes("docker-host-no-port-publish"));
  });

  test("Docker host: loopback with port publish does not flag no-publish warning", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "docker-host",
      topologyContext: { hostPortPublished: true },
    });
    assert.ok(!getDiagIds(result).includes("docker-host-no-port-publish"));
  });
});

// ─── Kubernetes topology rules ──────────────────────────────────────────────

describe("Kubernetes topology rules", () => {
  test("K8s in-cluster: loopback flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "127.0.0.1",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "kubernetes-in-cluster",
    });
    assert.ok(getDiagIds(result).includes("k8s-in-cluster-loopback"));
  });

  test("K8s external: service DNS flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "kafka-0.kafka-headless.default.svc.cluster.local",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "kubernetes-external",
    });
    assert.ok(getDiagIds(result).includes("k8s-external-service-dns"));
    assert.ok(result.errorCount >= 1);
  });

  test("K8s external: loopback flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "kubernetes-external",
    });
    assert.ok(getDiagIds(result).includes("k8s-external-loopback"));
  });

  test("K8s external: private IP without public hostname flags warning", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "10.0.0.5",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "kubernetes-external",
    });
    assert.ok(getDiagIds(result).includes("k8s-external-private"));
  });
});

// ─── NAT topology rules ────────────────────────────────────────────────────

describe("NAT topology rules", () => {
  test("NAT: loopback flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "nat",
    });
    assert.ok(getDiagIds(result).includes("nat-loopback"));
  });

  test("NAT: private address without public hostname flags warning", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "192.168.1.100",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "nat",
    });
    assert.ok(getDiagIds(result).includes("nat-private-no-public"));
  });

  test("NAT: advertised port mismatch with NAT mapping flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "broker.example.com",
        advertisedPort: 9093,
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "nat",
      topologyContext: { natMappedPort: 29093 },
    });
    assert.ok(getDiagIds(result).includes("advertised-port-nat-mismatch"));
  });
});

// ─── Internet topology rules ───────────────────────────────────────────────

describe("internet topology rules", () => {
  test("internet: loopback flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "internet",
    });
    assert.ok(getDiagIds(result).includes("internet-loopback"));
  });

  test("internet: private address without public hostname flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "172.16.0.5",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "internet",
    });
    assert.ok(getDiagIds(result).includes("internet-private-no-public"));
    assert.ok(result.errorCount >= 1);
  });

  test("internet: public hostname is accepted without errors", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "kafka.example.com",
        advertisedPort: 9093,
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "internet",
    });
    assert.ok(!getDiagIds(result).includes("internet-private-no-public"));
    assert.ok(!getDiagIds(result).includes("internet-loopback"));
  });
});

// ─── Client reachability: internal-only with remote client ──────────────────

describe("client reachability: internal-only with remote client", () => {
  test("single internal listener with LAN client warns about no external", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "broker1.local" })],
      clientLocation: "lan",
    });
    assert.ok(getDiagIds(result).includes("no-external-listener"));
  });

  test("single internal listener with localhost for LAN flags loopback", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "localhost" })],
      clientLocation: "lan",
    });
    assert.ok(getDiagIds(result).includes("lan-loopback"));
  });

  test("single internal listener with localhost for Docker flags reachability", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "localhost" })],
      clientLocation: "docker-host",
    });
    // Should flag docker-host diagnostics via reachability analysis
    assert.ok(result.diagnostics.length > 0);
  });

  test("single internal listener with localhost for internet flags error", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "localhost" })],
      clientLocation: "internet",
    });
    assert.ok(getDiagIds(result).includes("internet-loopback"));
  });

  test("single internal listener with localhost for K8s in-cluster flags error", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "localhost" })],
      clientLocation: "kubernetes-in-cluster",
    });
    assert.ok(getDiagIds(result).includes("k8s-in-cluster-loopback"));
  });

  test("single internal listener with localhost for NAT flags error", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "localhost" })],
      clientLocation: "nat",
    });
    assert.ok(getDiagIds(result).includes("nat-loopback"));
  });

  test("no duplicate diagnostics when both external and reachability fire", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "lan",
    });
    // Should have lan-loopback exactly once
    const lanLoopbacks = result.diagnostics.filter((d) => d.id === "lan-loopback");
    assert.equal(lanLoopbacks.length, 1);
  });

  test("same-host with internal-only does not warn about no external", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "localhost" })],
      clientLocation: "same-host",
    });
    assert.ok(!getDiagIds(result).includes("no-external-listener"));
  });
});

// ─── Selected inter-broker listener ─────────────────────────────────────────

describe("inter-broker listener selection", () => {
  test("explicit inter-broker listener is used", () => {
    const result = getResult({
      ...makeInput(),
      interBrokerListenerName: "INTERNAL",
    });
    assert.equal(result.interBrokerListenerName, "INTERNAL");
  });

  test("defaults to first internal-role listener", () => {
    const result = getResult(makeInput());
    assert.equal(result.interBrokerListenerName, "INTERNAL");
  });

  test("non-existent inter-broker listener flags validation error", () => {
    const r = analyzeListeners({
      ...makeInput(),
      interBrokerListenerName: "NONEXISTENT",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "inter-broker-not-found"));
    }
  });

  test("case-insensitive inter-broker match works", () => {
    const result = getResult({
      ...makeInput(),
      interBrokerListenerName: "internal",
    });
    assert.equal(result.interBrokerListenerName, "INTERNAL");
  });
});

// ─── Deterministic snippet ordering ─────────────────────────────────────────

describe("deterministic snippet ordering", () => {
  test("listeners in snippet are sorted by name", () => {
    const result = getResult({
      listeners: [
        makeListener({ name: "ZEBRA", bindPort: 9094, advertisedHost: "z.local", advertisedPort: 9094, securityProtocol: "PLAINTEXT" }),
        makeListener({ name: "ALPHA", bindPort: 9092, advertisedHost: "a.local", advertisedPort: 9092, securityProtocol: "PLAINTEXT" }),
        makeListener({ name: "MIDDLE", bindPort: 9093, advertisedHost: "m.local", advertisedPort: 9093, role: "external", securityProtocol: "PLAINTEXT" }),
      ],
      clientLocation: "lan",
    });
    const parts = result.brokerSnippet.listeners.split(",");
    assert.ok(parts[0].startsWith("ALPHA://"));
    assert.ok(parts[1].startsWith("MIDDLE://"));
    assert.ok(parts[2].startsWith("ZEBRA://"));
  });

  test("protocol map in snippet is sorted by listener name", () => {
    const result = getResult({
      listeners: [
        makeListener({ name: "ZEBRA", bindPort: 9094, advertisedHost: "z.local", advertisedPort: 9094, securityProtocol: "PLAINTEXT" }),
        makeListener({ name: "ALPHA", bindPort: 9092, advertisedHost: "a.local", advertisedPort: 9092, securityProtocol: "PLAINTEXT" }),
      ],
      clientLocation: "same-host",
    });
    const mapParts = result.brokerSnippet.listenerSecurityProtocolMap.split(",");
    assert.ok(mapParts[0].startsWith("ALPHA:"));
    assert.ok(mapParts[1].startsWith("ZEBRA:"));
  });

  test("same input always produces same output", () => {
    const input = makeInput();
    const r1 = getResult(input);
    const r2 = getResult(input);
    assert.equal(r1.brokerSnippet.listeners, r2.brokerSnippet.listeners);
    assert.equal(r1.brokerSnippet.advertisedListeners, r2.brokerSnippet.advertisedListeners);
    assert.equal(r1.brokerSnippet.listenerSecurityProtocolMap, r2.brokerSnippet.listenerSecurityProtocolMap);
  });
});

