"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Record {
  id: number;
  key: string;
  value: string | null;
  offset: number;
}

const SEED: Record[] = [
  { id: 1, offset: 0, key: "user-1", value: "name=Alice city=Madrid" },
  { id: 2, offset: 1, key: "user-2", value: "name=Bob   city=Boston" },
  { id: 3, offset: 2, key: "user-1", value: "name=Alice city=Lisbon" },
  { id: 4, offset: 3, key: "user-3", value: "name=Carol city=Seoul" },
  { id: 5, offset: 4, key: "user-2", value: null },
  { id: 6, offset: 5, key: "user-1", value: "name=Alice city=Paris" },
  { id: 7, offset: 6, key: "user-4", value: "name=Dan   city=Oslo" },
  { id: 8, offset: 7, key: "user-3", value: "name=Carol city=Tokyo" },
];

function compact(records: Record[]): Record[] {
  const latestByKey = new Map<string, Record>();
  for (const r of records) latestByKey.set(r.key, r);

  const kept = new Set<number>();
  for (const r of latestByKey.values()) {
    if (r.value === null) continue; // tombstone removes the key
    kept.add(r.id);
  }
  return records.filter((r) => kept.has(r.id));
}

export function CompactionTimeline() {
  const [records, setRecords] = useState<Record[]>(SEED);
  const [compacted, setCompacted] = useState(false);

  const nextOffset = records.length;
  const dirtyRatio = useMemo(() => {
    if (records.length === 0) return 0;
    const keys = new Set(records.map((r) => r.key)).size;
    return Math.max(0, 1 - keys / records.length);
  }, [records]);

  const handleCompact = useCallback(() => {
    setRecords((prev) =>
      compact(prev).map((r, i) => ({ ...r, offset: i })),
    );
    setCompacted(true);
  }, []);

  const handleReset = useCallback(() => {
    setRecords(SEED);
    setCompacted(false);
  }, []);

  const handleAppend = useCallback(
    (key: string, value: string | null) => {
      setRecords((prev) => [
        ...prev,
        {
          id: Date.now(),
          key,
          value,
          offset: prev.length === 0 ? 0 : prev[prev.length - 1].offset + 1,
        },
      ]);
      setCompacted(false);
    },
    [],
  );

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="Interactive log compaction timeline"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">
            Log compaction — append, tombstone, compact
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-fd-muted-foreground">
          <span>dirty {(dirtyRatio * 100).toFixed(0)}%</span>
          <span aria-hidden>·</span>
          <span>{records.length} records</span>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.5fr_1fr]">
        <ol className="space-y-1.5">
          {records.map((r) => {
            const isLatestForKey = (() => {
              for (let i = records.length - 1; i >= 0; i--) {
                if (records[i].key === r.key) return records[i].id === r.id;
              }
              return false;
            })();
            const survives = isLatestForKey && r.value !== null;
            return (
              <li
                key={r.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2 font-mono text-xs",
                  r.value === null
                    ? "border-amber-500/40 bg-amber-500/5"
                    : survives
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-fd-border bg-fd-background opacity-60",
                )}
              >
                <span className="w-10 shrink-0 text-fd-muted-foreground">
                  {r.offset.toString().padStart(3, "0")}
                </span>
                <span className="w-16 shrink-0 font-semibold">{r.key}</span>
                <span className="flex-1 truncate">
                  {r.value === null ? (
                    <span className="text-amber-700 dark:text-amber-300">
                      tombstone (value=null)
                    </span>
                  ) : (
                    r.value
                  )}
                </span>
                {survives ? (
                  <Badge tone="success">keeps</Badge>
                ) : r.value === null ? (
                  <Badge tone="warning">tombstone</Badge>
                ) : (
                  <Badge tone="neutral">superseded</Badge>
                )}
              </li>
            );
          })}
        </ol>

        <aside className="flex flex-col gap-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4">
          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wider text-fd-muted-foreground">
              Append a record
            </span>
            <div className="flex gap-1">
              {["user-1", "user-2", "user-3"].map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    handleAppend(k, `name=Updated city=Where (${nextOffset})`)
                  }
                >
                  upsert {k}
                </Button>
              ))}
            </div>
            <div className="flex gap-1">
              {["user-1", "user-2", "user-3"].map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant="ghost"
                  onClick={() => handleAppend(k, null)}
                >
                  delete {k}
                </Button>
              ))}
            </div>
          </div>

          <div className="my-2 border-t border-fd-border" />

          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider text-fd-muted-foreground">
              LogCleaner pass
            </span>
            <p className="text-xs leading-relaxed text-fd-muted-foreground">
              Triggers when dirty ratio &gt; <code>min.cleanable.dirty.ratio</code>
              {" "}(default 0.5). Keeps last value per key. Drops keys whose latest
              record is a tombstone (after <code>delete.retention.ms</code>).
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={handleCompact}>
                run compaction
              </Button>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                reset
              </Button>
            </div>
          </div>

          {compacted ? (
            <div
              role="status"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300"
            >
              Segment rewritten. Offsets are NOT reassigned in real Kafka — this
              demo renumbers them for clarity.
            </div>
          ) : null}
        </aside>
      </div>
    </figure>
  );
}
