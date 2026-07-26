import assert from "node:assert/strict";
import { test } from "node:test";
import { validateProductionEnvironment } from "./check-production-env.mjs";

test("production env accepts a root HTTPS origin", () => {
  assert.deepEqual(
    validateProductionEnvironment({
      NEXT_PUBLIC_SITE_URL: "https://kafka-hub.dev/",
    }),
    { errors: [], warnings: [] },
  );
});

test("production env rejects missing or non-origin canonical URLs", () => {
  assert.match(
    validateProductionEnvironment({}).errors.join("\n"),
    /NEXT_PUBLIC_SITE_URL is required/,
  );

  for (const value of [
    "https://user@example.com",
    "https://example.com/learn",
    "https://example.com/?preview=1",
    "https://example.com/#top",
  ]) {
    assert.ok(
      validateProductionEnvironment({
        NEXT_PUBLIC_SITE_URL: value,
      }).errors.length > 0,
      `${value} should be rejected`,
    );
  }
});

test("production env allows localhost HTTP only with explicit local mode", () => {
  const env = { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" };
  assert.ok(validateProductionEnvironment(env).errors.length > 0);
  assert.deepEqual(
    validateProductionEnvironment(env, { allowLocalhostHttp: true }),
    { errors: [], warnings: [] },
  );
  assert.ok(
    validateProductionEnvironment(
      { NEXT_PUBLIC_SITE_URL: "http://example.com" },
      { allowLocalhostHttp: true },
    ).errors.length > 0,
  );
});

test("production env requires an explicit model with an Anthropic key", () => {
  const result = validateProductionEnvironment({
    NEXT_PUBLIC_SITE_URL: "https://kafka-hub.dev",
    ANTHROPIC_API_KEY: "not-printed",
  });
  assert.match(result.errors.join("\n"), /ANTHROPIC_MODEL is required/);

  assert.deepEqual(
    validateProductionEnvironment({
      NEXT_PUBLIC_SITE_URL: "https://kafka-hub.dev",
      ANTHROPIC_API_KEY: "not-printed",
      ANTHROPIC_MODEL: "explicit-model",
    }),
    { errors: [], warnings: [] },
  );
});

test("production env validates proxy trust and emits a non-secret reminder", () => {
  const trusted = validateProductionEnvironment({
    NEXT_PUBLIC_SITE_URL: "https://kafka-hub.dev",
    TRUST_PROXY_HEADERS: "true",
  });
  assert.equal(trusted.errors.length, 0);
  assert.match(trusted.warnings.join("\n"), /overwrites forwarding headers/);

  assert.match(
    validateProductionEnvironment({
      NEXT_PUBLIC_SITE_URL: "https://kafka-hub.dev",
      TRUST_PROXY_HEADERS: "yes",
    }).errors.join("\n"),
    /must be either true or false/,
  );
});
