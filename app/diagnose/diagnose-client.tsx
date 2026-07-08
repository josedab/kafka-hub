"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Info,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  evaluate,
  rules,
  type Category,
  type DiagnosticFinding,
  type Severity,
} from "@/lib/diagnostic-rules";
import {
  DIAGNOSE_HISTORY_KEY,
  DiagnoseHistory,
  type DiagnoseHistoryEntry,
} from "./diagnose-history";

const severityMeta: Record<
  Severity,
  { label: string; icon: typeof Info; tone: "danger" | "warning" | "info" }
> = {
  danger: { label: "Danger", icon: XCircle, tone: "danger" },
  warning: { label: "Warning", icon: AlertTriangle, tone: "warning" },
  info: { label: "Info", icon: Info, tone: "info" },
};

const ALL_CATEGORIES: Category[] = [
  "broker",
  "topic",
  "producer",
  "consumer",
  "transactions",
  "security",
  "performance",
];

const MAX_CONFIG_DROP_BYTES = 100 * 1024;
const HISTORY_LIMIT = 5;

interface LlmFinding {
  title: string;
  detail: string;
  severity: Severity;
}

interface LlmResponse {
  configured: boolean;
  cached: boolean;
  findings: LlmFinding[];
  rationale?: string;
  error?: string;
}

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
    if (entries.length === 0) {
      window.localStorage.removeItem(DIAGNOSE_HISTORY_KEY);
    } else {
      window.localStorage.setItem(DIAGNOSE_HISTORY_KEY, JSON.stringify(entries));
    }
  } catch {
    // localStorage may be unavailable in private or constrained contexts.
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
  const [isConfigDragging, setIsConfigDragging] = useState(false);
  const [shortcutHint, setShortcutHint] = useState("Ctrl+↵");
  const [history, setHistory] = useState<DiagnoseHistoryEntry[]>([]);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmResponse, setLlmResponse] = useState<LlmResponse | null>(null);

  // Hydrate from URL hash on first paint.
  // Reading window.location.hash requires the DOM and so cannot happen
  // during render or in a state initializer (would break SSR hydration).
  // One mount-time sync is intentional here.
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
      setShortcutHint("⌘↵");
    }
  }, []);

  const report = useMemo(() => evaluate(input), [input]);

  const filteredFindings = useMemo(() => {
    const order: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };
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

  const toggleCategory = (c: Category) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

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
    const enc = encodeConfig(input);
    const url = `${window.location.origin}${window.location.pathname}#c=${enc}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy share URL:", url);
    }
  }, [input]);

  const downloadJson = useCallback(() => {
    const payload = {
      generatedAt: new Date().toISOString(),
      ruleEngineVersion: 1,
      parsedKeys: report.parsedKeys,
      stats: report.stats,
      findings: report.findings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kafka-hub-diagnosis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const runLlm = useCallback(
    async (configOverride?: string) => {
      if (llmLoading) return;

      const config = configOverride ?? input;
      rememberRun(config);
      setLlmLoading(true);
      setLlmResponse(null);
      try {
        const res = await fetch("/api/diagnose/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        });
        const json = (await res.json()) as LlmResponse;
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
      setInput(text);
    },
    [],
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

  const totalRulesByCategory = useMemo(() => {
    const m = new Map<Category, number>();
    for (const r of rules) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, []);

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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Paste config
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setInput(sample)}
            >
              Load sample
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setInput("")}>
              Clear
            </Button>
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto font-mono text-[11px] text-fd-muted-foreground">
            {report.parsedKeys} key{report.parsedKeys === 1 ? "" : "s"} parsed ·
            findings update as you type · {rules.length} rules loaded
          </p>
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
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map((c) => {
            const matched = categoryCounts.get(c) ?? 0;
            const total = totalRulesByCategory.get(c) ?? 0;
            const active = activeCategories.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  active
                    ? "border-fd-foreground bg-fd-foreground text-fd-background"
                    : "border-fd-border text-fd-muted-foreground hover:bg-fd-accent",
                )}
                title={`${total} rules in this category`}
              >
                {c} {matched > 0 ? `· ${matched}` : ""}
              </button>
            );
          })}
        </div>

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
              <FindingCard key={`${f.ruleId}-${idx}`} finding={f} />
            ))
          )}

          {llmResponse ? <LlmPanel response={llmResponse} /> : null}
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding: f }: { finding: DiagnosticFinding }) {
  const meta = severityMeta[f.severity];
  const Icon = meta.icon;
  return (
    <article
      className={cn(
        "rounded-xl border bg-fd-card p-4 shadow-sm",
        f.severity === "danger" && "border-red-500/30",
        f.severity === "warning" && "border-amber-500/30",
        f.severity === "info" && "border-sky-500/30",
      )}
    >
      <header className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 size-4 flex-none",
            f.severity === "danger" && "text-red-500",
            f.severity === "warning" && "text-amber-500",
            f.severity === "info" && "text-sky-500",
          )}
          aria-hidden
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <div className="flex gap-1.5">
              <Badge tone="neutral">{f.category}</Badge>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
            {f.detail}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fd-muted-foreground">
            <span className="font-mono">{f.ruleId}</span>
            <Link
              href={`/diagnose/rules/${f.ruleId}`}
              className="underline-offset-4 hover:underline"
            >
              Details →
            </Link>
            {f.learnSlug ? (
              <Link
                href={`/learn/${f.learnSlug}`}
                className="underline-offset-4 hover:underline"
              >
                Read the explainer →
              </Link>
            ) : null}
            {f.simulateSlug ? (
              <Link
                href={`/simulate?scenario=${encodeURIComponent(f.simulateSlug)}`}
                className="underline-offset-4 hover:underline"
              >
                Reproduce in simulator →
              </Link>
            ) : null}
          </div>
          {f.fix ? <FindingFix fix={f.fix} /> : null}
        </div>
      </header>
    </article>
  );
}

function prefixDiffLine(prefix: "-" | "+", value: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix} ${line}`)
    .join("\n");
}

