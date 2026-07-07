export interface Cheatsheet {
  slug: string;
  title: string;
  oneliner: string;
  keySettings: Array<{
    key: string;
    typicalValue: string;
    note: string;
    dangerIfWrong?: string;
  }>;
  heuristics: string[];
  dangerList: string[];
  relatedRules: string[];
  relatedScenarios?: string[];
}

export const cheatsheets: Cheatsheet[] = [
  {
    slug: "isr-and-acks",
    title: "ISR mechanics and acks semantics",
    oneliner:
      "Durable Kafka writes come from matching replication.factor, min.insync.replicas, and producer acks to the failure budget you actually need.",
    keySettings: [
      {
        key: "replication.factor",
        typicalValue: "3",
        note: "Three replicas let one broker disappear while the partition still has two copies to form a write quorum.",
        dangerIfWrong:
          "RF=1 loses availability and durability on one broker loss; RF=2 cannot keep min.insync.replicas=2 after a failure.",
      },
      {
        key: "min.insync.replicas",
        typicalValue: "2 for RF=3",
        note: "With acks=all, the leader only acknowledges after at least this many ISR replicas have the record.",
        dangerIfWrong:
          "Leaving it at 1 makes acks=all behave like acks=1 for durability while keeping the latency cost.",
      },
      {
        key: "acks",
        typicalValue: "all",
        note: "Use all for data you cannot cheaply recreate; pair it with idempotence on producers.",
        dangerIfWrong:
          "acks=0 hides failures; acks=1 can lose acknowledged writes if the leader dies before followers catch up.",
      },
      {
        key: "unclean.leader.election.enable",
        typicalValue: "false",
        note: "Keeps Kafka from electing an out-of-sync replica when the last clean ISR is gone.",
        dangerIfWrong:
          "true can silently truncate acknowledged records and reuse offsets for different data.",
      },
      {
        key: "replica.lag.time.max.ms",
        typicalValue: "10000",
        note: "Follower lag beyond this window removes the follower from ISR until it catches up.",
        dangerIfWrong:
          "Too low churns ISR during benign pauses; too high keeps stale replicas eligible for acknowledgements too long.",
      },
    ],
    heuristics: [
      "Production default: RF=3, min.insync.replicas=2, acks=all, idempotence=true.",
      "Treat ISR shrink as a write-capacity event, not just a replication metric.",
      "The high watermark advances at the slowest in-sync replica, so one laggy ISR member can gate consumers.",
      "acks=all is only as strong as min.insync.replicas; validate both together.",
      "Prefer rejecting writes over accepting writes with fewer durable copies than your SLO allows.",
      "Alert on under-min-ISR partitions and offline partitions separately; they mean different operator actions.",
    ],
    dangerList: [
      "acks=all + min.insync.replicas=1 is the classic false sense of safety.",
      "Auto-created topics inherit weak broker defaults unless you provision RF and min ISR explicitly.",
      "A follower that repeatedly leaves ISR usually points to disk, GC, or network saturation on that broker.",
      "Raising replica.lag.time.max.ms can mask a bad follower instead of fixing the replication bottleneck.",
    ],
    relatedRules: [
      "acks-all-with-min-isr-1",
      "replication-factor-too-low",
      "unclean-leader-election",
      "enable-idempotence-vs-acks",
    ],
    relatedScenarios: ["isr-shrink", "quorum-loss", "network-partition"],
  },
  {
    slug: "unclean-leader-election",
    title: "Quorum loss and unclean leader election",
    oneliner:
      "Unclean leader election is an explicit availability-over-durability switch for the moment no in-sync replica is alive.",
    keySettings: [
      {
        key: "unclean.leader.election.enable",
        typicalValue: "false",
        note: "When false, Kafka keeps the partition offline until a replica from the last ISR returns.",
        dangerIfWrong:
          "true may elect a stale replica, truncate acknowledged records, and produce divergent downstream state.",
      },
      {
        key: "min.insync.replicas",
        typicalValue: "2 for RF=3",
        note: "Defines the committed write quorum that must survive for clean failover to preserve acknowledged records.",
        dangerIfWrong:
          "Too low lets writes commit with too few copies; too high can reject writes during routine maintenance.",
      },
      {
        key: "replication.factor",
        typicalValue: "3+",
        note: "Sets how many physical copies can participate in ISR and future clean elections.",
        dangerIfWrong:
          "RF=1 has no clean failover path; RF=2 has almost no maintenance margin with min ISR 2.",
      },
      {
        key: "kafka-leader-election --election-type UNCLEAN",
        typicalValue: "manual only",
        note: "Prefer a deliberate break-glass command over enabling automatic unclean election cluster-wide.",
        dangerIfWrong:
          "An always-on unsafe election can fire during exactly the incidents where you most need auditability.",
      },
    ],
    heuristics: [
      "Default to false for every topic whose source of truth is Kafka.",
      "Only consider unclean election for replayable ingest streams with a documented loss budget.",
      "If a partition is offline, recover a broker from the last ISR before touching unclean election.",
      "Page on offline partitions; a healthy broker count can still hide a dead partition quorum.",
      "Record the leader epoch and last stable offset before any manual unclean election.",
      "After recovery, expect stale replicas to truncate to the elected leader epoch and refetch.",
    ],
    dangerList: [
      "Downstream consumers may have already acted on offsets that disappear after an unclean election.",
      "The same offset can later contain different data, which breaks audit trails and idempotent sinks.",
      "Turning the setting on globally makes a rare emergency tradeoff the default behavior.",
      "A stale replica can look healthy at the broker level while being unusable for safe leadership.",
    ],
    relatedRules: [
      "unclean-leader-election",
      "replication-factor-too-low",
      "acks-all-with-min-isr-1",
    ],
    relatedScenarios: ["quorum-loss", "network-partition"],
  },
  {
    slug: "consumer-rebalance",
    title: "Consumer group rebalances — eager vs cooperative",
    oneliner:
      "Rebalance pain is controlled by how often members look dead and how much assignment state they must revoke when membership changes.",
    keySettings: [
      {
        key: "partition.assignment.strategy",
        typicalValue: "CooperativeStickyAssignor",
        note: "Uses incremental cooperative rebalancing so unchanged partitions keep processing during member changes.",
        dangerIfWrong:
          "Eager assignors revoke every partition and create stop-the-world pauses on each restart or scale event.",
      },
      {
        key: "session.timeout.ms",
        typicalValue: "30000-45000",
        note: "Coordinator removes a member when heartbeats are absent for this long; tune above normal GC and network jitter.",
        dangerIfWrong:
          "Too low causes churn; too high delays real failure detection and replacement.",
      },
      {
        key: "heartbeat.interval.ms",
        typicalValue: "~1/3 session.timeout.ms",
        note: "Keep enough heartbeat attempts inside the session window for one missed beat not to eject the member.",
        dangerIfWrong:
          "Heartbeat intervals too close to the timeout make tiny pauses look like member failures.",
      },
      {
        key: "max.poll.interval.ms",
        typicalValue: "> slowest batch time",
        note: "Upper bound between poll calls before Kafka assumes the application is wedged.",
        dangerIfWrong:
          "Long processing, model calls, or sink retries beyond this interval trigger a rebalance mid-work.",
      },
      {
        key: "group.instance.id",
        typicalValue: "stable per pod/VM",
        note: "Enables static membership so quick restarts keep the same logical member slot.",
        dangerIfWrong:
          "Random IDs disable static membership; duplicate IDs fence each other.",
      },
    ],
    heuristics: [
      "Migrate to cooperative-sticky in two rolls: add it after the old assignor, then make it the only assignor.",
      "Set max.poll.interval.ms from measured p99 processing time, not wishful service latency.",
      "Use static membership for Kubernetes StatefulSets or stable VM consumers; skip it for ephemeral autoscaled jobs.",
      "Log partition revoke and assign callbacks with generation, member id, and duration.",
      "Pause partitions or reduce max.poll.records for slow work; do not let poll starve heartbeats.",
      "A rebalance is a symptom; correlate it with deploys, GC, sink latency, and broker coordinator logs.",
    ],
    dangerList: [
      "Rolling a cooperative assignor directly into an eager-only group can fail the migration or keep using the old protocol.",
      "Auto-commit can commit offsets for work that later fails during a rebalance.",
      "One slow member can repeatedly miss max.poll.interval.ms and make the whole group churn.",
      "Range assignment across multiple topics can overload the first consumers and hide as consumer lag.",
    ],
    relatedRules: [
      "max-poll-interval-low",
      "session-timeout-vs-heartbeat",
      "partition-assignment-strategy-range",
      "auto-offset-reset-latest",
      "enable-auto-commit-true",
    ],
    relatedScenarios: ["slow-consumer"],
  },
  {
    slug: "partition-assignment",
    title: "Partition assignment strategies",
    oneliner:
      "Pick the assignor by balancing three forces: even load, partition stickiness, and whether rebalances revoke everything or only what moves.",
    keySettings: [
      {
        key: "RangeAssignor",
        typicalValue: "legacy compatibility",
        note: "Assigns contiguous partition ranges per topic; deterministic but often imbalanced across consumers and topics.",
        dangerIfWrong:
          "Multi-topic subscribers can pile low-numbered partitions onto the same consumers.",
      },
      {
        key: "RoundRobinAssignor",
        typicalValue: "stateless legacy groups",
        note: "Spreads partitions evenly across consumers with at most one partition difference.",
        dangerIfWrong:
          "No stickiness means stateful consumers rebuild caches or RocksDB stores after ordinary membership changes.",
      },
      {
        key: "StickyAssignor",
        typicalValue: "stateful eager groups",
        note: "Preserves previous ownership while balancing load; still uses eager revoke-all protocol.",
        dangerIfWrong:
          "Partitions move less often, but every rebalance still pauses all partitions first.",
      },
      {
        key: "CooperativeStickyAssignor",
        typicalValue: "modern default",
        note: "Sticky assignment plus cooperative incremental revocation; best default for Kafka 3.x consumer groups.",
        dangerIfWrong:
          "Unsafe migrations can mix incompatible assignor lists and cause repeated group failures.",
      },
    ],
    heuristics: [
      "New group on modern Kafka: start with CooperativeStickyAssignor.",
      "Stateful eager group: move Range/RoundRobin → Sticky → CooperativeSticky with a rolling migration.",
      "Single-topic, stateless, legacy group: RoundRobin is acceptable when cooperative is unavailable.",
      "Range is compatibility, not optimization; prove you need it before keeping it.",
      "Custom assignors must be deterministic pure functions of coordinator inputs.",
      "Balance is partitions per consumer; stability is partitions that do not move across generations.",
    ],
    dangerList: [
      "Different assignor lists across members can make the group pick an old protocol unexpectedly.",
      "Sticky assignment does not remove stop-the-world pauses unless it is cooperative-sticky.",
      "Custom assignors that use randomness, clocks, or external calls can split-brain the group.",
      "Increasing partitions changes the assignment shape and can trigger state movement even with sticky assignors.",
    ],
    relatedRules: [
      "partition-assignment-strategy-range",
      "session-timeout-vs-heartbeat",
      "max-poll-interval-low",
    ],
    relatedScenarios: ["slow-consumer"],
  },
  {
    slug: "controller-and-metadata",
    title: "The controller, broker registration, and metadata propagation",
    oneliner:
      "The controller is Kafka's metadata log leader: it elects partition leaders, fences stale brokers, and lets clients converge through metadata refreshes.",
    keySettings: [
      {
        key: "process.roles",
        typicalValue: "broker or controller",
        note: "KRaft clusters can run dedicated controllers or combined broker/controller nodes; dedicated roles isolate metadata quorum load.",
        dangerIfWrong:
          "Combined mode is simpler but lets broker resource pressure affect controller responsiveness.",
      },
      {
        key: "controller.quorum.voters",
        typicalValue: "3 or 5 controllers",
        note: "Static voter set for the KRaft Raft quorum; needs a majority to elect the active controller.",
        dangerIfWrong:
          "Wrong IDs or endpoints prevent controller election and strand the cluster without metadata leadership.",
      },
      {
        key: "broker.heartbeat.interval.ms",
        typicalValue: "2000",
        note: "How often brokers heartbeat to the controller after registration.",
        dangerIfWrong:
          "Too slow delays failure signals; too aggressive can add noise during controller pressure.",
      },
      {
        key: "broker.session.timeout.ms",
        typicalValue: "9000",
        note: "Missed heartbeat window before the controller fences the broker and starts leader election.",
        dangerIfWrong:
          "Too low fences brokers during transient pauses; too high prolongs partitions led by dead brokers.",
      },
      {
        key: "leader epoch",
        typicalValue: "monotonic per partition",
        note: "Epochs fence stale leaders and tell followers where to truncate after failover.",
        dangerIfWrong:
          "Ignoring epoch errors in clients can mask real leader churn; manual log surgery risks divergence.",
      },
    ],
    heuristics: [
      "Use KRaft for new clusters; ZooKeeper-era controller behavior is legacy context only.",
      "Run an odd number of controllers across failure domains; three tolerates one controller loss.",
      "Keep controllers out of the produce/fetch hot path when cluster size or partition count is large.",
      "Metadata refresh errors are usually convergence noise after a leader move; persistent loops mean broker or listener config drift.",
      "Controller CPU affects topic creation, reassignment, and failover speed, not steady-state produce throughput.",
      "Treat FencedLeaderEpochException as a refresh-and-retry signal unless it repeats with broker flapping.",
    ],
    dangerList: [
      "Misconfigured advertised.listeners makes metadata look valid but routes clients to unreachable brokers.",
      "Controller quorum loss stops metadata changes even if brokers with data are still alive.",
      "Co-located controllers can starve under broker disk or network pressure during the same incident they must resolve.",
      "Stale metadata in clients explains one failed request; it should not explain minutes of produce failures.",
    ],
    relatedRules: [
      "auto-leader-rebalance-disabled",
      "broker-id-vs-cluster-id",
      "num-partitions-too-many",
      "replication-factor-too-low",
    ],
    relatedScenarios: ["network-partition", "quorum-loss", "isr-shrink"],
  },
  {
    slug: "exactly-once",
    title: "Exactly-once semantics and the transaction coordinator",
    oneliner:
      "Kafka EOS is idempotent per-partition retry safety plus transactional visibility and offset commits for Kafka-to-Kafka workflows.",
    keySettings: [
      {
        key: "enable.idempotence",
        typicalValue: "true",
        note: "Adds producer IDs and sequence numbers so broker-side duplicate retries are accepted once.",
        dangerIfWrong:
          "false lets retry-after-timeout create duplicate records for the same logical send.",
      },
      {
        key: "transactional.id",
        typicalValue: "stable per producer instance",
        note: "Registers the producer with the transaction coordinator and fences older epochs for that ID.",
        dangerIfWrong:
          "Random IDs defeat fencing; shared IDs between live instances fence each other.",
      },
      {
        key: "isolation.level",
        typicalValue: "read_committed",
        note: "Consumers skip aborted and in-flight transactional records when reading EOS output topics.",
        dangerIfWrong:
          "read_uncommitted can expose records from transactions that later abort.",
      },
      {
        key: "transaction.timeout.ms",
        typicalValue: "60000-300000",
        note: "Coordinator aborts transactions that stay open past this timeout; must cover processing plus commit latency.",
        dangerIfWrong:
          "Too low aborts healthy slow transactions; too high leaves locks and in-flight visibility gaps around longer.",
      },
      {
        key: "max.in.flight.requests.per.connection",
        typicalValue: "≤5 with idempotence",
        note: "Kafka's idempotent producer preserves ordering with up to five in-flight batches per connection.",
        dangerIfWrong:
          ">5 is invalid or unsafe with idempotence depending on client vintage.",
      },
      {
        key: "transaction.state.log.replication.factor",
        typicalValue: "3",
        note: "Replication factor for the compacted internal transaction coordinator state topic.",
        dangerIfWrong:
          "Low RF makes coordinator state a single point of failure for every transactional.id on that partition.",
      },
    ],
    heuristics: [
      "Enable idempotence for almost every producer; use transactions only when atomic multi-partition writes or offset commits matter.",
      "EOS does not make Kafka + an external database atomic; use idempotent sinks or outbox/CDC.",
      "Commit small, bounded batches; one producer cannot pipeline multiple open transactions.",
      "Always disable consumer auto-commit in consume-process-produce transactions.",
      "Name transactional.id from stable workload identity plus shard, not a restart-time UUID.",
      "Scale EOS throughput by sharding producers and coordinator load, not by one giant transaction.",
    ],
    dangerList: [
      "A zombie producer with the same transactional.id is fenced; that is correctness, not a transient warning to ignore.",
      "read_committed consumers can appear to lag behind high watermark while waiting for open transactions to finish.",
      "Long transactions amplify coordinator load and keep consumers from seeing records promptly.",
      "External side effects inside a Kafka transaction still need their own idempotency key.",
    ],
    relatedRules: [
      "enable-idempotence-vs-acks",
      "transactional-id-fixed",
      "transaction-state-rf-low",
      "enable-auto-commit-true",
    ],
  },
  {
    slug: "log-compaction",
    title: "Log compaction internals",
    oneliner:
      "Compaction keeps the latest value per key, but only after segments roll and tombstones live long enough for every stateful consumer to see deletes.",
    keySettings: [
      {
        key: "cleanup.policy",
        typicalValue: "compact",
        note: "Enables LogCleaner rewriting so only the newest record per key survives; can combine with delete for bounded history.",
        dangerIfWrong:
          "Using delete for state topics loses latest state; using compact for event history erases historical events by key.",
      },
      {
        key: "min.cleanable.dirty.ratio",
        typicalValue: "0.5 (0.2 aggressive)",
        note: "Cleaner waits until this fraction of the log contains superseded records before compacting.",
        dangerIfWrong:
          "Too high bloats restore time; too low burns cleaner CPU and IO.",
      },
      {
        key: "segment.ms",
        typicalValue: "21600000 for low-volume state",
        note: "Compaction never touches the active segment, so low-write topics need time-based rolls.",
        dangerIfWrong:
          "Default 7 days can make small compacted topics appear never to compact.",
      },
      {
        key: "delete.retention.ms",
        typicalValue: "86400000",
        note: "Tombstones remain readable for this window before the cleaner can remove them.",
        dangerIfWrong:
          "Too low lets slow rebuilders miss deletes and resurrect stale local state.",
      },
      {
        key: "tombstone value",
        typicalValue: "null",
        note: "A null value for a key is the delete marker in a compacted topic.",
        dangerIfWrong:
          "A missing field, empty JSON object, or string 'null' is not a Kafka tombstone.",
      },
    ],
    heuristics: [
      "Compaction is not immediate; design consumers to handle superseded records and missing keys.",
      "For low-volume compacted topics, tune segment.ms/segment.bytes first, then dirty ratio.",
      "Use compact,delete when you need latest-per-key plus an absolute age boundary.",
      "Keep keys stable and small; compaction is only meaningful when logical identity maps to the same key.",
      "State rebuilders must be idempotent: value upserts, tombstone deletes, missing key means absent.",
      "Leave Kafka internal compacted topics alone unless you know the coordinator impact.",
    ],
    dangerList: [
      "Active segments are immune to cleaning; no segment roll means no compaction progress.",
      "Tombstones disappear after delete.retention.ms, so late consumers may never see the delete event.",
      "Key schema changes can strand old keys forever because the cleaner sees different bytes.",
      "Compaction preserves order only within the retained log, not a complete audit history.",
    ],
    relatedRules: [
      "compacted-topic-segment-ms-default",
      "compact-and-delete-mixed",
      "min-cleanable-dirty-ratio-too-high",
      "delete-retention-ms-too-low",
    ],
  },
  {
    slug: "kafka-for-ai",
    title: "Kafka for AI engineers — RAG ingestion, agent traces, embeddings",
    oneliner:
      "Kafka earns its place in AI systems when you need durable replay, fan-out, backpressure, and ordered traces—not synchronous chat latency.",
    keySettings: [
      {
        key: "partition key: document_id",
        typicalValue: "RAG chunks",
        note: "Keeps all chunks for one document ordered and local so embedders can preserve context-window relationships.",
        dangerIfWrong:
          "Random chunk keys destroy locality and make per-document replay or dedupe harder.",
      },
      {
        key: "partition key: tenant_id",
        typicalValue: "multi-tenant RAG",
        note: "Groups a tenant's ingest so consumers can enforce tenant-level rate limits and replay boundaries.",
        dangerIfWrong:
          "Large tenants become hot keys; shard intentionally if one tenant dominates traffic.",
      },
      {
        key: "retention.ms",
        typicalValue: "days to weeks",
        note: "Keep raw ingest long enough to re-embed after model, chunker, or metadata changes.",
        dangerIfWrong:
          "Too short turns model upgrades into source-system re-ingest projects.",
      },
      {
        key: "cleanup.policy",
        typicalValue: "delete for events, compact for state",
        note: "Trace timelines and ingest are append-only; latest run state, eval verdicts, and schema registries are compacted.",
        dangerIfWrong:
          "Compacting raw traces erases audit history; deleting state topics loses current status.",
      },
      {
        key: "schema.version",
        typicalValue: "explicit vN field/topic",
        note: "Version event contracts so embedders, evals, and sinks can roll independently.",
        dangerIfWrong:
          "Silent schema drift breaks long-lived replays and offline training joins.",
      },
      {
        key: "compression.type",
        typicalValue: "zstd",
        note: "Text-heavy prompts, chunks, and traces compress well and are read by many downstream consumers.",
        dangerIfWrong:
          "No compression turns every replay and fan-out into avoidable broker and network load.",
      },
    ],
    heuristics: [
      "Use Kafka off the request path: ingest, trace, evaluate, re-embed, and materialize features asynchronously.",
      "Key by the unit that must stay ordered: document, tenant, agent_run_id, or feature entity.",
      "Keep raw input topics immutable; write derived embeddings/results to versioned output topics.",
      "Separate operational retention from eval/training retention; not every trace needs to live for months.",
      "Plan DLQs by model and failure class so poison records do not block clean partitions.",
      "If a one-shot script finishes faster than the platform review, do not build Kafka for it.",
    ],
    dangerList: [
      "Putting synchronous chat turns through Kafka adds latency without improving the user response path.",
      "Embedding APIs are expensive; losing ingest events usually costs more than acks=all latency.",
      "PII in prompts and tool outputs makes retention a compliance setting, not just a storage setting.",
      "A single model or tenant hot key can underutilize a large consumer group.",
    ],
    relatedRules: [
      "enable-idempotence-vs-acks",
      "compression-type-none",
      "linger-ms-too-low",
      "batch-size-tiny",
      "max-poll-interval-low",
      "fetch-min-bytes-too-low",
    ],
    relatedScenarios: ["slow-consumer"],
  },
  {
    slug: "embedding-backpressure",
    title: "Backpressure in embedding pipelines",
    oneliner:
      "Embedding backpressure is the mismatch between fast text producers, GPU batch economics, and slower vector sinks; make that pressure visible and bounded.",
    keySettings: [
      {
        key: "max.poll.records",
        typicalValue: "1-64",
        note: "Set from model batch size and per-record latency; high enough for GPU efficiency, low enough to finish before poll timeout.",
        dangerIfWrong:
          "Huge polls create memory spikes and long uncommitted batches; tiny polls starve the GPU.",
      },
      {
        key: "max.poll.interval.ms",
        typicalValue: "900000 for slow models",
        note: "Must exceed worst-case encode plus vector upsert for one poll batch.",
        dangerIfWrong:
          "The group kicks out healthy embedders while they are still processing expensive records.",
      },
      {
        key: "fetch.min.bytes / fetch.max.wait.ms",
        typicalValue: "1MiB / 250ms",
        note: "Lets brokers batch enough text for efficient GPU work while capping added latency.",
        dangerIfWrong:
          "Defaults can create many tiny fetches; oversized waits inflate p95 record latency.",
      },
      {
        key: "linger.ms / batch.size",
        typicalValue: "20ms / 131072",
        note: "Producer-side batching makes text ingest cheaper without hurting asynchronous pipelines.",
        dangerIfWrong:
          "linger=0 and tiny batches waste broker CPU, compression, and network bandwidth.",
      },
      {
        key: "DLQ topic",
        typicalValue: "embeddings.dlq.v1",
        note: "Poison records and exhausted vector upsert retries move aside with error metadata.",
        dangerIfWrong:
          "Infinite retries pin one partition and hide clean work behind a bad document.",
      },
    ],
    heuristics: [
      "Track three queues separately: Kafka lag, local pre-GPU queue, and vector sink retry queue.",
      "Sleep before polling more records; never sleep inside the encode call to fake backpressure.",
      "Pause hot partitions instead of leaving the group when one tenant or model floods traffic.",
      "Split topics or groups by model when latency and batch-size curves differ materially.",
      "Commit only after durable vector upsert or an explicit DLQ write.",
      "Optimize for GPU utilization and p95 record latency together; either metric alone lies.",
    ],
    dangerList: [
      "A vector DB rate limit can masquerade as a Kafka consumer problem.",
      "Batch OOMs usually need dynamic split-and-retry, not blind process restarts.",
      "A poison tokenizer input should not keep being retried in the source partition forever.",
      "Autoscaling consumers without more GPU or sink quota simply moves the bottleneck.",
    ],
    relatedRules: [
      "max-poll-interval-low",
      "fetch-min-bytes-too-low",
      "linger-ms-too-low",
      "batch-size-tiny",
      "enable-idempotence-vs-acks",
    ],
    relatedScenarios: ["slow-consumer"],
  },
  {
    slug: "agent-traces",
    title: "Agent traces as Kafka topics",
    oneliner:
      "Model every agent run as an ordered event stream keyed by run id, with compacted companion state for fast current-status lookups.",
    keySettings: [
      {
        key: "event topic key",
        typicalValue: "agent_run_id",
        note: "All events for a run land in one partition, preserving total order for reconstruction and replay.",
        dangerIfWrong:
          "Keying by event kind or tool name turns one run into a cross-partition join.",
      },
      {
        key: "agent-events cleanup.policy",
        typicalValue: "delete",
        note: "Append-only timeline keeps thoughts, calls, observations, retries, and final events for audit/debug replay.",
        dangerIfWrong:
          "Compaction can erase intermediate evidence needed for evaluation or incident review.",
      },
      {
        key: "agent-state cleanup.policy",
        typicalValue: "compact",
        note: "Latest status per run answers 'what is this agent doing now?' without scanning the timeline.",
        dangerIfWrong:
          "Delete-only state topics lose current run status; uncompacted state grows with every heartbeat.",
      },
      {
        key: "retention.ms",
        typicalValue: "7d ops / 90d eval",
        note: "Use separate operational and evaluation topics when retention, privacy, or cost requirements differ.",
        dangerIfWrong:
          "Long raw retention can keep PII and tool outputs beyond policy; short eval retention breaks offline scoring.",
      },
      {
        key: "payload reference",
        typicalValue: "content-addressed blob URI",
        note: "Store large screenshots, PDFs, and tool arguments outside Kafka; put immutable references in events.",
        dangerIfWrong:
          "Oversized messages stress brokers and make every replay drag large blobs through the log.",
      },
    ],
    heuristics: [
      "Start with one event topic using a kind field; split by purpose or retention, not by every event type.",
      "Use a monotonic seq per run and reject duplicate or out-of-order producer bugs in the trace writer.",
      "Write corrections as new events; do not mutate the historical trace topic.",
      "Redact or tokenize tool observations before they enter long-retention topics.",
      "Use compacted state for dashboards and append-only events for debugging and training data.",
      "If one run becomes a hot key, shard by explicit phase and record phase boundaries.",
    ],
    dangerList: [
      "Separating thoughts, tools, and errors into different topics makes replay ordering a join problem.",
      "Raw tool outputs often contain customer data; retention defaults can become a privacy incident.",
      "Compacted topics need tombstone handling for deletion workflows and state cleanup.",
      "Huge reasoning payloads can exceed broker limits unless producers cap and externalize content.",
    ],
    relatedRules: [
      "compacted-topic-segment-ms-default",
      "min-cleanable-dirty-ratio-too-high",
      "delete-retention-ms-too-low",
      "compression-type-none",
      "num-partitions-too-many",
    ],
  },
];
