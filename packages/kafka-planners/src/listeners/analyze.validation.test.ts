import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeListeners,
  normalizeHost,
  isWildcard,
  isLoopback,
  isValidListenerName,
  isValidHost,
  isIPv6,
  formatEndpointHost,
  SASL_MECHANISMS,
  makeListener,
  makeInput,
  getResult,
  getDiagIds,
} from "./analyze.test-support";

// ─── Valid same-host setup ──────────────────────────────────────────────────

describe("valid same-host setup", () => {
  test("single internal listener on same-host produces no errors", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "localhost", advertisedPort: 9092 })],
      clientLocation: "same-host",
    });
    assert.equal(result.errorCount, 0);
  });

  test("same-host with loopback advertised is valid", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "127.0.0.1" })],
      clientLocation: "same-host",
    });
    assert.equal(result.errorCount, 0);
  });
});

// ─── Valid LAN setup ────────────────────────────────────────────────────────

describe("valid LAN setup", () => {
  test("internal + external listeners on LAN with routable hosts", () => {
    const result = getResult(makeInput());
    assert.equal(result.errorCount, 0);
    assert.ok(result.brokerSnippet.listeners.length > 0);
    assert.ok(result.brokerSnippet.advertisedListeners.length > 0);
  });
});

// ─── Valid internal+external setup ──────────────────────────────────────────

describe("valid internal+external setup", () => {
  test("separate internal and external listeners produce correct snippets", () => {
    const result = getResult(makeInput());
    assert.ok(result.brokerSnippet.listeners.includes("INTERNAL://"));
    assert.ok(result.brokerSnippet.listeners.includes("EXTERNAL://"));
    assert.ok(result.brokerSnippet.advertisedListeners.includes("INTERNAL://"));
    assert.ok(result.brokerSnippet.advertisedListeners.includes("EXTERNAL://"));
    assert.ok(result.brokerSnippet.interBrokerListenerName);
  });

  test("client snippet uses external listener", () => {
    const result = getResult(makeInput());
    assert.ok(result.clientSnippet.bootstrapServers.includes("broker1.example.com:9093"));
    assert.equal(result.clientSnippet.securityProtocol, "PLAINTEXT");
  });
});

// ─── Advertising 0.0.0.0 or :: ─────────────────────────────────────────────

describe("advertising wildcard addresses", () => {
  test("advertising 0.0.0.0 flags error", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "0.0.0.0" })],
      clientLocation: "same-host",
    });
    assert.ok(getDiagIds(result).includes("advertised-wildcard"));
    assert.ok(result.errorCount >= 1);
  });

  test("advertising :: flags error", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "::" })],
      clientLocation: "same-host",
    });
    assert.ok(getDiagIds(result).includes("advertised-wildcard"));
  });

  test("advertising [::] flags error (bracketed IPv6 wildcard)", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "[::]" })],
      clientLocation: "same-host",
    });
    assert.ok(getDiagIds(result).includes("advertised-wildcard"));
  });
});

// ─── Remote clients receiving localhost ─────────────────────────────────────

describe("remote clients receiving localhost/loopback", () => {
  test("external listener advertising localhost flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "lan",
    });
    assert.ok(getDiagIds(result).includes("advertised-loopback-external"));
    assert.ok(result.errorCount >= 1);
  });

  test("external listener advertising 127.0.0.1 flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXTERNAL",
        advertisedHost: "127.0.0.1",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "lan",
    });
    assert.ok(getDiagIds(result).includes("advertised-loopback-external"));
  });

  test("LAN client with loopback advertised flags error", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        advertisedHost: "localhost",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "lan",
    });
    assert.ok(getDiagIds(result).includes("lan-loopback"));
  });
});

// ─── Case-insensitive duplicate names ───────────────────────────────────────

describe("case-insensitive duplicate listener names", () => {
  test("INTERNAL and internal treated as duplicates", () => {
    const r = analyzeListeners({
      listeners: [
        makeListener({ name: "INTERNAL", securityProtocol: "PLAINTEXT" }),
        makeListener({ name: "internal", bindPort: 9093, advertisedPort: 9093, securityProtocol: "PLAINTEXT" }),
      ],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "duplicate-listener-name"));
    }
  });

  test("External and EXTERNAL treated as duplicates", () => {
    const r = analyzeListeners({
      listeners: [
        makeListener({ name: "External", bindPort: 9092, securityProtocol: "PLAINTEXT" }),
        makeListener({ name: "EXTERNAL", bindPort: 9093, advertisedPort: 9093, securityProtocol: "PLAINTEXT" }),
      ],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "duplicate-listener-name"));
    }
  });
});

