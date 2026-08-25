import type { EcoRelease, FredSeries } from '../../shared/types'
import { DiskCache } from '../diskcache'
import { ProviderError, TokenBucket } from './util'

const BASE = 'https://api.stlouisfed.org/fred'

// FRED allows 120 req/min; stay conservative.
const bucket = new TokenBucket(60, 60_000)

/** Release names worth surfacing in the ECO week view. */
const RELEASE_KEYWORDS = [
  'Consumer Price Index',
  'Employment Situation',
  'Gross Domestic Product',
  'Personal Income',
  'Producer Price Index',
  'Advance Monthly Sales',
  'FOMC',
  'H.4.1',
  'Consumer Sentiment'
]

export class FredProvider {
  private seriesCache = new DiskCache<FredSeries>('fred-cache', 12 * 3600_000, 40)
  private releasesCache = new DiskCache<EcoRelease[]>('fred-releases', 12 * 3600_000, 4)

  constructor(private getKey: () => string | null) {}

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const key = this.getKey()
    if (!key) throw new ProviderError('NO_KEY', 'FRED API key not configured. Open SET to add it.')
    if (!bucket.take()) throw new ProviderError('RATE_LIMITED', 'FRED rate limit reached.', bucket.msUntilToken())
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('api_key', key)
    url.searchParams.set('file_type', 'json')
    let res: Response
    try {
      res = await fetch(url)
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching FRED: ' + String(err))
    }
    if (res.status === 400 || res.status === 403) throw new ProviderError('BAD_KEY', 'FRED rejected the API key.')
    if (res.status === 429) throw new ProviderError('RATE_LIMITED', 'FRED returned 429 (rate limited).')
    if (!res.ok) throw new ProviderError('HTTP', 'FRED HTTP ' + res.status)
    return (await res.json()) as T
  }

  async testKey(): Promise<boolean> {
    try {
      const s = await this.getSeries('UNRATE', 90)
      return s.observations.length > 0
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'BAD_KEY') return false
      throw err
    }
  }

  /** Observations for one series over the trailing `days`, cached 12h + disk. */
  async getSeries(id: string, days: number): Promise<FredSeries> {
    const key = `${id}:${days}`
    const cached = this.seriesCache.get(key)
    if (cached && !cached.stale) return { ...cached.value, fromCache: true }
    try {
      const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
      const d = await this.call<{ observations?: Array<{ date: string; value: string }> }>('/series/observations', {
        series_id: id,
        observation_start: start,
        sort_order: 'asc',
        limit: '100000'
      })
      const observations = (d.observations ?? []).map((o) => ({
        date: o.date,
        // FRED encodes gaps (holidays etc.) as "."
        value: o.value === '.' ? null : Number(o.value)
      }))
      if (observations.length === 0) throw new ProviderError('UNSUPPORTED', 'FRED returned no observations for ' + id)
      const result: FredSeries = { id, observations, fetchedAt: Date.now(), fromCache: false }
      this.seriesCache.set(key, result)
      return result
    } catch (err) {
      if (cached) return { ...cached.value, fromCache: true }
      throw err
    }
  }

  /** Upcoming major US release dates (next 14 days), cached 12h + disk. */
  async getUpcomingReleases(): Promise<EcoRelease[]> {
    const cached = this.releasesCache.get('upcoming')
    if (cached && !cached.stale) return cached.value
    try {
      const today = new Date().toISOString().slice(0, 10)
      const horizon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
      const d = await this.call<{ release_dates?: Array<{ release_name?: string; date?: string }> }>('/releases/dates', {
        include_release_dates_with_no_data: 'true',
        sort_order: 'asc',
        realtime_start: today,
        realtime_end: horizon,
        limit: '1000'
      })
      const releases: EcoRelease[] = (d.release_dates ?? [])
        .filter((r): r is { release_name: string; date: string } => Boolean(r.release_name && r.date))
        .filter((r) => r.date >= today && r.date <= horizon)
        .filter((r) => RELEASE_KEYWORDS.some((k) => r.release_name.includes(k)))
        .map((r) => ({ date: r.date, name: r.release_name }))
      // Dedupe (release, date) pairs.
      const seen = new Set<string>()
      const unique = releases.filter((r) => {
        const k = r.date + '|' + r.name
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      this.releasesCache.set('upcoming', unique)
      return unique
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }
}

export function fredBucketStatus(): { remaining: number; capacity: number } {
  return bucket.status()
}
