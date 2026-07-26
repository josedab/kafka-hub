export type LearnArticleSlug =
  | "consumer-rebalance"
  | "controller-and-metadata"
  | "exactly-once"
  | "isr-and-acks"
  | "log-compaction"
  | "unclean-leader-election";

export type GlossaryTerm = {
  id: string;
  name: string;
  expansion: string;
  oneLiner: string;
  articleSlug?: LearnArticleSlug;
  articleSlugs: readonly LearnArticleSlug[];
  definition: readonly string[];
};

export const learnArticleTitles = {
  "consumer-rebalance": "Consumer group rebalances",
  "controller-and-metadata": "The controller and metadata",
  "exactly-once": "Exactly-once semantics",
  "isr-and-acks": "ISR mechanics and acks semantics",
  "log-compaction": "Log compaction internals",
  "unclean-leader-election": "Quorum loss and unclean leader election",
} as const satisfies Record<LearnArticleSlug, string>;

export const glossaryTerms = [
  {
    id: "controller-epoch",
    name: "Controller epoch",
    expansion: "Monotonic cluster controller term counter",
    oneLiner:
      "The controller epoch increments on each controller election so brokers can reject stale metadata updates.",
    articleSlug: "controller-and-metadata",
    articleSlugs: ["controller-and-metadata"],
    definition: [
      "A controller epoch is the cluster-wide term that changes whenever the active controller changes.",
      "Brokers compare it on metadata updates and ignore older epochs, preventing split-brain controllers from overwriting newer state.",
    ],
  },
  {
    id: "dirty-ratio",
    name: "Dirty ratio",
    expansion: "Fraction of a log eligible for compaction",
    oneLiner:
      "Dirty ratio tells the LogCleaner how much obsolete data is waiting to be compacted.",
    articleSlug: "log-compaction",
    articleSlugs: ["log-compaction"],
    definition: [
      "The dirty ratio estimates how much of a compacted partition contains superseded records that could be removed.",
      "Kafka compares it with min.cleanable.dirty.ratio, compaction lag, and segment roll state to decide whether cleaning is worth the I/O.",
    ],
  },
  {
    id: "fencing",
    name: "Fencing",
    expansion: "Protocol that ignores writes from a stale producer or leader",
    oneLiner:
      "Fencing prevents zombie producers, brokers, or leaders from committing state after a newer epoch has taken over.",
    articleSlug: "exactly-once",
    articleSlugs: ["exactly-once", "controller-and-metadata"],
    definition: [
      "Fencing is Kafka's stale-owner defense: a broker, leader, or producer carrying an older epoch can keep talking, but its writes are rejected.",
      "It is what keeps transactional zombies and old leaders from corrupting state after failover.",
    ],
  },
  {
    id: "generation",
    name: "Generation",
    expansion: "Monotonic counter for each consumer group rebalance",
    oneLiner:
      "A generation identifies the current membership-and-assignment version of a consumer group.",
    articleSlug: "consumer-rebalance",
    articleSlugs: ["consumer-rebalance"],
    definition: [
      "The group coordinator increments the generation every time a consumer group completes a rebalance.",
      "Consumers include the generation in heartbeats and offset commits so stale members from an old assignment cannot keep committing progress.",
    ],
  },
  {
    id: "hw",
    name: "HW",
    expansion: "High Water Mark",
    oneLiner:
      "The high water mark is the highest offset replicated to the current ISR and visible to consumers.",
    articleSlug: "isr-and-acks",
    articleSlugs: ["isr-and-acks"],
    definition: [
      "HW is the committed frontier of a partition: consumers should not read beyond it because those records are not guaranteed to survive leader failover.",
      "It is derived from the slowest in-sync replica, so a lagging ISR member can hold back consumer visibility even while the leader has more data.",
    ],
  },
  {
    id: "isr",
    name: "ISR",
    expansion: "In-Sync Replica",
    oneLiner:
      "The ISR is the set of replicas caught up enough to participate in committed writes and clean leader election.",
    articleSlug: "isr-and-acks",
    articleSlugs: ["isr-and-acks"],
    definition: [
      "The in-sync replica set contains the leader and followers that have fetched recently enough to be considered durable copies of the partition.",
      "Producers using acks=all wait on the current ISR, and Kafka elects clean leaders from it when the leader fails.",
    ],
  },
  {
    id: "kraft",
    name: "KRaft",
    expansion: "Kafka Raft",
    oneLiner:
      "KRaft is Kafka's Raft-backed metadata quorum that replaced ZooKeeper for cluster coordination.",
    articleSlug: "controller-and-metadata",
    articleSlugs: ["controller-and-metadata"],
    definition: [
      "KRaft stores Kafka metadata in an internal Raft log instead of ZooKeeper.",
      "The active controller is the leader of that metadata quorum, and brokers learn cluster state by fetching the ordered metadata log.",
    ],
  },
  {
    id: "leader-epoch",
    name: "Leader epoch",
    expansion: "Monotonic per-partition leadership counter",
    oneLiner:
      "A leader epoch names a partition leader's term so followers and clients can detect stale leadership.",
    articleSlug: "controller-and-metadata",
    articleSlugs: ["controller-and-metadata", "unclean-leader-election"],
    definition: [
      "A leader epoch increments whenever leadership for a partition changes.",
      "Followers use it to truncate divergent tails after failover, and brokers reject fetches or writes that arrive with an older view of partition leadership.",
    ],
  },
  {
    id: "leo",
    name: "LEO",
    expansion: "Log End Offset",
    oneLiner:
      "The log end offset is the next offset a replica will assign or fetch after its current tail.",
    articleSlug: "isr-and-acks",
    articleSlugs: ["isr-and-acks"],
    definition: [
      "LEO is the offset just after the last record present on a replica, so it advances as that replica appends or fetches records.",
      "Different replicas can have different LEOs during replication lag, and the ISR/HW machinery decides which tail is actually committed.",
    ],
  },
  {
    id: "osr",
    name: "OSR",
    expansion: "Out-of-Sync Replica",
    oneLiner:
      "An out-of-sync replica has fallen far enough behind that Kafka removed it from the ISR.",
    articleSlug: "isr-and-acks",
    articleSlugs: ["isr-and-acks"],
    definition: [
      "OSR describes a follower that is still a replica of the partition but no longer counts toward committed writes because it has exceeded Kafka's lag threshold.",
      "It can rejoin the ISR after catching up, but while it is out of sync it is not a safe clean leader candidate.",
    ],
  },
  {
    id: "pid",
    name: "PID",
    expansion: "Producer ID",
    oneLiner:
      "A PID is the broker-assigned identity Kafka uses to recognize retries from an idempotent producer.",
    articleSlug: "exactly-once",
    articleSlugs: ["exactly-once"],
    definition: [
      "The broker assigns a producer ID when an idempotent producer starts, and the producer stamps it on produce requests.",
      "Combined with per-partition sequence numbers and epochs, the PID lets brokers accept legitimate retries while rejecting duplicates or fenced writers.",
    ],
  },
  {
    id: "rebalance",
    name: "Rebalance",
    expansion: "Partition reassignment across consumers in a group",
    oneLiner:
      "A rebalance is the stop-and-reassign protocol that maps topic partitions to current group members.",
    articleSlug: "consumer-rebalance",
    articleSlugs: ["consumer-rebalance"],
    definition: [
      "A rebalance happens when group membership or subscribed topic partitions change, forcing the coordinator to compute a new assignment.",
      "Eager rebalances revoke everything, while cooperative rebalances move only the partitions that actually need to change owners.",
    ],
  },
  {
    id: "segment",
    name: "Segment",
    expansion: "Append-only file backing a portion of a partition's log",
    oneLiner:
      "A segment is one rolled chunk of a partition log that retention and compaction can manage independently.",
    articleSlug: "log-compaction",
    articleSlugs: ["log-compaction"],
    definition: [
      "Kafka stores each partition log as a sequence of segment files rather than one ever-growing file.",
      "The active segment receives appends and is not compacted; older rolled segments are where deletion and compaction do most of their work.",
    ],
  },
  {
    id: "sequence-number",
    name: "Sequence number",
    expansion: "Per-partition counter the broker uses to deduplicate idempotent writes",
    oneLiner:
      "Sequence numbers let the broker distinguish a retry from a new idempotent write on each partition.",
    articleSlug: "exactly-once",
    articleSlugs: ["exactly-once"],
    definition: [
      "An idempotent producer increments a sequence number independently for each partition it writes to.",
      "The broker tracks recent sequences per PID and partition, accepting the next expected write and treating already-seen sequences as safe duplicates.",
    ],
  },
  {
    id: "tombstone",
    name: "Tombstone",
    expansion: "Null-valued record marking a key for deletion in a compacted topic",
    oneLiner:
      "A tombstone is a null value for a key that tells compaction to delete that key's latest value.",
    articleSlug: "log-compaction",
    articleSlugs: ["log-compaction"],
    definition: [
      "In a compacted topic, a record with a key and value=null marks that key as deleted.",
      "Kafka keeps the tombstone for delete.retention.ms so consumers can observe the delete, then the cleaner can remove both the tombstone and older values.",
    ],
  },
  {
    id: "transactional-id",
    name: "Transactional ID",
    expansion: "Durable identity for a transactional producer",
    oneLiner:
      "A transactional ID binds producer restarts to durable transaction state so Kafka can fence zombies.",
    articleSlug: "exactly-once",
    articleSlugs: ["exactly-once"],
    definition: [
      "A transactional.id is the stable name a transactional producer registers with the transaction coordinator.",
      "On restart, initTransactions uses that identity to recover or fence previous epochs so only the current logical producer can commit.",
    ],
  },
  {
    id: "watermark",
    name: "Watermark",
    expansion: "High Water Mark",
    oneLiner:
      "Watermark is the consumer-visible committed offset frontier, usually used as a synonym for HW.",
    articleSlug: "isr-and-acks",
    articleSlugs: ["isr-and-acks"],
    definition: [
      "In Kafka replication discussions, watermark usually means the high water mark: the offset boundary up to which records are considered committed and fetchable.",
      "It advances only as the ISR proves durability, which is why a slow in-sync follower can delay what consumers see.",
    ],
  },
] as const satisfies readonly GlossaryTerm[];

export function normalizeGlossaryTermId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findGlossaryTerm(term: string): GlossaryTerm | undefined {
  const normalized = normalizeGlossaryTermId(term);

  return glossaryTerms.find(
    (entry) =>
      entry.id === normalized || normalizeGlossaryTermId(entry.name) === normalized,
  );
}
