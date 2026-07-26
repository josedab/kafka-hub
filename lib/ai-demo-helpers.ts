export type ShareRecordState = "available" | "locked" | "acked" | "rejected";

export interface ShareRecord {
  id: string;
  partition: number;
  deliveryCount: number;
  state: ShareRecordState;
  lockedBy?: string;
  lockExpiresAt?: number;
  poison?: boolean;
}

export interface SharePoolState {
  now: number;
  lockDuration: number;
  records: ShareRecord[];
  event: string;
}

function withShareEvent(state: SharePoolState, event: string): SharePoolState {
  return { ...state, event };
}

function heldRecord(state: SharePoolState, worker: string): ShareRecord | undefined {
  return state.records.find(
    (record) => record.state === "locked" && record.lockedBy === worker,
  );
}

function replaceShareRecord(
  state: SharePoolState,
  id: string,
  next: (record: ShareRecord) => ShareRecord,
  event: string,
): SharePoolState {
  return {
    ...state,
    event,
    records: state.records.map((record) => (record.id === id ? next(record) : record)),
  };
}

export function createSharePoolState(): SharePoolState {
  return {
    now: 0,
    lockDuration: 30,
    event: "Ready: records are available for acquisition.",
    records: [
      { id: "work-101", partition: 0, deliveryCount: 0, state: "available" },
      { id: "work-102", partition: 1, deliveryCount: 0, state: "available" },
      { id: "work-103", partition: 2, deliveryCount: 0, state: "available" },
      {
        id: "poison-404",
        partition: 0,
        deliveryCount: 0,
        state: "available",
        poison: true,
      },
      { id: "work-104", partition: 1, deliveryCount: 0, state: "available" },
    ],
  };
}

export function acquireShareRecord(
  state: SharePoolState,
  worker: string,
): SharePoolState {
  if (heldRecord(state, worker)) {
    return withShareEvent(state, `${worker} already holds a record.`);
  }

  // The demo keeps the seeded record order as a deterministic availability
  // queue. Real share-group fetch scheduling is broker/client behavior, not a
  // fairness guarantee that this small teaching model should imply.
  const candidate = state.records.find((record) => record.state === "available");

  if (!candidate) {
    return withShareEvent(state, `No available record for ${worker}.`);
  }

  return replaceShareRecord(
    state,
    candidate.id,
    (record) => ({
      ...record,
      deliveryCount: record.deliveryCount + 1,
      state: "locked",
      lockedBy: worker,
      lockExpiresAt: state.now + state.lockDuration,
    }),
    `${worker} acquired ${candidate.id}; lock expires at ${state.now + state.lockDuration}s.`,
  );
}

export function acknowledgeShareRecord(
  state: SharePoolState,
  worker: string,
): SharePoolState {
  const record = heldRecord(state, worker);
  if (!record) return withShareEvent(state, `${worker} has no record to acknowledge.`);

  return replaceShareRecord(
    state,
    record.id,
    (current) => ({
      ...current,
      state: "acked",
      lockedBy: undefined,
      lockExpiresAt: undefined,
    }),
    `${worker} acknowledged ${record.id}.`,
  );
}

export function processShareRecord(
  state: SharePoolState,
  worker: string,
): SharePoolState {
  const record = heldRecord(state, worker);
  if (!record) return withShareEvent(state, `${worker} has no record to process.`);

  return withShareEvent(
    state,
    record.poison
      ? `${worker} processed ${record.id}; validation failed, so release or reject it explicitly.`
      : `${worker} processed ${record.id}; acknowledge only after its durable outcome is known.`,
  );
}

export function releaseShareRecord(
  state: SharePoolState,
  worker: string,
): SharePoolState {
  const record = heldRecord(state, worker);
  if (!record) return withShareEvent(state, `${worker} has no record to release.`);

  return replaceShareRecord(
    state,
    record.id,
    (current) => ({
      ...current,
      state: "available",
      lockedBy: undefined,
      lockExpiresAt: undefined,
    }),
    `${worker} released ${record.id}; it is eligible for redelivery.`,
  );
}

