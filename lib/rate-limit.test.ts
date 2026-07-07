import assert from "node:assert/strict";
import { test } from "node:test";
import { TokenBucketRateLimiter } from "./rate-limit";

test("TokenBucketRateLimiter enforces burst capacity and refills over time", () => {
  let now = 0;
  const limiter = new TokenBucketRateLimiter({ now: () => now });

  for (let request = 0; request < 10; request += 1) {
    assert.equal(limiter.take("client"), true);
  }
  assert.equal(limiter.take("client"), false);
  assert.equal(limiter.remaining("client"), 0);

  now += 6_000;
  assert.equal(limiter.remaining("client"), 1);
  assert.equal(limiter.take("client"), true);
  assert.equal(limiter.take("client"), false);
});

test("TokenBucketRateLimiter keeps keys isolated", () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 1 });

  assert.equal(limiter.take("first"), true);
  assert.equal(limiter.take("first"), false);
  assert.equal(limiter.take("second"), true);
});

test("TokenBucketRateLimiter rejects invalid configuration and costs", () => {
  assert.throws(
    () => new TokenBucketRateLimiter({ refillIntervalMs: 0 }),
    RangeError,
  );

  const limiter = new TokenBucketRateLimiter();
  assert.throws(() => limiter.take("client", 0), RangeError);
});
