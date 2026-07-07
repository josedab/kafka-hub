"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { findGlossaryTerm } from "./terms";

type GProps = {
  term: string;
  children: ReactNode;
  className?: string;
};

export function G({ term, children, className }: GProps) {
  const entry = findGlossaryTerm(term);
  const href = entry ? `/learn/glossary#${entry.id}` : "/learn/glossary";

  if (!entry) {
    return (
      <Link
        href={href}
        className={cn(
          "font-medium underline decoration-dotted underline-offset-4 transition-colors hover:text-fd-foreground",
          className,
        )}
      >
        {children}
      </Link>
    );
  }

  const tooltipId = `glossary-card-${entry.id}`;

  return (
    <span className="glossary-term relative inline-block align-baseline">
      <Link
        href={href}
        aria-describedby={tooltipId}
        className={cn(
          "font-medium text-fd-foreground underline decoration-fd-muted-foreground decoration-dotted underline-offset-4 transition-colors hover:decoration-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background",
          className,
        )}
      >
        {children}
      </Link>

      <span
        id={tooltipId}
        role="tooltip"
        className="glossary-term-card absolute left-1/2 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-fd-border bg-fd-card p-4 text-left text-sm text-fd-card-foreground opacity-0 shadow-xl transition-opacity duration-150"
      >
        <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-fd-muted-foreground">
          {entry.name}
        </span>
        <span className="mt-1 block font-mono text-xs text-fd-muted-foreground">
          {entry.expansion}
        </span>
        <span className="mt-3 block leading-relaxed text-fd-muted-foreground">
          {entry.oneLiner}
        </span>
        <Link
          href={href}
          className="mt-3 inline-flex text-sm font-semibold text-fd-foreground underline-offset-4 hover:underline"
        >
          Read more →
        </Link>
      </span>
    </span>
  );
}