export function rejectShareRecord(
  state: SharePoolState,
  worker: string,
): SharePoolState {
  const record = heldRecord(state, worker);
  if (!record) return withShareEvent(state, `${worker} has no record to reject.`);

  return replaceShareRecord(
    state,
    record.id,
    (current) => ({
      ...current,
      state: "rejected",
      lockedBy: undefined,
      lockExpiresAt: undefined,
    }),
    `${worker} rejected ${record.id}; it will not be retried by this share group.`,
  );
}

export function advanceShareTime(
  state: SharePoolState,
  seconds = state.lockDuration,
): SharePoolState {
  const now = state.now + Math.max(0, seconds);
  const expired = state.records.filter(
    (record) =>
      record.state === "locked" &&
      record.lockExpiresAt !== undefined &&
      record.lockExpiresAt <= now,
  );

  if (expired.length === 0) {
    return { ...state, now, event: `Clock advanced to ${now}s; no lock expired.` };
  }

  return {
    ...state,
    now,
    event: `${expired.map((record) => record.id).join(", ")} lock expired; record(s) available for redelivery.`,
    records: state.records.map((record) =>
      expired.some((expiredRecord) => expiredRecord.id === record.id)
        ? {
            ...record,
            state: "available",
            lockedBy: undefined,
            lockExpiresAt: undefined,
          }
        : record,
    ),
  };
}

export type ReplayBoundary =
  | "before-effect"
  | "after-effect-before-result"
  | "after-result-before-commit"
  | "after-commit";

export type SideEffectStrategy = "naive" | "idempotency-key" | "durable-result";

export interface SideEffectReplay {
  modelRequests: number;
  modelExecutions: number;
  toolRequests: number;
  toolExecutions: number;
  resultReused: boolean;
  decision: string;
}

export function simulateSideEffectReplay(
  boundary: ReplayBoundary,
  strategy: SideEffectStrategy,
): SideEffectReplay {
  const effectStarted = boundary !== "before-effect";
  const resultWasDurable =
    boundary === "after-result-before-commit" || boundary === "after-commit";
  const committed = boundary === "after-commit";

  if (committed || !effectStarted) {
    return {
      modelRequests: 1,
      modelExecutions: 1,
      toolRequests: 1,
      toolExecutions: 1,
      resultReused: false,
      decision: committed
        ? "The Kafka offset committed before the crash; no replay is required."
        : "The crash happened before an effect started; replay makes one call.",
    };
  }

  if (strategy === "idempotency-key") {
    return {
      modelRequests: 2,
      modelExecutions: 1,
      toolRequests: 2,
      toolExecutions: 1,
      resultReused: true,
      decision:
        "Replay retries the request, but an endpoint that honors the same idempotency key executes the effect once.",
    };
  }

  if (strategy === "durable-result" && resultWasDurable) {
    return {
      modelRequests: 1,
      modelExecutions: 1,
      toolRequests: 1,
      toolExecutions: 1,
      resultReused: true,
      decision:
        "Replay finds the durable result and commits without another external call.",
    };
  }

  return {
    modelRequests: 2,
    modelExecutions: 2,
    toolRequests: 2,
    toolExecutions: 2,
    resultReused: false,
    decision:
      strategy === "durable-result"
        ? "The crash sits between the external effect and its durable result; a result ledger alone cannot rule out a duplicate."
        : "Replay has no external deduplication boundary, so both model and tool effects can run twice.",
  };
}

export interface RagIndexSnapshot {
  version: number | null;
  deleted: boolean;
  modelVersion: string;
}

export interface PendingRagWork {
  target: "primary" | "candidate";
  kind: "upsert" | "tombstone";
  version: number;
  modelVersion: string;
  readyAt: number;
}

export interface RagFreshnessState {
  clock: number;
  embedLatency: number;
  sourceVersion: number;
  sourceDeleted: boolean;
  primary: RagIndexSnapshot;
  candidate: RagIndexSnapshot | null;
  pending: PendingRagWork[];
  event: string;
}

