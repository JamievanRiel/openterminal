export class ProviderError extends Error {
  constructor(
    public code: 'NO_KEY' | 'BAD_KEY' | 'RATE_LIMITED' | 'HTTP' | 'NETWORK' | 'UNSUPPORTED',
    message: string,
    /** for RATE_LIMITED: how long until a token frees up (drives countdown UIs) */
    public retryAfterMs?: number
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** Token bucket matching a provider's free-tier rate limit. */
export class TokenBucket {
  private tokens: number
  private lastRefill = Date.now()

  constructor(
    private capacity: number,
    private refillWindowMs: number
  ) {
    this.tokens = capacity
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + (elapsed / this.refillWindowMs) * this.capacity)
      this.lastRefill = now
    }
  }

  take(): boolean {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    return false
  }

  status(): { remaining: number; capacity: number } {
    this.refill()
    return { remaining: Math.floor(this.tokens), capacity: this.capacity }
  }

  /** ms until the next token becomes available (0 when one is ready now). */
  msUntilToken(): number {
    this.refill()
    if (this.tokens >= 1) return 0
    return Math.ceil(((1 - this.tokens) * this.refillWindowMs) / this.capacity)
  }
}

interface CacheEntry<T> {
  value: T
  expires: number
}

const ttlRegistry: Array<TtlCache<unknown>> = []

/** Wipe every in-memory TTL cache (SET → clear caches). */
export function clearAllTtlCaches(): number {
  let cleared = 0
  for (const cache of ttlRegistry) cleared += cache.clear()
  return cleared
}

/** In-memory TTL cache. Expired entries remain readable as "stale". */
export class TtlCache<T> {
  private map = new Map<string, CacheEntry<T>>()

  constructor(
    private ttlMs: number,
    private maxEntries = 500
  ) {
    ttlRegistry.push(this as TtlCache<unknown>)
  }

  clear(): number {
    const n = this.map.size
    this.map.clear()
    return n
  }

  get size(): number {
    return this.map.size
  }

  get(key: string): { value: T; stale: boolean } | null {
    const entry = this.map.get(key)
    if (!entry) return null
    return { value: entry.value, stale: Date.now() > entry.expires }
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs })
  }
}
