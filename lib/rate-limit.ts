/**
 * In-process token bucket per IP. Replaces Upstash in v1.
 *
 * Defaults to 10 requests per minute per IP. Burst capacity is the same as the
 * fill rate, so a client gets ~10 requests, then 1 every 6 seconds.
 *
 * This is fine for a Vercel deployment with a single region; multi-region
 * users should swap this for the Upstash backend documented in the README.
 */

const CAPACITY = 10;
const REFILL_INTERVAL_MS = 60_000;

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface TokenBucketRateLimiterOptions {
  capacity?: number;
  refillTokens?: number;
  refillIntervalMs?: number;
  now?: () => number;
}

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly capacity: number;
  private readonly fillRatePerMs: number;
  private readonly now: () => number;

  constructor({
    capacity = CAPACITY,
    refillTokens = CAPACITY,
    refillIntervalMs = REFILL_INTERVAL_MS,
    now = Date.now,
  }: TokenBucketRateLimiterOptions = {}) {
    if (capacity <= 0 || refillTokens <= 0 || refillIntervalMs <= 0) {
      throw new RangeError("Token bucket values must be greater than zero.");
    }

    this.capacity = capacity;
    this.fillRatePerMs = refillTokens / refillIntervalMs;
    this.now = now;
  }

  take(key: string, cost = 1): boolean {
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new RangeError("Token cost must be greater than zero.");
    }

    const bucket = this.refill(key);

    if (bucket.tokens < cost) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    return true;
  }

  remaining(key: string): number {
    return Math.floor(this.refill(key).tokens);
  }

  private refill(key: string): TokenBucket {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? {
      tokens: this.capacity,
      lastRefill: now,
    };

    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsed * this.fillRatePerMs,
    );
    bucket.lastRefill = now;
    this.buckets.set(key, bucket);
    return bucket;
  }
}

const limiter = new TokenBucketRateLimiter();

export function take(key: string, cost = 1): boolean {
  return limiter.take(key, cost);
}

export function remaining(key: string): number {
  return limiter.remaining(key);
}
