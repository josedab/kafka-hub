import assert from "node:assert/strict";
import { test } from "node:test";
import { LruCache } from "./lru-cache";

test("LruCache evicts the least recently used entry", () => {
  const cache = new LruCache<number>(2);
  cache.set("first", 1);
  cache.set("second", 2);

  assert.equal(cache.get("first"), 1);
  cache.set("third", 3);

  assert.equal(cache.has("first"), true);
  assert.equal(cache.has("second"), false);
  assert.equal(cache.get("third"), 3);
});

test("LruCache updates an existing entry without evicting another key", () => {
  const cache = new LruCache<number>(2);
  cache.set("first", 1);
  cache.set("second", 2);
  cache.set("first", 10);

  assert.equal(cache.get("first"), 10);
  assert.equal(cache.get("second"), 2);
});

test("LruCache rejects invalid capacities", () => {
  assert.throws(() => new LruCache(0), RangeError);
  assert.throws(() => new LruCache(1.5), RangeError);
});
