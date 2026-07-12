import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalOrigin } from "./canonical-origin";

describe("resolveCanonicalOrigin", () => {
  it("returns fallback for undefined", () => {
    assert.equal(resolveCanonicalOrigin(undefined), "https://kafka-hub.dev");
  });

  it("returns fallback for empty string", () => {
    assert.equal(resolveCanonicalOrigin(""), "https://kafka-hub.dev");
    assert.equal(resolveCanonicalOrigin("  "), "https://kafka-hub.dev");
  });

  it("returns fallback for invalid URL", () => {
    assert.equal(resolveCanonicalOrigin("not-a-url"), "https://kafka-hub.dev");
  });

  it("returns fallback for non-http protocol", () => {
    assert.equal(resolveCanonicalOrigin("ftp://example.com"), "https://kafka-hub.dev");
  });

  it("returns fallback for URLs with credentials", () => {
    assert.equal(resolveCanonicalOrigin("https://user:pass@example.com"), "https://kafka-hub.dev");
    assert.equal(resolveCanonicalOrigin("https://user@example.com"), "https://kafka-hub.dev");
  });

  it("strips path/query/fragment and returns origin", () => {
    assert.equal(resolveCanonicalOrigin("https://kafka-hub.dev/learn?q=1#top"), "https://kafka-hub.dev");
  });

  it("accepts valid https origin", () => {
    assert.equal(resolveCanonicalOrigin("https://kafka-hub.dev"), "https://kafka-hub.dev");
  });

  it("accepts valid http origin", () => {
    assert.equal(resolveCanonicalOrigin("http://localhost:3000"), "http://localhost:3000");
  });

  it("preserves non-default port", () => {
    assert.equal(resolveCanonicalOrigin("https://example.com:8443"), "https://example.com:8443");
  });

  it("strips trailing slash", () => {
    assert.equal(resolveCanonicalOrigin("https://kafka-hub.dev/"), "https://kafka-hub.dev");
  });
});
