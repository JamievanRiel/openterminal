import type { EconomicEvent } from '../shared/types'

/**
 * Forex Factory impact strings → our three buckets. The mirror serves either
 * labels ('High') or colours ('red'/'orange'/'yellow'); everything unknown
 * (holiday, non-economic, gray) is 'low'.
 */
const IMPACT_MAP: Record<string, EconomicEvent['impact']> = {
  high: 'high',
  red: 'high',
  medium: 'medium',
  orange: 'medium',
  ora: 'medium'
}

/** The feed keys events by currency; the panel filters by country. */
const COUNTRY_MAP: Record<string, string> = { USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP' }

export function normalizeCalendar(raw: unknown): EconomicEvent[] {
  if (!Array.isArray(raw)) return []
  const events: EconomicEvent[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    const title = String(r.title ?? '').trim()
    if (!title) continue
    const currency = String(r.country ?? '').toUpperCase()
    const parsed = Date.parse(String(r.date ?? ''))
    events.push({
      title,
      country: COUNTRY_MAP[currency] ?? currency,
      impact: IMPACT_MAP[String(r.impact ?? '').toLowerCase()] ?? 'low',
      actual: String(r.actual ?? ''),
      forecast: String(r.forecast ?? ''),
      previous: String(r.previous ?? ''),
      time: Number.isFinite(parsed) ? parsed : null
    })
  }
  events.sort((a, b) => (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER))
  return events
}
