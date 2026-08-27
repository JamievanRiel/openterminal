import type {
  CompanyProfile,
  EarningsCalItem,
  EarningsEvent,
  EarningsSurprise,
  Metric52w,
  MetricRecord,
  NewsItem,
  Quote,
  SymbolHit
} from '../../shared/types'
import { classifyStatus, parseRelatedTickers, ProviderError, TokenBucket, TtlCache } from './util'

const BASE = 'https://finnhub.io/api/v1'

// Free tier: 60 calls/min
const bucket = new TokenBucket(60, 60_000)
const quoteCache = new TtlCache<Quote>(5_000)
const profileCache = new TtlCache<CompanyProfile>(7 * 24 * 3600_000, 200)
const peersCache = new TtlCache<string[]>(7 * 24 * 3600_000, 200)
const searchCache = new TtlCache<SymbolHit[]>(3600_000, 200)
const metricCache = new TtlCache<Metric52w>(24 * 3600_000, 300)
const earningsCache = new TtlCache<EarningsEvent[]>(24 * 3600_000, 100)
const metricFullCache = new TtlCache<MetricRecord>(24 * 3600_000, 100)
const newsCache = new TtlCache<NewsItem[]>(60_000, 60)
const oldNewsCache = new TtlCache<NewsItem[]>(3600_000, 60)
const surprisesCache = new TtlCache<EarningsSurprise[]>(24 * 3600_000, 100)
const earningsWeekCache = new TtlCache<EarningsCalItem[]>(12 * 3600_000, 4)

export function finnhubBucketStatus(): { remaining: number; capacity: number } {
  return bucket.status()
}

