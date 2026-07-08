"use client";

import { type MouseEvent, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const shortcuts = [
  { keys: ["Space"], action: "Toggle play / pause" },
  { keys: ["→"], action: "Step one op; after the script ends, step one tick" },
  { keys: ["R"], action: "Reset the current scenario" },
  { keys: ["K"], action: "Kill the broker currently under your pointer" },
  { keys: ["?"], action: "Open this keyboard shortcut sheet" },
];

export function KeyboardShortcutsDialog({
  dialogRef,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const close = () => dialogRef.current?.close();

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="keyboard-shortcuts-title"
      className="fixed inset-0 m-0 hidden h-screen max-h-none w-screen max-w-none place-items-center bg-transparent p-4 text-fd-foreground backdrop:bg-fd-background/75 backdrop:backdrop-blur-sm open:grid"
      onClick={handleBackdropClick}
    >
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-fd-border bg-fd-card shadow-2xl shadow-fd-foreground/10">
        <header className="flex items-center justify-between gap-3 border-b border-fd-border px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fd-muted-foreground">
              Simulate controls
            </p>
            <h2 id="keyboard-shortcuts-title" className="mt-1 text-lg font-semibold">
              Keyboard shortcuts
            </h2>
          </div>
          <Button
            aria-label="Close keyboard shortcuts"
            className="size-8 px-0"
            size="sm"
            variant="ghost"
            onClick={close}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </header>

        <dl className="divide-y divide-fd-border px-5 py-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.keys.join("+")}
              className="grid grid-cols-[5.5rem_1fr] gap-4 py-3 text-sm"
            >
              <dt className="flex flex-wrap items-center gap-1.5">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-fd-border bg-fd-muted px-2 py-1 font-mono text-[11px] font-semibold leading-none text-fd-foreground shadow-sm"
                  >
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="leading-relaxed text-fd-muted-foreground">
                {shortcut.action}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </dialog>
  );
}
