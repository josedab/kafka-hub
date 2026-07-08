"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="cheatsheet-print-action inline-flex h-10 items-center gap-2 rounded-md border border-fd-border bg-fd-card px-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-fd-foreground transition-colors hover:bg-fd-accent"
    >
      <Printer className="size-4" aria-hidden />
      Print
    </button>
  );
}