export class FinnhubProvider {
  constructor(private getKey: () => string | null) {}

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'Finnhub API key not configured. Open SET to add it.')
    if (!bucket.take()) throw new ProviderError('RATE_LIMITED', 'Finnhub rate limit reached (60/min).')
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('token', key)
    let res: Response
    try {
      res = await fetch(url)
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching Finnhub: ' + String(err))
    }
    const classified = classifyStatus('Finnhub', res.status)
    if (classified) throw classified
    return (await res.json()) as T
  }

  async testKey(): Promise<boolean> {
    try {
      const data = await this.call<{ c: number }>('/quote', { symbol: 'AAPL' })
      return typeof data.c === 'number'
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'BAD_KEY') return false
      throw err
    }
  }

  async searchSymbols(query: string): Promise<SymbolHit[]> {
    const cached = searchCache.get(query)
    if (cached && !cached.stale) return cached.value
    const data = await this.call<{ result: Array<{ symbol: string; description: string; type: string }> }>(
      '/search',
      { q: query }
    )
    const hits = (data.result ?? [])
      .filter((r) => !r.symbol.includes('.') || r.type === 'Common Stock')
      .slice(0, 12)
      .map((r) => ({ symbol: r.symbol, description: r.description, type: r.type }))
    searchCache.set(query, hits)
    return hits
  }

  async getQuote(symbol: string): Promise<Quote> {
    const cached = quoteCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    try {
      const d = await this.call<{ c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number }>(
        '/quote',
        { symbol }
      )
      const quote: Quote = {
        symbol,
        current: d.c,
        change: d.d ?? 0,
        percentChange: d.dp ?? 0,
        high: d.h,
        low: d.l,
        open: d.o,
        prevClose: d.pc,
        timestamp: (d.t ?? 0) * 1000,
        stale: false
      }
      quoteCache.set(symbol, quote)
      return quote
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'RATE_LIMITED' && cached) {
        return { ...cached.value, stale: true }
      }
      throw err
    }
  }

  async getProfile(symbol: string): Promise<CompanyProfile> {
    const cached = profileCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const d = await this.call<{
      name?: string
      exchange?: string
      finnhubIndustry?: string
      marketCapitalization?: number
      shareOutstanding?: number
      logo?: string
      weburl?: string
      country?: string
      currency?: string
      ipo?: string
    }>('/stock/profile2', { symbol })
    if (!d.name) throw new ProviderError('HTTP', 'No profile found for ' + symbol)
    const profile: CompanyProfile = {
      symbol,
      name: d.name,
      exchange: d.exchange ?? '—',
      industry: d.finnhubIndustry ?? '—',
      marketCap: (d.marketCapitalization ?? 0) * 1_000_000,
      sharesOutstanding: (d.shareOutstanding ?? 0) * 1_000_000,
      logo: d.logo ?? '',
      weburl: d.weburl ?? '',
      country: d.country ?? '—',
      currency: d.currency ?? 'USD',
      ipo: d.ipo ?? '—'
    }
    profileCache.set(symbol, profile)
    return profile
  }

  /** 52-week high/low from /stock/metric, cached 24h. */
  async getMetric(symbol: string): Promise<Metric52w> {
    const cached = metricCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const d = await this.call<{ metric?: { '52WeekHigh'?: number; '52WeekLow'?: number } }>('/stock/metric', {
      symbol,
      metric: 'all'
    })
    const high52 = d.metric?.['52WeekHigh']
    const low52 = d.metric?.['52WeekLow']
    if (typeof high52 !== 'number' || typeof low52 !== 'number') {
      throw new ProviderError('UNSUPPORTED', 'No 52-week range available for ' + symbol)
    }
    const metric: Metric52w = { high52, low52 }
    metricCache.set(symbol, metric)
    return metric
  }

  /** Past year + next two quarters of earnings dates, cached 24h. Chart markers only — callers must tolerate failure. */
  async getEarnings(symbol: string): Promise<EarningsEvent[]> {
    const cached = earningsCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const fmt = (d: Date): string => d.toISOString().slice(0, 10)
    const now = Date.now()
    const d = await this.call<{
      earningsCalendar?: Array<{ date?: string; epsActual?: number | null; epsEstimate?: number | null }>
    }>('/calendar/earnings', {
      from: fmt(new Date(now - 400 * 86_400_000)),
      to: fmt(new Date(now + 200 * 86_400_000)),
      symbol
    })
    const events: EarningsEvent[] = (d.earningsCalendar ?? [])
      .filter((e): e is { date: string; epsActual?: number | null; epsEstimate?: number | null } => Boolean(e.date))
      .map((e) => ({ date: e.date, epsActual: e.epsActual ?? null, epsEstimate: e.epsEstimate ?? null }))
      .sort((a, b) => a.date.localeCompare(b.date))
    earningsCache.set(symbol, events)
    return events
  }

  /** Full basic-financials metric record for the FA fallback mode, cached 24h. */
  async getMetricFull(symbol: string): Promise<MetricRecord> {
    const cached = metricFullCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const d = await this.call<{ metric?: MetricRecord }>('/stock/metric', { symbol, metric: 'all' })
    if (!d.metric) throw new ProviderError('UNSUPPORTED', 'No financial metrics for ' + symbol)
    metricFullCache.set(symbol, d.metric)
    return d.metric
  }

  /**
   * News. page 0 = the last 7 days (60s cache, polled); page N = the window
   * N weeks back (1h cache, drives infinite scroll). symbol null = market news.
   */
  async getNews(symbol: string | null, page: number): Promise<NewsItem[]> {
    const key = `${symbol ?? '_market'}:${page}`
    const cache = page === 0 ? newsCache : oldNewsCache
    const cached = cache.get(key)
    if (cached && !cached.stale) return cached.value

    let items: NewsItem[]
    if (symbol === null) {
      const d = await this.call<Array<{ id?: number; source?: string; headline?: string; summary?: string; url?: string; datetime?: number; related?: string }>>(
        '/news',
        { category: 'general' }
      )
      items = (d ?? []).map((a) => this.mapArticle(a))
    } else {
      const DAY = 86_400_000
      const to = new Date(Date.now() - page * 7 * DAY)
      const from = new Date(to.getTime() - 7 * DAY)
      const fmt = (x: Date): string => x.toISOString().slice(0, 10)
      const d = await this.call<Array<{ id?: number; source?: string; headline?: string; summary?: string; url?: string; datetime?: number; related?: string }>>(
        '/company-news',
        { symbol, from: fmt(from), to: fmt(to) }
      )
      items = (d ?? []).map((a) => this.mapArticle(a))
    }
    items = items
      .filter((a) => a.headline && a.url)
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 80)
    cache.set(key, items)
    return items
  }

  private mapArticle(a: {
    id?: number
    source?: string
    headline?: string
    summary?: string
    url?: string
    datetime?: number
    related?: string
  }): NewsItem {
    return {
      id: String(a.id ?? a.url ?? ''),
      source: a.source ?? '—',
      headline: a.headline ?? '',
      summary: a.summary ?? '',
      url: a.url ?? '',
      tickers: parseRelatedTickers(a.related),
      datetime: (a.datetime ?? 0) * 1000
    }
  }

  // Finnhub's news-sentiment endpoint drifted to paid tiers; probe it once per
  // session and go quiet if the plan doesn't include it.
  private sentimentBlocked = false
  private sentimentLogged = false
  async getNewsSentiment(symbol: string): Promise<number | null> {
    if (this.sentimentBlocked) return null
    try {
      const d = await this.call<{ sentiment?: { bullishPercent?: number; bearishPercent?: number }; companyNewsScore?: number }>(
        '/news-sentiment',
        { symbol }
      )
      if (typeof d.companyNewsScore === 'number') return d.companyNewsScore * 2 - 1
      const bull = d.sentiment?.bullishPercent
      return typeof bull === 'number' ? bull * 2 - 1 : null
    } catch (err) {
      if (err instanceof ProviderError && ['BAD_KEY', 'UNSUPPORTED', 'HTTP'].includes(err.code)) {
        this.sentimentBlocked = true
        if (!this.sentimentLogged) {
          this.sentimentLogged = true
          console.log('[finnhub] news-sentiment not available on this plan — sentiment badges disabled for this session')
        }
        return null
      }
      throw err
    }
  }

  // Finnhub's economic calendar is premium on free keys: probe once, then stay quiet.
  private ecoCalendarBlocked = false
  async tryEconomicCalendar(): Promise<Array<{ event: string; time: string }> | null> {
    if (this.ecoCalendarBlocked) return null
    try {
      const d = await this.call<{ economicCalendar?: Array<{ event?: string; time?: string }> }>('/calendar/economic', {})
      return (d.economicCalendar ?? [])
        .filter((e): e is { event: string; time: string } => Boolean(e.event && e.time))
        .slice(0, 100)
    } catch (err) {
      if (err instanceof ProviderError && ['BAD_KEY', 'UNSUPPORTED', 'HTTP'].includes(err.code)) {
        this.ecoCalendarBlocked = true
        console.log('[finnhub] economic calendar not available on this plan — using FRED release dates instead')
        return null
      }
      throw err
    }
  }

  /** Market-wide earnings dates for a date window (ECO week view), cached 12h. */
  async getEarningsWeek(from: string, to: string): Promise<EarningsCalItem[]> {
    const key = `${from}:${to}`
    const cached = earningsWeekCache.get(key)
    if (cached && !cached.stale) return cached.value
    const d = await this.call<{ earningsCalendar?: Array<{ symbol?: string; date?: string; epsEstimate?: number | null }> }>(
      '/calendar/earnings',
      { from, to }
    )
    const items: EarningsCalItem[] = (d.earningsCalendar ?? [])
      .filter((e): e is { symbol: string; date: string; epsEstimate?: number | null } => Boolean(e.symbol && e.date))
      .map((e) => ({ symbol: e.symbol, date: e.date, epsEstimate: e.epsEstimate ?? null }))
      .slice(0, 400)
    earningsWeekCache.set(key, items)
    return items
  }

  /** Last ~4 quarters of EPS actual vs estimate (free tier), cached 24h. */
  async getEarningsSurprises(symbol: string): Promise<EarningsSurprise[]> {
    const cached = surprisesCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const d = await this.call<Array<{ period?: string; actual?: number | null; estimate?: number | null; surprisePercent?: number | null }>>(
      '/stock/earnings',
      { symbol }
    )
    const out: EarningsSurprise[] = (d ?? [])
      .filter((e): e is { period: string; actual?: number | null; estimate?: number | null; surprisePercent?: number | null } => Boolean(e.period))
      .map((e) => ({
        period: e.period,
        actual: e.actual ?? null,
        estimate: e.estimate ?? null,
        surprisePct:
          e.surprisePercent ??
          (typeof e.actual === 'number' && typeof e.estimate === 'number' && e.estimate !== 0
            ? ((e.actual - e.estimate) / Math.abs(e.estimate)) * 100
            : null),
        revenueActual: null,
        revenueEstimate: null
      }))
      .sort((a, b) => a.period.localeCompare(b.period))
    surprisesCache.set(symbol, out)
    return out
  }

  async getPeers(symbol: string): Promise<string[]> {
    const cached = peersCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const d = await this.call<string[]>('/stock/peers', { symbol })
    const peers = (d ?? []).filter((p) => p !== symbol).slice(0, 6)
    peersCache.set(symbol, peers)
    return peers
  }
}
