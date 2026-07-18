"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SCENARIOS } from "@kafka-hub/kafka-sim";
import { SimulateClient } from "./simulate-client";

/**
 * Resolves the `?scenario=` query parameter from the URL.
 * Returns a valid scenario slug or undefined.
 *
 * This is a pure client component that uses useSearchParams,
 * which must be wrapped in <Suspense> per Next 16 guidance
 * to avoid making the page route dynamic.
 *
 * Uses a `key` prop on SimulateClient so that when the URL query
 * changes (e.g. browser back/forward navigation), the component
 * remounts and synchronizes with the new scenario.
 */
function ScenarioResolver() {
  const searchParams = useSearchParams();
  const scenarioParam = searchParams.get("scenario");

  // Valid slug → pass to client; invalid/missing → undefined (fallback to default)
  const validSlug = scenarioParam && SCENARIOS[scenarioParam] ? scenarioParam : undefined;

  // key forces remount when URL query changes (including browser navigation)
  return <SimulateClient key={validSlug ?? "__default"} initialScenario={validSlug} />;
}

/**
 * Wraps the scenario resolver in a <Suspense> boundary so that
 * the static server page can be prerendered. The useSearchParams
 * hook triggers a client-side rendering bailout up to the nearest
 * Suspense boundary.
 */
export function ScenarioDeepLinkClient() {
  return (
    <Suspense fallback={<SimulateClient />}>
      <ScenarioResolver />
    </Suspense>
  );
}
