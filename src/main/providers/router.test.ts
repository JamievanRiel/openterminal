import { describe, expect, it } from 'vitest'
import type { Quote } from '../../shared/types'
import type { AlpacaProvider } from './alpaca'
import type { FinnhubProvider } from './finnhub'
import type { TwelveDataProvider } from './twelvedata'
import { ProviderRouter } from './router'
import { ProviderError } from './util'

const quote = (symbol: string, source: Quote['source']): Quote => ({
  symbol,
  current: 100,
  change: 1,
  percentChange: 1,
  high: 101,
  low: 99,
  open: 99.5,
  prevClose: 99,
  timestamp: Date.now(),
  stale: false,
  source
})

function makeRouter(opts: {
  finnhub?: (s: string) => Promise<Quote>
  alpacaConfigured?: boolean
  alpaca?: (s: string) => Promise<Quote>
  twelvedata?: (s: string) => Promise<Quote>
}): ProviderRouter {
  const finnhub = { getQuote: opts.finnhub ?? ((s: string) => Promise.resolve(quote(s, 'finnhub'))) }
  const alpaca = {
    configured: () => opts.alpacaConfigured ?? true,
    getQuote: opts.alpaca ?? ((s: string) => Promise.resolve(quote(s, 'alpaca')))
  }
  const twelvedata = { getQuote: opts.twelvedata ?? ((s: string) => Promise.resolve(quote(s, 'twelvedata'))) }
  return new ProviderRouter(
    finnhub as unknown as FinnhubProvider,
    alpaca as unknown as AlpacaProvider,
    twelvedata as unknown as TwelveDataProvider
  )
}

describe('ProviderRouter fallback order', () => {
  it('US equities use Finnhub first', async () => {
    const router = makeRouter({})
    expect((await router.getQuote('AAPL')).source).toBe('finnhub')
  })

  it('falls back to Alpaca when Finnhub is rate limited', async () => {
    const router = makeRouter({
      finnhub: () => Promise.reject(new ProviderError('RATE_LIMITED', 'nope'))
    })
    expect((await router.getQuote('AAPL')).source).toBe('alpaca')
  })

  it('does NOT fall back on BAD_KEY (surfaces the key problem)', async () => {
    const router = makeRouter({
      finnhub: () => Promise.reject(new ProviderError('BAD_KEY', 'bad key'))
    })
    await expect(router.getQuote('AAPL')).rejects.toMatchObject({ code: 'BAD_KEY' })
  })

  it('skips Alpaca when it is not configured', async () => {
    const router = makeRouter({
      finnhub: () => Promise.reject(new ProviderError('RATE_LIMITED', 'nope')),
      alpacaConfigured: false
    })
    await expect(router.getQuote('AAPL')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('routes FX and crypto display symbols to Twelve Data', async () => {
    const router = makeRouter({})
    expect((await router.getQuote('EUR/USD')).source).toBe('twelvedata')
    expect((await router.getQuote('BTC-USD')).source).toBe('twelvedata')
  })
})
