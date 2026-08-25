import type { CandleInterval, ChartRange } from './types'

/** Default interval per range; the user may override via the toolbar. */
export const RANGE_DEFAULT_INTERVAL: Record<ChartRange, CandleInterval> = {
  '1D': '1m',
  '5D': '5m',
  '1M': '1h',
  '3M': '1D',
  '6M': '1D',
  YTD: '1D',
  '1Y': '1D',
  '5Y': '1W',
  MAX: '1M'
}

export const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '1D', '1W', '1M']
export const RANGES: ChartRange[] = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']

export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1D': 86_400,
  '1W': 7 * 86_400,
  '1M': 30 * 86_400
}

export function isIntraday(interval: CandleInterval): boolean {
  return INTERVAL_SECONDS[interval] < 86_400
}

/** UTC epoch ms of the start of a chart range. */
export function rangeStartMs(range: ChartRange, now: Date = new Date()): number {
  const DAY = 86_400_000
  switch (range) {
    case '1D':
      return now.getTime() - 1.5 * DAY // margin so the whole last session is covered
    case '5D':
      return now.getTime() - 8 * DAY
    case '1M':
      return now.getTime() - 31 * DAY
    case '3M':
      return now.getTime() - 92 * DAY
    case '6M':
      return now.getTime() - 183 * DAY
    case 'YTD':
      return Date.UTC(now.getUTCFullYear(), 0, 1)
    case '1Y':
      return now.getTime() - 366 * DAY
    case '5Y':
      return now.getTime() - 5 * 366 * DAY
    case 'MAX':
      return Date.UTC(1990, 0, 1)
  }
}

/** Rough bar count a (range, interval) pair needs — used to size provider requests. */
export function estimateBars(range: ChartRange, interval: CandleInterval, now: Date = new Date()): number {
  const days = Math.max(1, Math.ceil((now.getTime() - rangeStartMs(range, now)) / 86_400_000))
  const tradingDays = Math.max(1, Math.ceil(days * (isIntraday(interval) || interval === '1D' ? 5 / 7 : 1)))
  // Intraday bars/day assume the extended 04:00–20:00 session.
  const perDay: Record<CandleInterval, number> = {
    '1m': 960,
    '5m': 192,
    '15m': 64,
    '1h': 16,
    '1D': 1,
    '1W': 1 / 5,
    '1M': 1 / 21
  }
  return Math.min(5000, Math.ceil(tradingDays * perDay[interval]) + 10)
}
