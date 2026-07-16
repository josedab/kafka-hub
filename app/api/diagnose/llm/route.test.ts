import assert from "node:assert/strict";
import { test } from "node:test";
import { LruCache } from "@/lib/lru-cache";
import { createPostHandler } from "./route";

function request(body: string, ip = "127.0.0.1"): Request {
  return new Request("http://localhost/api/diagnose/llm", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body,
  });
}

test("LLM route works without an API key or network access", async () => {
  const post = createPostHandler({
    take: () => true,
    getApiKey: () => undefined,
  });

  const response = await post(request(JSON.stringify({ config: "acks=all" })));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    configured: false,
    cached: false,
    findings: [],
  });
});

test("LLM route validates request bodies before invoking a model", async () => {
  let calls = 0;
  const post = createPostHandler({
    take: () => true,
    getApiKey: () => "test-key",
    generateText: async () => {
      calls += 1;
      return { available: true, text: "{}" };
    },
  });

  const invalidJson = await post(request("{"));
  assert.equal(invalidJson.status, 400);

  const missingConfig = await post(request(JSON.stringify({ config: "" })));
  assert.equal(missingConfig.status, 400);

  const oversized = await post(
    request(JSON.stringify({ config: "a".repeat(16_001) })),
  );
  assert.equal(oversized.status, 413);
  assert.equal(calls, 0);
});

test("LLM route returns a local rate-limit response", async () => {
  const post = createPostHandler({ take: () => false });
  const response = await post(request(JSON.stringify({ config: "acks=all" })));

  assert.equal(response.status, 429);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /Rate limit exceeded/,
  );
});

test("LLM route accepts a fake model client and caches sanitized findings", async () => {
  let calls = 0;
  let selectedModel = "";
  const cache = new LruCache<
    {
      findings: Array<{
        title: string;
        detail: string;
        severity: "danger" | "warning" | "info";
      }>;
      rationale?: string;
    }
  >(4);
  const findings = Array.from({ length: 6 }, (_, index) => ({
    title: index === 0 ? "t".repeat(250) : `Finding ${index}`,
    detail: index === 0 ? "d".repeat(900) : `Detail ${index}`,
    severity: index === 0 ? "unexpected" : "warning",
  }));
  const post = createPostHandler({
    take: () => true,
    cache,
    getApiKey: () => "test-key",
    getModel: () => "fake-model",
    generateText: async ({ model }) => {
      calls += 1;
      selectedModel = model;
      return {
        available: true,
        text: `\`\`\`json\n${JSON.stringify({
          findings,
          rationale: "Fixture response.",
        })}\n\`\`\``,
      };
    },
  });
  const body = JSON.stringify({ config: "acks=all" });

  const first = await post(request(body));
  const firstJson = (await first.json()) as {
    cached: boolean;
    rationale: string;
    findings: Array<{ title: string; detail: string; severity: string }>;
  };
  assert.equal(first.status, 200);
  assert.equal(firstJson.cached, false);
  assert.equal(firstJson.rationale, "Fixture response.");
  assert.equal(firstJson.findings.length, 5);
  assert.equal(firstJson.findings[0].severity, "info");
  assert.equal(firstJson.findings[0].title.length, 200);
  assert.equal(firstJson.findings[0].detail.length, 800);
  assert.equal(selectedModel, "fake-model");

  const second = await post(request(body));
  const secondJson = (await second.json()) as {
    cached: boolean;
    rationale?: string;
    findings: unknown[];
  };
  assert.equal(secondJson.cached, true);
  assert.equal(secondJson.findings.length, 5);
  assert.equal(secondJson.rationale, "Fixture response.");
  assert.equal(calls, 1);
});

test("LLM route surfaces model failures with sanitized error (no raw details)", async () => {
  const post = createPostHandler({
    take: () => true,
    getApiKey: () => "test-key",
    generateText: async () => {
      throw new Error("Connection to https://api.anthropic.com failed with key sk-ant-xxx");
    },
  });

  const response = await post(request(JSON.stringify({ config: "acks=all" })));
  assert.equal(response.status, 502);
  const body = (await response.json()) as { error: string };
  // Must NOT contain raw provider details (potential key leakage)
  assert.ok(!body.error.includes("sk-ant-xxx"), "Raw error details must not leak");
  assert.ok(!body.error.includes("api.anthropic.com"), "Provider URLs must not leak");
  // Must be a user-safe message
  assert.ok(body.error.length > 0);
  assert.ok(body.error.length <= 200);
});

test("LLM route sanitizes rate limit errors", async () => {
  const post = createPostHandler({
    take: () => true,
    getApiKey: () => "test-key",
    generateText: async () => {
      throw new Error("Rate limit exceeded for model claude-3");
    },
  });
  const response = await post(request(JSON.stringify({ config: "acks=all" })));
  assert.equal(response.status, 502);
  const body = (await response.json()) as { error: string };
  assert.ok(body.error.includes("rate limit"), "Should mention rate limit");
  assert.ok(!body.error.includes("claude-3"), "Should not mention model details");
});

test("LLM route bounds rationale length in response", async () => {
  const longRationale = "x".repeat(5000);
  const post = createPostHandler({
    take: () => true,
    cache: new LruCache(4),
    getApiKey: () => "test-key",
    generateText: async () => ({
      available: true,
      text: JSON.stringify({ findings: [], rationale: longRationale }),
    }),
  });
  const response = await post(request(JSON.stringify({ config: "acks=all" })));
  const body = (await response.json()) as { rationale?: string };
  assert.ok(body.rationale);
  assert.ok(body.rationale!.length <= 2000, "Rationale must be bounded");
});
