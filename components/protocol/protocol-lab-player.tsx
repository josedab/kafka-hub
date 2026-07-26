"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { ProtocolLab } from "@/lib/protocol-lab";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { SequenceView } from "./sequence-view";
import { WireView } from "./wire-view";

const AUTOPLAY_INTERVAL_MS = 3200;

type Mode = "sequence" | "wire";

function isShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(target.tagName);
}

export function ProtocolLabPlayer({ lab }: { lab: ProtocolLab }) {
  const [variantIndex, setVariantIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("sequence");
  const [playing, setPlaying] = useState(false);

  const variant = lab.variants[variantIndex];
  const steps = variant.steps;
  const step = steps[stepIndex];
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === steps.length - 1;

  // Moving to (or landing on) the last step always pauses — deterministic
  // reset/replay is an explicit Reset, never a silent loop.
  const goToStep = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, steps.length - 1));
      setStepIndex(clamped);
      if (clamped === steps.length - 1) setPlaying(false);
    },
    [steps.length],
  );

  const goNext = useCallback(() => goToStep(stepIndex + 1), [goToStep, stepIndex]);
  const goPrev = useCallback(() => goToStep(stepIndex - 1), [goToStep, stepIndex]);

  const reset = useCallback(() => {
    setPlaying(false);
    setStepIndex(0);
  }, []);

  const togglePlaying = useCallback(() => {
    // Never start playing from the last step — there is nothing to advance to.
    setPlaying((p) => (p ? false : !atEnd));
  }, [atEnd]);

  const selectVariant = useCallback((index: number) => {
    setVariantIndex(index);
    setStepIndex(0);
    setPlaying(false);
  }, []);

  const handleScenarioKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      const lastIndex = lab.variants.length - 1;
      let nextIndex: number | undefined;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = index === lastIndex ? 0 : index + 1;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = index === 0 ? lastIndex : index - 1;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = lastIndex;
      }

      if (nextIndex === undefined) return;
      event.preventDefault();
      selectVariant(nextIndex);
      const radios =
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      radios?.[nextIndex]?.focus();
    },
    [lab.variants.length, selectVariant],
  );

  // Autoplay loop. The interval callback (not the effect body itself) is
  // what advances state, so this synchronizes with the external timer
  // rather than setting state synchronously during the effect.
  useEffect(() => {
    if (!playing || atEnd) return;
    const id = window.setInterval(() => {
      setStepIndex((i) => {
        const next = Math.min(i + 1, steps.length - 1);
        if (next >= steps.length - 1) setPlaying(false);
        return next;
      });
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, atEnd, steps.length]);

  // Keyboard shortcuts are scoped to the focusable player container. This
  // preserves native page scrolling/navigation when focus is elsewhere.
  const handlePlayerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      if (isShortcutTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        togglePlaying();
      } else if (event.key === "Home") {
        event.preventDefault();
        goToStep(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goToStep(steps.length - 1);
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        reset();
      }
    },
    [goNext, goPrev, goToStep, reset, togglePlaying, steps.length],
  );

  const stepLabel = useMemo(() => `Step ${stepIndex + 1} of ${steps.length}`, [stepIndex, steps.length]);

  return (
    <div
      className="flex flex-col gap-5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fd-foreground"
      tabIndex={0}
      onKeyDown={handlePlayerKeyDown}
      aria-label="Protocol player. Use arrow keys to change steps, space to play or pause, and R to reset."
    >
      {/* Variant selector */}
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fd-muted-foreground">
          Scenario
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select a scenario">
          {lab.variants.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={i === variantIndex}
              tabIndex={i === variantIndex ? 0 : -1}
              onClick={() => selectVariant(i)}
              onKeyDown={(event) => handleScenarioKeyDown(event, i)}
              className={cn(
                "min-h-11 rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-foreground",
                i === variantIndex
                  ? "border-fd-foreground bg-fd-foreground/5"
                  : "border-fd-border bg-fd-card hover:border-fd-foreground/30",
              )}
            >
              <span className="block font-semibold">{v.label}</span>
              <span className="mt-0.5 block max-w-xs text-fd-muted-foreground">{v.summary}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mode switch + controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-fd-border bg-fd-card p-3">
        <div className="flex rounded-md border border-fd-border p-0.5" role="tablist" aria-label="Display mode">
          {(["sequence", "wire"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "min-h-9 rounded px-3 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-fd-foreground text-fd-background"
                  : "text-fd-muted-foreground hover:text-fd-foreground",
              )}
            >
              {m === "sequence" ? "Sequence" : "Wire"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={goPrev}
            disabled={atStart}
            aria-label="Previous step"
            className="min-h-[44px]"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={togglePlaying}
            disabled={atEnd && !playing}
            className="min-h-[44px]"
          >
            {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            {playing ? "pause" : "play"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={goNext}
            disabled={atEnd}
            aria-label="Next step"
            className="min-h-[44px]"
          >
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={reset} className="min-h-[44px]">
            <RotateCcw className="size-3.5" aria-hidden /> reset
          </Button>
        </div>

        <span
          className="ml-auto font-mono text-[11px] text-fd-muted-foreground"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {stepLabel}: {step.title}
        </span>
      </div>

      {/* Timeline */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Step timeline"
      >
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === stepIndex}
            aria-label={`Step ${i + 1}: ${s.title}`}
            title={s.title}
            onClick={() => goToStep(i)}
            className={cn(
              "h-2.5 min-w-[1.5rem] flex-1 shrink-0 rounded-full border transition-colors motion-reduce:transition-none",
              i === stepIndex
                ? "border-fd-foreground bg-fd-foreground"
                : i < stepIndex
                  ? "border-fd-foreground/40 bg-fd-foreground/30"
                  : "border-fd-border bg-fd-muted",
            )}
          />
        ))}
      </div>

      {/* Content */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-5">
        {mode === "sequence" ? (
          <SequenceView actors={lab.actors} step={step} />
        ) : (
          <WireView step={step} />
        )}
      </div>

      <p className="font-mono text-[11px] text-fd-muted-foreground">
        Keyboard: <kbd className="rounded border border-fd-border px-1">←</kbd>/
        <kbd className="rounded border border-fd-border px-1">→</kbd> step ·{" "}
        <kbd className="rounded border border-fd-border px-1">space</kbd> play/pause ·{" "}
        <kbd className="rounded border border-fd-border px-1">home</kbd>/
        <kbd className="rounded border border-fd-border px-1">end</kbd> jump ·{" "}
        <kbd className="rounded border border-fd-border px-1">r</kbd> reset
      </p>
    </div>
  );
}