// ─── Duplicate bind endpoints ───────────────────────────────────────────────

describe("duplicate bind endpoints", () => {
  test("same bind host:port on two listeners flags validation error", () => {
    const r = analyzeListeners({
      listeners: [
        makeListener({ name: "A", bindHost: "0.0.0.0", bindPort: 9092, securityProtocol: "PLAINTEXT" }),
        makeListener({ name: "B", bindHost: "0.0.0.0", bindPort: 9092, advertisedPort: 9093, securityProtocol: "PLAINTEXT" }),
      ],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "duplicate-bind-endpoint"));
    }
  });
});

// ─── Duplicate advertised endpoints ─────────────────────────────────────────

describe("duplicate advertised endpoints", () => {
  test("same advertised host:port on two listeners flags validation error", () => {
    const r = analyzeListeners({
      listeners: [
        makeListener({ name: "A", advertisedHost: "broker1.local", advertisedPort: 9092, securityProtocol: "PLAINTEXT" }),
        makeListener({ name: "B", bindPort: 9093, advertisedHost: "broker1.local", advertisedPort: 9092, securityProtocol: "PLAINTEXT" }),
      ],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "duplicate-advertised-endpoint"));
    }
  });
});

// ─── Protocol map generation ────────────────────────────────────────────────

describe("protocol map generation", () => {
  test("protocol map includes all listeners", () => {
    const result = getResult(makeInput());
    assert.equal(result.protocolMap.length, 2);
    const names = result.protocolMap.map((e) => e.listenerName);
    assert.ok(names.includes("INTERNAL"));
    assert.ok(names.includes("EXTERNAL"));
  });

  test("protocol map uses explicit security protocol when provided", () => {
    const result = getResult({
      listeners: [
        makeListener({ name: "INT", securityProtocol: "SSL" }),
        makeListener({ name: "EXT", bindPort: 9093, advertisedHost: "ext.local", advertisedPort: 9093, role: "external", securityProtocol: "SASL_SSL" }),
      ],
      clientLocation: "lan",
    });
    const internal = result.protocolMap.find((e) => e.listenerName === "INT");
    const external = result.protocolMap.find((e) => e.listenerName === "EXT");
    assert.equal(internal?.protocol, "SSL");
    assert.equal(external?.protocol, "SASL_SSL");
  });

  test("standard listener name infers same protocol when not specified", () => {
    const result = getResult({
      listeners: [makeListener({ name: "SSL" })],
      clientLocation: "same-host",
    });
    assert.equal(result.protocolMap[0].protocol, "SSL");
    assert.equal(result.protocolMap[0].listenerName, "SSL");
  });

  test("standard name PLAINTEXT infers PLAINTEXT protocol", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT" })],
      clientLocation: "same-host",
    });
    assert.equal(result.protocolMap[0].protocol, "PLAINTEXT");
  });

  test("standard name SASL_SSL infers SASL_SSL protocol", () => {
    const result = getResult({
      listeners: [makeListener({ name: "SASL_SSL", securityProtocol: undefined })],
      clientLocation: "same-host",
    });
    assert.equal(result.protocolMap[0].protocol, "SASL_SSL");
  });

  test("custom listener name without securityProtocol returns protocol-map-missing", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "INTERNAL" })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "protocol-map-missing"));
    }
  });

  test("custom listener name BROKER without securityProtocol returns protocol-map-missing", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "BROKER" })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "protocol-map-missing"));
    }
  });

  test("custom listener name with explicit protocol passes validation", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "INTERNAL", securityProtocol: "PLAINTEXT" })],
      clientLocation: "same-host",
    });
    assert.ok(r.ok);
  });
});

// ─── SASL mechanism ─────────────────────────────────────────────────────────

