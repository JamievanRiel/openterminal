import type { FlightsResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { classifyStatus, ProviderError } from './providers/util'
import { prepareFlights } from './flightsCore'

const OPENSKY_URL = 'https://opensky-network.org/api/states/all'
// Continental US (lamin, lomin, lamax, lomax) — from Riel's config.
const US_BBOX: Record<string, number> = { lamin: 24.0, lomin: -125.0, lamax: 50.0, lomax: -66.0 }
// Anonymous OpenSky: 400 credits/day, this bbox costs 4/request → the panel
// polls every 10 min and this cache absorbs duplicate panel instances.
const CAP = 400

export class FlightService {
  private cache = new DiskCache<FlightsResult>('flights-us', 5 * 60_000, 2)

  async get(): Promise<FlightsResult> {
    const cached = this.cache.get('us')
    if (cached && !cached.stale) return cached.value
    try {
      const params = new URLSearchParams(Object.entries(US_BBOX).map(([k, v]): [string, string] => [k, String(v)]))
      let res: Response
      try {
        res = await fetch(`${OPENSKY_URL}?${params}`, { headers: { Accept: 'application/json' } })
      } catch (err) {
        throw new ProviderError('NETWORK', 'Network error reaching OpenSky: ' + String(err))
      }
      const classified = classifyStatus('OpenSky', res.status, res.status === 429 ? 600_000 : undefined)
      if (classified) throw classified
      const { flights, total } = prepareFlights(await res.json(), CAP)
      const result: FlightsResult = { flights, total, fetchedAt: Date.now() }
      this.cache.set('us', result)
      return result
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }
}
