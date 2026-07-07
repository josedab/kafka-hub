"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TxStep = {
  label: string;
  detail: string;
  txState: "none" | "ongoing" | "prepare_commit" | "prepare_abort" | "complete_commit" | "complete_abort";
  producer: {
    pid: number;
    epoch: number;
    sequence: number;
  };
  /** Records appended to user topic with their txn state. */
  log: Array<{ offset: number; key: string; visible: boolean; aborted: boolean }>;
  /** Transaction state log entries (special __transaction_state topic). */
  txLog: string[];
  consumed: number[];
};

const STEPS: TxStep[] = [
  {
    label: "1. initTransactions()",
    detail:
      "Producer reaches out to the transaction coordinator (a broker chosen by hash of transactional.id). Gets a PID + epoch. Fences any prior producer with the same id.",
    txState: "none",
    producer: { pid: 4001, epoch: 7, sequence: 0 },
    log: [],
    txLog: ["Init: tx=orders-svc, pid=4001, epoch=7"],
    consumed: [],
  },
  {
    label: "2. beginTransaction() + send()",
    detail: "Producer sends 3 records to topic `orders`. They land in the log but are NOT visible to read_committed consumers.",
    txState: "ongoing",
    producer: { pid: 4001, epoch: 7, sequence: 3 },
    log: [
      { offset: 0, key: "order-1", visible: false, aborted: false },
      { offset: 1, key: "order-2", visible: false, aborted: false },
      { offset: 2, key: "order-3", visible: false, aborted: false },
    ],
    txLog: ["Begin: pid=4001, epoch=7"],
    consumed: [],
  },
  {
    label: "3a. commitTransaction() → coordinator writes PREPARE_COMMIT",
    detail: "Two-phase commit. Coordinator durably records the intent before fanning out to partition leaders.",
    txState: "prepare_commit",
    producer: { pid: 4001, epoch: 7, sequence: 3 },
    log: [
      { offset: 0, key: "order-1", visible: false, aborted: false },
      { offset: 1, key: "order-2", visible: false, aborted: false },
      { offset: 2, key: "order-3", visible: false, aborted: false },
    ],
    txLog: ["Begin: pid=4001, epoch=7", "PrepareCommit"],
    consumed: [],
  },
  {
    label: "3b. control markers written, COMPLETE_COMMIT",
    detail: "Coordinator writes a COMMIT marker to every partition the producer touched. read_committed consumers can now see the records.",
    txState: "complete_commit",
    producer: { pid: 4001, epoch: 7, sequence: 3 },
    log: [
      { offset: 0, key: "order-1", visible: true, aborted: false },
      { offset: 1, key: "order-2", visible: true, aborted: false },
      { offset: 2, key: "order-3", visible: true, aborted: false },
      { offset: 3, key: "<COMMIT marker>", visible: true, aborted: false },
    ],
    txLog: ["Begin", "PrepareCommit", "CompleteCommit"],
    consumed: [0, 1, 2],
  },
];

const ABORT_STEPS: TxStep[] = [
  STEPS[0],
  STEPS[1],
  {
    label: "3a. abortTransaction() → PREPARE_ABORT",
    detail: "Producer hits an error. Coordinator durably records the abort intent.",
    txState: "prepare_abort",
    producer: { pid: 4001, epoch: 7, sequence: 3 },
    log: [
      { offset: 0, key: "order-1", visible: false, aborted: false },
      { offset: 1, key: "order-2", visible: false, aborted: false },
      { offset: 2, key: "order-3", visible: false, aborted: false },
    ],
    txLog: ["Begin: pid=4001, epoch=7", "PrepareAbort"],
    consumed: [],
  },
  {
    label: "3b. ABORT markers written, COMPLETE_ABORT",
    detail:
      "Coordinator writes ABORT markers. The records remain in the log but read_committed consumers skip them entirely. The disk space is reclaimed by the log cleaner.",
    txState: "complete_abort",
    producer: { pid: 4001, epoch: 7, sequence: 3 },
    log: [
      { offset: 0, key: "order-1", visible: false, aborted: true },
      { offset: 1, key: "order-2", visible: false, aborted: true },
      { offset: 2, key: "order-3", visible: false, aborted: true },
      { offset: 3, key: "<ABORT marker>", visible: true, aborted: false },
    ],
    txLog: ["Begin", "PrepareAbort", "CompleteAbort"],
    consumed: [],
  },
];

export function TransactionLifecycle({
  startOutcome = "commit",
}: { startOutcome?: "commit" | "abort" } = {}) {
  const [outcome, setOutcome] = useState<"commit" | "abort">(startOutcome);
  const [index, setIndex] = useState(0);
  const steps = useMemo(() => (outcome === "commit" ? STEPS : ABORT_STEPS), [outcome]);
  const step = steps[index];

  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">Transaction lifecycle — commit vs abort</span>
        </div>
        <div className="flex gap-1">
          {(["commit", "abort"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                setOutcome(o);
                setIndex(0);
              }}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                outcome === o
                  ? "border-fd-foreground bg-fd-foreground text-fd-background"
                  : "border-fd-border text-fd-muted-foreground hover:bg-fd-accent",
              )}
              aria-pressed={outcome === o}
            >
              {o}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="rounded-md border border-fd-border bg-fd-background p-3 text-sm">
          <div className="font-mono text-xs text-fd-muted-foreground">{step.label}</div>
          <p className="mt-1 leading-relaxed">{step.detail}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-fd-border bg-fd-background">
            <div className="border-b border-fd-border px-3 py-2 font-mono text-xs text-fd-muted-foreground">
              user topic: orders
            </div>
            {step.log.length === 0 ? (
              <p className="p-3 font-mono text-xs text-fd-muted-foreground">
                empty
              </p>
            ) : (
              <ul className="divide-y divide-fd-border">
                {step.log.map((r) => (
                  <li
                    key={r.offset}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 font-mono text-xs",
                      r.aborted && "text-fd-muted-foreground line-through",
                      !r.visible && !r.aborted && "text-fd-muted-foreground",
                    )}
                  >
                    <span>
                      offset {r.offset} {r.key}
                    </span>
                    {r.visible ? (
                      <Badge tone="success">visible</Badge>
                    ) : r.aborted ? (
                      <Badge tone="danger">aborted</Badge>
                    ) : (
                      <Badge tone="warning">in-flight</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-fd-border bg-fd-background">
            <div className="border-b border-fd-border px-3 py-2 font-mono text-xs text-fd-muted-foreground">
              __transaction_state (coordinator)
            </div>
            <ul className="divide-y divide-fd-border">
              {step.txLog.map((entry, i) => (
                <li
                  key={i}
                  className="px-3 py-2 font-mono text-xs text-fd-muted-foreground"
                >
                  {entry}
                </li>
              ))}
            </ul>
            <div className="border-t border-fd-border bg-fd-muted/40 p-3 font-mono text-[11px] text-fd-muted-foreground">
              producer pid={step.producer.pid} epoch={step.producer.epoch} seq=
              {step.producer.sequence}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            ← prev
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
            disabled={index === steps.length - 1}
          >
            next →
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIndex(0)}>
            reset
          </Button>
          <span className="ml-auto font-mono text-xs text-fd-muted-foreground">
            consumed (read_committed): {step.consumed.length}
          </span>
        </div>
      </div>
    </figure>
  );
}