describe("SASL mechanism", () => {
  test("SASL mechanism is emitted in client snippet only when explicitly provided", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "SASL_SSL",
        role: "external",
      })],
      clientLocation: "lan",
    });
    assert.equal(result.clientSnippet.securityProtocol, "SASL_SSL");
    assert.equal(result.clientSnippet.saslMechanism, undefined);
  });

  test("explicit SASL mechanism is emitted in client snippet", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        role: "external",
        securityProtocol: "SASL_SSL",
        saslMechanism: "SCRAM-SHA-512",
      })],
      clientLocation: "lan",
    });
    assert.equal(result.clientSnippet.securityProtocol, "SASL_SSL");
    assert.equal(result.clientSnippet.saslMechanism, "SCRAM-SHA-512");
  });

  test("all valid SASL mechanisms are accepted", () => {
    for (const mech of SASL_MECHANISMS) {
      const r = analyzeListeners({
        listeners: [makeListener({
          name: "EXT",
          role: "external",
          securityProtocol: "SASL_SSL",
          saslMechanism: mech,
        })],
        clientLocation: "lan",
      });
      assert.ok(r.ok, `Mechanism ${mech} should be accepted`);
    }
  });

  test("invalid SASL mechanism flags validation error", () => {
    const r = analyzeListeners({
      listeners: [makeListener({
        name: "EXT",
        securityProtocol: "SASL_SSL",
        saslMechanism: "INVALID" as unknown as import("./types").SaslMechanism,
      })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-sasl-mechanism"));
    }
  });

  test("SASL mechanism with non-SASL protocol flags validation error", () => {
    const r = analyzeListeners({
      listeners: [makeListener({
        name: "EXT",
        securityProtocol: "PLAINTEXT",
        saslMechanism: "SCRAM-SHA-256",
      })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "sasl-mechanism-requires-sasl-protocol"));
    }
  });

  test("SASL mechanism with SSL protocol flags validation error", () => {
    const r = analyzeListeners({
      listeners: [makeListener({
        name: "EXT",
        securityProtocol: "SSL",
        saslMechanism: "PLAIN",
      })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "sasl-mechanism-requires-sasl-protocol"));
    }
  });

  test("SASL_PLAINTEXT listener with no mechanism emits nothing in client", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "SASL_PLAINTEXT",
        role: "external",
      })],
      clientLocation: "lan",
    });
    assert.equal(result.clientSnippet.securityProtocol, "SASL_PLAINTEXT");
    assert.equal(result.clientSnippet.saslMechanism, undefined);
  });
});

// ─── Invalid ports ──────────────────────────────────────────────────────────

describe("invalid ports", () => {
  test("port 0 is invalid", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ bindPort: 0 })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-port"));
    }
  });

  test("port 65536 is invalid", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ bindPort: 65536 })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-port"));
    }
  });

  test("port -1 is invalid", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ advertisedPort: -1 })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-port"));
    }
  });

  test("non-integer port is invalid", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ bindPort: 9092.5 })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-port"));
    }
  });
});

// ─── Invalid protocols ──────────────────────────────────────────────────────

describe("invalid security protocols", () => {
  test("unknown protocol flags validation error", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ securityProtocol: "TLS" as unknown as import("./types").SecurityProtocol })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-security-protocol"));
    }
  });
});

// ─── Listener name validation ───────────────────────────────────────────────

describe("listener name validation", () => {
  test("valid listener names", () => {
    assert.ok(isValidListenerName("INTERNAL"));
    assert.ok(isValidListenerName("EXTERNAL"));
    assert.ok(isValidListenerName("BROKER"));
    assert.ok(isValidListenerName("my-listener"));
    assert.ok(isValidListenerName("LISTENER_1"));
    assert.ok(isValidListenerName("a"));
    assert.ok(isValidListenerName("A1"));
    assert.ok(isValidListenerName("SASL_SSL"));
  });

  test("invalid listener names with commas", () => {
    assert.ok(!isValidListenerName("INTERNAL,EXTERNAL"));
  });

  test("invalid listener names with colons", () => {
    assert.ok(!isValidListenerName("INTERNAL:9092"));
  });

  test("invalid listener names with slashes", () => {
    assert.ok(!isValidListenerName("INTERNAL/EXTERNAL"));
  });

  test("invalid listener names with equals", () => {
    assert.ok(!isValidListenerName("INTERNAL=PLAINTEXT"));
  });

  test("invalid listener names with whitespace", () => {
    assert.ok(!isValidListenerName("INTER NAL"));
    assert.ok(!isValidListenerName("INTERNAL\n"));
    assert.ok(!isValidListenerName("INTERNAL\t"));
  });

  test("invalid listener names starting with non-alphanumeric", () => {
    assert.ok(!isValidListenerName("-INTERNAL"));
    assert.ok(!isValidListenerName("_INTERNAL"));
    assert.ok(!isValidListenerName(".INTERNAL"));
  });

  test("invalid listener name is rejected by analyzeListeners", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "MY,LISTENER" })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-listener-name"));
    }
  });

  test("listener name with newline injection is rejected", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "INTERNAL\nmalicious=true" })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-listener-name"));
    }
  });
});

