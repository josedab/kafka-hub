"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Moon, Search, Sun } from "lucide-react";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { useTheme } from "fumadocs-ui/provider/base";
import { site } from "@/lib/site";
import { cn } from "@/lib/cn";

const links = [
  { href: "/learn", label: "Learn" },
  { href: "/diagnose", label: "Diagnose" },
  { href: "/simulate", label: "Simulate" },
  { href: "/runbooks", label: "Runbooks" },
  { href: "/errors", label: "Errors" },
  { href: "/kips", label: "KIPs" },
];

const themeModes = ["light", "dark", "system"] as const;
type ThemeMode = (typeof themeModes)[number];

const headerActionClassName =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-fd-border px-2.5 py-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground disabled:pointer-events-none disabled:opacity-50 sm:px-3";

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function getNextThemeMode(value: string | undefined): ThemeMode {
  const current = isThemeMode(value) ? value : "system";
  const index = themeModes.indexOf(current);

  return themeModes[(index + 1) % themeModes.length];
}

function ThemeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const currentTheme = isThemeMode(theme) ? theme : "system";
  const nextTheme = getNextThemeMode(theme);
  const resolvedLabel = resolvedTheme === "dark" ? "dark" : "light";
  const ThemeIcon = resolvedLabel === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      className={cn(headerActionClassName, "px-2.5")}
      onClick={() => setTheme(nextTheme)}
      aria-label={`Cycle theme from ${currentTheme} to ${nextTheme}. Currently resolved as ${resolvedLabel}.`}
    >
      <ThemeIcon className="size-4" aria-hidden />
      <span className="sr-only">Cycle color theme</span>
    </button>
  );
}

function SearchButton() {
  const { enabled, hotKey, open, setOpenSearch } = useSearchContext();

  if (!enabled) return null;

  return (
    <button
      type="button"
      className={headerActionClassName}
      onClick={() => setOpenSearch(true)}
      aria-label="Open search"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts="Meta+K Control+K"
    >
      <Search className="size-4" aria-hidden />
      <span className="hidden sm:inline">Search</span>
      <span
        className="hidden items-center gap-0.5 sm:inline-flex"
        aria-hidden
      >
        {hotKey.map((key, index) => (
          <kbd
            key={index}
            className="rounded-md border border-fd-border bg-fd-card px-1.5 py-0.5 font-mono text-[10px] leading-none text-fd-muted-foreground"
          >
            {key.display}
          </kbd>
        ))}
      </span>
    </button>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.21 21.38 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function SiteHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "site-header sticky top-0 z-40 border-b border-fd-border bg-fd-background/80 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-fd-border bg-fd-card font-mono text-[10px] font-bold"
          >
            k
          </span>
          {site.shortName}
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
            >
              {l.label}
            </Link>
          ))}
          <div className="ml-2 flex items-center gap-1">
            <ThemeToggle />
            <SearchButton />
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer noopener"
              className={headerActionClassName}
              aria-label="GitHub repository"
            >
              <GitHubMark className="size-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer mt-auto border-t border-fd-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-fd-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {site.name} · MIT licensed · open source ·{" "}
          <a className="underline-offset-4 hover:underline" href={site.repo}>
            GitHub
          </a>
        </p>
        <p className="font-mono text-xs">
          No live cluster connections. Paste-only diagnostics.
        </p>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
