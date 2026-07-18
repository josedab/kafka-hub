"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ClusterState, ConsumerGroup, RebalanceEvent } from "@kafka-hub/kafka-sim";

// ───────────────────────── protocol explanation ─────────────────────────

function protocolLabel(g: ConsumerGroup): string {
  if (g.groupProtocol === "consumer") return "KIP-848 Consumer Protocol";
  if (g.classicAssignmentBehavior === "eager") return "Classic / Eager";
  return "Classic / Cooperative";
}

function assignorLabel(g: ConsumerGroup): string {
  return g.assignor;
}

function protocolDescription(g: ConsumerGroup): string {
  if (g.groupProtocol === "consumer") {
    return "Broker-coordinated assignment with group/member epochs, server-side uniform assignor, and incremental reconciliation. Not the classic cooperative assignor — this is a fundamentally different protocol (KIP-848).";
  }
  if (g.classicAssignmentBehavior === "eager") {
    return `Stop-the-world rebalance (${g.assignor} assignor): all consumers pause, revoke all partitions, then get reassigned. Maximum processing disruption.`;
  }
  return `Incremental rebalance (${g.assignor} assignor): only moved partitions are revoked. Unaffected consumers continue processing without pause.`;
}

function reconciliationLabel(g: ConsumerGroup): string | null {
  if (g.groupProtocol !== "consumer") return null;
  return g.reconciliationState;
}

// ───────────────────────── duplicate risk badge ─────────────────────────

function DuplicateRiskBadge({ risk }: { risk: RebalanceEvent["duplicateRisk"] }) {
  const tone = risk.level === "elevated" || risk.level === "high" ? "warning" : "neutral";
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge tone={tone}>
        Duplicate risk: {risk.level}
      </Badge>
      <span className="text-[10px] leading-tight text-fd-muted-foreground">
        {risk.reason}
      </span>
    </span>
  );
}

// ───────────────────────── rebalance event detail ─────────────────────────

