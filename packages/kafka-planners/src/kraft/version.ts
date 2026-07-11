import type { ParsedKafkaVersion } from "./types";

export const MIN_KRAFT_BRIDGE_VERSION: ParsedKafkaVersion = {
  major: 3,
  minor: 3,
  patch: 0,
  preRelease: null,
  raw: "3.3.0",
};

export const MIN_MIGRATION_VERSION: ParsedKafkaVersion = {
  major: 3,
  minor: 9,
  patch: 1,
  preRelease: null,
  raw: "3.9.1",
};

export const RECOMMENDED_MIGRATION_VERSION: ParsedKafkaVersion = {
  major: 3,
  minor: 9,
  patch: 2,
  preRelease: null,
  raw: "3.9.2",
};

const FINAL_ZOOKEEPER_LINE = { major: 3, minor: 9 };

export const KRAFT_ONLY_MAJOR = 4;

export function parseKafkaVersion(raw: string): ParsedKafkaVersion | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const match = trimmed.match(
    /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-(.+))?$/,
  );
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const preRelease = match[4] ?? null;

  if (
    !Number.isFinite(major) ||
    !Number.isFinite(minor) ||
    !Number.isFinite(patch)
  ) {
    return null;
  }

  return { major, minor, patch, preRelease, raw: trimmed };
}

export function compareVersions(
  a: ParsedKafkaVersion,
  b: ParsedKafkaVersion,
): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.preRelease !== null && b.preRelease === null) return -1;
  if (a.preRelease === null && b.preRelease !== null) return 1;
  return 0;
}

export function isKRaftOnlyVersion(v: ParsedKafkaVersion): boolean {
  return v.major >= KRAFT_ONLY_MAJOR;
}

export function isFinalZookeeperLine(v: ParsedKafkaVersion): boolean {
  return (
    v.major === FINAL_ZOOKEEPER_LINE.major &&
    v.minor === FINAL_ZOOKEEPER_LINE.minor
  );
}

export function supportsMigration(v: ParsedKafkaVersion): boolean {
  return compareVersions(v, MIN_MIGRATION_VERSION) >= 0 && !isKRaftOnlyVersion(v);
}

export function isKRaftBridgeCandidate(v: ParsedKafkaVersion): boolean {
  return (
    compareVersions(v, MIN_KRAFT_BRIDGE_VERSION) >= 0 &&
    compareVersions(v, MIN_MIGRATION_VERSION) < 0 &&
    !isKRaftOnlyVersion(v)
  );
}
