import { describe, expect, it } from 'vitest'
import { classify, fromStreamSymbol, isTwelveDataQuoted, toStreamSymbol, toTwelveDataSymbol } from './symbols'

describe('symbols mapping', () => {
  it('classifies display symbols', () => {
    expect(classify('AAPL')).toBe('equity')
    expect(classify('BRK.B')).toBe('equity')
    expect(classify('BTC-USD')).toBe('crypto')
    expect(classify('EUR/USD')).toBe('fx')
    expect(classify('EUR/GBP')).toBe('fx')
  })

  it('round-trips stream symbols', () => {
    expect(toStreamSymbol('BTC-USD')).toBe('BINANCE:BTCUSDT')
    expect(fromStreamSymbol('BINANCE:BTCUSDT')).toBe('BTC-USD')
    expect(toStreamSymbol('EUR/USD')).toBe('OANDA:EUR_USD')
    expect(fromStreamSymbol('OANDA:EUR_USD')).toBe('EUR/USD')
    expect(toStreamSymbol('AAPL')).toBe('AAPL')
    expect(fromStreamSymbol('AAPL')).toBe('AAPL')
  })

  it('maps Twelve Data symbols (identity for unlisted FX crosses and equities)', () => {
    expect(toTwelveDataSymbol('BTC-USD')).toBe('BTC/USD')
    expect(toTwelveDataSymbol('EUR/USD')).toBe('EUR/USD')
    expect(toTwelveDataSymbol('GBP/JPY')).toBe('GBP/JPY')
    expect(toTwelveDataSymbol('ASML')).toBe('ASML')
  })

  it('routes non-equities to Twelve Data quoting', () => {
    expect(isTwelveDataQuoted('AAPL')).toBe(false)
    expect(isTwelveDataQuoted('BTC-USD')).toBe(true)
    expect(isTwelveDataQuoted('EUR/USD')).toBe(true)
  })
})