// ─── Host validation ────────────────────────────────────────────────────────

describe("host validation", () => {
  test("valid hosts", () => {
    assert.ok(isValidHost("localhost"));
    assert.ok(isValidHost("broker1.local"));
    assert.ok(isValidHost("192.168.1.1"));
    assert.ok(isValidHost("0.0.0.0"));
    assert.ok(isValidHost("::1"));
    assert.ok(isValidHost("[::1]"));
    assert.ok(isValidHost("[2001:db8::1]"));
    assert.ok(isValidHost("2001:db8::1"));
    assert.ok(isValidHost("kafka-0.kafka-headless.default.svc.cluster.local"));
    assert.ok(isValidHost("host.docker.internal"));
  });

  test("empty host is invalid", () => {
    assert.ok(!isValidHost(""));
    assert.ok(!isValidHost("  "));
  });

  test("host with whitespace is invalid", () => {
    assert.ok(!isValidHost("broker 1.local"));
    assert.ok(!isValidHost("broker1.local\n"));
  });

  test("host with comma is invalid", () => {
    assert.ok(!isValidHost("broker1,broker2"));
  });

  test("host with equals is invalid", () => {
    assert.ok(!isValidHost("broker1=value"));
  });

  test("host with slash is invalid", () => {
    assert.ok(!isValidHost("broker1/path"));
  });

  test("host with control chars is invalid", () => {
    assert.ok(!isValidHost("broker1\x00"));
    assert.ok(!isValidHost("\x07bell"));
  });

  test("invalid host in listener bindHost is rejected", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "PLAINTEXT", bindHost: "host with space" })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-host"));
    }
  });

  test("injection attempt in advertisedHost is rejected", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "host\nmalicious.property=true" })],
      clientLocation: "lan",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-host"));
    }
  });

  test("injection attempt in topologyContext.publicHostname is rejected", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "PLAINTEXT" })],
      clientLocation: "lan",
      topologyContext: { publicHostname: "host,inject=true" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-host"));
    }
  });

  test("injection attempt in topologyContext.serviceDns is rejected", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "PLAINTEXT" })],
      clientLocation: "lan",
      topologyContext: { serviceDns: "svc\nnewline" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-host"));
    }
  });

  test("interBrokerListenerName with injection chars is rejected", () => {
    const r = analyzeListeners({
      listeners: [makeListener({ name: "PLAINTEXT" })],
      clientLocation: "lan",
      interBrokerListenerName: "INTERNAL\nmalicious=true",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.kind === "invalid-listener-name"));
    }
  });
});

// ─── IPv6 formatting ────────────────────────────────────────────────────────

