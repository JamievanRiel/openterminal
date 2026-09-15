import type { OptionsFlowResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { ProviderError } from './providers/util'
import { parseOptionsChain } from './optionsFlowCore'
import { YahooSession } from './yahooSession'

const CHAIN_URL = 'https://query2.finance.yahoo.com/v7/finance/options/'

/**
 * FLOW — nearest-expiry options flow from Yahoo's keyless chain endpoint.
 * Yahoo throttles hard, so the disk cache absorbs repeat panels and doubles as
 * the stale fallback when a fetch fails.
 */
export class OptionsFlowService {
  private cache = new DiskCache<OptionsFlowResult>('options-flow', 5 * 60_000, 30)
  private session = new YahooSession()

  async get(symbol: string): Promise<OptionsFlowResult> {
    const key = symbol.toUpperCase()
    const cached = this.cache.get(key)
    if (cached && !cached.stale) return cached.value
    try {
      const parsed = parseOptionsChain(await this.session.fetchJson(CHAIN_URL + encodeURIComponent(key)))
      if (!parsed) throw new ProviderError('UNSUPPORTED', `Yahoo has no option chain for ${key}.`)
      const result: OptionsFlowResult = { ...parsed, symbol: parsed.symbol || key, fetchedAt: Date.now() }
      this.cache.set(key, result)
      return result
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }
}
