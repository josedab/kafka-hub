"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SanitizationWarning } from "@/components/sanitization-warning";
import { cn } from "@/lib/cn";
import {
  evaluate,
  rules,
  prepareForUrl,
  prepareForHistory,
  prepareForJsonExport,
  prepareForLlm,
  type Category,
  type RedactionReport,
} from "@kafka-hub/kafka-diagnose";
import {
  DIAGNOSE_HISTORY_KEY,
  DiagnoseHistory,
  type DiagnoseHistoryEntry,
} from "./diagnose-history";
import { FindingCard } from "./components/finding-card";
import { LlmPanel, type LlmResponse } from "./components/llm-panel";
import { CategoryFilter, ALL_CATEGORIES } from "./components/category-filter";
import { ConfigInput } from "./components/config-input";
import { FixComposer } from "./components/fix-composer";

const HISTORY_LIMIT = 5;

interface Props {
  sample: string;
}

function encodeConfig(text: string): string {
  if (typeof window === "undefined") return "";
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeConfig(encoded: string): string | null {
  try {
    const b = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (b.length % 4)) % 4);
    const binary = atob(b + padding);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHistoryEntry(value: unknown): value is DiagnoseHistoryEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.ts === "number" &&
    typeof value.config === "string" &&
    typeof value.parsedKeys === "number" &&
    typeof value.dangerCount === "number" &&
    typeof value.warningCount === "number"
  );
}

function readDiagnoseHistory(): DiagnoseHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DIAGNOSE_HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeDiagnoseHistory(entries: DiagnoseHistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    // Apply common-pattern redaction before localStorage egress.
    const redactedEntries = entries.map((e) => ({
      ...e,
      config: prepareForHistory(e.config).payload,
    }));
    if (redactedEntries.length === 0) {
      window.localStorage.removeItem(DIAGNOSE_HISTORY_KEY);
    } else {
      window.localStorage.setItem(DIAGNOSE_HISTORY_KEY, JSON.stringify(redactedEntries));
    }
  } catch {
    // localStorage may be unavailable
  }
}

function toHistoryEntry(config: string): DiagnoseHistoryEntry {
  const runReport = evaluate(config);
  return {
    ts: Date.now(),
    config,
    parsedKeys: runReport.parsedKeys,
    dangerCount: runReport.stats.danger,
    warningCount: runReport.stats.warning,
  };
}

