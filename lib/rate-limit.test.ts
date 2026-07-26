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

test("TokenBucketRateLimiter calculates retry-after from the refill rate", () => {
  let now = 0;
  const limiter = new TokenBucketRateLimiter({
    capacity: 2,
    refillTokens: 2,
    refillIntervalMs: 10_000,
    now: () => now,
  });

  assert.deepEqual(limiter.consume("client"), {
    allowed: true,
    limit: 2,
    remaining: 1,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(limiter.consume("client"), {
    allowed: true,
    limit: 2,
    remaining: 0,
    retryAfterSeconds: 5,
  });
  assert.deepEqual(limiter.consume("client"), {
    allowed: false,
    limit: 2,
    remaining: 0,
    retryAfterSeconds: 5,
  });

  now += 2_500;
  assert.equal(limiter.consume("client").retryAfterSeconds, 3);
});

test("TokenBucketRateLimiter keeps keys isolated", () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 1 });

  assert.equal(limiter.take("first"), true);
  assert.equal(limiter.take("first"), false);
  assert.equal(limiter.take("second"), true);
});

test("TokenBucketRateLimiter evicts least-recently-used buckets at its bound", () => {
  const limiter = new TokenBucketRateLimiter({
    capacity: 1,
    maxBuckets: 2,
  });

  assert.equal(limiter.take("first"), true);
  assert.equal(limiter.take("second"), true);
  assert.equal(limiter.bucketCount, 2);

  // Touch first so second becomes the eviction candidate.
  assert.equal(limiter.take("first"), false);
  assert.equal(limiter.take("third"), true);
  assert.equal(limiter.bucketCount, 2);

  // The evicted second bucket starts with a fresh token.
  assert.equal(limiter.take("second"), true);
  assert.equal(limiter.bucketCount, 2);
});

test("TokenBucketRateLimiter rejects invalid configuration and costs", () => {
  assert.throws(
    () => new TokenBucketRateLimiter({ refillIntervalMs: 0 }),
    RangeError,
  );
  assert.throws(
    () => new TokenBucketRateLimiter({ maxBuckets: 0 }),
    RangeError,
  );

  const limiter = new TokenBucketRateLimiter();
  assert.throws(() => limiter.take("client", 0), RangeError);
  assert.throws(() => limiter.take("", 1), RangeError);
  assert.throws(() => limiter.take("client", 11), RangeError);
});
