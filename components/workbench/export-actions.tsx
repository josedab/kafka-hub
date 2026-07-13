"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { SanitizationWarning } from "@/components/sanitization-warning";
import { cn } from "@/lib/cn";

interface ExportActionsProps {
  /** Generate Markdown export content. */
  onExportMarkdown: () => { content: string; redactionSummary: string };
  /** Generate JSON export content. */
  onExportJson: () => { content: string; redactionSummary: string };
  /** Safe filename prefix without an extension. */
  filenamePrefix: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Export action buttons: copy to clipboard and download as file.
 */
export function ExportActions({
  onExportMarkdown,
  onExportJson,
  filenamePrefix,
  disabled,
  className,
}: ExportActionsProps) {
  const [copied, setCopied] = useState<"md" | "json" | null>(null);
  const [lastRedaction, setLastRedaction] = useState<string | null>(null);

  const handleCopy = useCallback(
    async (format: "md" | "json") => {
      const exporter = format === "md" ? onExportMarkdown : onExportJson;
      const { content, redactionSummary } = exporter();
      setLastRedaction(redactionSummary);
      try {
        await navigator.clipboard.writeText(content);
        setCopied(format);
        setTimeout(() => setCopied(null), 2000);
      } catch {
        // Fallback: prompt
        window.prompt(`Copy ${format.toUpperCase()}:`, content.slice(0, 1000));
      }
    },
    [onExportMarkdown, onExportJson],
  );

  const handleDownload = useCallback(
    (format: "md" | "json") => {
      const exporter = format === "md" ? onExportMarkdown : onExportJson;
      const { content, redactionSummary } = exporter();
      setLastRedaction(redactionSummary);
      const mimeType = format === "md" ? "text/markdown" : "application/json";
      const ext = format === "md" ? "md" : "json";
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safePrefix =
        filenamePrefix.replace(/[^a-zA-Z0-9_-]+/g, "-") || "kafka-workbench";
      a.href = url;
      a.download = `${safePrefix}-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [filenamePrefix, onExportMarkdown, onExportJson],
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleCopy("md")}
          disabled={disabled}
          aria-label="Copy Markdown to clipboard"
        >
          {copied === "md" ? "Copied" : "Copy Markdown"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleCopy("json")}
          disabled={disabled}
          aria-label="Copy JSON to clipboard"
        >
          {copied === "json" ? "Copied" : "Copy JSON"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleDownload("md")}
          disabled={disabled}
          aria-label="Download Markdown file"
        >
          Download .md
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleDownload("json")}
          disabled={disabled}
          aria-label="Download JSON file"
        >
          Download .json
        </Button>
      </div>
      <SanitizationWarning />
      {lastRedaction && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-fd-muted-foreground"
        >
          {lastRedaction}
        </p>
      )}
    </div>
  );
}
