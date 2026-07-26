import { ArrowRight, Bot, Globe, RotateCw, Server, ShieldCheck, User, Waypoints } from "lucide-react";
import type { ActorRole, ProtocolActor, ProtocolStep } from "@/lib/protocol-lab";
import { cn } from "@/lib/cn";
import { StatePanel } from "./state-panel";

const roleIcon: Record<ActorRole, typeof User> = {
  client: User,
  broker: Server,
  coordinator: Waypoints,
  controller: ShieldCheck,
  worker: Bot,
  external: Globe,
};

const directionTone: Record<ProtocolStep["direction"], string> = {
  request: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  response: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  broadcast: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  internal: "border-fd-border bg-fd-muted/40 text-fd-muted-foreground",
};

const annotationTone: Record<string, string> = {
  neutral: "border-fd-border bg-fd-muted/40",
  info: "border-sky-500/40 bg-sky-500/10",
  success: "border-emerald-500/40 bg-emerald-500/10",
  warning: "border-amber-500/40 bg-amber-500/10",
  danger: "border-red-500/40 bg-red-500/10",
};

function ActorNode({ actor, active }: { actor: ProtocolActor; active: boolean }) {
  const Icon = roleIcon[actor.role];
  return (
    <div
      className={cn(
        "flex min-w-[7rem] shrink-0 flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-center transition-colors motion-reduce:transition-none",
        active
          ? "border-fd-foreground/50 bg-fd-card shadow-sm"
          : "border-fd-border bg-fd-background/40 opacity-60",
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span className="font-mono text-xs font-semibold leading-tight">{actor.label}</span>
      {actor.detail ? (
        <span className="font-mono text-[10px] leading-tight text-fd-muted-foreground">{actor.detail}</span>
      ) : null}
    </div>
  );
}

export function SequenceView({
  actors,
  step,
}: {
  actors: readonly ProtocolActor[];
  step: ProtocolStep;
}) {
  const fromActor = actors.find((a) => a.id === step.fromActorId);
  const toActor = actors.find((a) => a.id === step.toActorId);

  return (
    <div className="flex flex-col gap-5">
      <div
        className="flex flex-wrap gap-2 overflow-x-auto pb-1"
        role="list"
        aria-label="Actors in this lab"
      >
        {actors.map((actor) => (
          <div key={actor.id} role="listitem">
            <ActorNode
              actor={actor}
              active={actor.id === step.fromActorId || actor.id === step.toActorId}
            />
          </div>
        ))}
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 font-mono text-xs",
          directionTone[step.direction],
        )}
      >
        <span className="font-semibold">{fromActor?.label ?? step.fromActorId}</span>
        {step.direction === "internal" ? (
          <RotateCw className="size-3.5" aria-hidden />
        ) : (
          <ArrowRight className="size-3.5" aria-hidden />
        )}
        <span className="font-semibold">{toActor?.label ?? step.toActorId}</span>
        <span className="ml-auto uppercase tracking-wider opacity-80">{step.direction}</span>
      </div>

      <div>
        <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
        <p className="mt-2 leading-relaxed text-fd-muted-foreground">{step.narrative}</p>
      </div>

      {step.annotation ? (
        <div
          className={cn(
            "rounded-md border px-3 py-2.5 text-sm leading-relaxed",
            annotationTone[step.annotation.tone],
          )}
        >
          {step.annotation.text}
        </div>
      ) : null}

      <StatePanel state={step.state} />
    </div>
  );
}
