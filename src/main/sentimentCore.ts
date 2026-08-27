import type { NewsItem } from '../shared/types'

/**
 * Small, dependency-free finance sentiment lexicon, ported from Riel-main's
 * news provider. Deliberately crude: a word-count ratio, not NLP — good
 * enough to badge a headline, honest enough to return null when it has no
 * signal (so the UI never shows a fake NEUTRAL).
 */

const POSITIVE = new Set([
  'gain', 'gains', 'surge', 'surges', 'rally', 'rallies', 'rise', 'rises', 'jump',
  'soar', 'soars', 'beat', 'beats', 'record', 'growth', 'profit', 'bullish', 'up',
  'boom', 'recovery', 'upgrade', 'strong', 'optimism', 'win', 'wins', 'deal'
])
const NEGATIVE = new Set([
  'loss', 'losses', 'fall', 'falls', 'drop', 'drops', 'plunge', 'plunges', 'crash',
  'slump', 'miss', 'misses', 'recession', 'bearish', 'down', 'fear', 'fears',
  'selloff', 'default', 'downgrade', 'weak', 'warning', 'war', 'sanction', 'crisis'
])

/** Score in [-1, 1] from lexicon word counts; null when nothing matched. */
export function scoreSentiment(text: string): number | null {
  let pos = 0
  let neg = 0
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/^[.,!?:;"'()]+|[.,!?:;"'()]+$/g, '').toLowerCase()
    if (POSITIVE.has(word)) pos++
    else if (NEGATIVE.has(word)) neg++
  }
  const total = pos + neg
  return total === 0 ? null : (pos - neg) / total
}

export interface SentimentAggregate {
  bullish: number // % of items scoring > 0.05
  bearish: number // % of items scoring < -0.05
  score: number // average, nulls counted as 0 (Riel semantics)
}

/**
 * Backfill missing sentiment on provider news items from the lexicon so the
 * N/TOP badges appear even when the provider supplies none (Finnhub).
 * Provider-supplied scores are never overwritten.
 */
export function enrichNewsSentiment(items: NewsItem[]): NewsItem[] {
  return items.map((item) =>
    typeof item.sentiment === 'number' ? item : { ...item, sentiment: scoreSentiment(`${item.headline} ${item.summary}`) }
  )
}

export function aggregateSentiment(scores: Array<number | null>): SentimentAggregate {
  if (scores.length === 0) return { bullish: 0, bearish: 0, score: 0 }
  const values = scores.map((s) => s ?? 0)
  const bullish = values.filter((s) => s > 0.05).length / values.length
  const bearish = values.filter((s) => s < -0.05).length / values.length
  return {
    bullish: bullish * 100,
    bearish: bearish * 100,
    score: values.reduce((a, b) => a + b, 0) / values.length
  }
}
