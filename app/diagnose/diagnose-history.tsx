"use client";

import { useState } from "react";
import { ChevronDown, Clock3, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const DIAGNOSE_HISTORY_KEY = "kafka-hub:diagnose:history";

export interface DiagnoseHistoryEntry {
  ts: number;
  config: string;
  parsedKeys: number;
  dangerCount: number;
  warningCount: number;
}

interface DiagnoseHistoryProps {
  entries: DiagnoseHistoryEntry[];
  onSelect: (config: string) => void;
  onClear: () => void;
  className?: string;
  disabled?: boolean;
}

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

function summarizeConfig(config: string): string {
  const firstMeaningfulLine = config
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  return firstMeaningfulLine ?? "Kafka config";
}

export function DiagnoseHistory({
  entries,
  onSelect,
  onClear,
  className,
  disabled = false,
}: DiagnoseHistoryProps) {
  const [open, setOpen] = useState(true);

  if (entries.length === 0) return null;

  return (
    <aside
      className={cn(
        "h-fit rounded-xl border border-fd-border bg-fd-card/80 p-3 shadow-sm xl:sticky xl:top-24",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-auto flex-1 justify-start px-0 hover:bg-transparent"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <Clock3 className="size-3.5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Recent runs
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 transition-transform",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={onClear}
        >
          <Trash2 className="size-3" aria-hidden />
          Clear history
        </Button>
      </div>

      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          {entries.map((entry) => (
            <Button
              key={`${entry.ts}-${entry.config.slice(0, 24)}`}
              variant="secondary"
              size="sm"
              className="h-auto w-full flex-col items-start justify-start gap-1.5 rounded-lg px-3 py-2 text-left"
              onClick={() => onSelect(entry.config)}
              disabled={disabled}
            >
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                  {summarizeConfig(entry.config)}
                </span>
                <span className="shrink-0 text-[10px] text-fd-muted-foreground">
                  {formatRelativeTime(entry.ts)}
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Badge tone="neutral">{entry.parsedKeys} keys</Badge>
                <Badge tone="danger">{entry.dangerCount} danger</Badge>
                <Badge tone="warning">{entry.warningCount} warning</Badge>
              </span>
            </Button>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
