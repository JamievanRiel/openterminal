import type { Candle, CandleInterval, CandleResponse, ChartRange } from '../shared/types'
import { safeStore } from './migrations'
import { estimateBars, isIntraday, rangeStartMs } from '../shared/chart'
import { classify } from '../shared/symbols'
import type { AlpacaProvider } from './providers/alpaca'
import type { TwelveDataProvider } from './providers/twelvedata'
import { ProviderError, TtlCache } from './providers/util'

/** REST source of historical OHLCV series, normalized before crossing IPC. */
export interface CandleProvider {
  getCandles(symbol: string, interval: CandleInterval, range: ChartRange, priority: boolean): Promise<CandleResponse>
}

interface DiskEntry {
  resp: CandleResponse
  savedAt: number
}

interface QueueTask {
  priority: number
  seq: number
  run: () => Promise<void>
}

const DISK_MAX_ENTRIES = 40
const DISK_FRESH_MS = 3600_000

const etDate = (epochSec: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(epochSec * 1000))

/**
 * Candle routing: Twelve Data primary (all timeframes, international symbols),
 * Alpaca IEX bars as US-equity fallback. Memory TTLs (60s intraday / 1h daily),
 * plus a persisted disk cache for daily+ so long ranges never re-burn the
 * Twelve Data daily budget and charts render offline / instantly at startup.
 * Requests funnel through a priority queue: the focused panel loads first.
 */
export class CandleService implements CandleProvider {
  private memIntraday = new TtlCache<CandleResponse>(60_000, 60)
  private memDaily = new TtlCache<CandleResponse>(3600_000, 60)
  private disk = safeStore<{ entries: Record<string, DiskEntry> }>('candles-cache')
  private queue: QueueTask[] = []
  private running = false
  private seq = 0

  constructor(
    private twelvedata: TwelveDataProvider,
    private alpaca: AlpacaProvider
  ) {}

  private pendingFetches = new Map<string, Promise<CandleResponse>>()

  async getCandles(symbol: string, interval: CandleInterval, range: ChartRange, priority: boolean): Promise<CandleResponse> {
    const key = `${symbol}:${interval}:${range}`
    const mem = this.memCache(interval).get(key)
    if (mem && !mem.stale) return mem.value

    if (!isIntraday(interval)) {
      const entry = this.diskEntries()[key]
      if (entry && Date.now() - entry.savedAt < DISK_FRESH_MS) {
        return { ...entry.resp, fromDiskCache: true }
      }
    }

    // Coalesce concurrent identical requests (e.g. GP + HP on the same key) into one fetch.
    const pending = this.pendingFetches.get(key)
    if (pending) return pending
    const promise = this.enqueue(priority, () => this.fetch(key, symbol, interval, range)).finally(() =>
      this.pendingFetches.delete(key)
    )
    this.pendingFetches.set(key, promise)
    return promise
  }

  /** SET → clear caches. */
  clearCaches(): number {
    const n = Object.keys(this.diskEntries()).length + this.memIntraday.size + this.memDaily.size
    this.memIntraday.clear()
    this.memDaily.clear()
    this.disk.set('entries', {})
    return n
  }

  diskCount(): number {
    return Object.keys(this.diskEntries()).length
  }

  // ------------------------------------------------------------------ queue

  private enqueue<T>(priority: boolean, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        priority: priority ? 1 : 0,
        seq: ++this.seq,
        run: () => run().then(resolve, reject)
      })
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    while (this.queue.length > 0) {
      this.queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq)
      const task = this.queue.shift() as QueueTask
      await task.run().catch(() => undefined)
    }
    this.running = false
  }

  // ------------------------------------------------------------------ fetch

  private async fetch(key: string, symbol: string, interval: CandleInterval, range: ChartRange): Promise<CandleResponse> {
    const startMs = rangeStartMs(range)
    const bars = estimateBars(range, interval)
    let candles: Candle[] | null = null
    let source: 'twelvedata' | 'alpaca' = 'twelvedata'
    let primaryErr: unknown

    try {
      candles = await this.twelvedata.getCandles(symbol, interval, bars)
    } catch (err) {
      primaryErr = err
    }

    if (!candles && classify(symbol) === 'equity' && this.alpaca.configured()) {
      const fallbackWorthy =
        primaryErr instanceof ProviderError &&
        ['RATE_LIMITED', 'NETWORK', 'HTTP', 'UNSUPPORTED', 'NO_KEY'].includes(primaryErr.code)
      if (fallbackWorthy) {
        try {
          candles = await this.alpaca.getBars(symbol, interval, startMs)
          source = 'alpaca'
        } catch {
          /* keep primaryErr */
        }
      }
    }

    if (!candles) {
      // Serve anything cached (stale memory, then any-age disk) before failing.
      const mem = this.memCache(interval).get(key)
      if (mem) return { ...mem.value, fromDiskCache: true }
      const entry = this.diskEntries()[key]
      if (entry) return { ...entry.resp, fromDiskCache: true }
      throw primaryErr
    }

    const trimmed = this.trim(candles, interval, range, startMs)
    const resp: CandleResponse = {
      symbol,
      interval,
      candles: trimmed,
      source,
      // Twelve Data free tier doesn't flag delay; treat non-equity/international feeds as delayed.
      delayed: source === 'twelvedata' && classify(symbol) !== 'equity' ? true : false,
      fetchedAt: Date.now(),
      fromDiskCache: false
    }
    this.memCache(interval).set(key, resp)
    if (!isIntraday(interval)) this.writeDisk(key, resp)
    return resp
  }

  private trim(candles: Candle[], interval: CandleInterval, range: ChartRange, startMs: number): Candle[] {
    if (range === 'MAX') return candles
    let out = candles.filter((c) => c.time * 1000 >= startMs)
    if (out.length === 0) out = candles.slice(-50)
    // 1D range = the most recent session only (incl. its pre/post bars).
    if (range === '1D' && isIntraday(interval) && out.length > 0) {
      const lastDay = etDate(out[out.length - 1].time)
      out = out.filter((c) => etDate(c.time) === lastDay)
    }
    return out
  }

  // ------------------------------------------------------------------- disk

  private memCache(interval: CandleInterval): TtlCache<CandleResponse> {
    return isIntraday(interval) ? this.memIntraday : this.memDaily
  }

  private diskEntries(): Record<string, DiskEntry> {
    return this.disk.get('entries') ?? {}
  }

  private writeDisk(key: string, resp: CandleResponse): void {
    const entries = this.diskEntries()
    entries[key] = { resp, savedAt: Date.now() }
    const keys = Object.keys(entries)
    if (keys.length > DISK_MAX_ENTRIES) {
      keys
        .sort((a, b) => entries[a].savedAt - entries[b].savedAt)
        .slice(0, keys.length - DISK_MAX_ENTRIES)
        .forEach((k) => delete entries[k])
    }
    this.disk.set('entries', entries)
  }
}
