import { describe, expect, it } from 'vitest'
import {
  estimateBars,
  INTERVAL_SECONDS,
  INTERVALS,
  isIntraday,
  RANGE_DEFAULT_INTERVAL,
  RANGES,
  rangeStartMs
} from './chart'

const AT = (iso: string): Date => new Date(iso)

describe('range/interval tables', () => {
  it('gives every range a default interval', () => {
    for (const range of RANGES) expect(RANGE_DEFAULT_INTERVAL[range]).toBeDefined()
  })

  it('gives every interval a duration', () => {
    for (const interval of INTERVALS) expect(INTERVAL_SECONDS[interval]).toBeGreaterThan(0)
  })

  it('counts anything under a day as intraday', () => {
    expect(isIntraday('1m')).toBe(true)
    expect(isIntraday('1h')).toBe(true)
    expect(isIntraday('1D')).toBe(false)
    expect(isIntraday('1W')).toBe(false)
  })
})

describe('rangeStartMs', () => {
  const now = AT('2026-09-15T13:00:00Z')

  it('always starts in the past', () => {
    for (const range of RANGES) expect(rangeStartMs(range, now)).toBeLessThan(now.getTime())
  })

  it('reaches further back the longer the range', () => {
    const starts = RANGES.map((r) => rangeStartMs(r, now))
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeLessThan(starts[i - 1])
  })

  it('starts YTD at January 1st UTC of the current year', () => {
    expect(rangeStartMs('YTD', now)).toBe(Date.UTC(2026, 0, 1))
    expect(rangeStartMs('YTD', AT('2026-01-01T00:30:00Z'))).toBe(Date.UTC(2026, 0, 1))
  })

  it('starts MAX at 1990', () => {
    expect(new Date(rangeStartMs('MAX', now)).getUTCFullYear()).toBe(1990)
  })

  it('covers more than the last session for 1D, so a full day of bars fits', () => {
    expect(now.getTime() - rangeStartMs('1D', now)).toBeGreaterThan(86_400_000)
  })

  // Guards the v1.0.1 fix: these windows are epoch arithmetic, not wall-clock,
  // so a DST transition inside the window must not shift the span by an hour.
  it('spans the same duration across a DST transition as outside one', () => {
    const springForward = AT('2026-03-09T12:00:00Z') // US DST started 2026-03-08
    const quietWeek = AT('2026-06-09T12:00:00Z')
    for (const range of ['5D', '1M', '3M', '6M', '1Y', '5Y'] as const) {
      const acrossDst = springForward.getTime() - rangeStartMs(range, springForward)
      const outsideDst = quietWeek.getTime() - rangeStartMs(range, quietWeek)
      expect(acrossDst).toBe(outsideDst)
    }
  })
})

describe('estimateBars', () => {
  const now = AT('2026-09-15T13:00:00Z')

  it('asks for at least one bar for every range and interval', () => {
    for (const range of RANGES) {
      for (const interval of INTERVALS) expect(estimateBars(range, interval, now)).toBeGreaterThan(0)
    }
  })

  it('never asks a provider for more than 5000 bars', () => {
    for (const range of RANGES) {
      for (const interval of INTERVALS) expect(estimateBars(range, interval, now)).toBeLessThanOrEqual(5000)
    }
  })

  it('asks for more bars as the interval gets finer', () => {
    expect(estimateBars('1M', '1m', now)).toBeGreaterThan(estimateBars('1M', '1h', now))
    expect(estimateBars('1M', '1h', now)).toBeGreaterThan(estimateBars('1M', '1D', now))
  })

  it('asks for more bars as the range gets longer', () => {
    expect(estimateBars('1Y', '1D', now)).toBeGreaterThan(estimateBars('1M', '1D', now))
  })

  it('discounts weekends for daily and intraday bars', () => {
    // 31 calendar days of daily bars is ~22 trading days, not 31.
    expect(estimateBars('1M', '1D', now)).toBeLessThan(31 + 10)
  })
})
