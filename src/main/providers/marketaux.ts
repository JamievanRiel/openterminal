import type { NewsItem } from '../../shared/types'
import { ProviderError, TokenBucket, TtlCache } from './util'

const BASE = 'https://api.marketaux.com/v1/news/all'

// Free tier: 100 requests/day.
const bucket = new TokenBucket(100, 24 * 3600_000)
const cache = new TtlCache<NewsItem[]>(5 * 60_000, 40)

/**
 * Marketaux — company-news fallback when Finnhub errors. Optional key; when
 * absent the fallback is silently skipped. Articles carry entity sentiment.
 */
export class MarketauxProvider {
  constructor(private getKey: () => string | null) {}

  configured(): boolean {
    return this.getKey() !== null
  }

  async getCompanyNews(symbol: string): Promise<NewsItem[]> {
    const cached = cache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'Marketaux API key not configured.')
    if (!bucket.take()) throw new ProviderError('RATE_LIMITED', 'Marketaux rate limit reached (100/day).', bucket.msUntilToken())
    const url = new URL(BASE)
    url.searchParams.set('symbols', symbol)
    url.searchParams.set('filter_entities', 'true')
    url.searchParams.set('limit', '50')
    url.searchParams.set('api_token', key)
    let res: Response
    try {
      res = await fetch(url)
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching Marketaux: ' + String(err))
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('BAD_KEY', 'Marketaux rejected the API key.')
    if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'Marketaux returned 429 (rate limited).')
    if (!res.ok) throw new ProviderError('HTTP', 'Marketaux HTTP ' + res.status)
    const d = (await res.json()) as {
      data?: Array<{
        uuid?: string
        title?: string
        description?: string
        url?: string
        source?: string
        published_at?: string
        entities?: Array<{ symbol?: string; sentiment_score?: number }>
      }>
    }
    const items: NewsItem[] = (d.data ?? [])
      .filter((a) => a.title && a.url)
      .map((a) => {
        const entity = (a.entities ?? []).find((e) => e.symbol === symbol)
        return {
          id: a.uuid ?? (a.url as string),
          source: a.source ?? '—',
          headline: a.title as string,
          summary: a.description ?? '',
          url: a.url as string,
          tickers: (a.entities ?? []).map((e) => e.symbol).filter((s): s is string => Boolean(s)).slice(0, 4),
          datetime: a.published_at ? Date.parse(a.published_at) : 0,
          // Marketaux sentiment_score is already −1..1.
          sentiment: typeof entity?.sentiment_score === 'number' ? entity.sentiment_score : null
        }
      })
      .sort((a, b) => b.datetime - a.datetime)
    cache.set(symbol, items)
    return items
  }
}
