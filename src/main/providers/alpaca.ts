import type { Candle, CandleInterval, Quote } from '../../shared/types'
import { ProviderError, TtlCache } from './util'

const BASE = 'https://data.alpaca.markets/v2'

// Alpaca free market-data tier allows 200 req/min on IEX; we only use it as a
// fallback so a dedicated bucket is unnecessary — the 5s cache bounds call volume.
const quoteCache = new TtlCache<Quote>(5_000, 100)

interface Snapshot {
  latestTrade?: { p: number; t: string }
  latestQuote?: { bp: number; ap: number; bs: number; as: number }
  dailyBar?: { o: number; h: number; l: number; c: number; v: number }
  prevDailyBar?: { c: number }
}

/**
 * The Alpaca key is stored as one string "KEY_ID:SECRET" (their API needs both headers).
 */
export class AlpacaProvider {
  constructor(private getKey: () => string | null) {}

  configured(): boolean {
    const raw = this.getKey()
    return Boolean(raw && raw.includes(':'))
  }

  private headers(): Record<string, string> {
    const raw = this.getKey()
    if (!raw || !raw.includes(':')) {
      throw new ProviderError('NO_KEY', 'Alpaca key not configured (expected "KEY_ID:SECRET"). Open SET to add it.')
    }
    const idx = raw.indexOf(':')
    return {
      'APCA-API-KEY-ID': raw.slice(0, idx),
      'APCA-API-SECRET-KEY': raw.slice(idx + 1)
    }
  }

  async testKey(): Promise<boolean> {
    try {
      const q = await this.getQuote('AAPL')
      return Number.isFinite(q.current)
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'BAD_KEY') return false
      throw err
    }
  }

  /** IEX bars, oldest → newest (Alpaca timestamps are RFC3339 UTC; includes extended hours). */
  async getBars(symbol: string, interval: CandleInterval, startMs: number): Promise<Candle[]> {
    const tf: Record<CandleInterval, string> = {
      '1m': '1Min',
      '5m': '5Min',
      '15m': '15Min',
      '1h': '1Hour',
      '1D': '1Day',
      '1W': '1Week',
      '1M': '1Month'
    }
    const headers = this.headers()
    const candles: Candle[] = []
    let pageToken: string | undefined
    for (let page = 0; page < 3; page++) {
      const url = new URL(`${BASE}/stocks/${encodeURIComponent(symbol)}/bars`)
      url.searchParams.set('timeframe', tf[interval])
      url.searchParams.set('start', new Date(startMs).toISOString())
      url.searchParams.set('limit', '10000')
      url.searchParams.set('feed', 'iex')
      url.searchParams.set('adjustment', 'split')
      if (pageToken) url.searchParams.set('page_token', pageToken)
      let res: Response
      try {
        res = await fetch(url, { headers })
      } catch (err) {
        throw new ProviderError('NETWORK', 'Network error reaching Alpaca: ' + String(err))
      }
      if (res.status === 401 || res.status === 403) throw new ProviderError('BAD_KEY', 'Alpaca rejected the API key.')
      if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'Alpaca returned 429 (rate limited).')
      if (!res.ok) throw new ProviderError('HTTP', 'Alpaca HTTP ' + res.status)
      const d = (await res.json()) as {
        bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>
        next_page_token?: string | null
      }
      for (const b of d.bars ?? []) {
        const time = Date.parse(b.t) / 1000
        if (Number.isFinite(time)) candles.push({ time, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })
      }
      if (!d.next_page_token) break
      pageToken = d.next_page_token
    }
    if (candles.length === 0) throw new ProviderError('UNSUPPORTED', 'Alpaca has no bars for ' + symbol)
    candles.sort((a, b) => a.time - b.time)
    return candles
  }

  async getQuote(symbol: string): Promise<Quote> {
    const cached = quoteCache.get(symbol)
    if (cached && !cached.stale) return cached.value
    const url = `${BASE}/stocks/${encodeURIComponent(symbol)}/snapshot?feed=iex`
    let res: Response
    try {
      res = await fetch(url, { headers: this.headers() })
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching Alpaca: ' + String(err))
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('BAD_KEY', 'Alpaca rejected the API key.')
    if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'Alpaca returned 429 (rate limited).')
    if (res.status === 404) throw new ProviderError('UNSUPPORTED', 'Alpaca has no data for ' + symbol)
    if (!res.ok) throw new ProviderError('HTTP', 'Alpaca HTTP ' + res.status)
    const d = (await res.json()) as Snapshot
    const last = d.latestTrade?.p ?? d.dailyBar?.c
    const prevClose = d.prevDailyBar?.c
    if (typeof last !== 'number' || typeof prevClose !== 'number') {
      throw new ProviderError('UNSUPPORTED', 'Alpaca snapshot incomplete for ' + symbol)
    }
    const quote: Quote = {
      symbol,
      current: last,
      change: last - prevClose,
      percentChange: prevClose !== 0 ? ((last - prevClose) / prevClose) * 100 : 0,
      high: d.dailyBar?.h ?? last,
      low: d.dailyBar?.l ?? last,
      open: d.dailyBar?.o ?? last,
      prevClose,
      timestamp: d.latestTrade?.t ? Date.parse(d.latestTrade.t) : Date.now(),
      stale: false,
      volume: d.dailyBar?.v,
      bid: d.latestQuote?.bp,
      ask: d.latestQuote?.ap,
      bidSize: d.latestQuote?.bs,
      askSize: d.latestQuote?.as,
      source: 'alpaca'
    }
    quoteCache.set(symbol, quote)
    return quote
  }
}