export function createRagFreshnessState(): RagFreshnessState {
  return {
    clock: 0,
    embedLatency: 3,
    sourceVersion: 1,
    sourceDeleted: false,
    primary: { version: 1, deleted: false, modelVersion: "embed-v1" },
    candidate: null,
    pending: [],
    event: "Source v1 and the primary index are aligned.",
  };
}

function queueRagWork(
  state: RagFreshnessState,
  work: Omit<PendingRagWork, "readyAt">,
  event: string,
): RagFreshnessState {
  return {
    ...state,
    event,
    pending: [
      ...state.pending,
      { ...work, readyAt: state.clock + state.embedLatency },
    ],
  };
}

export function setRagEmbedLatency(
  state: RagFreshnessState,
  embedLatency: number,
): RagFreshnessState {
  return {
    ...state,
    embedLatency: Math.max(1, Math.min(10, Math.round(embedLatency))),
    event: `Embedding latency set to ${Math.max(1, Math.min(10, Math.round(embedLatency)))} ticks.`,
  };
}

export function updateRagSource(state: RagFreshnessState): RagFreshnessState {
  const sourceVersion = state.sourceVersion + 1;
  return queueRagWork(
    { ...state, sourceVersion, sourceDeleted: false },
    {
      target: "primary",
      kind: "upsert",
      version: sourceVersion,
      modelVersion: state.primary.modelVersion,
    },
    `CDC update accepted for source v${sourceVersion}; embedding is queued.`,
  );
}

export function deleteRagSource(state: RagFreshnessState): RagFreshnessState {
  const sourceVersion = state.sourceVersion + 1;
  return queueRagWork(
    { ...state, sourceVersion, sourceDeleted: true },
    {
      target: "primary",
      kind: "tombstone",
      version: sourceVersion,
      modelVersion: state.primary.modelVersion,
    },
    `CDC tombstone accepted for source v${sourceVersion}; the old vector remains queryable until applied.`,
  );
}

export function reembedRagSource(
  state: RagFreshnessState,
  modelVersion = "embed-v2",
): RagFreshnessState {
  if (state.sourceDeleted) {
    return { ...state, event: "Backfill skipped: the source is tombstoned." };
  }

  return queueRagWork(
    { ...state, candidate: { version: null, deleted: false, modelVersion } },
    {
      target: "candidate",
      kind: "upsert",
      version: state.sourceVersion,
      modelVersion,
    },
    `Dual-index backfill queued for source v${state.sourceVersion} with ${modelVersion}.`,
  );
}

export function advanceRagFreshness(
  state: RagFreshnessState,
  ticks = 1,
): RagFreshnessState {
  const clock = state.clock + Math.max(0, Math.round(ticks));
  const ready = state.pending.filter((work) => work.readyAt <= clock);
  let primary = state.primary;
  let candidate = state.candidate;

  for (const work of ready) {
    const snapshot: RagIndexSnapshot = {
      version: work.version,
      deleted: work.kind === "tombstone",
      modelVersion: work.modelVersion,
    };
    if (work.target === "primary" && (primary.version ?? -1) <= work.version) {
      primary = snapshot;
    }
    if (work.target === "candidate" && candidate && (candidate.version ?? -1) <= work.version) {
      candidate = snapshot;
    }
  }

  return {
    ...state,
    clock,
    primary,
    candidate,
    pending: state.pending.filter((work) => work.readyAt > clock),
    event:
      ready.length > 0
        ? `Applied ${ready.length} queued index event${ready.length === 1 ? "" : "s"} at tick ${clock}.`
        : `Clock advanced to tick ${clock}; index work is still pending.`,
  };
}

export function ragStaleWindow(state: RagFreshnessState): number {
  return state.pending.reduce(
    (window, work) => Math.max(window, Math.max(0, work.readyAt - state.clock)),
    0,
  );
}

