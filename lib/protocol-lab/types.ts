/**
 * Typed model for Protocol Lab.
 *
 * Protocol Lab renders curated, deterministic walkthroughs of Kafka wire
 * protocol exchanges (ApiVersions, Metadata, Produce, the group coordinator
 * protocols, ShareGroup APIs, transactions, and replication) in two modes:
 *
 *  - "sequence": an intuitive animated/stepped actor-lane view.
 *  - "wire": a decoded request/response frame view with header fields,
 *    body fields, and an educational framed hex byte layout.
 *
 * Every value here is a plain, JSON-serializable object. Lab data is built
 * once per module (pure functions, no randomness, no dates) so the same
 * slug always renders the same steps in the same order — this is what
 * "deterministic" means for Protocol Lab: replaying a lab produces
 * byte-for-byte identical output every time.
 */

/** Kafka baseline every lab is reviewed against. Rendered verbatim on every lab page. */
export const KAFKA_BASELINE_VERSION = "4.3.1";

/** Exact text every lab page must display. Do not alter the wording. */
export const REVIEWED_AGAINST_TEXT = `Reviewed against Apache Kafka ${KAFKA_BASELINE_VERSION}`;

export const PROTOCOL_LAB_SLUGS = [
  "produce-record",
  "consumer-group",
  "share-groups",
  "transactions",
  "replication-failover",
] as const;

export type ProtocolLabSlug = (typeof PROTOCOL_LAB_SLUGS)[number];

export function isProtocolLabSlug(value: string): value is ProtocolLabSlug {
  return (PROTOCOL_LAB_SLUGS as readonly string[]).includes(value);
}

/** Broad category of participant in a protocol exchange. */
export type ActorRole =
  | "client"
  | "broker"
  | "coordinator"
  | "controller"
  | "worker"
  | "external";

export interface ProtocolActor {
  /** Stable id referenced by steps (e.g. "producer", "broker-2"). */
  readonly id: string;
  /** Short display label shown in the lane header (e.g. "Producer"). */
  readonly label: string;
  readonly role: ActorRole;
  /** Optional secondary detail shown under the label (e.g. "leader: p0"). */
  readonly detail?: string;
}

export type SignalTone = "neutral" | "info" | "success" | "warning" | "danger";

/** A single labeled value in a point-in-time state snapshot. */
export interface StateField {
  readonly label: string;
  readonly value: string;
  readonly tone?: SignalTone;
  /** True when this field's value changed at this step — used to highlight it. */
  readonly changed?: boolean;
}

/** A single header or body field in a decoded wire frame. */
export interface WireField {
  readonly name: string;
  readonly value: string;
  /** Kafka protocol primitive type, e.g. "INT16", "STRING", "ARRAY[...]", "COMPACT_RECORDS". */
  readonly type: string;
  readonly note?: string;
}

/**
 * A decoded request or response frame rendered in Wire mode.
 *
 * `hexBytes`/`hexLabels` are parallel arrays: each entry is a small group of
 * framed, educational hex byte pairs with a matching human label. They are
 * illustrative and simplified (not a byte-exact encoder) but internally
 * consistent — sizes, orderings, and API metadata always agree with the
 * structured fields above them.
 */
export interface WireFrame {
  readonly kind: "request" | "response";
  readonly apiName: string;
  readonly apiKey: number;
  readonly apiVersion: number;
  readonly correlationId: number;
  readonly clientId?: string;
  readonly headerFields: readonly WireField[];
  readonly bodyFields: readonly WireField[];
  readonly errorCode?: number;
  readonly errorName?: string;
  readonly hexBytes: readonly string[];
  readonly hexLabels: readonly string[];
}

export interface StepAnnotation {
  readonly tone: SignalTone;
  readonly text: string;
}

export type StepDirection = "request" | "response" | "broadcast" | "internal";

/** One step in a deterministic protocol sequence. */
export interface ProtocolStep {
  readonly id: string;
  readonly title: string;
  readonly fromActorId: string;
  readonly toActorId: string;
  readonly direction: StepDirection;
  /** Plain-language explanation shown in Sequence mode. */
  readonly narrative: string;
  /** Full state snapshot as of this step (rendered in both modes). */
  readonly state: readonly StateField[];
  /** Zero or more decoded frames shown in Wire mode (request, then response). */
  readonly frames?: readonly WireFrame[];
  readonly annotation?: StepAnnotation;
}

/** A named, fully precomputed deterministic step sequence for a lab. */
export interface ProtocolVariant {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly steps: readonly ProtocolStep[];
}

export interface ProtocolLabLinks {
  readonly learnSlugs?: readonly string[];
  readonly errorIds?: readonly string[];
  readonly kipIds?: readonly number[];
  readonly scenarioSlugs?: readonly string[];
  readonly runbookSlugs?: readonly string[];
}

export interface ProtocolLab {
  readonly slug: ProtocolLabSlug;
  readonly title: string;
  readonly tagline: string;
  readonly blurb: string;
  readonly focusAreas: readonly string[];
  readonly actors: readonly ProtocolActor[];
  readonly variants: readonly ProtocolVariant[];
  readonly links: ProtocolLabLinks;
}
