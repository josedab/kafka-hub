"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <p className="font-mono text-6xl font-semibold tracking-tighter text-fd-foreground">
        Error
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-fd-muted-foreground">
        An unexpected error occurred while rendering this page.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs text-fd-muted-foreground">
            Digest: {error.digest}
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-md bg-fd-foreground px-5 text-sm font-medium text-fd-background transition-colors hover:bg-fd-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-md border border-fd-border px-5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