function RebalanceEventDetail({ evt }: { evt: RebalanceEvent }) {
  const movedCount = evt.movedPartitions.length;
  const revokedTotal = Object.values(evt.revokedPartitions).flat().length;
  const assignedTotal = Object.values(evt.assignedPartitions).flat().length;

  return (
    <div className="rounded-lg border border-fd-border bg-fd-background p-3 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Badge tone="neutral">{evt.operation}</Badge>
        <span className="font-mono text-fd-muted-foreground">
          epoch {evt.groupEpoch}
        </span>
        <Badge tone="neutral">{evt.assignor}</Badge>
        {evt.reconciliationState ? (
          <Badge tone={evt.reconciliationState === "stable" ? "success" : "warning"}>
            {evt.reconciliationState}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="font-semibold text-fd-muted-foreground">Protocol</dt>
        <dd>{evt.groupProtocol}{evt.classicAssignmentBehavior ? ` / ${evt.classicAssignmentBehavior}` : ""}</dd>

        <dt className="font-semibold text-fd-muted-foreground">Assignor</dt>
        <dd>{evt.assignor}</dd>

        <dt className="font-semibold text-fd-muted-foreground">Moved</dt>
        <dd>
          {movedCount} partition{movedCount !== 1 ? "s" : ""}
          {movedCount > 0 ? (
            <ul className="mt-0.5 space-y-0.5 pl-2">
              {evt.movedPartitions.map(([pId, from, to]) => (
                <li key={pId} className="font-mono text-[10px]">
                  p{pId}: {from ?? "∅"} → {to ?? "∅"}
                </li>
              ))}
            </ul>
          ) : null}
        </dd>

        <dt className="font-semibold text-fd-muted-foreground">Revoked</dt>
        <dd>
          {revokedTotal} partition{revokedTotal !== 1 ? "s" : ""}
          {revokedTotal > 0 ? (
            <ul className="mt-0.5 space-y-0.5 pl-2">
              {Object.entries(evt.revokedPartitions)
                .filter(([, parts]) => parts.length > 0)
                .map(([memberId, parts]) => (
                  <li key={memberId} className="font-mono text-[10px]">
                    {memberId}: [{parts.join(", ")}]
                  </li>
                ))}
            </ul>
          ) : null}
        </dd>

        <dt className="font-semibold text-fd-muted-foreground">Assigned</dt>
        <dd>
          {assignedTotal} partition{assignedTotal !== 1 ? "s" : ""}
          {assignedTotal > 0 ? (
            <ul className="mt-0.5 space-y-0.5 pl-2">
              {Object.entries(evt.assignedPartitions)
                .filter(([, parts]) => parts.length > 0)
                .map(([memberId, parts]) => (
                  <li key={memberId} className="font-mono text-[10px]">
                    {memberId}: [{parts.join(", ")}]
                  </li>
                ))}
            </ul>
          ) : null}
        </dd>

        {evt.pausedMembers.length > 0 ? (
          <>
            <dt className="font-semibold text-fd-muted-foreground">Paused</dt>
            <dd>
              {evt.pausedMembers.join(", ")} ({evt.pauseTicks} tick{evt.pauseTicks !== 1 ? "s" : ""})
            </dd>
          </>
        ) : (
          <>
            <dt className="font-semibold text-fd-muted-foreground">Paused</dt>
            <dd className="text-emerald-700 dark:text-emerald-300">none — no processing pause</dd>
          </>
        )}

        {evt.unassignedPartitions.length > 0 ? (
          <>
            <dt className="font-semibold text-fd-muted-foreground">Pending</dt>
            <dd className="text-sky-700 dark:text-sky-300">
              [{evt.unassignedPartitions.join(", ")}] — awaiting reconciliation
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-2">
        <DuplicateRiskBadge risk={evt.duplicateRisk} />
      </div>
    </div>
  );
}

// ───────────────────────── manual controls ─────────────────────────

function GroupControls({
  groupId,
  members,
  onJoin,
  onLeave,
  onCrash,
  onScaleOut,
  onRollingRestart,
}: {
  groupId: string;
  members: ConsumerGroup["members"];
  onJoin?: (groupId: string, memberId: string) => void;
  onLeave?: (groupId: string, memberId: string) => void;
  onCrash?: (groupId: string, memberId: string) => void;
  onScaleOut?: (groupId: string) => void;
  onRollingRestart?: (groupId: string, memberId: string) => void;
}) {
  const aliveMembers = members.filter((m) => m.alive);
  const deadMembers = members.filter((m) => !m.alive);

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {onScaleOut ? (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] text-[11px]"
          onClick={() => onScaleOut(groupId)}
        >
          + scale out
        </Button>
      ) : null}
      {aliveMembers.map((m) => (
        <div key={m.id} className="flex gap-1">
          {onLeave ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-[11px]"
              onClick={() => onLeave(groupId, m.id)}
              title={`Graceful leave ${m.id}`}
            >
              leave {m.id}
            </Button>
          ) : null}
          {onCrash ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-[11px] text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={() => onCrash(groupId, m.id)}
              title={`Crash ${m.id} — no offset commit`}
            >
              crash {m.id}
            </Button>
          ) : null}
          {onRollingRestart ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-[11px]"
              onClick={() => onRollingRestart(groupId, m.id)}
              title={`Rolling restart ${m.id}`}
            >
              restart {m.id}
            </Button>
          ) : null}
        </div>
      ))}
      {deadMembers.map((m) => (
        <Button
          key={`join-${m.id}`}
          variant="ghost"
          size="sm"
          className="min-h-[44px] text-[11px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          onClick={() => onJoin?.(groupId, m.id)}
          title={`Rejoin ${m.id}`}
        >
          rejoin {m.id}
        </Button>
      ))}
    </div>
  );
}

// ───────────────────────── main component ─────────────────────────

