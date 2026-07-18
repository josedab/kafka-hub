import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveScenarioSlug, buildSimulateUrl, validScenarioSlugs } from "./simulate-routing";

test("resolveScenarioSlug: returns valid slug unchanged", () => {
  assert.equal(resolveScenarioSlug("quorum-loss"), "quorum-loss");
  assert.equal(resolveScenarioSlug("rebalance-eager-classic"), "rebalance-eager-classic");
  assert.equal(resolveScenarioSlug("rebalance-cooperative-classic"), "rebalance-cooperative-classic");
  assert.equal(resolveScenarioSlug("rebalance-consumer-protocol"), "rebalance-consumer-protocol");
});

test("resolveScenarioSlug: returns null for invalid slugs", () => {
  assert.equal(resolveScenarioSlug("nonexistent"), null);
  assert.equal(resolveScenarioSlug(""), null);
  assert.equal(resolveScenarioSlug(null), null);
  assert.equal(resolveScenarioSlug(undefined), null);
  assert.equal(resolveScenarioSlug("QUORUM-LOSS"), null); // case sensitive
  assert.equal(resolveScenarioSlug("../../../etc/passwd"), null);
});

test("buildSimulateUrl: base URL without scenario", () => {
  assert.equal(buildSimulateUrl(), "/simulate");
  assert.equal(buildSimulateUrl(undefined), "/simulate");
});

test("buildSimulateUrl: valid scenario adds query param", () => {
  assert.equal(buildSimulateUrl("quorum-loss"), "/simulate?scenario=quorum-loss");
  assert.equal(buildSimulateUrl("rebalance-eager-classic"), "/simulate?scenario=rebalance-eager-classic");
});

test("buildSimulateUrl: invalid scenario returns base URL", () => {
  assert.equal(buildSimulateUrl("nonexistent"), "/simulate");
});

test("validScenarioSlugs: returns non-empty array of strings", () => {
  const slugs = validScenarioSlugs();
  assert.ok(slugs.length > 0);
  for (const slug of slugs) {
    assert.ok(typeof slug === "string");
    assert.ok(slug.length > 0);
  }
});

test("validScenarioSlugs: includes rebalance scenarios", () => {
  const slugs = validScenarioSlugs();
  assert.ok(slugs.includes("rebalance-eager-classic"));
  assert.ok(slugs.includes("rebalance-cooperative-classic"));
  assert.ok(slugs.includes("rebalance-consumer-protocol"));
});

test("validScenarioSlugs: includes existing scenarios", () => {
  const slugs = validScenarioSlugs();
  assert.ok(slugs.includes("quorum-loss"));
  assert.ok(slugs.includes("slow-consumer"));
  assert.ok(slugs.includes("isr-shrink"));
  assert.ok(slugs.includes("network-partition"));
});

// ─── query-change remount helper tests ───

test("resolveScenarioSlug: changing slug produces different resolved values", () => {
  // Simulates what ScenarioResolver does: resolve slug from URL, use as key
  const slug1 = resolveScenarioSlug("rebalance-eager-classic");
  const slug2 = resolveScenarioSlug("rebalance-consumer-protocol");
  assert.notEqual(slug1, slug2, "different slugs should resolve to different values");
  // Both should be valid
  assert.equal(slug1, "rebalance-eager-classic");
  assert.equal(slug2, "rebalance-consumer-protocol");
});

test("resolveScenarioSlug: null/undefined produces same fallback key", () => {
  // When ScenarioResolver gets invalid slugs, key should be the same fallback
  const a = resolveScenarioSlug(null);
  const b = resolveScenarioSlug(undefined);
  const c = resolveScenarioSlug("nonexistent");
  assert.equal(a, null);
  assert.equal(b, null);
  assert.equal(c, null);
  // All three would map to "__default" key in ScenarioResolver
});

test("buildSimulateUrl: round-trip slug → URL → slug", () => {
  const slug = "rebalance-consumer-protocol";
  const url = buildSimulateUrl(slug);
  // Extract slug back from the URL
  const parsed = new URL(url, "http://localhost");
  const extracted = parsed.searchParams.get("scenario");
  assert.equal(resolveScenarioSlug(extracted), slug, "slug should survive round-trip through URL");
});
