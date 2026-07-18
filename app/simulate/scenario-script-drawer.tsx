"use client";

import {
  type ForwardRefExoticComponent,
  type RefAttributes,
  type SyntheticEvent,
  useState,
} from "react";
import {
  Heart,
  Minus,
  Plus,
  RefreshCw,
  Send,
  Skull,
  Timer,
  UserPlus,

  Zap,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Scenario, ScenarioOp } from "@kafka-hub/kafka-sim";

type PreviewOp = ScenarioOp | { kind: "addGroup"; note?: string };
type Icon = ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
>;

interface OpMeta {
  icon: Icon;
  label: string;
  detail: string;
  tone: string;
}

function pluralizeTick(count: number) {
  return `${count} tick${count === 1 ? "" : "s"}`;
}

function opMeta(op: PreviewOp): OpMeta {
  switch (op.kind) {
    case "killBroker":
      return {
        icon: Skull,
        label: "kill broker",
        detail: `broker ${op.brokerId}`,
        tone: "text-red-600 dark:text-red-300",
      };
    case "reviveBroker":
      return {
        icon: Heart,
        label: "revive broker",
        detail: `broker ${op.brokerId}`,
        tone: "text-emerald-600 dark:text-emerald-300",
      };
    case "inducePartition":
      return {
        icon: Zap,
        label: "induce partition",
        detail: `{${op.groupA.join(",")}} | {${op.groupB.join(",")}}`,
        tone: "text-amber-600 dark:text-amber-300",
      };
    case "healPartition":
      return {
        icon: Heart,
        label: "heal partition",
        detail: "restore network links",
        tone: "text-emerald-600 dark:text-emerald-300",
      };
    case "produce":
      return {
        icon: Send,
        label: "produce",
        detail: `p${op.partition}${op.key ? ` · key=${op.key}` : ""} · ${op.value}`,
        tone: "text-sky-600 dark:text-sky-300",
      };
    case "wait":
      return {
        icon: Timer,
        label: "step",
        detail: pluralizeTick(op.ticks),
        tone: "text-fd-muted-foreground",
      };
    case "shrinkIsrLag":
      return {
        icon: Zap,
        label: "shrink ISR",
        detail: `broker ${op.brokerId} lag ${op.lagMs.toLocaleString()}ms`,
        tone: "text-amber-600 dark:text-amber-300",
      };
    case "addGroup":
      return {
        icon: Plus,
        label: "add group",
        detail: "consumer group",
        tone: "text-violet-600 dark:text-violet-300",
      };
    case "consumerJoin":
      return {
        icon: UserPlus,
        label: "join",
        detail: `${op.memberId} -> ${op.groupId}`,
        tone: "text-emerald-600 dark:text-emerald-300",
      };
    case "consumerLeave":
      return {
        icon: Minus,
        label: "leave",
        detail: `${op.memberId} <- ${op.groupId}`,
        tone: "text-amber-600 dark:text-amber-300",
      };
    case "consumerCrash":
      return {
        icon: Skull,
        label: "crash",
        detail: `${op.memberId} in ${op.groupId}`,
        tone: "text-red-600 dark:text-red-300",
      };
    case "consumerRestart":
      return {
        icon: Heart,
        label: "restart",
        detail: `${op.memberId} in ${op.groupId}`,
        tone: "text-emerald-600 dark:text-emerald-300",
      };
    case "consumerScaleOut":
      return {
        icon: UserPlus,
        label: "scale out",
        detail: `+${op.memberIds.length} in ${op.groupId}`,
        tone: "text-sky-600 dark:text-sky-300",
      };
    case "consumerRollingRestartStep":
      return {
        icon: RefreshCw,
        label: "rolling restart",
        detail: `${op.memberId} in ${op.groupId}`,
        tone: "text-violet-600 dark:text-violet-300",
      };
  }
}

export function ScenarioScriptDrawer({
  scenario,
  opIndex,
  onJumpTo,
  defaultOpen,
  className,
}: {
  scenario: Scenario;
  opIndex: number;
  onJumpTo: (index: number) => void;
  defaultOpen: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(event.currentTarget.open);
  };

  return (
    <details
      className={cn(
        "overflow-hidden rounded-xl border border-fd-border bg-fd-card",
        className,
      )}
      open={open}
      onToggle={handleToggle}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>Scenario script ({scenario.script.length} ops)</span>
        <span className="ml-auto font-mono text-[11px] font-normal text-fd-muted-foreground">
          current {Math.min(opIndex + 1, scenario.script.length)}/{scenario.script.length}
        </span>
      </summary>

      <ol className="max-h-[360px] overflow-y-auto border-t border-fd-border p-2">
        {scenario.script.map((op, index) => {
          const meta = opMeta(op);
          const IconComponent = meta.icon;
          const current = index === opIndex;

          return (
            <li key={`${op.kind}-${index}`}>
              <button
                type="button"
                className={cn(
                  "grid min-h-[44px] w-full grid-cols-[2.75rem_1.75rem_minmax(0,1fr)] items-start gap-3 rounded-lg border-l-4 px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-foreground",
                  current
                    ? "border-l-fd-foreground bg-fd-foreground/10"
                    : "border-l-transparent hover:bg-fd-muted/60",
                )}
                aria-current={current ? "step" : undefined}
                onClick={() => onJumpTo(index)}
              >
                <span className="font-mono text-[11px] text-fd-muted-foreground">
                  #{String(index + 1).padStart(2, "0")}
                </span>
                <IconComponent
                  className={cn("mt-0.5 size-4", meta.tone)}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="min-w-0 break-words font-mono text-[11px] text-fd-muted-foreground">
                      {meta.detail}
                    </span>
                  </span>
                  {op.note ? (
                    <span className="mt-1 block min-w-0 break-words text-xs leading-relaxed text-fd-muted-foreground">
                      {op.note}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
