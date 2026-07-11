import type { SignatureDefinition } from "../signature-types";

export const AUTH_SASL_SIGNATURE: SignatureDefinition = {
    id: "auth-sasl-failure",
    title: "Authorization / SASL authentication failure",
    severity: "high",
    baseConfidence: 20,
    patterns: [
      { pattern: /(?:SASL|SSL)\s*(?:authentication|handshake)\s*failed/i, weight: 30, expectedKind: "broker-log" },
      { pattern: /TopicAuthorizationException|GroupAuthorizationException|ClusterAuthorizationException/i, weight: 30, expectedKind: "client-log" },
      { pattern: /TOPIC_AUTHORIZATION_FAILED|GROUP_AUTHORIZATION_FAILED|CLUSTER_AUTHORIZATION_FAILED/i, weight: 25, expectedKind: "client-log" },
      { pattern: /SaslAuthenticationException/i, weight: 25, expectedKind: "client-log" },
      { pattern: /javax\.security\.auth/i, weight: 15, expectedKind: "stack-trace" },
      { pattern: /sasl\.mechanism|security\.protocol|sasl\.jaas\.config/i, weight: 10, expectedKind: "config" },
    ],
    conflicts: [
      { pattern: /authentication.*(?:success|complete)/i, reduction: 15, expectedKind: "broker-log" },
    ],
    missingEvidence: [
      "Client security.protocol and sasl.mechanism configuration",
      "Broker ACL configuration",
      "JAAS configuration (redacted)",
    ],
    recommendedNextEvidence: [
      "Verify security.protocol matches between client and broker",
      "Check ACLs: kafka-acls --list --topic <topic>",
      "Review SASL mechanism configuration on both sides",
    ],
    resourceLinks: [
      { label: "TopicAuthorizationException", href: "/errors/topic-authorization-exception", surface: "errors" },
      { label: "AuthorizationException", href: "/errors/authorization-exception", surface: "errors" },
    ],
    observability: [
      {
        metric: "kafka.server:type=BrokerTopicMetrics,name=FailedAuthenticationPerSec",
        description: "Rate of failed authentication attempts (count/sec).",
        rationale: "Non-zero indicates clients are misconfigured or unauthorized. May indicate credential rotation issues.",
        caveat: "Do not alert on this alone if you have expected scanner/probe traffic. Filter by source IP or principal for actionable alerts.",
      },
    ],
  };
