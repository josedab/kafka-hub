import { type ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral:
    "border-fd-border bg-fd-muted text-fd-muted-foreground",
  success:
    "border-emerald-200/60 bg-emerald-100/60 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning:
    "border-amber-200/60 bg-amber-100/60 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200",
  danger:
    "border-red-200/60 bg-red-100/60 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200",
  info:
    "border-sky-200/60 bg-sky-100/60 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
