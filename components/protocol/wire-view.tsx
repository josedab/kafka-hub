import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ProtocolStep, WireField, WireFrame } from "@/lib/protocol-lab";
import { cn } from "@/lib/cn";
import { StatePanel } from "./state-panel";

function FieldRow({ field }: { field: WireField }) {
  return (
    <tr className="border-b border-fd-border/60 last:border-0">
      <td className="whitespace-nowrap py-1.5 pr-3 align-top font-mono text-[11px] text-fd-muted-foreground">
        {field.name}
      </td>
      <td className="py-1.5 pr-3 align-top font-mono text-xs font-medium break-all">{field.value}</td>
      <td className="whitespace-nowrap py-1.5 pr-3 align-top font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
        {field.type}
      </td>
      <td className="py-1.5 align-top text-xs text-fd-muted-foreground">{field.note}</td>
    </tr>
  );
}

function HexStrip({ frame }: { frame: WireFrame }) {
  return (
    <div className="overflow-x-auto rounded-md border border-fd-border bg-fd-background/60 p-3">
      <div className="flex min-w-max gap-2" role="list" aria-label="Framed hex bytes (educational, simplified)">
        {frame.hexBytes.map((group, i) => (
          <div key={i} role="listitem" className="flex flex-col items-center gap-1">
            <span className="rounded border border-fd-border bg-fd-muted/60 px-2 py-1 font-mono text-xs tabular-nums">
              {group}
            </span>
            <span className="max-w-[6rem] text-center font-mono text-[9px] leading-tight text-fd-muted-foreground">
              {frame.hexLabels[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrameCard({ frame }: { frame: WireFrame }) {
  const isError = (frame.errorCode ?? 0) !== 0;
  return (
    <div className="rounded-lg border border-fd-border bg-fd-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-fd-border px-4 py-2.5 font-mono text-xs">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider",
            frame.kind === "request"
              ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {frame.kind}
        </span>
        <span className="font-semibold">{frame.apiName}</span>
        <span className="text-fd-muted-foreground">apiKey={frame.apiKey}</span>
        <span className="text-fd-muted-foreground">v{frame.apiVersion}</span>
        <span className="text-fd-muted-foreground">correlationId={frame.correlationId}</span>
        {frame.clientId ? <span className="text-fd-muted-foreground">clientId={frame.clientId}</span> : null}
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
            isError
              ? "bg-red-500/15 text-red-700 dark:text-red-300"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {isError ? <AlertTriangle className="size-3" aria-hidden /> : <CheckCircle2 className="size-3" aria-hidden />}
          {frame.errorName ?? "NONE"}
        </span>
      </div>

      {frame.headerFields.length > 0 ? (
        <div className="px-4 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fd-muted-foreground">Header</p>
          <table className="mt-1.5 w-full border-collapse">
            <tbody>
              {frame.headerFields.map((f) => (
                <FieldRow key={f.name} field={f} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {frame.bodyFields.length > 0 ? (
        <div className="px-4 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fd-muted-foreground">Body</p>
          <table className="mt-1.5 w-full border-collapse">
            <tbody>
              {frame.bodyFields.map((f) => (
                <FieldRow key={f.name} field={f} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="p-4 pt-3">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fd-muted-foreground">
          Framed bytes (educational, simplified)
        </p>
        <HexStrip frame={frame} />
      </div>
    </div>
  );
}

export function WireView({ step }: { step: ProtocolStep }) {
  const frames = step.frames ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
        <p className="mt-2 leading-relaxed text-fd-muted-foreground">{step.narrative}</p>
      </div>

      {frames.length === 0 ? (
        <div className="rounded-md border border-dashed border-fd-border px-4 py-6 text-center text-sm text-fd-muted-foreground">
          No wire frame for this step — it is an internal broker/controller action with no client-visible RPC.
        </div>
      ) : (
        frames.map((frame, i) => <FrameCard key={i} frame={frame} />)
      )}

      <StatePanel state={step.state} />
    </div>
  );
}
