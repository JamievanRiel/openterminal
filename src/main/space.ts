import type { SpaceLaunch, SpaceResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { moonInfo } from './moonCore'
import { normalizeIss, normalizeLaunches, parseKp } from './spaceCore'

const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544'
const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
// The Space Devs anonymous tier allows ~15 req/hour — cache generously.
const LAUNCHES_URL = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10'

/**
 * Space dashboard data. Parts are independent on purpose: one dead upstream
 * nulls its slot instead of blanking the panel, and the moon always computes
 * locally — so SPACE renders something even fully offline.
 */
export class SpaceService {
  private kpCache = new DiskCache<number>('space-kp', 10 * 60_000, 2)
  private launchCache = new DiskCache<SpaceLaunch[]>('space-launches', 30 * 60_000, 2)

  async get(): Promise<SpaceResult> {
    const [iss, kp, launches] = await Promise.all([this.iss(), this.kp(), this.launches()])
    return { iss, kp, moon: moonInfo(), launches, fetchedAt: Date.now() }
  }

  private async json(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  private async iss(): Promise<SpaceResult['iss']> {
    try {
      return normalizeIss(await this.json(ISS_URL))
    } catch (err) {
      console.log('[space] ISS fetch failed:', String(err))
      return null
    }
  }

  private async kp(): Promise<number | null> {
    const cached = this.kpCache.get('kp')
    if (cached && !cached.stale) return cached.value
    try {
      const kp = parseKp(await this.json(KP_URL))
      if (kp !== null) this.kpCache.set('kp', kp)
      return kp ?? cached?.value ?? null
    } catch (err) {
      console.log('[space] Kp fetch failed:', String(err))
      return cached?.value ?? null
    }
  }

  private async launches(): Promise<SpaceLaunch[]> {
    const cached = this.launchCache.get('launches')
    if (cached && !cached.stale) return cached.value
    try {
      const launches = normalizeLaunches(await this.json(LAUNCHES_URL))
      if (launches.length > 0) this.launchCache.set('launches', launches)
      return launches.length > 0 ? launches : (cached?.value ?? [])
    } catch (err) {
      console.log('[space] launches fetch failed:', String(err))
      return cached?.value ?? []
    }
  }
}
