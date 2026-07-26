/**
 * Transactions lab.
 *
 * InitProducerId -> transactional Produce -> consumer-offset participation
 * -> EndTxn -> control (transaction marker) records, compared across
 * commit, abort, producer fencing after a coordinator/epoch bump, and an
 * external side-effect caveat: a call to an LLM or third-party tool made
 * inside a "transactional" business step is not covered by Kafka's atomic
 * write and is not undone if the Kafka transaction aborts.
 */
import type { ProtocolActor, ProtocolLab, ProtocolStep, ProtocolVariant, WireFrame } from "../types";

const producer: ProtocolActor = { id: "producer", label: "Producer", role: "client", detail: 'transactional.id="orders-txn-7"' };
const replacement: ProtocolActor = { id: "replacement-producer", label: "Producer (replacement instance)", role: "client", detail: "new epoch, same transactional.id" };
const coordinator: ProtocolActor = { id: "txn-coordinator", label: "Transaction Coordinator", role: "coordinator", detail: "__transaction_state-3" };
const leader: ProtocolActor = { id: "broker-2", label: "Broker 2", role: "broker", detail: "leader: orders-0" };
const consumer: ProtocolActor = { id: "consumer", label: "Consumer", role: "client", detail: "isolation.level=read_committed" };
const tool: ProtocolActor = { id: "external-tool", label: "External Tool / LLM API", role: "external", detail: "outside Kafka's atomicity boundary" };

const ACTORS: readonly ProtocolActor[] = [producer, coordinator, leader, consumer, tool, replacement];