function FindingFix({ fix }: { fix: NonNullable<DiagnosticFinding["fix"]> }) {
  const [copied, setCopied] = useState(false);

  const copyFix = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fix.after);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [fix.after]);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-fd-border bg-fd-background">
      <div className="flex items-center justify-between gap-2 border-b border-fd-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
          Suggested fix
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={copyFix}
        >
          <Copy className="size-3" aria-hidden />
          {copied ? "Copied!" : "Copy fix"}
        </Button>
      </div>
      <div className="font-mono text-xs leading-relaxed">
        <pre className="overflow-x-auto whitespace-pre-wrap bg-red-500/5 px-3 py-2 text-red-700 dark:text-red-300">{prefixDiffLine("-", fix.before)}</pre>
        <pre className="overflow-x-auto whitespace-pre-wrap border-t border-fd-border bg-emerald-500/5 px-3 py-2 text-emerald-700 dark:text-emerald-300">{prefixDiffLine("+", fix.after)}</pre>
      </div>
    </div>
  );
}

function LlmPanel({ response }: { response: LlmResponse }) {
  if (response.error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
        <div className="font-semibold">LLM pass failed</div>
        <p className="mt-1 text-xs opacity-80">{response.error}</p>
      </div>
    );
  }

  if (!response.configured) {
    return (
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-700 dark:text-sky-300">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          <span className="font-semibold">
            LLM analysis is not configured on this deployment.
          </span>
        </div>
        <p className="mt-1 text-xs opacity-80">
          Set <code className="font-mono">ANTHROPIC_API_KEY</code> in the
          environment to enable free-form recommendations on top of the static
          rule engine.
        </p>
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
          <Sparkles className="size-4" aria-hidden />
          <span className="text-sm font-semibold">LLM recommendations</span>
        </div>
        {response.cached ? (
          <Badge tone="info">cached</Badge>
        ) : (
          <Badge tone="neutral">fresh</Badge>
        )}
      </header>
      <div className="mt-3 space-y-3">
        {response.findings.map((f, i) => {
          const meta = severityMeta[f.severity];
          return (
            <div
              key={i}
              className="rounded-lg border border-violet-500/20 bg-fd-background p-3"
            >
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-semibold">{f.title}</h4>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
                {f.detail}
              </p>
            </div>
          );
        })}
        {response.rationale ? (
          <p className="text-xs italic text-fd-muted-foreground">
            {response.rationale}
          </p>
        ) : null}
      </div>
    </article>
  );
}
