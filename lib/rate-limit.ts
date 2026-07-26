/**
 * Bounded, in-process token buckets for the optional LLM endpoint.
 *
 * State is deliberately per-instance and best-effort. Multi-instance
 * deployments should enforce a shared quota at the platform or provider too.
 */

const CAPACITY = 10;
const REFILL_INTERVAL_MS = 60_000;
const MAX_BUCKETS = 1_024;
const MAX_KEY_LENGTH = 256;

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface TokenBucketRateLimiterOptions {
  capacity?: number;
  refillTokens?: number;
  refillIntervalMs?: number;
  maxBuckets?: number;
  now?: () => number;
}

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly capacity: number;
  private readonly fillRatePerMs: number;
  private readonly maxBuckets: number;
  private readonly now: () => number;

  constructor({
    capacity = CAPACITY,
    refillTokens = CAPACITY,
    refillIntervalMs = REFILL_INTERVAL_MS,
    maxBuckets = MAX_BUCKETS,
    now = Date.now,
  }: TokenBucketRateLimiterOptions = {}) {
    if (capacity <= 0 || refillTokens <= 0 || refillIntervalMs <= 0) {
      throw new RangeError("Token bucket values must be greater than zero.");
    }
    if (!Number.isInteger(maxBuckets) || maxBuckets <= 0) {
      throw new RangeError("Maximum bucket count must be a positive integer.");
    }

    this.capacity = capacity;
    this.fillRatePerMs = refillTokens / refillIntervalMs;
    this.maxBuckets = maxBuckets;
    this.now = now;
  }

  consume(key: string, cost = 1): RateLimitDecision {
    this.validateInput(key, cost);
    const bucket = this.refill(key);
    const allowed = bucket.tokens >= cost;

    if (allowed) {
      bucket.tokens -= cost;
    }

    this.touch(key, bucket);
    const missingTokens = Math.max(0, cost - bucket.tokens);

    return {
      allowed,
      limit: this.capacity,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds:
        missingTokens === 0
          ? 0
          : Math.max(1, Math.ceil(missingTokens / this.fillRatePerMs / 1_000)),
    };
  }

  take(key: string, cost = 1): boolean {
    return this.consume(key, cost).allowed;
  }

  remaining(key: string): number {
    this.validateInput(key, 1);
    return Math.floor(this.refill(key).tokens);
  }

  get bucketCount(): number {
    return this.buckets.size;
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
    this.touch(key, bucket);
    return bucket;
  }

  private touch(key: string, bucket: TokenBucket): void {
    if (this.buckets.has(key)) {
      this.buckets.delete(key);
    } else if (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey !== undefined) this.buckets.delete(oldestKey);
    }
    this.buckets.set(key, bucket);
  }

  private validateInput(key: string, cost: number): void {
    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new RangeError(
        `Token bucket key must be between 1 and ${MAX_KEY_LENGTH} characters.`,
      );
    }
    if (!Number.isFinite(cost) || cost <= 0 || cost > this.capacity) {
      throw new RangeError(
        "Token cost must be greater than zero and no larger than capacity.",
      );
    }
  }
}

const limiter = new TokenBucketRateLimiter();

export function consume(key: string, cost = 1): RateLimitDecision {
  return limiter.consume(key, cost);
}

export function take(key: string, cost = 1): boolean {
  return limiter.take(key, cost);
}

export function remaining(key: string): number {
  return limiter.remaining(key);
}
