import type { Flight } from '../shared/types'

/** Common business-jet operator callsign prefixes (heuristic, from Riel). */
const JET_PREFIXES = new Set(['NJE', 'EJA', 'LXJ', 'VJT', 'JET', 'GAMA', 'DCM', 'FLX'])

const num = (v: unknown): number | null => {
  const n = Number(v)
  return v === null || v === undefined || !Number.isFinite(n) ? null : n
}

/**
 * OpenSky /states/all → sorted, capped flights. The state-vector index
 * layout is documented and stable; rows without coordinates are dropped.
 * Jets sort first so the cap never hides them, then fastest first.
 */
export function prepareFlights(raw: unknown, cap: number): { flights: Flight[]; total: number } {
  const states = (raw as { states?: unknown } | null)?.states
  if (!Array.isArray(states)) return { flights: [], total: 0 }
  const flights: Flight[] = []
  for (const s of states) {
    if (!Array.isArray(s)) continue
    const lon = num(s[5])
    const lat = num(s[6])
    if (lon === null || lat === null) continue
    const callsign = String(s[1] ?? '').trim()
    flights.push({
      icao24: String(s[0] ?? ''),
      callsign,
      country: String(s[2] ?? ''),
      lat,
      lon,
      altitudeM: num(s[7]),
      onGround: Boolean(s[8]),
      velocityMs: num(s[9]),
      heading: num(s[10]) ?? 0,
      jet: JET_PREFIXES.has(callsign.slice(0, 3).toUpperCase())
    })
  }
  flights.sort((a, b) => Number(b.jet) - Number(a.jet) || (b.velocityMs ?? 0) - (a.velocityMs ?? 0))
  return { flights: flights.slice(0, cap), total: flights.length }
}
