import type { MoonInfo } from '../shared/types'

/**
 * Mean-synodic moon model — replaces Riel's `ephem` dependency. Linear lunar
 * age from a reference new moon (2000-01-06 18:14 UTC); true lunations drift
 * up to ~half a day from the mean, which is fine for a dashboard readout.
 */
export const SYNODIC_DAYS = 29.530588853
const DAY_MS = 86_400_000
const EPOCH_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)

const PHASES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent'
] as const

export function moonInfo(now = Date.now()): MoonInfo {
  const age = (((now - EPOCH_NEW_MOON) / DAY_MS) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS
  const illumination = (1 - Math.cos((2 * Math.PI * age) / SYNODIC_DAYS)) / 2
  const phase = PHASES[Math.round((age / SYNODIC_DAYS) * 8) % 8]
  const daysUntil = (targetAge: number): number => {
    const d = (targetAge - age + SYNODIC_DAYS) % SYNODIC_DAYS
    return d === 0 ? SYNODIC_DAYS : d
  }
  return {
    phase,
    illumination,
    nextFull: now + daysUntil(SYNODIC_DAYS / 2) * DAY_MS,
    nextNew: now + daysUntil(0) * DAY_MS
  }
}
