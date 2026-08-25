import type { Candle, CandleInterval, IntlIndexQuote, Quote } from '../../shared/types'
import { toTwelveDataSymbol } from '../../shared/symbols'
import { ProviderError, TokenBucket, TtlCache } from './util'

const BASE = 'https://api.twelvedata.com'

// Free tier: 8 credits/min (and 800/day; the minute bucket is the binding constraint here).
const bucket = new TokenBucket(8, 60_000)
const quoteCache = new TtlCache<Quote>(60_000, 100)
const indexCache = new TtlCache<IntlIndexQuote>(90_000, 50)
const seriesCache = new TtlCache<number[]>(10 * 60_000, 100)

export function twelvedataBucketStatus(): { remaining: number; capacity: number } {
  return bucket.status()
}

interface TdQuotePayload {
  symbol?: string
  close?: string
  open?: string
  high?: string
  low?: string
  previous_close?: string
  change?: string
  percent_change?: string
  volume?: string
  timestamp?: number
  status?: string
  code?: number
  message?: string
}

function num(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export class TwelveDataProvider {
  constructor(private getKey: () => string | null) {}

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'Twelve Data API key not configured. Open SET to add it.')
    if (!bucket.take()) {
      throw new ProviderError('RATE_LIMITED', 'Twelve Data rate limit reached (8/min).', bucket.msUntilToken())
    }
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('apikey', key)
    let res: Response
    try {
      res = await fetch(url)
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching Twelve Data: ' + String(err))
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('BAD_KEY', 'Twelve Data rejected the API key.')
    if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'Twelve Data returned 429 (rate limited).')
    if (!res.ok) throw new ProviderError('HTTP', 'Twelve Data HTTP ' + res.status)
    const body = (await res.json()) as T & { status?: string; code?: number; message?: string }
    // Twelve Data reports errors as 200 + {status:"error"} payloads.
    if (body && body.status === 'error') {
      if (body.code === 401) throw new ProviderError('BAD_KEY', body.message ?? 'Twelve Data rejected the API key.')
      if (body.code === 429) throw new ProviderError('RATE_LIMITED', body.message ?? 'Twelve Data rate limited.')
      // 400/404/premium-plan errors all land here.
      throw new ProviderError('UNSUPPORTED', body.message ?? 'Twelve Data cannot serve this symbol on the current plan.')
    }
    return body
  }

  async testKey(): Promise<boolean> {
    try {
      const d = await this.call<TdQuotePayload>('/quote', { symbol: 'EUR/USD' })
      return typeof d.close === 'string'
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'BAD_KEY') return false
      throw err
    }
  }

  /** FX / crypto quote by display symbol ('EUR/USD', 'BTC-USD'). Cached 60s — the WS keeps "last" fresh. */
  async getQuote(displaySymbol: string): Promise<Quote> {
    const cached = quoteCache.get(displaySymbol)
    if (cached && !cached.stale) return cached.value
    try {
      const d = await this.call<TdQuotePayload>('/quote', { symbol: toTwelveDataSymbol(displaySymbol) })
      const quote: Quote = {
        symbol: displaySymbol,
        current: num(d.close),
        change: num(d.change) || 0,
        percentChange: num(d.percent_change) || 0,
        high: num(d.high),
        low: num(d.low),
        open: num(d.open),
        prevClose: num(d.previous_close),
        timestamp: (d.timestamp ?? 0) * 1000,
        stale: false,
        volume: Number.isFinite(num(d.volume)) ? num(d.volume) : undefined,
        source: 'twelvedata'
      }
      quoteCache.set(displaySymbol, quote)
      return quote
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'RATE_LIMITED' && cached) {
        return { ...cached.value, stale: true }
      }
      throw err
    }
  }

  /** Delayed international index quote (true index levels, 90s cache). */
  async getIndexQuote(tdSymbol: string): Promise<IntlIndexQuote> {
    const cached = indexCache.get(tdSymbol)
    if (cached && !cached.stale) return cached.value
    try {
      const d = await this.call<TdQuotePayload>('/quote', { symbol: tdSymbol })
      const q: IntlIndexQuote = {
        symbol: tdSymbol,
        last: num(d.close),
        change: num(d.change) || 0,
        percentChange: num(d.percent_change) || 0,
        timestamp: (d.timestamp ?? 0) * 1000,
        stale: false
      }
      indexCache.set(tdSymbol, q)
      return q
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'RATE_LIMITED' && cached) {
        return { ...cached.value, stale: true }
      }
      throw err
    }
  }

  /**
   * OHLCV candles, oldest → newest, times in UTC epoch seconds.
   * `timezone=UTC` makes Twelve Data convert exchange-local stamps server-side,
   * so charts never show shifted sessions regardless of listing exchange.
   */
  async getCandles(displaySymbol: string, interval: CandleInterval, outputsize: number): Promise<Candle[]> {
    const tdInterval: Record<CandleInterval, string> = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '1h': '1h',
      '1D': '1day',
      '1W': '1week',
      '1M': '1month'
    }
    const d = await this.call<{
      values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>
    }>('/time_series', {
      symbol: toTwelveDataSymbol(displaySymbol),
      interval: tdInterval[interval],
      outputsize: String(Math.min(5000, Math.max(1, outputsize))),
      timezone: 'UTC',
      order: 'ASC'
    })
    const rows = d.values ?? []
    if (rows.length === 0) throw new ProviderError('UNSUPPORTED', 'Twelve Data returned no candles for ' + displaySymbol)
    const candles: Candle[] = []
    for (const v of rows) {
      // Intraday: "2026-08-24 13:30:00"; daily+: "2026-08-24" → UTC midnight.
      const iso = v.datetime.includes(' ') ? v.datetime.replace(' ', 'T') + 'Z' : v.datetime + 'T00:00:00Z'
      const time = Date.parse(iso) / 1000
      const open = num(v.open)
      const close = num(v.close)
      if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue
      candles.push({
        time,
        open,
        high: num(v.high),
        low: num(v.low),
        close,
        volume: Number.isFinite(num(v.volume)) ? num(v.volume) : 0
      })
    }
    candles.sort((a, b) => a.time - b.time)
    return candles
  }

  /** Intraday 5-min close series for sparklines, oldest → newest. Cached 10 min. */
  async getSparkline(tdSymbol: string): Promise<number[]> {
    const cached = seriesCache.get(tdSymbol)
    if (cached && !cached.stale) return cached.value
    try {
      const d = await this.call<{ values?: Array<{ close: string }> }>('/time_series', {
        symbol: tdSymbol,
        interval: '5min',
        outputsize: '78'
      })
      const closes = (d.values ?? []).map((v) => num(v.close)).filter(Number.isFinite).reverse()
      if (closes.length === 0) throw new ProviderError('UNSUPPORTED', 'No intraday series for ' + tdSymbol)
      seriesCache.set(tdSymbol, closes)
      return closes
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'RATE_LIMITED' && cached) return cached.value
      throw err
    }
  }
}
