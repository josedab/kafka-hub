"use client";

import { useCallback, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const MAX_CONFIG_DROP_BYTES = 100 * 1024;

interface ConfigInputProps {
  value: string;
  onChange: (value: string) => void;
  sample: string;
  parsedKeys: number;
  ruleCount: number;
}

export function ConfigInput({
  value,
  onChange,
  sample,
  parsedKeys,
  ruleCount,
}: ConfigInputProps) {
  const [isConfigDragging, setIsConfigDragging] = useState(false);

  const handleConfigDragOver = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setIsConfigDragging(true);
    },
    [],
  );

  const handleConfigDrop = useCallback(
    async (event: DragEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsConfigDragging(false);

      const file = event.dataTransfer.files.item(0);
      if (!file) return;

      const text = await file.slice(0, MAX_CONFIG_DROP_BYTES).text();
      onChange(text);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Paste config
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onChange(sample)}
          >
            Load sample
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange("")}>
            Clear
          </Button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onDragEnter={() => setIsConfigDragging(true)}
        onDragOver={handleConfigDragOver}
        onDragLeave={() => setIsConfigDragging(false)}
        onDrop={handleConfigDrop}
        spellCheck={false}
        className={cn(
          "min-h-[420px] w-full resize-y rounded-xl border border-fd-border bg-fd-card p-4 font-mono text-xs leading-relaxed text-fd-foreground shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
          isConfigDragging && "border-sky-400 bg-sky-500/5",
        )}
        aria-label="Kafka configuration text"
      />
      <p className="font-mono text-[11px] text-fd-muted-foreground">
        {parsedKeys} key{parsedKeys === 1 ? "" : "s"} parsed ·
        findings update as you type · {ruleCount} rules loaded
      </p>
    </div>
  );
}
