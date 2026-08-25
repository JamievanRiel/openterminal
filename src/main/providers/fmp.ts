import type { Mover, MoversResult, ScreenerFilters, ScreenerResult, ScreenerRow } from '../../shared/types'
import { classifyStatus, ProviderError, TokenBucket, TtlCache } from './util'

export type MoversTab = 'gainers' | 'losers' | 'actives'

// Free tier: 250 calls/day.
const bucket = new TokenBucket(250, 24 * 3600_000)
const moversCache = new TtlCache<MoversResult>(60_000, 10)
const earningsRawCache = new TtlCache<Array<Record<string, unknown>>>(24 * 3600_000, 60)
const screenerCache = new TtlCache<ScreenerResult>(10 * 60_000, 20)

export function fmpBucketStatus(): { remaining: number; capacity: number } {
  return bucket.status()
}

/** The 250/day quota must survive restarts — ipc wires an electron-store here. */
export function attachFmpBucketPersistence(persistence: import('./util').BucketPersistence): void {
  bucket.setPersistence(persistence)
}

// FMP moved from /api/v3 to /stable; newer free keys only work on /stable, older ones on /v3.
const ENDPOINTS: Record<MoversTab, { stable: string; v3: string }> = {
  gainers: {
    stable: 'https://financialmodelingprep.com/stable/biggest-gainers',
    v3: 'https://financialmodelingprep.com/api/v3/stock_market/gainers'
  },
  losers: {
    stable: 'https://financialmodelingprep.com/stable/biggest-losers',
    v3: 'https://financialmodelingprep.com/api/v3/stock_market/losers'
  },
  actives: {
    stable: 'https://financialmodelingprep.com/stable/most-actives',
    v3: 'https://financialmodelingprep.com/api/v3/stock_market/actives'
  }
}

interface FmpRow {
  symbol?: string
  name?: string
  price?: number
  change?: number
  changesPercentage?: number
  volume?: number
}

export class FmpProvider {
  constructor(private getKey: () => string | null) {}

