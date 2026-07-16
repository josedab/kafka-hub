"use client";

import { useState } from "react";
import { Copy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SanitizationWarning } from "@/components/sanitization-warning";
import { prepareForClipboard, type RedactionReport } from "@kafka-hub/kafka-diagnose";

export function CopyFixButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<RedactionReport | null>(null);

  async function copyFix() {
    // Redact via egress boundary before clipboard
    const { payload, report: redactReport } = prepareForClipboard(value);
    setReport(redactReport);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy fixed config:", payload);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="sm" onClick={copyFix}>
        <Copy className="size-3.5" aria-hidden />
        {copied ? "Copied" : "Copy fix"}
      </Button>
      {report && report.count > 0 && (
        <div
          className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"
          role="status"
          aria-live="polite"
          aria-label={report.summary}
        >
          <ShieldAlert className="size-3.5" aria-hidden />
          <span>{report.summary}</span>
        </div>
      )}
      <SanitizationWarning compact className="max-w-sm" />
    </div>
  );
}