describe("IPv6 formatting", () => {
  test("normalizeHost strips brackets from IPv6", () => {
    assert.equal(normalizeHost("[::1]"), "::1");
    assert.equal(normalizeHost("[2001:db8::1]"), "2001:db8::1");
  });

  test("normalizeHost lowercases", () => {
    assert.equal(normalizeHost("BroKer1.LOCAL"), "broker1.local");
  });

  test("isWildcard recognizes :: and [::] and 0.0.0.0", () => {
    assert.ok(isWildcard("::"));
    assert.ok(isWildcard("[::]"));
    assert.ok(isWildcard("0.0.0.0"));
    assert.ok(!isWildcard("::1"));
  });

  test("isLoopback recognizes ::1 and [::1] and localhost", () => {
    assert.ok(isLoopback("::1"));
    assert.ok(isLoopback("[::1]"));
    assert.ok(isLoopback("localhost"));
    assert.ok(isLoopback("127.0.0.1"));
    assert.ok(!isLoopback("192.168.1.1"));
  });

  test("isIPv6 detects IPv6 addresses", () => {
    assert.ok(isIPv6("::1"));
    assert.ok(isIPv6("[2001:db8::1]"));
    assert.ok(isIPv6("2001:db8::1"));
    assert.ok(!isIPv6("192.168.1.1"));
    assert.ok(!isIPv6("broker1.local"));
  });

  test("formatEndpointHost brackets unbracketed IPv6", () => {
    assert.equal(formatEndpointHost("2001:db8::1"), "[2001:db8::1]");
    assert.equal(formatEndpointHost("::1"), "[::1]");
  });

  test("formatEndpointHost does not double-bracket IPv6", () => {
    assert.equal(formatEndpointHost("[2001:db8::1]"), "[2001:db8::1]");
    assert.equal(formatEndpointHost("[::1]"), "[::1]");
  });

  test("formatEndpointHost passes through IPv4 and hostnames", () => {
    assert.equal(formatEndpointHost("192.168.1.1"), "192.168.1.1");
    assert.equal(formatEndpointHost("broker1.local"), "broker1.local");
    assert.equal(formatEndpointHost("0.0.0.0"), "0.0.0.0");
  });

  test("IPv6 advertised host is bracketed in generated listeners", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "PLAINTEXT",
        bindHost: "0.0.0.0",
        advertisedHost: "2001:db8::1",
        advertisedPort: 9092,
      })],
      clientLocation: "same-host",
    });
    assert.ok(result.brokerSnippet.advertisedListeners.includes("[2001:db8::1]:9092"));
  });

  test("already-bracketed IPv6 is not double-bracketed in generated listeners", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "PLAINTEXT",
        bindHost: "0.0.0.0",
        advertisedHost: "[2001:db8::1]",
        advertisedPort: 9092,
      })],
      clientLocation: "same-host",
    });
    assert.ok(result.brokerSnippet.advertisedListeners.includes("[2001:db8::1]:9092"));
    assert.ok(!result.brokerSnippet.advertisedListeners.includes("[[2001:db8::1]]"));
  });

  test("IPv6 in bootstrap.servers is properly bracketed", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "PLAINTEXT",
        advertisedHost: "2001:db8::1",
        advertisedPort: 9092,
        role: "external",
      })],
      clientLocation: "lan",
    });
    assert.equal(result.clientSnippet.bootstrapServers, "[2001:db8::1]:9092");
  });

  test("bracketed IPv6 as advertised host accepted", () => {
    const result = getResult({
      listeners: [makeListener({ name: "PLAINTEXT", advertisedHost: "[2001:db8::1]", advertisedPort: 9092 })],
      clientLocation: "same-host",
    });
    assert.equal(result.errorCount, 0);
  });

  test("IPv6 bind host is bracketed in generated listeners", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "PLAINTEXT",
        bindHost: "::",
        advertisedHost: "broker1.local",
        advertisedPort: 9092,
      })],
      clientLocation: "same-host",
    });
    assert.ok(result.brokerSnippet.listeners.includes("[::]:9092"));
  });
});

// ─── IPv6 private detection ─────────────────────────────────────────────────

describe("IPv6 private address detection", () => {
  test("ULA address fc00::/7 is treated as private for internet clients", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        advertisedHost: "fd12:3456:789a::1",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "internet",
    });
    assert.ok(getDiagIds(result).includes("internet-private-no-public"));
  });

  test("link-local fe80:: is treated as private", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        advertisedHost: "fe80::1",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "internet",
    });
    assert.ok(getDiagIds(result).includes("internet-private-no-public"));
  });

  test("fc00:: ULA is flagged for NAT clients", () => {
    const result = getResult({
      listeners: [makeListener({
        name: "EXT",
        advertisedHost: "fc00::1",
        role: "external",
        securityProtocol: "PLAINTEXT",
      })],
      clientLocation: "nat",
    });
    assert.ok(getDiagIds(result).includes("nat-private-no-public"));
  });
});

