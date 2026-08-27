import type { IssPosition, SpaceLaunch } from '../shared/types'

/**
 * NOAA planetary K-index — latest row wins. The service has shipped two
 * shapes over the years (object rows and legacy tabular rows); handle both,
 * like Riel did.
 */
export function parseKp(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const latest: unknown = raw[raw.length - 1]
  if (Array.isArray(latest) && latest.length > 1) {
    const kp = Number(latest[1])
    return Number.isFinite(kp) ? kp : null
  }
  if (typeof latest === 'object' && latest !== null) {
    const r = latest as Record<string, unknown>
    const kp = Number(r.Kp ?? r.kp)
    return Number.isFinite(kp) ? kp : null
  }
  return null
}

/** The Space Devs upcoming-launch results → compact rows. */
export function normalizeLaunches(raw: unknown): SpaceLaunch[] {
  const results = (raw as { results?: unknown[] } | null)?.results
  if (!Array.isArray(results)) return []
  const launches: SpaceLaunch[] = []
  for (const item of results) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    const parsed = Date.parse(String(r.net ?? ''))
    launches.push({
      name: String(r.name ?? 'Unknown'),
      provider: String((r.launch_service_provider as { name?: string } | undefined)?.name ?? ''),
      pad: String((r.pad as { name?: string } | undefined)?.name ?? ''),
      net: Number.isFinite(parsed) ? parsed : null,
      status: String((r.status as { abbrev?: string } | undefined)?.abbrev ?? '')
    })
  }
  return launches
}

/** wheretheiss.at satellite record → position, or null without coordinates. */
export function normalizeIss(raw: unknown): IssPosition | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const lat = Number(r.latitude)
  const lon = Number(r.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    lat,
    lon,
    altitudeKm: Number(r.altitude) || 0,
    velocityKmh: Number(r.velocity) || 0,
    visibility: String(r.visibility ?? '')
  }
}
