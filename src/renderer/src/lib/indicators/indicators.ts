import type { Candle } from '../../../../shared/types'

/**
 * Pure indicator math over normalized candle arrays. Every function returns
 * arrays aligned 1:1 with its input (null during warm-up) so callers can zip
 * values straight onto chart series without index juggling.
 */

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** EMA seeded with the SMA of the first `period` values (standard convention). */
export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  let prev = seed / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Wilder-smoothed RSI. */
export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) avgGain += diff
    else avgLoss -= diff
  }
  avgGain /= period
  avgLoss /= period
  const toRsi = (g: number, l: number): number => (l === 0 ? 100 : 100 - 100 / (1 + g / l))
  out[period] = toRsi(avgGain, avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
    out[i] = toRsi(avgGain, avgLoss)
  }
  return out
}

export interface MacdResult {
  macd: Array<number | null>
  signal: Array<number | null>
  histogram: Array<number | null>
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const emaFast = ema(values, fast)
  const emaSlow = ema(values, slow)
  const macdLine: Array<number | null> = values.map((_, i) => {
    const f = emaFast[i]
    const s = emaSlow[i]
    return f !== null && s !== null ? f - s : null
  })
  // Signal = EMA of the MACD line, computed over its non-null tail.
  const firstIdx = macdLine.findIndex((v) => v !== null)
  const signal: Array<number | null> = new Array(values.length).fill(null)
  const histogram: Array<number | null> = new Array(values.length).fill(null)
  if (firstIdx >= 0) {
    const tail = macdLine.slice(firstIdx) as number[]
    const sig = ema(tail, signalPeriod)
    for (let i = 0; i < sig.length; i++) {
      signal[firstIdx + i] = sig[i]
      const m = macdLine[firstIdx + i]
      if (sig[i] !== null && m !== null) histogram[firstIdx + i] = m - (sig[i] as number)
    }
  }
  return { macd: macdLine, signal, histogram }
}

export interface BollingerResult {
  middle: Array<number | null>
  upper: Array<number | null>
  lower: Array<number | null>
}

/** Bollinger Bands using population standard deviation (industry convention). */
export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period)
  const upper: Array<number | null> = new Array(values.length).fill(null)
  const lower: Array<number | null> = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i] as number
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2
    const sd = Math.sqrt(variance / period)
    upper[i] = mean + mult * sd
    lower[i] = mean - mult * sd
  }
  return { middle, upper, lower }
}

/**
 * Session-anchored VWAP from typical price × volume; resets whenever
 * `sessionKey` changes (callers pass an ET-date keyer for US symbols).
 */
export function vwap(candles: Candle[], sessionKey: (timeSec: number) => string): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null)
  let key = ''
  let cumPV = 0
  let cumV = 0
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const k = sessionKey(c.time)
    if (k !== key) {
      key = k
      cumPV = 0
      cumV = 0
    }
    const typical = (c.high + c.low + c.close) / 3
    cumPV += typical * c.volume
    cumV += c.volume
    out[i] = cumV > 0 ? cumPV / cumV : typical
  }
  return out
}
