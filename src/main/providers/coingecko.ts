import type { CryptoDetail, CryptoMarkets, CryptoMarketRow } from '../../shared/types'
import { ProviderError, TokenBucket, TtlCache } from './util'

const BASE = 'https://api.coingecko.com/api/v3'

// Public tier ≈30/min without a key; our polling needs ~1/min. Demo key raises limits.
const bucket = new TokenBucket(25, 60_000)
const marketsCache = new TtlCache<CryptoMarkets>(55_000, 2)
const detailCache = new TtlCache<CryptoDetail>(10 * 60_000, 30)

export class CoinGeckoProvider {
  constructor(private getKey: () => string | null) {}

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!bucket.take()) throw new ProviderError('RATE_LIMITED', 'CoinGecko rate limit reached.', bucket.msUntilToken())
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const headers: Record<string, string> = { Accept: 'application/json' }
    const key = this.getKey()
    if (key) headers['x-cg-demo-api-key'] = key
    let res: Response
    try {
      res = await fetch(url, { headers })
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching CoinGecko: ' + String(err))
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('BAD_KEY', 'CoinGecko rejected the API key.')
    if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'CoinGecko returned 429 (rate limited).', 60_000)
    if (!res.ok) throw new ProviderError('HTTP', 'CoinGecko HTTP ' + res.status)
    return (await res.json()) as T
  }

  async testKey(): Promise<boolean> {
    const m = await this.getMarkets()
    return m.rows.length > 0
  }

  /** Top-100 by market cap with 7d sparklines, cached just under the 60s poll. */
  async getMarkets(): Promise<CryptoMarkets> {
    const cached = marketsCache.get('top100')
    if (cached && !cached.stale) return { ...cached.value, fromCache: true }
    try {
      const d = await this.call<
        Array<{
          id: string
          market_cap_rank: number | null
          name: string
          symbol: string
          current_price: number | null
          price_change_percentage_24h_in_currency?: number | null
          price_change_percentage_7d_in_currency?: number | null
          market_cap: number | null
          total_volume: number | null
          sparkline_in_7d?: { price?: number[] }
        }>
      >('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: '100',
        page: '1',
        sparkline: 'true',
        price_change_percentage: '24h,7d'
      })
      const rows: CryptoMarketRow[] = d
        .filter((c) => typeof c.current_price === 'number')
        .map((c) => ({
          id: c.id,
          rank: c.market_cap_rank ?? 0,
          name: c.name,
          symbol: c.symbol.toUpperCase(),
          price: c.current_price as number,
          change24hPct: c.price_change_percentage_24h_in_currency ?? null,
          change7dPct: c.price_change_percentage_7d_in_currency ?? null,
          marketCap: c.market_cap,
          volume24h: c.total_volume,
          // Thin the 7d sparkline (hourly points) for cheap SVG rendering.
          sparkline7d: (c.sparkline_in_7d?.price ?? []).filter((_, i) => i % 4 === 0)
        }))
      const result: CryptoMarkets = { rows, fetchedAt: Date.now(), fromCache: false }
      marketsCache.set('top100', result)
      return result
    } catch (err) {
      if (err instanceof ProviderError && cached) return { ...cached.value, fromCache: true }
      throw err
    }
  }

  /** Detail stats + price line for 1/7/30/365 days, cached 10 min. */
  async getDetail(id: string, days: number): Promise<CryptoDetail> {
    const key = `${id}:${days}`
    const cached = detailCache.get(key)
    if (cached && !cached.stale) return cached.value
    const chart = await this.call<{ prices?: Array<[number, number]> }>(`/coins/${encodeURIComponent(id)}/market_chart`, {
      vs_currency: 'usd',
      days: String(days)
    })
    // Stats ride along from the markets cache when possible (zero extra calls).
    const markets = marketsCache.get('top100')?.value
    const row = markets?.rows.find((r) => r.id === id)
    let ath: number | null = null
    let athChangePct: number | null = null
    let circulating: number | null = null
    let total: number | null = null
    try {
      const info = await this.call<{
        market_data?: {
          ath?: { usd?: number }
          ath_change_percentage?: { usd?: number }
          circulating_supply?: number
          total_supply?: number | null
        }
      }>(`/coins/${encodeURIComponent(id)}`, {
        localization: 'false',
        tickers: 'false',
        market_data: 'true',
        community_data: 'false',
        developer_data: 'false',
        sparkline: 'false'
      })
      ath = info.market_data?.ath?.usd ?? null
      athChangePct = info.market_data?.ath_change_percentage?.usd ?? null
      circulating = info.market_data?.circulating_supply ?? null
      total = info.market_data?.total_supply ?? null
    } catch {
      /* stats are optional */
    }
    const result: CryptoDetail = {
      id,
      name: row?.name ?? id,
      symbol: row?.symbol ?? id.toUpperCase(),
      rank: row?.rank ?? null,
      ath,
      athChangePct,
      circulatingSupply: circulating,
      totalSupply: total,
      marketCap: row?.marketCap ?? null,
      prices: chart.prices ?? [],
      fetchedAt: Date.now()
    }
    detailCache.set(key, result)
    return result
  }
}