export function DiagnoseClient({ sample }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState(sample);
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [copied, setCopied] = useState(false);
  const [shortcutHint, setShortcutHint] = useState("Ctrl+\u21B5");
  const [history, setHistory] = useState<DiagnoseHistoryEntry[]>([]);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmResponse, setLlmResponse] = useState<LlmResponse | null>(null);
  const [selectedFixes, setSelectedFixes] = useState<Set<string>>(new Set());
  const [egressReport, setEgressReport] = useState<RedactionReport | null>(null);

  // Hydrate from URL hash on first paint
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#c=")) return;
    const decoded = decodeConfig(hash.slice(3));
    if (decoded !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput(decoded);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(readDiagnoseHistory());
  }, []);

  useEffect(() => {
    if (navigator.platform.includes("Mac")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShortcutHint("\u2318\u21B5");
    }
  }, []);

  const report = useMemo(() => evaluate(input), [input]);

  const filteredFindings = useMemo(() => {
    const order: Record<string, number> = { danger: 0, warning: 1, info: 2 };
    return [...report.findings]
      .filter((f) => activeCategories.has(f.category))
      .sort((a, b) => order[a.severity] - order[b.severity]);
  }, [report.findings, activeCategories]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const f of report.findings)
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    return counts;
  }, [report.findings]);

  const totalRulesByCategory = useMemo(() => {
    const m = new Map<Category, number>();
    for (const r of rules) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, []);

  const toggleCategory = (c: Category) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const toggleFix = useCallback((ruleId: string) => {
    setSelectedFixes((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }, []);

  const rememberRun = useCallback(
    (config: string) => {
      if (config.trim().length === 0) return;
      const entry = toHistoryEntry(config);
      const next = [
        entry,
        ...history.filter((item) => item.config !== config),
      ].slice(0, HISTORY_LIMIT);
      setHistory(next);
      writeDiagnoseHistory(next);
    },
    [history],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    writeDiagnoseHistory([]);
  }, []);

  const copyShareLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    // Redact via egress boundary before encoding into URL
    const { payload: redacted, report: redactReport } = prepareForUrl(input);
    const enc = encodeConfig(redacted);
    const url = `${window.location.origin}${window.location.pathname}#c=${enc}`;
    setEgressReport(redactReport);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy share URL:", url);
    }
  }, [input]);

  const downloadJson = useCallback(() => {
    // Apply common-pattern redaction before export/download egress.
    const { payload, report: redactReport } = prepareForJsonExport(input);
    setEgressReport(redactReport);
    const blob = new Blob([payload], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kafka-hub-diagnosis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [input]);

  const runLlm = useCallback(
    async (configOverride?: string) => {
      if (llmLoading) return;

      const config = configOverride ?? input;
      rememberRun(config);
      setLlmLoading(true);
      setLlmResponse(null);
      try {
        // Apply common-pattern redaction before LLM egress.
        const { payload: redacted, report: redactReport } = prepareForLlm(config);
        setEgressReport(redactReport);
        const res = await fetch("/api/diagnose/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: redacted }),
        });
        const json = (await res.json()) as LlmResponse;
        json.redacted = redactReport.count > 0;
        json.redactedCount = redactReport.count;
        setLlmResponse(json);
      } catch (err) {
        setLlmResponse({
          configured: false,
          cached: false,
          findings: [],
          error: err instanceof Error ? err.message : "Request failed",
        });
      } finally {
        setLlmLoading(false);
      }
    },
    [input, llmLoading, rememberRun],
  );

  const handleHistorySelect = useCallback(
    (config: string) => {
      setInput(config);
      void runLlm(config);
    },
    [runLlm],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;

      const root = rootRef.current;
      const activeElement = document.activeElement;
      if (!root || !(activeElement instanceof Node)) return;
      if (!root.contains(activeElement)) return;

      event.preventDefault();
      void runLlm();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runLlm]);

  const hasHistory = history.length > 0;

  return (
    <div
      ref={rootRef}
      className={cn(
        "grid gap-6 lg:grid-cols-[1fr_1fr]",
        hasHistory &&
          "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]",
      )}
    >
      <div className="order-1 flex flex-col gap-3">
        <ConfigInput
          value={input}
          onChange={setInput}
          sample={sample}
          parsedKeys={report.parsedKeys}
          ruleCount={rules.length}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={copyShareLink}>
            <Copy className="size-3.5" aria-hidden />
            {copied ? "copied" : "share link"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadJson}
            disabled={report.findings.length === 0}
          >
            <Download className="size-3.5" aria-hidden />
            JSON
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void runLlm()}
              disabled={llmLoading}
            >
              {llmLoading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-3.5" aria-hidden />
              )}
              Analyze
            </Button>
            <kbd className="rounded border border-fd-border bg-fd-muted px-1.5 py-0.5 font-mono text-[10px] text-fd-muted-foreground">
              {shortcutHint}
            </kbd>
          </div>
        </div>
        <SanitizationWarning />

        {/* Accessible redaction feedback for share/copy/download/export/LLM */}
        {egressReport && egressReport.count > 0 ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
            role="status"
            aria-live="polite"
            aria-label={egressReport.summary}
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <span className="font-semibold">{egressReport.summary}</span>
              {egressReport.keys.length > 0 && (
                <span className="ml-1 text-fd-muted-foreground">
                  Keys: {egressReport.keys.join(", ")}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <DiagnoseHistory
        entries={history}
        onSelect={handleHistorySelect}
        onClear={clearHistory}
        disabled={llmLoading}
        className="order-2 lg:order-3 lg:col-span-2 xl:col-span-1"
      />

      <div className="order-3 flex flex-col gap-3 lg:order-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Findings
          </h2>
          <div className="flex gap-2">
            <Badge tone="danger">{report.stats.danger} danger</Badge>
            <Badge tone="warning">{report.stats.warning} warning</Badge>
            <Badge tone="info">{report.stats.info} info</Badge>
            {report.fixableCount > 0 ? (
              <Badge tone="neutral">{report.fixableCount} fixable</Badge>
            ) : null}
          </div>
        </div>

        <CategoryFilter
          activeCategories={activeCategories}
          categoryCounts={categoryCounts}
          totalRulesByCategory={totalRulesByCategory}
          onToggle={toggleCategory}
        />

        <div className="flex flex-col gap-3">
          {filteredFindings.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-5" aria-hidden />
              <div>
                <div className="font-semibold">No rule matched.</div>
                <div className="text-xs opacity-80">
                  Either the config is clean, your filter excludes everything,
                  or you haven&apos;t given the engine enough to chew on. Try
                  loading the sample.
                </div>
              </div>
            </div>
          ) : (
            filteredFindings.map((f, idx) => (
              <FindingCard
                key={`${f.ruleId}-${idx}`}
                finding={f}
                selectable={true}
                selected={selectedFixes.has(f.ruleId)}
                onToggleSelect={toggleFix}
              />
            ))
          )}

          {llmResponse ? <LlmPanel response={llmResponse} /> : null}
        </div>

        <FixComposer
          input={input}
          findings={report.findings}
          selectedFixes={selectedFixes}
        />
      </div>
    </div>
  );
}
