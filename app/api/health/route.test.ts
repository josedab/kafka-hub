import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createHealthPayload,
  GET,
  HEAD,
  resolveCommit,
  resolveLlmFeatureStatus,
} from "./route";

test("health payload reports core status without exposing LLM configuration", () => {
  assert.deepEqual(createHealthPayload({}), {
    status: "ok",
    version: "0.1.0",
    commit: null,
    features: { llm: "disabled" },
  });
  assert.equal(
    resolveLlmFeatureStatus({
      ANTHROPIC_API_KEY: "secret",
      ANTHROPIC_MODEL: "model-name",
    }),
    "configured",
  );
  assert.equal(
    resolveLlmFeatureStatus({ ANTHROPIC_API_KEY: "secret" }),
    "misconfigured",
  );
  assert.equal(
    resolveLlmFeatureStatus({ ANTHROPIC_MODEL: "model-name" }),
    "misconfigured",
  );
});

test("health commit identifier is validated and shortened", () => {
  assert.equal(
    resolveCommit({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef" }),
    "0123456789ab",
  );
  assert.equal(resolveCommit({ GIT_SHA: "abcdef1" }), "abcdef1");
  assert.equal(resolveCommit({ GIT_SHA: "not-a-commit" }), null);
});

test("health GET and HEAD are successful and explicitly non-cacheable", async () => {
  const getResponse = GET();
  assert.equal(getResponse.status, 200);
  assert.match(getResponse.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(getResponse.headers.get("pragma"), "no-cache");
  assert.equal((await getResponse.json() as { status: string }).status, "ok");

  const headResponse = HEAD();
  assert.equal(headResponse.status, 200);
  assert.match(headResponse.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(await headResponse.text(), "");
});