export function isRagIndexStale(state: RagFreshnessState): boolean {
  return (
    state.primary.version !== state.sourceVersion ||
    state.primary.deleted !== state.sourceDeleted ||
    state.pending.length > 0
  );
}

export interface AiProtocolDecisionInput {
  needsReplay: boolean;
  needsToolDiscovery: boolean;
  needsCrossAgentLongTask: boolean;
  needsFanout: boolean;
  needsRequestResponse: boolean;
}

export interface AiProtocolRecommendation {
  name: "Kafka" | "MCP" | "A2A" | "Direct API";
  rationale: string;
}

export function recommendAiProtocolComposition(
  input: AiProtocolDecisionInput,
): AiProtocolRecommendation[] {
  const recommendations: AiProtocolRecommendation[] = [];

  if (input.needsReplay || input.needsFanout) {
    recommendations.push({
      name: "Kafka",
      rationale: input.needsReplay && input.needsFanout
        ? "Keep durable ordered events for replay and independent consumer fan-out."
        : input.needsReplay
          ? "Keep durable ordered events so a consumer can replay from an explicit offset."
          : "Use independent consumer groups for durable fan-out.",
    });
  }

  if (input.needsToolDiscovery) {
    recommendations.push({
      name: "MCP",
      rationale:
        "Use JSON-RPC lifecycle/capability exchange to discover tools, resources, and prompts; it is not the durable log.",
    });
  }

  if (input.needsCrossAgentLongTask) {
    recommendations.push({
      name: "A2A",
      rationale:
        "Use A2A task/message/artifact interoperability for a remote agent’s long-running work; it is not Kafka.",
    });
  }

  if (input.needsRequestResponse) {
    recommendations.push({
      name: "Direct API",
      rationale:
        "Keep latency-sensitive request/response on a direct authenticated API; emit a durable event only when replay or fan-out is required.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      name: "Direct API",
      rationale:
        "No selected requirement needs a streaming transport or an agent protocol; begin with a small explicit application API.",
    });
  }

  return recommendations;
}

export const DETERMINISTIC_CANARY_SAMPLES = [
  "refund-policy",
  "invoice-match",
  "support-escalation",
  "catalog-change",
  "fraud-review",
  "knowledge-grounding",
  "access-request",
  "shipment-delay",
  "contract-clause",
  "incident-summary",
  "document-delete",
  "tool-timeout",
] as const;

export interface ModelCanaryInput {
  baselineQuality: number;
  candidateQuality: number;
  baselineCost: number;
  candidateCost: number;
  baselineLatency: number;
  candidateLatency: number;
  minimumQuality: number;
  maximumCostIncrease: number;
  maximumLatencyIncrease: number;
}

export interface ModelCanaryResult {
  qualityDelta: number;
  costIncrease: number;
  latencyIncrease: number;
  qualityPasses: boolean;
  costPasses: boolean;
  latencyPasses: boolean;
  decision: "rollout" | "hold";
}

export function evaluateModelCanary(input: ModelCanaryInput): ModelCanaryResult {
  const baselineCost = Math.max(input.baselineCost, Number.EPSILON);
  const baselineLatency = Math.max(input.baselineLatency, Number.EPSILON);
  const qualityDelta = input.candidateQuality - input.baselineQuality;
  const costIncrease = ((input.candidateCost - baselineCost) / baselineCost) * 100;
  const latencyIncrease =
    ((input.candidateLatency - baselineLatency) / baselineLatency) * 100;
  const qualityPasses =
    input.candidateQuality >= input.minimumQuality && qualityDelta >= 0;
  const costPasses = costIncrease <= input.maximumCostIncrease;
  const latencyPasses = latencyIncrease <= input.maximumLatencyIncrease;

  return {
    qualityDelta,
    costIncrease,
    latencyIncrease,
    qualityPasses,
    costPasses,
    latencyPasses,
    decision: qualityPasses && costPasses && latencyPasses ? "rollout" : "hold",
  };
}
