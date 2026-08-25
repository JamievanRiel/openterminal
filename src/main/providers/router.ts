import type { Quote } from '../../shared/types'
import { isTwelveDataQuoted } from '../../shared/symbols'
import type { AlpacaProvider } from './alpaca'
import type { FinnhubProvider } from './finnhub'
import type { TwelveDataProvider } from './twelvedata'
import { ProviderError, TtlCache } from './util'

/** A REST source of point-in-time quote snapshots. */
export interface QuoteProvider {
  getQuote(symbol: string): Promise<Quote>
}

/**
 * Routes REST quote requests: US equities go Finnhub → Alpaca (fallback on rate
 * limit / transient failure), FX & crypto display symbols go to Twelve Data.
 * Keeps a short LRU so bursty panels don't burn tokens; when every provider is
 * out of tokens, serves the stale entry with stale=true (renderer shows DELAYED).
 */
export class ProviderRouter implements QuoteProvider {
  private lru = new TtlCache<Quote>(5_000, 300)

  constructor(
    private finnhub: FinnhubProvider,
    private alpaca: AlpacaProvider,
    private twelvedata: TwelveDataProvider
  ) {}

  async getQuote(symbol: string): Promise<Quote> {
    const cached = this.lru.get(symbol)
    if (cached && !cached.stale) return cached.value

    if (isTwelveDataQuoted(symbol)) {
      const quote = await this.twelvedata.getQuote(symbol)
      this.lru.set(symbol, quote)
      return quote
    }

    let primaryErr: unknown
    try {
      const quote = await this.finnhub.getQuote(symbol)
      if (!quote.stale) {
        this.lru.set(symbol, quote)
        return quote
      }
      primaryErr = new ProviderError('RATE_LIMITED', 'Finnhub rate limited (stale cache only).')
    } catch (err) {
      primaryErr = err
    }

    const fallbackWorthy =
      primaryErr instanceof ProviderError && ['RATE_LIMITED', 'NETWORK', 'HTTP'].includes(primaryErr.code)
    if (fallbackWorthy && this.alpaca.configured()) {
      try {
        const quote = await this.alpaca.getQuote(symbol)
        this.lru.set(symbol, quote)
        return quote
      } catch {
        /* fall through to stale/error below */
      }
    }
    if (cached) return { ...cached.value, stale: true }
    throw primaryErr
  }
}