function initProducerIdReq(cid: number): WireFrame {
  return {
    kind: "request",
    apiName: "InitProducerId",
    apiKey: 22,
    apiVersion: 4,
    correlationId: cid,
    clientId: "orders-txn-producer",
    headerFields: [
      { name: "api_key", value: "22", type: "INT16" },
      { name: "api_version", value: "4", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "transactional_id", value: "orders-txn-7", type: "COMPACT_NULLABLE_STRING" },
      { name: "transaction_timeout_ms", value: "60000", type: "INT32" },
    ],
    hexBytes: ["00 16", "00 04", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=22", "api_version=4", "correlation_id"],
  };
}

function initProducerIdResp(cid: number, producerId: number, producerEpoch: number): WireFrame {
  return {
    kind: "response",
    apiName: "InitProducerId",
    apiKey: 22,
    apiVersion: 4,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [
      { name: "error_code", value: "0", type: "INT16", note: "NONE" },
      { name: "producer_id", value: String(producerId), type: "INT64" },
      { name: "producer_epoch", value: String(producerEpoch), type: "INT16" },
    ],
    errorCode: 0,
    errorName: "NONE",
    hexBytes: ["00 00", "00 00 00 00 00 00 " + producerId.toString(16).padStart(4, "0").toUpperCase().slice(0, 2) + " " + producerId.toString(16).padStart(4, "0").toUpperCase().slice(2), "00 " + producerEpoch.toString(16).padStart(2, "0").toUpperCase()],
    hexLabels: ["error_code=NONE", `producer_id=${producerId}`, `producer_epoch=${producerEpoch}`],
  };
}

function addPartitionsReq(cid: number, producerEpoch: number): WireFrame {
  return {
    kind: "request",
    apiName: "AddPartitionsToTxn",
    apiKey: 24,
    apiVersion: 5,
    correlationId: cid,
    clientId: "orders-txn-producer",
    headerFields: [
      { name: "api_key", value: "24", type: "INT16" },
      { name: "api_version", value: "5", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "transactional_id", value: "orders-txn-7", type: "COMPACT_STRING" },
      { name: "producer_id", value: "7001", type: "INT64" },
      { name: "producer_epoch", value: String(producerEpoch), type: "INT16" },
      { name: "topics[0].partitions", value: "[orders-0]", type: "ARRAY[INT32]" },
    ],
    hexBytes: ["00 18", "00 05", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=24", "api_version=5", "correlation_id"],
  };
}

function addPartitionsResp(cid: number, errorCode = 0, errorName = "NONE"): WireFrame {
  return {
    kind: "response",
    apiName: "AddPartitionsToTxn",
    apiKey: 24,
    apiVersion: 5,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [{ name: "error_code", value: String(errorCode), type: "INT16", note: errorName }],
    errorCode,
    errorName,
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`],
    hexLabels: [`error_code=${errorName}`],
  };
}

function txnProduceReq(cid: number, producerEpoch: number, baseSequence: number): WireFrame {
  return {
    kind: "request",
    apiName: "Produce",
    apiKey: 0,
    apiVersion: 11,
    correlationId: cid,
    clientId: "orders-txn-producer",
    headerFields: [
      { name: "api_key", value: "0", type: "INT16" },
      { name: "api_version", value: "11", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "transactional_id", value: "orders-txn-7", type: "COMPACT_NULLABLE_STRING" },
      { name: "acks", value: "-1", type: "INT16", note: "all — required for transactional produce" },
      { name: "topic_data[0].partition_data[0].records", value: "1 record batch (key=order-9042)", type: "COMPACT_RECORDS" },
      { name: "producer_id", value: "7001", type: "INT64" },
      { name: "producer_epoch", value: String(producerEpoch), type: "INT16" },
      { name: "base_sequence", value: String(baseSequence), type: "INT32" },
    ],
    hexBytes: ["00 00", "00 0B", String(cid).padStart(2, "0"), "FF FF"],
    hexLabels: ["api_key=0", "api_version=11", "correlation_id", "acks=all"],
  };
}

function txnProduceResp(cid: number, opts: { baseOffset?: number; errorCode?: number; errorName?: string }): WireFrame {
  const errorCode = opts.errorCode ?? 0;
  const errorName = opts.errorName ?? "NONE";
  return {
    kind: "response",
    apiName: "Produce",
    apiKey: 0,
    apiVersion: 11,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields:
      errorCode === 0
        ? [
            { name: "error_code", value: "0", type: "INT16", note: "NONE" },
            { name: "base_offset", value: String(opts.baseOffset ?? 0), type: "INT64" },
          ]
        : [{ name: "error_code", value: String(errorCode), type: "INT16", note: errorName }],
    errorCode,
    errorName,
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`],
    hexLabels: [`error_code=${errorName}`],
  };
}

function txnOffsetCommitReq(cid: number, producerEpoch: number): WireFrame {
  return {
    kind: "request",
    apiName: "TxnOffsetCommit",
    apiKey: 28,
    apiVersion: 4,
    correlationId: cid,
    clientId: "orders-txn-producer",
    headerFields: [
      { name: "api_key", value: "28", type: "INT16" },
      { name: "api_version", value: "4", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "transactional_id", value: "orders-txn-7", type: "COMPACT_STRING" },
      { name: "group_id", value: "orders-consumers", type: "COMPACT_STRING" },
      { name: "producer_id", value: "7001", type: "INT64" },
      { name: "producer_epoch", value: String(producerEpoch), type: "INT16" },
      { name: "topics[0].partitions[0].committed_offset", value: "9043", type: "INT64" },
    ],
    hexBytes: ["00 1C", "00 04", String(cid).padStart(2, "0")],
    hexLabels: ["api_key=28", "api_version=4", "correlation_id"],
  };
}

function txnOffsetCommitResp(cid: number, errorCode = 0, errorName = "NONE"): WireFrame {
  return {
    kind: "response",
    apiName: "TxnOffsetCommit",
    apiKey: 28,
    apiVersion: 4,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [{ name: "error_code", value: String(errorCode), type: "INT16", note: errorName }],
    errorCode,
    errorName,
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`],
    hexLabels: [`error_code=${errorName}`],
  };
}

function endTxnReq(cid: number, producerEpoch: number, committed: boolean): WireFrame {
  return {
    kind: "request",
    apiName: "EndTxn",
    apiKey: 26,
    apiVersion: 5,
    correlationId: cid,
    clientId: "orders-txn-producer",
    headerFields: [
      { name: "api_key", value: "26", type: "INT16" },
      { name: "api_version", value: "5", type: "INT16" },
      { name: "correlation_id", value: String(cid), type: "INT32" },
    ],
    bodyFields: [
      { name: "transactional_id", value: "orders-txn-7", type: "COMPACT_STRING" },
      { name: "producer_id", value: "7001", type: "INT64" },
      { name: "producer_epoch", value: String(producerEpoch), type: "INT16" },
      { name: "committed", value: String(committed), type: "BOOLEAN" },
    ],
    hexBytes: ["00 1A", "00 05", String(cid).padStart(2, "0"), committed ? "01" : "00"],
    hexLabels: ["api_key=26", "api_version=5", "correlation_id", `committed=${committed}`],
  };
}

function endTxnResp(cid: number, errorCode = 0, errorName = "NONE"): WireFrame {
  return {
    kind: "response",
    apiName: "EndTxn",
    apiKey: 26,
    apiVersion: 5,
    correlationId: cid,
    headerFields: [{ name: "correlation_id", value: String(cid), type: "INT32" }],
    bodyFields: [{ name: "error_code", value: String(errorCode), type: "INT16", note: errorName }],
    errorCode,
    errorName,
    hexBytes: [`00 ${errorCode.toString(16).padStart(2, "0").toUpperCase()}`],
    hexLabels: [`error_code=${errorName}`],
  };
}

function commonInit(cidStart: number): ProtocolStep[] {
  return [
    {
      id: "init-producer-id-req",
      title: "InitProducerId request",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative:
        "The producer registers its transactional.id with the transaction coordinator. This is how Kafka recognizes the same logical producer across process restarts.",
      state: [{ label: "transactional.id", value: "orders-txn-7", tone: "neutral" }],
      frames: [initProducerIdReq(cidStart)],
    },
    {
      id: "init-producer-id-resp",
      title: "InitProducerId response",
      fromActorId: "txn-coordinator",
      toActorId: "producer",
      direction: "response",
      narrative:
        "The coordinator returns producer_id=7001 at epoch 0, and fences any previous instance still holding an older epoch for this transactional.id (none exists yet on first start).",
      state: [
        { label: "Producer ID", value: "7001", tone: "success", changed: true },
        { label: "Producer epoch", value: "0", tone: "neutral", changed: true },
      ],
      frames: [initProducerIdResp(cidStart, 7001, 0)],
    },
    {
      id: "add-partitions-req",
      title: "AddPartitionsToTxn request",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative: "Before writing, the producer tells the coordinator which partition this transaction will touch: orders-0.",
      state: [{ label: "Transaction state", value: "Ongoing", tone: "info", changed: true }],
      frames: [addPartitionsReq(cidStart + 1, 0)],
    },
    {
      id: "add-partitions-resp",
      title: "AddPartitionsToTxn response",
      fromActorId: "txn-coordinator",
      toActorId: "producer",
      direction: "response",
      narrative: "The coordinator records orders-0 in the transaction's partition set so it knows to write a marker there at commit/abort time.",
      state: [],
      frames: [addPartitionsResp(cidStart + 1)],
    },
    {
      id: "txn-produce-req",
      title: "Transactional Produce request",
      fromActorId: "producer",
      toActorId: "broker-2",
      direction: "request",
      narrative: "The producer writes the record to orders-0, tagged with its producer_id, epoch, and sequence number.",
      state: [],
      frames: [txnProduceReq(cidStart + 2, 0, 0)],
    },
    {
      id: "txn-produce-resp",
      title: "Transactional Produce response",
      fromActorId: "broker-2",
      toActorId: "producer",
      direction: "response",
      narrative:
        "The leader appends the record to the log immediately — but marks it as part of an open transaction. A read_committed consumer cannot see it yet, even though it is already on disk.",
      state: [
        { label: "orders-0 LEO", value: "9043 (uncommitted)", tone: "warning", changed: true },
        { label: "read_committed visibility", value: "blocked until marker", tone: "warning", changed: true },
      ],
      frames: [txnProduceResp(cidStart + 2, { baseOffset: 9042 })],
    },
    {
      id: "txn-offset-commit-req",
      title: "TxnOffsetCommit request",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative:
        "The same producer also commits a consumer group's input offset as part of this transaction — the classic read-process-write pattern. The offset commit is staged, not yet visible to the group.",
      state: [],
      frames: [txnOffsetCommitReq(cidStart + 3, 0)],
    },
    {
      id: "txn-offset-commit-resp",
      title: "TxnOffsetCommit response",
      fromActorId: "txn-coordinator",
      toActorId: "producer",
      direction: "response",
      narrative: "The staged offset commit is acknowledged. It becomes real only when this transaction ends in a commit.",
      state: [],
      frames: [txnOffsetCommitResp(cidStart + 3)],
    },
  ];
}

function commitVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...commonInit(1),
    {
      id: "end-txn-commit-req",
      title: "EndTxn request (committed=true)",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative: "The application finished its read-process-write step successfully and asks to commit.",
      state: [],
      frames: [endTxnReq(5, 0, true)],
    },
    {
      id: "write-markers",
      title: "Coordinator writes COMMIT markers",
      fromActorId: "txn-coordinator",
      toActorId: "broker-2",
      direction: "broadcast",
      narrative:
        "The coordinator writes a transaction COMMIT control record to every partition in the transaction's set (orders-0 and the consumer offsets partition) — an internal broker-to-broker step, not a client-visible RPC.",
      state: [
        { label: "Transaction state", value: "PrepareCommit -> CompleteCommit", tone: "success", changed: true },
        { label: "orders-0 control record", value: "COMMIT marker appended", tone: "success", changed: true },
      ],
    },
    {
      id: "end-txn-commit-resp",
      title: "EndTxn response",
      fromActorId: "txn-coordinator",
      toActorId: "producer",
      direction: "response",
      narrative: "The producer is told the transaction is complete. It is now free to start the next one.",
      state: [],
      frames: [endTxnResp(5)],
    },
    {
      id: "consumer-read-committed",
      title: "read_committed consumer advances past the marker",
      fromActorId: "consumer",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "A consumer with isolation.level=read_committed tracks the Last Stable Offset (LSO) — the point up to which every transaction is resolved. Once the COMMIT marker lands, the LSO passes offset 9042 and the record becomes visible.",
      state: [
        { label: "Last Stable Offset", value: "9043", tone: "success", changed: true },
        { label: "Consumer sees order-9042", value: "yes", tone: "success", changed: true },
        { label: "Consumer's committed input offset", value: "visible as part of same commit", tone: "success" },
      ],
    },
  ];
  return {
    id: "commit",
    label: "Commit path",
    summary: "Produce + offset commit inside one transaction, resolved with a COMMIT marker read_committed consumers can see.",
    steps,
  };
}

function abortVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...commonInit(1),
    {
      id: "processing-fails",
      title: "Application detects a downstream failure",
      fromActorId: "producer",
      toActorId: "producer",
      direction: "internal",
      narrative: "After writing the record and staging the offset commit, application code hits an unrecoverable error and decides to abort rather than commit.",
      state: [{ label: "Decision", value: "abort", tone: "warning", changed: true }],
    },
    {
      id: "end-txn-abort-req",
      title: "EndTxn request (committed=false)",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative: "The producer asks the coordinator to abort the transaction.",
      state: [],
      frames: [endTxnReq(5, 0, false)],
    },
    {
      id: "write-abort-markers",
      title: "Coordinator writes ABORT markers",
      fromActorId: "txn-coordinator",
      toActorId: "broker-2",
      direction: "broadcast",
      narrative:
        "The coordinator writes an ABORT control record to orders-0 and to the offsets partition. The record at offset 9042 stays physically on disk (removed only later by log cleanup/retention) but is marked aborted.",
      state: [
        { label: "Transaction state", value: "PrepareAbort -> CompleteAbort", tone: "danger", changed: true },
        { label: "orders-0 control record", value: "ABORT marker appended", tone: "danger", changed: true },
      ],
    },
    {
      id: "end-txn-abort-resp",
      title: "EndTxn response",
      fromActorId: "txn-coordinator",
      toActorId: "producer",
      direction: "response",
      narrative: "The producer is told the abort completed and may safely start a new transaction.",
      state: [],
      frames: [endTxnResp(5)],
    },
    {
      id: "consumer-never-sees-it",
      title: "read_committed consumer skips the aborted record",
      fromActorId: "consumer",
      toActorId: "broker-2",
      direction: "internal",
      narrative:
        "The LSO still advances past offset 9042, but a read_committed consumer's client-side filtering drops any record whose transaction resolved to ABORT. It never sees order-9042, and the staged offset commit is discarded too — the group's committed offset is unaffected by this transaction.",
      state: [
        { label: "Consumer sees order-9042", value: "no — filtered as aborted", tone: "success", changed: true },
        { label: "Consumer's committed input offset", value: "unchanged (offset commit discarded)", tone: "success" },
      ],
    },
  ];
  return {
    id: "abort",
    label: "Abort path",
    summary: "Same produce + offset commit, resolved with an ABORT marker: read_committed consumers never observe the aborted record.",
    steps,
  };
}

function fencingVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    {
      id: "old-instance-init",
      title: "Original instance: InitProducerId",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative: "The original producer process starts and registers transactional.id=orders-txn-7.",
      state: [],
      frames: [initProducerIdReq(1)],
    },
    {
      id: "old-instance-init-resp",
      title: "Original instance gets epoch 4",
      fromActorId: "txn-coordinator",
      toActorId: "producer",
      direction: "response",
      narrative: "The coordinator returns producer_id=7001 at epoch 4 (this producer has restarted several times before).",
      state: [{ label: "Producer epoch (original)", value: "4", tone: "neutral", changed: true }],
      frames: [initProducerIdResp(1, 7001, 4)],
    },
    {
      id: "network-partition",
      title: "Network partition: original instance stalls",
      fromActorId: "producer",
      toActorId: "producer",
      direction: "internal",
      narrative:
        "A long GC pause or network partition freezes the original instance mid-transaction. An orchestrator, seeing missed health checks, starts a new instance of the same logical producer — a classic zombie scenario.",
      state: [{ label: "Original instance", value: "unresponsive (zombie-in-waiting)", tone: "warning", changed: true }],
    },
    {
      id: "new-instance-init",
      title: "New instance: InitProducerId (same transactional.id)",
      fromActorId: "replacement-producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative: "The new instance calls InitProducerId with the same transactional.id, as it always does on startup.",
      state: [],
      frames: [initProducerIdReq(2)],
    },
    {
      id: "new-instance-fenced-epoch",
      title: "New instance gets epoch 5 — old one is fenced",
      fromActorId: "txn-coordinator",
      toActorId: "replacement-producer",
      direction: "response",
      narrative:
        "The coordinator bumps the epoch to 5 for this transactional.id and remembers that any request carrying epoch 4 is now stale. This is the whole fencing mechanism: one monotonic epoch per transactional.id, held by the coordinator.",
      state: [
        { label: "Producer epoch (current)", value: "5", tone: "success", changed: true },
        { label: "Epoch 4 status", value: "fenced", tone: "danger", changed: true },
      ],
      frames: [initProducerIdResp(2, 7001, 5)],
    },
    {
      id: "zombie-wakes-up",
      title: "Original instance wakes up and retries its old write",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative:
        "The original instance resumes and tries to commit, still using epoch 4 — unaware a newer instance already replaced it.",
      state: [],
      frames: [endTxnReq(3, 4, true)],
    },
    {
      id: "zombie-fenced-response",
      title: "EndTxn rejected: INVALID_PRODUCER_EPOCH",
      fromActorId: "txn-coordinator",
      toActorId: "producer",
      direction: "response",
      narrative:
        "The coordinator rejects the stale epoch outright. The zombie instance cannot commit, abort, or produce anything further under this transactional.id — it is permanently fenced and must be restarted to obtain a new epoch.",
      state: [{ label: "Original instance", value: "fenced — cannot write", tone: "danger", changed: true }],
      frames: [endTxnResp(3, 47, "INVALID_PRODUCER_EPOCH")],
      annotation: {
        tone: "danger",
        text: "Producer fencing is what prevents two live instances of the same logical producer from both believing they own an in-flight transaction after a coordinator/epoch bump.",
      },
    },
  ];
  return {
    id: "fencing",
    label: "Producer fencing after epoch bump",
    summary: "A zombie instance of the same transactional.id is fenced the moment a newer instance calls InitProducerId.",
    steps,
  };
}

function externalSideEffectVariant(): ProtocolVariant {
  const steps: ProtocolStep[] = [
    ...commonInit(1).slice(0, 4),
    {
      id: "call-external-tool",
      title: "Application calls an external tool mid-transaction",
      fromActorId: "producer",
      toActorId: "external-tool",
      direction: "request",
      narrative:
        "Between staging the Kafka write and calling EndTxn, application code calls an external LLM/tool API — for example, to actually send an email or charge a payment based on the record it just produced.",
      state: [{ label: "Kafka transaction state", value: "Ongoing (not yet committed)", tone: "warning" }],
    },
    {
      id: "external-tool-executes",
      title: "External tool executes — for real, immediately",
      fromActorId: "external-tool",
      toActorId: "producer",
      direction: "response",
      narrative:
        "The external system has no concept of Kafka's transaction and no way to be rolled back by it. The side effect (the email, the charge, the API call) has already happened in the real world.",
      state: [{ label: "External side effect", value: "already executed — cannot be undone by Kafka", tone: "danger", changed: true }],
    },
    {
      id: "kafka-txn-aborts-anyway",
      title: "The Kafka transaction later aborts",
      fromActorId: "producer",
      toActorId: "txn-coordinator",
      direction: "request",
      narrative:
        "Perhaps the app crashes, or a downstream check fails, and the transaction is aborted (or times out and is aborted automatically). The Kafka record and offset commit are rolled back — but the external tool call is not.",
      state: [
        { label: "Kafka transaction", value: "aborted", tone: "danger", changed: true },
        { label: "External side effect", value: "still happened", tone: "danger", changed: true },
      ],
      frames: [endTxnReq(5, 0, false)],
    },
    {
      id: "inconsistent-outcome",
      title: "Net result: an inconsistent outcome",
      fromActorId: "consumer",
      toActorId: "consumer",
      direction: "internal",
      narrative:
        "A read_committed consumer correctly sees no record for this transaction — but the real-world side effect the record was supposed to represent already occurred. Kafka transactions guarantee atomicity across Kafka topics and offsets only; anything crossing that boundary (LLM calls, HTTP calls, database writes on another system) needs its own idempotency key, outbox pattern, or reconciliation step.",
      state: [
        { label: "Kafka's view", value: "nothing happened (aborted)", tone: "neutral" },
        { label: "Real-world view", value: "the tool call happened", tone: "danger" },
        { label: "System is exactly-once", value: "only within Kafka's boundary", tone: "warning", changed: true },
      ],
      annotation: {
        tone: "warning",
        text: "Kafka's exactly-once semantics cover produce + offset-commit atomicity inside Kafka. They do not extend to external side effects like LLM tool calls, webhooks, or non-Kafka database writes.",
      },
    },
  ];
  return {
    id: "external-side-effect",
    label: "External side effect caveat (LLM / tool calls)",
    summary: "A transactional produce is atomic within Kafka, but a mid-transaction call to an external tool or LLM API is not — and is not undone if the transaction aborts.",
    steps,
  };
}

export const transactionsLab: ProtocolLab = {
  slug: "transactions",
  title: "Transactions",
  tagline: "InitProducerId, transactional produce, offset participation, EndTxn, and control markers.",
  blurb:
    "Follow a read-process-write transaction through commit and abort, see producer fencing after an epoch bump, and see why external LLM/tool side effects fall outside Kafka's exactly-once boundary.",
  focusAreas: ["InitProducerId", "AddPartitionsToTxn", "TxnOffsetCommit", "EndTxn", "producer epoch", "read_committed", "LSO"],
  actors: ACTORS,
  variants: [commitVariant(), abortVariant(), fencingVariant(), externalSideEffectVariant()],
  links: {
    learnSlugs: ["exactly-once", "kafka-for-ai"],
    errorIds: ["producer-fenced-exception", "invalid-producer-epoch-exception", "out-of-order-sequence-exception"],
    kipIds: [447, 890],
    runbookSlugs: ["transactional-producer-stuck"],
  },
};
