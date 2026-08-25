import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyStatus, TokenBucket, type BucketPersistence } from './util'

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('empties at capacity and refills over the window', () => {
    const bucket = new TokenBucket(2, 1000)
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(false)
    vi.advanceTimersByTime(500) // half a window refills half the capacity
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(false)
  })

  it('reports remaining and time-to-token', () => {
    const bucket = new TokenBucket(4, 1000)
    bucket.take()
    expect(bucket.status()).toEqual({ remaining: 3, capacity: 4 })
    expect(bucket.msUntilToken()).toBe(0)
    for (let i = 0; i < 3; i++) bucket.take()
    expect(bucket.msUntilToken()).toBeGreaterThan(0)
    expect(bucket.msUntilToken()).toBeLessThanOrEqual(250)
  })

  it('day-quota persistence: state survives a "restart" and credits downtime', () => {
    const disk: { state: { tokens: number; lastRefill: number } | null } = { state: null }
    const persistence: BucketPersistence = {
      load: () => disk.state,
      save: (s) => (disk.state = s)
    }
    const dayMs = 24 * 3600_000
    const first = new TokenBucket(250, dayMs)
    first.setPersistence(persistence)
    for (let i = 0; i < 100; i++) first.take()
    expect(first.status().remaining).toBe(150)

    // "Restart" 6h later: a fresh bucket must resume from 150 + 6h/24h of refill.
    vi.advanceTimersByTime(6 * 3600_000)
    const second = new TokenBucket(250, dayMs)
    second.setPersistence(persistence)
    const remaining = second.status().remaining
    expect(remaining).toBeGreaterThanOrEqual(150 + 62) // 150 + ~62.5 refilled
    expect(remaining).toBeLessThanOrEqual(150 + 63)
    expect(remaining).toBeLessThan(250) // NOT reset to full
  })
})

describe('classifyStatus', () => {
  it('maps every status class to the correct outcome', () => {
    expect(classifyStatus('X', 200)).toBeNull()
    expect(classifyStatus('X', 401)?.code).toBe('BAD_KEY')
    expect(classifyStatus('X', 402)?.code).toBe('UNSUPPORTED')
    expect(classifyStatus('X', 403)?.code).toBe('UNSUPPORTED')
    expect(classifyStatus('X', 404)?.code).toBe('UNSUPPORTED')
    expect(classifyStatus('X', 429)?.code).toBe('RATE_LIMITED')
    expect(classifyStatus('X', 500)?.code).toBe('HTTP')
  })
  it('carries retryAfterMs on 429 only', () => {
    expect(classifyStatus('X', 429, 5000)?.retryAfterMs).toBe(5000)
    expect(classifyStatus('X', 500, 5000)?.retryAfterMs).toBeUndefined()
  })
})
