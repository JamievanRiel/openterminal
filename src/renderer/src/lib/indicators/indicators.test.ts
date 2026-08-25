import { describe, expect, it } from 'vitest'
import type { Candle } from '../../../../shared/types'
import { bollinger, ema, macd, rsi, sma, vwap } from './indicators'

const close = (values: Array<number | null>): Array<number | null> =>
  values.map((v) => (v === null ? null : Math.round(v * 1e6) / 1e6))

describe('sma', () => {
  it('matches hand-computed values and pads warm-up with null', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })
  it('returns all nulls when the series is shorter than the period', () => {
    expect(sma([1, 2], 3)).toEqual([null, null])
  })
})

describe('ema', () => {
  it('seeds with the SMA and applies the smoothing constant', () => {
    // period 3 → k = 0.5; seed = sma(2,4,6) = 4; then 8*.5+4*.5=6; 10*.5+6*.5=8
    expect(close(ema([2, 4, 6, 8, 10], 3))).toEqual([null, null, 4, 6, 8])
  })
})

describe('rsi', () => {
  it('matches hand-computed Wilder smoothing (period 2)', () => {
    // deltas: +1 +1 -1 +1 → RSI: 100, then 50, then 75
    expect(close(rsi([1, 2, 3, 2, 3], 2))).toEqual([null, null, 100, 50, 75])
  })
  it('is 100 when there are no losses', () => {
    const r = rsi([1, 2, 3, 4, 5], 2)
    expect(r[4]).toBe(100)
  })
})

describe('macd', () => {
  it('macd = emaFast − emaSlow; signal EMA over the non-null tail', () => {
    // fast=1 → ema equals closes; slow=2 seeds 1.5 then 2.5, 3.5; signal period 1 → macd itself
    const { macd: line, signal, histogram } = macd([1, 2, 3, 4], 1, 2, 1)
    expect(close(line)).toEqual([null, 0.5, 0.5, 0.5])
    expect(close(signal)).toEqual([null, 0.5, 0.5, 0.5])
    expect(close(histogram)).toEqual([null, 0, 0, 0])
  })
})

describe('bollinger', () => {
  it('uses population standard deviation around the SMA', () => {
    const { middle, upper, lower } = bollinger([1, 2, 3], 3, 1)
    const sd = Math.sqrt(2 / 3)
    expect(middle[2]).toBe(2)
    expect(upper[2]).toBeCloseTo(2 + sd, 10)
    expect(lower[2]).toBeCloseTo(2 - sd, 10)
  })
})

describe('vwap', () => {
  const bar = (time: number, typical: number, volume: number): Candle => ({
    time,
    open: typical,
    high: typical,
    low: typical,
    close: typical,
    volume
  })
  it('accumulates typical price × volume within a session', () => {
    const candles = [bar(0, 10, 100), bar(60, 20, 300)]
    const v = vwap(candles, () => 'day1')
    expect(v[0]).toBe(10)
    expect(v[1]).toBeCloseTo(17.5, 10)
  })
  it('resets when the session key changes', () => {
    const candles = [bar(0, 10, 100), bar(60, 20, 300), bar(86_400, 30, 100)]
    const v = vwap(candles, (t) => (t < 86_400 ? 'day1' : 'day2'))
    expect(v[2]).toBe(30)
  })
  it('falls back to typical price on zero volume', () => {
    const v = vwap([bar(0, 42, 0)], () => 's')
    expect(v[0]).toBe(42)
  })
})