  private async fetchList(rawUrl: string, key: string): Promise<FmpRow[]> {
    const url = new URL(rawUrl)
    url.searchParams.set('apikey', key)
    let res: Response
    try {
      res = await fetch(url)
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching FMP: ' + String(err))
    }
    const classified = classifyStatus('FMP', res.status)
    if (classified) throw classified
    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) throw new ProviderError('HTTP', 'FMP returned an unexpected payload.')
    return body as FmpRow[]
  }

  /**
   * Generic fetch trying the /stable endpoint first, then /api/v3 for legacy
   * keys. One bucket token per logical call. Returns the raw parsed JSON.
   */
  async fetchJson<T>(stableUrl: string, v3Url: string, params: Record<string, string>): Promise<T> {
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'FMP API key not configured. Open SET to add it.')
    if (!bucket.take()) {
      throw new ProviderError('RATE_LIMITED', 'FMP daily rate limit reached (250/day).', bucket.msUntilToken())
    }
    const attempt = async (rawUrl: string): Promise<T> => {
      const url = new URL(rawUrl)
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      url.searchParams.set('apikey', key)
      let res: Response
      try {
        res = await fetch(url)
      } catch (err) {
        throw new ProviderError('NETWORK', 'Network error reaching FMP: ' + String(err))
      }
      // 402/403/404 all classify as UNSUPPORTED, which triggers the stable↔v3 sibling fallback below.
      const classified = classifyStatus('FMP', res.status)
      if (classified) throw classified
      return (await res.json()) as T
    }
    try {
      return await attempt(stableUrl)
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'UNSUPPORTED') return attempt(v3Url)
      throw err
    }
  }

  /** One raw statement list (income/balance/cashflow/ratios/growth). */
  async getStatement(
    kind: 'income-statement' | 'balance-sheet-statement' | 'cash-flow-statement' | 'ratios' | 'financial-growth',
    symbol: string,
    period: 'annual' | 'quarter',
    limit: number
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.fetchJson<Array<Record<string, unknown>>>(
      `https://financialmodelingprep.com/stable/${kind}`,
      `https://financialmodelingprep.com/api/v3/${kind}/${encodeURIComponent(symbol)}`,
      { symbol, period, limit: String(limit) }
    )
    if (!Array.isArray(rows)) throw new ProviderError('HTTP', 'FMP returned an unexpected statements payload.')
    return rows
  }

  /** Dividend history rows (shape differs between stable and v3 — caller normalizes). */
  async getDividendsRaw(symbol: string): Promise<Array<Record<string, unknown>>> {
    const d = await this.fetchJson<unknown>(
      'https://financialmodelingprep.com/stable/dividends',
      `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${encodeURIComponent(symbol)}`,
      { symbol, limit: '80' }
    )
    if (Array.isArray(d)) return d as Array<Record<string, unknown>>
    const hist = (d as { historical?: Array<Record<string, unknown>> })?.historical
    return Array.isArray(hist) ? hist : []
  }

  /** Earnings history rows for the longer surprise series (optional enrichment), cached 24h. */
  async getEarningsRaw(symbol: string): Promise<Array<Record<string, unknown>>> {
    const cached = earningsRawCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const rows = await this.fetchJson<Array<Record<string, unknown>>>(
      'https://financialmodelingprep.com/stable/earnings',
      `https://financialmodelingprep.com/api/v3/historical/earning_calendar/${encodeURIComponent(symbol)}`,
      { symbol, limit: '24' }
    )
    const result = Array.isArray(rows) ? rows : []
    earningsRawCache.set(symbol, result)
    return result
  }

  bucketRemaining(): number {
    return bucket.status().remaining
  }

  private pendingScreener = new Map<string, Promise<ScreenerResult>>()

  /** Server-side screen, cached 10 min per filter set. Client-side refinements never re-call this. */
  async runScreener(filters: ScreenerFilters): Promise<ScreenerResult> {
    const key = JSON.stringify(filters)
    const cached = screenerCache.get(key)
    if (cached && !cached.stale) {
      console.log('[fmp] screener cache hit')
      return { ...cached.value, fromCache: true }
    }
    // Coalesce concurrent identical runs (e.g. StrictMode double-mount) into one call.
    const pending = this.pendingScreener.get(key)
    if (pending) return pending
    const promise = this.fetchScreener(key, filters).finally(() => this.pendingScreener.delete(key))
    this.pendingScreener.set(key, promise)
    return promise
  }

  private async fetchScreener(key: string, filters: ScreenerFilters): Promise<ScreenerResult> {
    const params: Record<string, string> = { limit: String(Math.min(filters.limit, 100)) }
    if (filters.sector) params.sector = filters.sector
    if (filters.exchange) params.exchange = filters.exchange
    if (filters.marketCapMin !== null) params.marketCapMoreThan = String(filters.marketCapMin)
    if (filters.marketCapMax !== null) params.marketCapLowerThan = String(filters.marketCapMax)
    if (filters.priceMin !== null) params.priceMoreThan = String(filters.priceMin)
    if (filters.priceMax !== null) params.priceLowerThan = String(filters.priceMax)
    if (filters.volumeMin !== null) params.volumeMoreThan = String(filters.volumeMin)
    if (filters.dividendMin !== null) params.dividendMoreThan = String(filters.dividendMin)
    console.log('[fmp] screener fetch', params)
    const rows = await this.fetchJson<Array<Record<string, unknown>>>(
      'https://financialmodelingprep.com/stable/company-screener',
      'https://financialmodelingprep.com/api/v3/stock-screener',
      params
    )
    if (!Array.isArray(rows)) throw new ProviderError('HTTP', 'FMP screener returned an unexpected payload.')
    const g = (r: Record<string, unknown>, k: string): number | null =>
      typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? (r[k] as number) : null
    const s = (r: Record<string, unknown>, k: string): string => (typeof r[k] === 'string' ? (r[k] as string) : '')
    const mapped: ScreenerRow[] = rows
      .filter((r) => s(r, 'symbol'))
      .slice(0, 100)
      .map((r) => {
        const price = g(r, 'price')
        const lastDiv = g(r, 'lastAnnualDividend')
        return {
          symbol: s(r, 'symbol'),
          name: s(r, 'companyName') || '—',
          sector: s(r, 'sector') || '—',
          marketCap: g(r, 'marketCap'),
          price,
          dividendYield: price && price > 0 && lastDiv !== null ? lastDiv / price : null,
          volume: g(r, 'volume'),
          exchange: s(r, 'exchangeShortName') || s(r, 'exchange')
        }
      })
    const result: ScreenerResult = { rows: mapped, fetchedAt: Date.now(), fromCache: false }
    screenerCache.set(key, result)
    return result
  }

  async testKey(): Promise<boolean> {
    try {
      await this.getMovers('actives')
      return true
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'BAD_KEY') return false
      throw err
    }
  }

  async getMovers(tab: MoversTab): Promise<MoversResult> {
    const cached = moversCache.get(tab)
    if (cached && !cached.stale) return { ...cached.value, fromCache: true }
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'FMP API key not configured. Open SET to add it.')
    if (!bucket.take()) {
      if (cached) return { ...cached.value, fromCache: true }
      throw new ProviderError('RATE_LIMITED', 'FMP daily rate limit reached (250/day).')
    }
    const endpoints = ENDPOINTS[tab]
    let rows: FmpRow[]
    try {
      rows = await this.fetchList(endpoints.stable, key)
    } catch (err) {
      // Legacy keys 403 on /stable — retry once against /api/v3 (no extra token; one logical call).
      if (err instanceof ProviderError && err.code === 'UNSUPPORTED') {
        rows = await this.fetchList(endpoints.v3, key)
      } else {
        if (err instanceof ProviderError && err.code === 'RATE_LIMITED' && cached) {
          return { ...cached.value, fromCache: true }
        }
        throw err
      }
    }
    const items: Mover[] = rows
      .filter((r) => typeof r.symbol === 'string' && typeof r.price === 'number')
      .slice(0, 25)
      .map((r) => ({
        symbol: r.symbol as string,
        name: r.name ?? '—',
        last: r.price as number,
        change: r.change ?? 0,
        percentChange: r.changesPercentage ?? 0,
        volume: typeof r.volume === 'number' ? r.volume : null
      }))
    const result: MoversResult = { items, asOf: Date.now(), fromCache: false }
    moversCache.set(tab, result)
    return result
  }
}
