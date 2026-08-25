import type { OptionChain, OptionChainRow, OptionSide, OptionsExpiration } from '../../shared/types'
import { classifyStatus, ProviderError, TokenBucket, TtlCache } from './util'

const BASE = 'https://api.polygon.io'

// Free/starter Polygon keys: 5 requests/min.
const bucket = new TokenBucket(5, 60_000)
const expirationsCache = new TtlCache<OptionsExpiration[]>(3600_000, 20)
const chainCache = new TtlCache<OptionChain>(60_000, 20)

export class PolygonProvider {
  constructor(private getKey: () => string | null) {}

  configured(): boolean {
    return this.getKey() !== null
  }

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'Polygon API key not configured. Open SET to add it.')
    if (!bucket.take()) throw new ProviderError('RATE_LIMITED', 'Polygon rate limit reached (5/min).', bucket.msUntilToken())
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('apiKey', key)
    let res: Response
    try {
      res = await fetch(url)
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching Polygon: ' + String(err))
    }
    const classified = classifyStatus('Polygon', res.status, res.status === 429 ? 60_000 : undefined)
    if (classified) throw classified
    return (await res.json()) as T
  }

  async testKey(): Promise<boolean> {
    try {
      const d = await this.call<{ status?: string }>('/v3/reference/options/contracts', {
        underlying_ticker: 'AAPL',
        limit: '1'
      })
      return d.status === 'OK' || d.status === 'DELAYED'
    } catch (err) {
      if (err instanceof ProviderError && (err.code === 'BAD_KEY' || err.code === 'UNSUPPORTED')) return false
      throw err
    }
  }

  /** Distinct upcoming expiration dates from the contracts reference endpoint. */
  async getExpirations(symbol: string): Promise<OptionsExpiration[]> {
    const cached = expirationsCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const today = new Date().toISOString().slice(0, 10)
    const d = await this.call<{ results?: Array<{ expiration_date?: string }> }>('/v3/reference/options/contracts', {
      underlying_ticker: symbol,
      'expiration_date.gte': today,
      limit: '1000',
      sort: 'expiration_date'
    })
    const counts = new Map<string, number>()
    for (const c of d.results ?? []) {
      if (c.expiration_date) counts.set(c.expiration_date, (counts.get(c.expiration_date) ?? 0) + 1)
    }
    const out = [...counts.entries()]
      .map(([date, contractCount]) => ({ date, contractCount }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 16)
    if (out.length === 0) throw new ProviderError('UNSUPPORTED', 'No option contracts found for ' + symbol)
    expirationsCache.set(symbol, out)
    return out
  }

  /** Snapshot chain for one expiration; cached 60s. */
  async getChain(symbol: string, expiration: string): Promise<OptionChain> {
    const key = `${symbol}:${expiration}`
    const cached = chainCache.get(key)
    if (cached && !cached.stale) return cached.value
    interface SnapContract {
      details?: { strike_price?: number; contract_type?: string; ticker?: string }
      last_quote?: { bid?: number; ask?: number }
      last_trade?: { price?: number }
      day?: { volume?: number }
      open_interest?: number
      implied_volatility?: number
      greeks?: { delta?: number }
    }
    const results: SnapContract[] = []
    let cursorUrl: string | null = null
    let delayed = false
    for (let page = 0; page < 3; page++) {
      const d: { results?: SnapContract[]; status?: string; next_url?: string } = cursorUrl
        ? await this.callRaw(cursorUrl)
        : await this.call('/v3/snapshot/options/' + encodeURIComponent(symbol), {
            expiration_date: expiration,
            limit: '250'
          })
      if (d.status === 'DELAYED') delayed = true
      results.push(...(d.results ?? []))
      if (!d.next_url) break
      cursorUrl = d.next_url
    }
    if (results.length === 0) throw new ProviderError('UNSUPPORTED', `No snapshot data for ${symbol} ${expiration} on this plan.`)

    const byStrike = new Map<number, OptionChainRow>()
    let hasGreeks = false
    for (const c of results) {
      const strike = c.details?.strike_price
      const type = c.details?.contract_type
      if (typeof strike !== 'number' || (type !== 'call' && type !== 'put')) continue
      const side: OptionSide = {
        bid: c.last_quote?.bid ?? null,
        ask: c.last_quote?.ask ?? null,
        last: c.last_trade?.price ?? null,
        volume: c.day?.volume ?? null,
        openInterest: c.open_interest ?? null,
        iv: typeof c.implied_volatility === 'number' ? c.implied_volatility : null,
        delta: typeof c.greeks?.delta === 'number' ? c.greeks.delta : null,
        occSymbol: c.details?.ticker ?? ''
      }
      if (side.iv !== null || side.delta !== null) hasGreeks = true
      let row = byStrike.get(strike)
      if (!row) {
        row = { strike, call: null, put: null }
        byStrike.set(strike, row)
      }
      if (type === 'call') row.call = side
      else row.put = side
    }
    const chain: OptionChain = {
      symbol,
      expiration,
      rows: [...byStrike.values()].sort((a, b) => a.strike - b.strike),
      delayed,
      hasGreeks,
      fetchedAt: Date.now()
    }
    chainCache.set(key, chain)
    return chain
  }

  /** Follow a Polygon next_url cursor (already contains the path + cursor params). */
  private async callRaw<T>(nextUrl: string): Promise<T> {
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'Polygon API key not configured.')
    if (!bucket.take()) throw new ProviderError('RATE_LIMITED', 'Polygon rate limit reached (5/min).', bucket.msUntilToken())
    const url = new URL(nextUrl)
    url.searchParams.set('apiKey', key)
    const res = await fetch(url)
    const classified = classifyStatus('Polygon', res.status)
    if (classified) throw classified
    return (await res.json()) as T
  }
}
