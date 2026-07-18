"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <head>
        <title>Error · Kafka Hub</title>
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "32rem", padding: "2rem" }}>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "3rem",
              fontWeight: 600,
              letterSpacing: "-0.04em",
            }}
          >
            Error
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginTop: "1rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#a3a3a3", marginTop: "0.75rem" }}>
            A critical error prevented this page from rendering.
            {error.digest ? (
              <span
                style={{
                  display: "block",
                  marginTop: "0.5rem",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                }}
              >
                Digest: {error.digest}
              </span>
            ) : null}
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              marginTop: "1.5rem",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                height: "2.75rem",
                minHeight: "44px",
                padding: "0 1.25rem",
                border: "none",
                borderRadius: "0.375rem",
                backgroundColor: "#fafafa",
                color: "#0a0a0a",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                display: "inline-flex",
                height: "2.75rem",
                minHeight: "44px",
                alignItems: "center",
                padding: "0 1.25rem",
                border: "1px solid #333",
                borderRadius: "0.375rem",
                color: "#fafafa",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Back home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
