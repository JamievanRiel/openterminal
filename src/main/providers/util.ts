/**
 * THE HTTP-status classifier for every provider adapter — no adapter-local
 * ad-hoc checks. Outcomes per class:
 *   401        → BAD_KEY      (key invalid — surfaces in SET key status)
 *   402/403    → UNSUPPORTED  (plan-gated — honest "not on this plan" state)
 *   404        → UNSUPPORTED  (no such data — panels show their empty state)
 *   429        → RATE_LIMITED (bucket/backoff, optional retryAfterMs)
 *   other !ok  → HTTP
 * Returns null for 2xx.
 */
export function classifyStatus(
  provider: string,
  status: number,
  retryAfterMs?: number
): ProviderError | null {
  if (status >= 200 && status < 300) return null
  if (status === 401) return new ProviderError('BAD_KEY', `${provider} rejected the API key.`)
  if (status === 402 || status === 403) {
    return new ProviderError('UNSUPPORTED', `${provider}: this endpoint is not available on the current plan (HTTP ${status}).`)
  }
  if (status === 404) return new ProviderError('UNSUPPORTED', `${provider}: no data found (HTTP 404).`)
  if (status === 429) return new ProviderError('RATE_LIMITED', `${provider} returned 429 (rate limited).`, retryAfterMs)
  return new ProviderError('HTTP', `${provider} HTTP ${status}`)
}

/** Finnhub `related` is comma-separated and may repeat a symbol — dedupe, cap at 4. */
export function parseRelatedTickers(related?: string): string[] {
  return [...new Set((related ?? '').split(',').filter(Boolean))].slice(0, 4)
}

/** Calendar feeds may repeat a symbol on one day — first row wins (dup React keys otherwise). */
export function dedupeBySymbolDate<T extends { symbol: string; date: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = `${r.symbol}:${r.date}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

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

export interface BucketPersistence {
  load: () => { tokens: number; lastRefill: number } | null
  save: (state: { tokens: number; lastRefill: number }) => void
}

/** Token bucket matching a provider's free-tier rate limit. */
export class TokenBucket {
  private tokens: number
  private lastRefill = Date.now()
  private persistence: BucketPersistence | null = null

  constructor(
    private capacity: number,
    private refillWindowMs: number
  ) {
    this.tokens = capacity
  }

  /**
   * Persist bucket state across restarts (day-quota buckets like FMP's
   * 250/day must not reset on relaunch). Loads immediately, saves on take.
   */
  setPersistence(persistence: BucketPersistence): void {
    this.persistence = persistence
    const saved = persistence.load()
    if (saved && Number.isFinite(saved.tokens) && Number.isFinite(saved.lastRefill) && saved.lastRefill <= Date.now()) {
      this.tokens = Math.max(0, Math.min(this.capacity, saved.tokens))
      this.lastRefill = saved.lastRefill
      this.refill() // credit elapsed downtime
    }
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
      this.persistence?.save({ tokens: this.tokens, lastRefill: this.lastRefill })
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
