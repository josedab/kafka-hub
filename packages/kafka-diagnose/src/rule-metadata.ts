/**
 * Consolidated diagnostic rule documentation metadata.
 *
 * Single authoritative source for rule documentation: titles, examples,
 * and explanatory "why it matters" text. Referenced by the UI rule detail
 * pages and the diagnose rule index.
 */

export interface RuleDocumentation {
  /** Human-readable title summarizing the finding. */
  readonly title: string;
  /** Example .properties snippet that triggers the rule. */
  readonly example: string;
  /** Explanation of why this configuration choice matters. */
  readonly whyItMatters: string;
}

/**
 * Documentation for each rule, keyed by rule ID.
 * This is the single source of truth — do not duplicate in other files.
 */
export const RULE_DOCUMENTATION: Record<string, RuleDocumentation> = {
  "malformed-boolean-literal": {
    title: "Kafka boolean setting contains a malformed literal",
    example: `# typo: Kafka accepts true or false
enable.auto.commit=flase
auto.offset.reset=earliest
max.poll.interval.ms=300000`,
    whyItMatters:
      "Kafka boolean settings have an exact true/false value domain. Treating every non-true value as false hides typos and can make a diagnostic report disagree with the broker or client parser. Correct the literal explicitly so the intended behavior is reviewable.",
  },
  "acks-all-with-min-isr-1": {
    title: "acks=all with min.insync.replicas=1 provides no durability win",
    example: `# producer
acks=all
min.insync.replicas=1
retries=2147483647
enable.idempotence=true`,
    whyItMatters:
      "acks=all only waits for replicas that are currently in the in-sync replica set. If min.insync.replicas is 1, the leader can acknowledge by itself, so a broker loss can still erase acknowledged writes. Raising min.insync.replicas makes the latency cost buy real durability.",
  },
  "unclean-leader-election": {
    title: "unclean.leader.election.enable=true risks committed-data loss",
    example: `# broker
broker.id=1
unclean.leader.election.enable=true
default.replication.factor=3
min.insync.replicas=2`,
    whyItMatters:
      "Unclean leader election favors availability by promoting a replica that may be missing acknowledged data. That can make consumers see the log move backward after a failure. Keep it disabled unless the business has explicitly chosen stale data over downtime.",
  },
  "replication-factor-too-low": {
    title: "replication.factor below the recommended minimum",
    example: `# broker defaults
broker.id=1
default.replication.factor=2
min.insync.replicas=2
auto.create.topics.enable=false`,
    whyItMatters:
      "Replication factor is the blast-radius control for broker loss. RF=1 has no redundancy, while RF=2 leaves little room to keep writes available with min.insync.replicas set safely. RF=3 is the usual floor for production topics because it tolerates one broker outage while preserving a quorum.",
  },
  "retention-vs-segment": {
    title: "segment.ms larger than retention.ms",
    example: `# topic
retention.ms=3600000
segment.ms=86400000
cleanup.policy=delete
min.insync.replicas=2`,
    whyItMatters:
      "Kafka deletes old data at segment boundaries, not continuously per record. If segments roll less often than retention expires, data remains until the active segment closes. This makes the configured retention misleading and can inflate disk usage.",
  },
  "auto-create-topics": {
    title: "auto.create.topics.enable=true leaks topics into the cluster",
    example: `# broker
broker.id=1
auto.create.topics.enable=true
default.replication.factor=3
min.insync.replicas=2`,
    whyItMatters:
      "A typo in a producer or consumer name can create a real topic with broker defaults. Those accidental topics often have the wrong partition count, retention, ACLs, and ownership. Explicit provisioning keeps topology reviewable and repeatable.",
  },
  "auto-leader-rebalance-disabled": {
    title: "auto.leader.rebalance.enable=false leaves leaders unbalanced after recovery",
    example: `# broker
broker.id=1
auto.leader.rebalance.enable=false
controlled.shutdown.enable=true
num.partitions=3`,
    whyItMatters:
      "After a broker restart, leadership often concentrates on the brokers that stayed up. If leaders are not moved back, produce traffic and request handling stay skewed long after the incident. Automatic leader rebalance helps the cluster return to its intended load shape.",
  },
  "num-network-threads-low": {
    title: "num.network.threads below the default",
    example: `# broker
broker.id=1
num.network.threads=2
num.io.threads=8
socket.send.buffer.bytes=102400`,
    whyItMatters:
      "Network threads accept client requests, broker replication traffic, and responses. Setting them below the default can make the broker look disk-bound or slow when it is actually waiting on request handling. Tune downward only after measuring thread utilization.",
  },
  "num-io-threads-low": {
    title: "num.io.threads below the default",
    example: `# broker
broker.id=1
num.io.threads=4
num.network.threads=3
log.dirs=/var/lib/kafka/data`,
    whyItMatters:
      "IO threads do the blocking work behind fetches, produces, and disk access. Reducing them can cap concurrency across partitions even when disks and CPUs have headroom. The default is conservative; lower values should come from capacity testing, not guesswork.",
  },
  "log-flush-interval-messages-set": {
    title: "log.flush.interval.messages overrides Kafka's default fsync strategy",
    example: `# broker
broker.id=1
log.flush.interval.messages=1
log.segment.bytes=1073741824
default.replication.factor=3`,
    whyItMatters:
      "Kafka durability is normally provided by replication and the operating system page cache. Forcing frequent fsyncs moves the bottleneck to disk latency without protecting against the common quorum-loss cases. It should be reserved for unusual compliance or hardware constraints.",
  },
  "broker-id-vs-cluster-id": {
    title: "broker.id is a reserved-looking value",
    example: `# broker
broker.id=0
listeners=SSL://:9093
default.replication.factor=3
log.dirs=/var/lib/kafka/data`,
    whyItMatters:
      "Broker IDs appear in logs, metrics, partition assignments, and incident notes. Values such as 0 and -1 are easy to confuse with unset, generated, or sentinel IDs. Clear positive IDs make cluster operations and automation safer.",
  },
  "compacted-topic-segment-ms-default": {
    title: "compacted topic with no explicit segment.ms",
    example: `# topic
cleanup.policy=compact
retention.ms=-1
min.cleanable.dirty.ratio=0.5
delete.retention.ms=86400000`,
    whyItMatters:
      "Compaction only works on closed segments. Low-volume compacted topics may keep their active segment open for days if segment.ms inherits the broker default. Setting an explicit roll interval lets stale keys be reclaimed on a predictable schedule.",
  },
  "compact-and-delete-mixed": {
    title: "cleanup.policy=compact,delete combines compaction with time-based deletion",
    example: `# topic
cleanup.policy=compact,delete
retention.ms=604800000
segment.ms=3600000
delete.retention.ms=86400000`,
    whyItMatters:
      "Mixed cleanup is powerful but easy to misunderstand. Kafka keeps the latest value per key only until the delete retention window also ages data out. Use it deliberately for bounded state, not as a default for event streams or state stores.",
  },
  "min-cleanable-dirty-ratio-too-high": {
    title: "min.cleanable.dirty.ratio delays compaction excessively",
    example: `# topic
cleanup.policy=compact
min.cleanable.dirty.ratio=0.95
segment.ms=3600000
delete.retention.ms=86400000`,
    whyItMatters:
      "The dirty ratio controls how much stale data must accumulate before the cleaner spends work on a log. Very high values reduce cleaner churn but make changelog restore slower and disk use larger. Defaults are usually a better balance until workload measurements say otherwise.",
  },
  "delete-retention-ms-too-low": {
    title: "delete.retention.ms may drop tombstones before slow consumers see them",
    example: `# topic
cleanup.policy=compact
segment.ms=3600000
delete.retention.ms=30000
min.cleanable.dirty.ratio=0.5`,
    whyItMatters:
      "Tombstones are delete records, and compacted consumers need to read them to remove state locally. If tombstones disappear too quickly, a lagging consumer can resurrect deleted keys during a rebuild. Keep delete retention long enough for your slowest recovery path.",
  },
  "num-partitions-too-many": {
    title: "num.partitions as a broker default is excessive",
    example: `# broker defaults
broker.id=1
num.partitions=2000
default.replication.factor=3
auto.create.topics.enable=false`,
    whyItMatters:
      "The default partition count applies to every topic that does not override it. Thousands of partitions multiply files, metadata, leader work, and follower fetches. Start with a small default and size high-throughput topics individually.",
  },
  "enable-idempotence-vs-acks": {
    title: "enable.idempotence=true requires acks=all",
    example: `# producer
enable.idempotence=true
acks=1
max.in.flight.requests.per.connection=5
retries=2147483647`,
    whyItMatters:
      "Idempotent producers depend on broker acknowledgements that prove all in-sync replicas accepted a write. Incompatible acks settings either fail at startup or weaken the ordering and retry guarantees people expect from idempotence. Keep acks=all and respect the max-in-flight limit.",
  },
  "compression-type-none": {
    title: "compression.type=none leaves significant throughput on the table",
    example: `# producer
compression.type=none
acks=all
linger.ms=5
batch.size=32768`,
    whyItMatters:
      "Kafka batches are often network-bound before they are CPU-bound. Compression shrinks producer traffic, follower replication, disk writes, and consumer fetches at the same time. Leaving it off is usually an expensive default for text or JSON payloads.",
  },
  "compression-type-gzip": {
    title: "compression.type=gzip is dominated by zstd for Kafka workloads",
    example: `# producer
compression.type=gzip
acks=all
linger.ms=5
batch.size=32768`,
    whyItMatters:
      "gzip remains compatible, but modern Kafka workloads usually get better throughput and compression ratio from zstd. That improves broker IO and consumer fetch efficiency without the older CPU trade-off. Keep gzip only for legacy client compatibility.",
  },
  "linger-ms-too-low": {
    title: "linger.ms=0 disables batching latency optimization",
    example: `# producer
linger.ms=0
compression.type=zstd
batch.size=32768
acks=all`,
    whyItMatters:
      "linger.ms gives the producer a tiny window to pack records into fuller batches. At zero, high-rate workloads send more requests and compress less efficiently. A small non-zero linger often buys substantial throughput for only a few milliseconds of latency.",
  },
  "batch-size-tiny": {
    title: "batch.size below default may cap throughput",
    example: `# producer
batch.size=8192
compression.type=zstd
linger.ms=5
acks=all`,
    whyItMatters:
      "Batch size bounds how much data the producer can group per partition before sending. Too small a value weakens compression and increases request overhead. Unless memory pressure is proven, the default or a larger value is usually safer.",
  },
  "request-timeout-vs-delivery-timeout": {
    title: "delivery.timeout.ms < request.timeout.ms",
    example: `# producer
request.timeout.ms=30000
delivery.timeout.ms=10000
linger.ms=5
acks=all`,
    whyItMatters:
      "delivery.timeout.ms is the outer deadline for a send, while request.timeout.ms is one attempt's broker round trip. If the outer deadline is shorter, retries cannot complete predictably and older clients may fail in surprising ways. Keep delivery timeout above request timeout plus linger.",
  },
  "max-block-ms-low": {
    title: "max.block.ms is aggressive and will surface ProducerSendBlockedException",
    example: `# producer
max.block.ms=1000
bootstrap.servers=kafka:9092
acks=all
delivery.timeout.ms=120000`,
    whyItMatters:
      "max.block.ms covers metadata lookups and buffer exhaustion before a send is even in flight. Very low values make normal startup, topic creation, or brief metadata stalls look like application failures. Use aggressive values only when callers are designed to handle them.",
  },
  "auto-offset-reset-latest": {
    title: "auto.offset.reset=latest will silently drop backlog on new groups",
    example: `# consumer
group.id=orders-reader
auto.offset.reset=latest
enable.auto.commit=false
max.poll.interval.ms=300000`,
    whyItMatters:
      "auto.offset.reset only applies when a group has no committed offset. With latest, a brand-new group starts after the existing backlog and never processes historical records. That is correct for tail-only consumers but dangerous for replay, ETL, and recovery jobs.",
  },
  "auto-offset-reset-none": {
    title: "auto.offset.reset=none throws on a new group with no commits",
    example: `# consumer
group.id=orders-reader
auto.offset.reset=none
enable.auto.commit=false
max.poll.interval.ms=300000`,
    whyItMatters:
      "The none setting turns missing offsets into an explicit failure. That can be useful for strict deployments, but it surprises services that expect first-start bootstrap behavior. Operators should choose it only when startup failure is the desired safety rail.",
  },
  "enable-auto-commit-true": {
    title: "enable.auto.commit=true risks data loss on processing failures",
    example: `# consumer
group.id=orders-reader
enable.auto.commit=true
auto.offset.reset=earliest
max.poll.records=500`,
    whyItMatters:
      "Auto commit records progress on a timer rather than after business logic succeeds. If a process crashes after the offset is committed but before side effects finish, Kafka will not redeliver those records to the group. Manual commits align offset advancement with successful processing.",
  },
  "max-poll-interval-low": {
    title: "max.poll.interval.ms is short for any non-trivial processing",
    example: `# consumer
group.id=orders-worker
max.poll.interval.ms=30000
enable.auto.commit=false
auto.offset.reset=earliest`,
    whyItMatters:
      "max.poll.interval.ms is the upper bound between poll calls before the group considers a member stuck. Short values make slow batches, GC pauses, or downstream calls trigger unnecessary rebalances. Set it above realistic worst-case processing time.",
  },
  "session-timeout-vs-heartbeat": {
    title: "heartbeat.interval.ms should be approximately 1/3 of session.timeout.ms",
    example: `# consumer
group.id=orders-worker
session.timeout.ms=10000
heartbeat.interval.ms=4000
enable.auto.commit=false`,
    whyItMatters:
      "Heartbeats prove that a consumer is still alive between polls. If the heartbeat interval is too close to the session timeout, one delayed heartbeat can evict a healthy member. A roughly one-third ratio leaves room for jitter without making failure detection too slow.",
  },
  "partition-assignment-strategy-range": {
    title: "RangeAssignor without sticky/cooperative companion",
    example: `# consumer
group.id=orders-reader
partition.assignment.strategy=org.apache.kafka.clients.consumer.RangeAssignor
enable.auto.commit=false
auto.offset.reset=earliest`,
    whyItMatters:
      "The range assignor can concentrate partitions unevenly when consumers subscribe to multiple topics. It also lacks the cooperative behavior that avoids full stop-the-world revokes during membership changes. Modern groups usually get smoother operations from CooperativeStickyAssignor.",
  },
  "fetch-min-bytes-too-low": {
    title: "fetch.min.bytes=1 (default) burns broker CPU on low-rate topics",
    example: `# consumer
group.id=orders-reader
fetch.min.bytes=1
fetch.max.wait.ms=500
enable.auto.commit=false`,
    whyItMatters:
      "A fetch minimum of one byte lets the broker return tiny responses immediately. On low-rate topics that can create a steady stream of small fetches and context switching. Raising fetch.min.bytes with a reasonable wait time lets the broker batch responses.",
  },
  "plaintext-listener-in-prod": {
    title: "PLAINTEXT listeners with no SSL/SASL alternative",
    example: `# broker
broker.id=1
listeners=PLAINTEXT://:9092
advertised.listeners=PLAINTEXT://broker:9092
security.inter.broker.protocol=PLAINTEXT`,
    whyItMatters:
      "PLAINTEXT exposes Kafka traffic and credentials to anyone who can observe the network path. Without an SSL or SASL listener, clients have no secure option to migrate toward. Production clusters should encrypt and authenticate both client and broker traffic.",
  },
  "ssl-endpoint-identification-disabled": {
    title: "ssl.endpoint.identification.algorithm disabled — MITM possible",
    example: `# client
security.protocol=SSL
ssl.truststore.location=/etc/kafka/truststore.jks
ssl.endpoint.identification.algorithm=
bootstrap.servers=kafka:9093`,
    whyItMatters:
      "TLS without hostname verification still trusts any certificate signed by the configured CA. That opens the door for a valid but wrong certificate to impersonate a broker. Keeping endpoint identification enabled makes the client verify it reached the intended host.",
  },
  "allow-everyone-if-no-acl-true": {
    title: "allow.everyone.if.no.acl.found=true defeats the ACL system",
    example: `# broker
authorizer.class.name=kafka.security.authorizer.AclAuthorizer
allow.everyone.if.no.acl.found=true
super.users=User:admin
listeners=SSL://:9093`,
    whyItMatters:
      "This setting makes missing ACLs mean allow instead of deny. A newly created topic, forgotten resource, or typo can become accessible to every authenticated principal. Secure clusters should fail closed and grant access intentionally.",
  },
  "super-users-empty": {
    title: "authorizer enabled with no super.users configured",
    example: `# broker
authorizer.class.name=kafka.security.authorizer.AclAuthorizer
super.users=
allow.everyone.if.no.acl.found=false
listeners=SSL://:9093`,
    whyItMatters:
      "When the authorizer is enabled, administrative tooling is subject to ACLs too. Without a break-glass super user, routine operations can lock themselves out during ACL mistakes. Configure a tightly controlled principal for cluster administration.",
  },
  "transactional-id-fixed": {
    title: "transactional.id looks generated per-run, defeating fencing",
    example: `# producer
transactional.id=random-7f2a
enable.idempotence=true
acks=all
max.in.flight.requests.per.connection=5`,
    whyItMatters:
      "Transactions rely on a stable transactional.id to fence old producer instances. If a new random ID is minted on every restart, Kafka cannot tell that an earlier process is a zombie for the same logical writer. Use a deterministic ID derived from the shard, pod, or host identity.",
  },
  "transaction-state-rf-low": {
    title: "transaction.state.log.replication.factor < 3",
    example: `# broker
transaction.state.log.replication.factor=2
transaction.state.log.min.isr=2
default.replication.factor=3
min.insync.replicas=2`,
    whyItMatters:
      "The internal transaction state topic coordinates producer epochs and transaction completion. If it loses availability or data, every transactional workload can stall or fail. Replicating it like other critical internal topics protects exactly-once processing.",
  },
  "offsets-topic-rf-low": {
    title: "offsets.topic.replication.factor < 3",
    example: `# broker
offsets.topic.replication.factor=2
default.replication.factor=3
min.insync.replicas=2
auto.create.topics.enable=false`,
    whyItMatters:
      "__consumer_offsets stores committed positions for every consumer group. If that topic is under-replicated, broker loss can erase commit history and force unexpected replay or gaps in operational visibility. Treat it as production-critical metadata.",
  },
};
