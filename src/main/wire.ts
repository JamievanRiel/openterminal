import type { WireResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { classifyStatus, ProviderError } from './providers/util'
import { parseFeedEntries, type AtomEntry } from './atom'
import { normalizeWire, type FeedResult } from './wireCore'
import { aggregateSentiment } from './sentimentCore'

/** Keyless RSS wire — feed list ported from Riel-main's news config. */
const FEEDS = [
  {
    name: 'Reuters US',
    url: 'https://news.google.com/rss/search?q=when:24h+site:reuters.com+business&ceid=US:en&hl=en-US&gl=US',
    category: 'markets'
  },
  { name: 'CNBC Markets', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'markets' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', category: 'markets' },
  { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', category: 'markets' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto' }
] as const

export class WireService {
  private cache = new DiskCache<WireResult>('news-wire', 2 * 60_000, 2)

  async get(): Promise<WireResult> {
    const cached = this.cache.get('wire')
    if (cached && !cached.stale) return cached.value
    try {
      const settled = await Promise.allSettled(FEEDS.map((f) => this.fetchFeed(f.url)))
      const feeds: FeedResult[] = []
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') feeds.push({ source: FEEDS[i].name, category: FEEDS[i].category, entries: res.value })
        else console.log(`[wire] feed failed ${FEEDS[i].name}: ${String(res.reason)}`)
      })
      // Partial coverage is fine (one broken feed must not blank the wire);
      // only a full wipe-out is an error.
      if (feeds.length === 0) throw new ProviderError('NETWORK', 'All news wire feeds failed.')
      const items = normalizeWire(feeds)
      const result: WireResult = {
        items,
        sentiment: aggregateSentiment(items.map((i) => i.sentiment)),
        fetchedAt: Date.now()
      }
      this.cache.set('wire', result)
      return result
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }

  private async fetchFeed(url: string): Promise<AtomEntry[]> {
    let res: Response
    try {
      res = await fetch(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } })
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error: ' + String(err))
    }
    const classified = classifyStatus('News wire', res.status)
    if (classified) throw classified
    return parseFeedEntries(await res.text())
  }
}
