"use client";

import {
  CircleQuestionMark,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ScenarioControls({
  scenario,
  opIndex,
  playing,
  workerActive,
  onPlayToggle,
  onStep,
  onReset,
  onTick,
  onProduce,
  onOpenShortcuts,
}: {
  scenario: { script: { kind: string; note?: string }[] };
  opIndex: number;
  playing: boolean;
  workerActive: boolean;
  onPlayToggle: () => void;
  onStep: () => void;
  onReset: () => void;
  onTick: () => void;
  onProduce: () => void;
  onOpenShortcuts: () => void;
}) {
  const op = scenario.script[opIndex];
  const done = opIndex >= scenario.script.length;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-fd-border bg-fd-card p-3">
      <Button variant="primary" size="sm" onClick={onPlayToggle} disabled={done} className="min-h-[44px]">
        {playing ? (
          <Pause className="size-3.5" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
        {playing ? "pause" : done ? "done" : "play"}
      </Button>
      <Button variant="secondary" size="sm" onClick={onStep} disabled={done} className="min-h-[44px]">
        <SkipForward className="size-3.5" aria-hidden /> next op
      </Button>
      <Button variant="ghost" size="sm" onClick={onTick} className="min-h-[44px]">
        +1 tick
      </Button>
      <Button variant="ghost" size="sm" onClick={onProduce} className="min-h-[44px]">
        produce
      </Button>
      <Button variant="ghost" size="sm" onClick={onReset} className="min-h-[44px]">
        <RotateCcw className="size-3.5" aria-hidden /> reset
      </Button>
      <Button
        aria-label="Open keyboard shortcuts"
        className="min-h-[44px] px-2"
        size="sm"
        variant="ghost"
        onClick={onOpenShortcuts}
      >
        <CircleQuestionMark className="size-3.5" aria-hidden />
        <span className="sr-only">Keyboard shortcuts</span>
      </Button>

      <div className="flex min-w-0 basis-full items-center gap-3 font-mono text-[11px] text-fd-muted-foreground sm:ml-auto sm:basis-auto">
        <Badge
          className="shrink-0 max-[420px]:hidden"
          tone={workerActive ? "success" : "neutral"}
          title={
            workerActive
              ? "Engine running in a Web Worker — main thread stays free."
              : "Engine running synchronously on the main thread."
          }
        >
          {workerActive ? "worker" : "sync"}
        </Badge>
        <span className="shrink-0">
          op {Math.min(opIndex + 1, scenario.script.length)}/{scenario.script.length}
        </span>
        {op?.note ? <span className="min-w-0 truncate">· {op.note}</span> : null}
      </div>
    </div>
  );
}
