import { describe, expect, it } from 'vitest'
import { aggregateSentiment, scoreSentiment } from './sentimentCore'

describe('scoreSentiment', () => {
  it('scores all-positive headlines 1', () => {
    expect(scoreSentiment('Stocks surge and rally on strong growth')).toBe(1)
  })

  it('scores all-negative headlines -1', () => {
    expect(scoreSentiment('Markets crash amid recession fears')).toBe(-1)
  })

  it('scores mixed headlines as the positive/negative ratio', () => {
    // rally (+1) vs recession, fears (-2) → (1-2)/3
    expect(scoreSentiment('Stocks rally despite recession fears')).toBeCloseTo(-1 / 3)
  })

  it('returns null when no lexicon word matches (no fake NEUTRAL)', () => {
    expect(scoreSentiment('The committee met on Tuesday')).toBeNull()
    expect(scoreSentiment('')).toBeNull()
  })

  it('strips punctuation and ignores case', () => {
    expect(scoreSentiment('Record profit!')).toBe(1)
    expect(scoreSentiment('SURGE')).toBe(1)
    expect(scoreSentiment('"crisis," (warning)')).toBe(-1)
  })
})

describe('aggregateSentiment', () => {
  it('computes bullish/bearish percentages and average with nulls as neutral', () => {
    const agg = aggregateSentiment([0.5, 0.5, -0.5, null])
    expect(agg.bullish).toBe(50)
    expect(agg.bearish).toBe(25)
    expect(agg.score).toBeCloseTo(0.125)
  })

  it('treats the ±0.05 boundary as neutral', () => {
    const agg = aggregateSentiment([0.05, -0.05])
    expect(agg.bullish).toBe(0)
    expect(agg.bearish).toBe(0)
  })

  it('returns zeros for an empty list', () => {
    expect(aggregateSentiment([])).toEqual({ bullish: 0, bearish: 0, score: 0 })
  })
})
