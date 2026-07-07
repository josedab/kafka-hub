"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Step = {
  label: string;
  detail: string;
  controller: number | null;
  /** Brokers and their metadata epoch. */
  brokers: Array<{ id: number; alive: boolean; epoch: number; isController: boolean }>;
  topic: { partitions: Array<{ id: number; leader: number | null }> };
  inflightUpdate?: { from: number; to: number; payload: string };
};

const SCRIPT: Step[] = [
  {
    label: "1. healthy",
    detail: "Broker 0 is the controller (epoch 1). Each partition has a leader.",
    controller: 0,
    brokers: [
      { id: 0, alive: true, epoch: 1, isController: true },
      { id: 1, alive: true, epoch: 1, isController: false },
      { id: 2, alive: true, epoch: 1, isController: false },
    ],
    topic: { partitions: [{ id: 0, leader: 0 }, { id: 1, leader: 1 }, { id: 2, leader: 2 }] },
  },
  {
    label: "2. broker 0 crashes",
    detail: "The controller goes offline. The remaining brokers detect a missed heartbeat.",
    controller: null,
    brokers: [
      { id: 0, alive: false, epoch: 1, isController: false },
      { id: 1, alive: true, epoch: 1, isController: false },
      { id: 2, alive: true, epoch: 1, isController: false },
    ],
    topic: { partitions: [{ id: 0, leader: null }, { id: 1, leader: 1 }, { id: 2, leader: 2 }] },
  },
  {
    label: "3. controller election (KRaft quorum vote)",
    detail: "Brokers 1 and 2 race the controller election. Broker 1 wins by Raft term, bumps epoch to 2.",
    controller: 1,
    brokers: [
      { id: 0, alive: false, epoch: 1, isController: false },
      { id: 1, alive: true, epoch: 2, isController: true },
      { id: 2, alive: true, epoch: 1, isController: false },
    ],
    topic: { partitions: [{ id: 0, leader: null }, { id: 1, leader: 1 }, { id: 2, leader: 2 }] },
    inflightUpdate: { from: 1, to: 2, payload: "epoch=2, leader(p0)=2" },
  },
  {
    label: "4. metadata propagation",
    detail: "New controller elects broker 2 as leader for p0 and pushes the updated metadata to every broker.",
    controller: 1,
    brokers: [
      { id: 0, alive: false, epoch: 1, isController: false },
      { id: 1, alive: true, epoch: 2, isController: true },
      { id: 2, alive: true, epoch: 2, isController: false },
    ],
    topic: { partitions: [{ id: 0, leader: 2 }, { id: 1, leader: 1 }, { id: 2, leader: 2 }] },
  },
  {
    label: "5. broker 0 recovers",
    detail: "Broker 0 rejoins, asks the controller for the latest metadata, learns it's no longer the controller.",
    controller: 1,
    brokers: [
      { id: 0, alive: true, epoch: 2, isController: false },
      { id: 1, alive: true, epoch: 2, isController: true },
      { id: 2, alive: true, epoch: 2, isController: false },
    ],
    topic: { partitions: [{ id: 0, leader: 2 }, { id: 1, leader: 1 }, { id: 2, leader: 2 }] },
  },
];

export function ControllerHandoff() {
  const [index, setIndex] = useState(0);
  const step = useMemo(() => SCRIPT[index], [index]);

  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">Controller failover & metadata propagation</span>
        </div>
        <span className="font-mono text-xs text-fd-muted-foreground">
          controller epoch: {Math.max(...step.brokers.map((b) => b.epoch))}
        </span>
      </header>

      <div className="space-y-4 p-4">
        <div className="rounded-md border border-fd-border bg-fd-background p-3 text-sm">
          <div className="font-mono text-xs text-fd-muted-foreground">{step.label}</div>
          <p className="mt-1 leading-relaxed">{step.detail}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {step.brokers.map((b) => (
            <div
              key={b.id}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                !b.alive
                  ? "border-red-500/30 bg-red-500/5"
                  : b.isController
                    ? "border-sky-500/40 bg-sky-500/10"
                    : "border-fd-border bg-fd-background",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">broker {b.id}</span>
                {b.isController && b.alive ? (
                  <Badge tone="info">controller</Badge>
                ) : !b.alive ? (
                  <Badge tone="danger">down</Badge>
                ) : null}
              </div>
              <div className="mt-2 font-mono text-[11px] text-fd-muted-foreground">
                epoch {b.epoch}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-fd-border bg-fd-background">
          <div className="border-b border-fd-border px-3 py-2 font-mono text-xs text-fd-muted-foreground">
            topic partitions
          </div>
          <ul className="divide-y divide-fd-border">
            {step.topic.partitions.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs">partition {p.id}</span>
                {p.leader === null ? (
                  <Badge tone="danger">no leader</Badge>
                ) : (
                  <Badge tone="success">leader = broker {p.leader}</Badge>
                )}
              </li>
            ))}
          </ul>
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
            onClick={() => setIndex((i) => Math.min(SCRIPT.length - 1, i + 1))}
            disabled={index === SCRIPT.length - 1}
          >
            next →
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIndex(0)}>
            reset
          </Button>
          <span className="ml-auto font-mono text-xs text-fd-muted-foreground">
            step {index + 1} / {SCRIPT.length}
          </span>
        </div>
      </div>
    </figure>
  );
}
