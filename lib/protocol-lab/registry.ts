/**
 * Authoritative Protocol Lab registry.
 *
 * Single source of truth for all five Protocol Lab entries. Used by:
 * - /protocol (landing, lists all labs)
 * - /protocol/[slug] (detail, generateStaticParams + lookup)
 * - Sitemap generation
 * - Displayed lab counts
 */
import type { ProtocolLab } from "./types";
import { produceRecordLab } from "./labs/produce-record";
import { consumerGroupLab } from "./labs/consumer-group";
import { shareGroupsLab } from "./labs/share-groups";
import { transactionsLab } from "./labs/transactions";
import { replicationFailoverLab } from "./labs/replication-failover";

export const PROTOCOL_LABS: readonly ProtocolLab[] = [
  produceRecordLab,
  consumerGroupLab,
  shareGroupsLab,
  transactionsLab,
  replicationFailoverLab,
];

export function findProtocolLab(slug: string): ProtocolLab | undefined {
  return PROTOCOL_LABS.find((lab) => lab.slug === slug);
}
