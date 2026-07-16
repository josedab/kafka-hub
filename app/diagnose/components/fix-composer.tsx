"use client";

import { useCallback, useMemo, useState } from "react";
import { Copy, Download, FileText, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SanitizationWarning } from "@/components/sanitization-warning";
import { cn } from "@/lib/cn";
import {
  parsePropertiesDocument,
  serializeDocument,
  applyPatches,
  prepareForClipboard,
  prepareForPropertiesDownload,
  type PatchOperation,
  type PatchConflict,
  type DiagnosticFindingWithFix,
  type RedactionReport,
} from "@kafka-hub/kafka-diagnose";

interface FixComposerProps {
  input: string;
  findings: DiagnosticFindingWithFix[];
  selectedFixes: Set<string>;
}

export function FixComposer({ input, findings, selectedFixes }: FixComposerProps) {
  const [copied, setCopied] = useState(false);
  const [lastReport, setLastReport] = useState<RedactionReport | null>(null);

  const fixableFindings = useMemo(
    () => findings.filter((f) => f.structuredFix && selectedFixes.has(f.ruleId)),
    [findings, selectedFixes],
  );

  const patchResult = useMemo(() => {
    if (fixableFindings.length === 0) return null;

    const doc = parsePropertiesDocument(input);
    const operations: PatchOperation[] = fixableFindings.flatMap(
      (f) => f.structuredFix!.operations as PatchOperation[],
    );

    return applyPatches(doc, operations);
  }, [input, fixableFindings]);

  const outputText = useMemo(() => {
    if (!patchResult || !patchResult.ok) return null;
    return serializeDocument(patchResult.document);
  }, [patchResult]);

  const diffPreview = useMemo(() => {
    if (!outputText) return null;
    const inputLines = input.split(/\r?\n/);
    const outputLines = outputText.split(/\r?\n/);
    const diff: Array<{ type: "context" | "removed" | "added"; text: string }> = [];

    let iIn = 0;
    let iOut = 0;

    while (iIn < inputLines.length || iOut < outputLines.length) {
      if (iIn < inputLines.length && iOut < outputLines.length) {
        if (inputLines[iIn] === outputLines[iOut]) {
          diff.push({ type: "context", text: inputLines[iIn] });
          iIn++;
          iOut++;
        } else {
          diff.push({ type: "removed", text: inputLines[iIn] });
          diff.push({ type: "added", text: outputLines[iOut] });
          iIn++;
          iOut++;
        }
      } else if (iIn < inputLines.length) {
        diff.push({ type: "removed", text: inputLines[iIn] });
        iIn++;
      } else {
        diff.push({ type: "added", text: outputLines[iOut] });
        iOut++;
      }
    }

    return diff;
  }, [input, outputText]);

  const copyOutput = useCallback(async () => {
    if (!outputText) return;
    // Apply common-pattern redaction before clipboard egress.
    const { payload, report } = prepareForClipboard(outputText);
    setLastReport(report);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [outputText]);

  const downloadOutput = useCallback(() => {
    if (!outputText) return;
    // Apply common-pattern redaction before download egress.
    const { payload, report } = prepareForPropertiesDownload(outputText);
    setLastReport(report);
    const blob = new Blob([payload], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `server.properties`;
    a.click();
    URL.revokeObjectURL(url);
  }, [outputText]);

  if (selectedFixes.size === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-fd-border bg-fd-card p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-fd-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Fix Composer</h3>
          <Badge tone="info">{selectedFixes.size} fix{selectedFixes.size !== 1 ? "es" : ""} selected</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={copyOutput}
            disabled={!outputText}
          >
            <Copy className="size-3.5" aria-hidden />
            {copied ? "Copied!" : "Copy corrected"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadOutput}
            disabled={!outputText}
          >
            <Download className="size-3.5" aria-hidden />
            Download .properties
          </Button>
        </div>
      </header>
      <SanitizationWarning className="mt-3" />

      {patchResult && !patchResult.ok ? (
        <ConflictsPanel conflicts={patchResult.conflicts} />
      ) : null}

      {lastReport && lastReport.count > 0 ? (
        <RedactionFeedback report={lastReport} />
      ) : null}

      {diffPreview && diffPreview.some((d) => d.type !== "context") ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-fd-border bg-fd-background">
          <div className="border-b border-fd-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
              Merged diff preview
            </span>
          </div>
          <pre className="max-h-[300px] overflow-auto p-3 font-mono text-xs leading-relaxed">
            {diffPreview.map((line, i) => (
              <div
                key={i}
                className={cn(
                  line.type === "removed" && "bg-red-500/10 text-red-700 dark:text-red-300",
                  line.type === "added" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  line.type === "context" && "text-fd-muted-foreground",
                )}
              >
                {line.type === "removed" && "- "}
                {line.type === "added" && "+ "}
                {line.type === "context" && "  "}
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function ConflictsPanel({ conflicts }: { conflicts: readonly PatchConflict[] }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
        Conflicts detected ({conflicts.length})
      </div>
      <ul className="mt-2 space-y-1.5">
        {conflicts.map((c, i) => (
          <li key={i} className="text-xs text-fd-muted-foreground">
            <Badge tone="warning">{c.reason}</Badge>{" "}
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-fd-muted-foreground">
        Deselect conflicting fixes or resolve duplicates manually before applying.
      </p>
    </div>
  );
}

function RedactionFeedback({ report }: { report: RedactionReport }) {
  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
      role="status"
      aria-live="polite"
      aria-label={report.summary}
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="text-xs text-amber-700 dark:text-amber-300">
        <span className="font-semibold">{report.summary}</span>
        {report.keys.length > 0 && (
          <span className="ml-1 text-fd-muted-foreground">
            Keys: {report.keys.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