export function ConsumerGroups({
  state,
  lag,
  onJoin,
  onLeave,
  onCrash,
  onScaleOut,
  onRollingRestart,
}: {
  state: ClusterState;
  lag: number;
  onJoin?: (groupId: string, memberId: string) => void;
  onLeave?: (groupId: string, memberId: string) => void;
  onCrash?: (groupId: string, memberId: string) => void;
  onScaleOut?: (groupId: string) => void;
  onRollingRestart?: (groupId: string, memberId: string) => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-fd-border px-4 py-2 text-xs text-fd-muted-foreground">
        <span className="font-mono">consumer groups</span>
        <span className="font-mono">total lag = {lag}</span>
      </header>
      <ul className="divide-y divide-fd-border">
        {state.groups.map((g) => {
          const lastRebalance = g.rebalanceEvents.length > 0
            ? g.rebalanceEvents[g.rebalanceEvents.length - 1]
            : null;
          const reconState = reconciliationLabel(g);

          return (
            <li key={g.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{g.id}</span>
                <span className="font-mono text-xs text-fd-muted-foreground">
                  {g.consumeRatePerTick}rec/tick
                </span>
              </div>

              {/* Protocol explanation */}
              <div className="mt-2 rounded-lg border border-fd-border bg-fd-muted/30 p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Badge tone="neutral">{protocolLabel(g)}</Badge>
                  <Badge tone="neutral">{assignorLabel(g)}</Badge>
                  <span className="font-mono text-[11px] text-fd-muted-foreground">
                    group epoch {g.groupEpoch}
                  </span>
                  {reconState ? (
                    <Badge tone={reconState === "stable" ? "success" : "warning"}>
                      {reconState}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-fd-muted-foreground">
                  {protocolDescription(g)}
                </p>
              </div>

              {/* Members */}
              <ul className="mt-2 space-y-1.5">
                {g.members.map((m) => {
                  const memberLag = m.alive
                    ? m.assigned.reduce((acc, pId) => {
                        const p = state.topic.partitions.find((x) => x.id === pId);
                        if (!p) return acc;
                        return acc + Math.max(0, p.hw - (m.committed[pId] ?? 0));
                      }, 0)
                    : 0;
                  return (
                    <li
                      key={m.id}
                      className={cn(
                        "flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-xs",
                        m.alive
                          ? m.paused
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-fd-border bg-fd-background"
                          : "border-red-500/30 bg-red-500/5",
                      )}
                    >
                      <span className="min-w-0 break-words font-mono">
                        {m.id}
                        {!m.alive ? (
                          <span className="ml-1 text-red-600 dark:text-red-400">[dead]</span>
                        ) : m.paused ? (
                          <span className="ml-1 text-amber-600 dark:text-amber-400">[paused]</span>
                        ) : null}
                      </span>
                      <span className="font-mono text-fd-muted-foreground">
                        [{m.assigned.join(",")}]
                        {m.pendingAssigned.length > 0 ? (
                          <span className="ml-1 text-sky-600 dark:text-sky-400">
                            pending:[{m.pendingAssigned.join(",")}]
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-fd-muted-foreground">
                        epoch {m.memberEpoch} · lag {memberLag}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Unassigned partitions info */}
              {g.reconciliationState === "reconciling" ? (
                <div className="mt-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-1.5 text-xs text-sky-700 dark:text-sky-300">
                  <span className="font-semibold">Reconciling</span> — pending partition assignments will activate on next step()
                </div>
              ) : null}

              {/* Latest rebalance event */}
              {lastRebalance ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-fd-muted-foreground">
                    Latest rebalance event
                  </summary>
                  <div className="mt-1.5">
                    <RebalanceEventDetail evt={lastRebalance} />
                  </div>
                </details>
              ) : null}

              {/* Manual controls */}
              {(onJoin || onLeave || onCrash || onScaleOut || onRollingRestart) ? (
                <GroupControls
                  groupId={g.id}
                  members={g.members}
                  onJoin={onJoin}
                  onLeave={onLeave}
                  onCrash={onCrash}
                  onScaleOut={onScaleOut}
                  onRollingRestart={onRollingRestart}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
