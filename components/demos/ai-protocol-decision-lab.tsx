"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  recommendAiProtocolComposition,
  type AiProtocolDecisionInput,
} from "@/lib/ai-demo-helpers";

const prompts: Array<{
  key: keyof AiProtocolDecisionInput;
  label: string;
  detail: string;
}> = [
  {
    key: "needsReplay",
    label: "Replay an event history",
    detail: "A consumer must reprocess an ordered durable event stream.",
  },
  {
    key: "needsToolDiscovery",
    label: "Discover tools or resources",
    detail: "An AI host needs negotiated tool/resource/prompt capabilities.",
  },
  {
    key: "needsCrossAgentLongTask",
    label: "Delegate a long remote-agent task",
    detail: "Independently built agents need task, message, and artifact interoperability.",
  },
  {
    key: "needsFanout",
    label: "Fan out the same event",
    detail: "Multiple independently deployed consumers need the same durable inputs.",
  },
  {
    key: "needsRequestResponse",
    label: "Serve a latency-sensitive request",
    detail: "The caller is waiting synchronously for a bounded response.",
  },
];

const initialInput: AiProtocolDecisionInput = {
  needsReplay: true,
  needsToolDiscovery: true,
  needsCrossAgentLongTask: false,
  needsFanout: true,
  needsRequestResponse: false,
};

export function AiProtocolDecisionLab() {
  const [input, setInput] = useState(initialInput);
  const recommendations = useMemo(
    () => recommendAiProtocolComposition(input),
    [input],
  );

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="AI protocol decision lab"
      data-testid="ai-protocol-decision-lab"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">Protocol composition — choose requirements, not a winner</span>
        </div>
        <span className="font-mono text-xs text-fd-muted-foreground">
          {recommendations.length} recommended boundary{recommendations.length === 1 ? "" : "ies"}
        </span>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <fieldset className="space-y-2 rounded-lg border border-fd-border bg-fd-background p-3">
          <legend className="px-1 font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
            Workload requirements
          </legend>
          {prompts.map((prompt) => (
            <label
              key={prompt.key}
              className="flex cursor-pointer gap-3 rounded-md border border-transparent p-2.5 transition-colors hover:border-fd-border hover:bg-fd-accent"
            >
              <input
                type="checkbox"
                checked={input[prompt.key]}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    [prompt.key]: event.target.checked,
                  }))
                }
                className="mt-0.5 size-4 shrink-0 accent-fd-foreground"
              />
              <span>
                <span className="block text-sm font-medium">{prompt.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-fd-muted-foreground">
                  {prompt.detail}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <section className="rounded-lg border border-fd-border bg-fd-background p-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
            Recommended composition
          </p>
          <ol className="mt-3 space-y-2" aria-live="polite">
            {recommendations.map((recommendation, index) => (
              <li
                key={recommendation.name}
                className="grid grid-cols-[2rem_1fr] gap-2 border-l-2 border-amber-500/70 bg-amber-500/5 px-3 py-3"
              >
                <span className="font-mono text-xs text-amber-800 dark:text-amber-200">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{recommendation.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-fd-muted-foreground">
                    {recommendation.rationale}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-fd-border pt-3 text-xs leading-relaxed text-fd-muted-foreground">
            MCP is JSON-RPC context/tool exchange, A2A is agent task/message/artifact
            interoperability, and Kafka is durable ordered event transport. They
            compose; none silently supplies the others&apos; semantics.
          </p>
        </section>
      </div>
    </figure>
  );
}
