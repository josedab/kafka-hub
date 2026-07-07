/**
 * In-process LRU cache. Used for memoizing LLM diagnostic responses keyed by
 * SHA-256 of the input config to keep API spend bounded.
 *
 * Per-instance only — Vercel functions can spin up multiple instances. That
 * means cache hits and rate limits are best-effort, not global. Multi-instance
 * deployments should add a shared quota backend or provider-side spend limit.
 */

export class LruCache<V> {
  private readonly map = new Map<string, V>();
  private readonly capacity: number;

  constructor(capacity = 256) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("LRU cache capacity must be a positive integer.");
    }
    this.capacity = capacity;
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }
}
