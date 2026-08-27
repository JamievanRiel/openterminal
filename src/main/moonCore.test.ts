import { describe, expect, it } from 'vitest'
import { moonInfo, SYNODIC_DAYS } from './moonCore'

// Real lunation anchors (UTC). A mean-synodic model drifts up to ~half a day
// from the true instants, so assertions use generous bands, not exact values.
const NEW_MOON_2024 = Date.parse('2024-01-11T11:57:00Z')
const FULL_MOON_2024 = Date.parse('2024-01-25T17:54:00Z')
const DAY = 86_400_000

describe('moonInfo', () => {
  it('reports a dark, new moon at a known new-moon instant', () => {
    const m = moonInfo(NEW_MOON_2024)
    expect(m.illumination).toBeLessThan(0.1)
    expect(m.phase).toBe('New Moon')
  })

  it('reports a lit, full moon at a known full-moon instant', () => {
    const m = moonInfo(FULL_MOON_2024)
    expect(m.illumination).toBeGreaterThan(0.9)
    expect(m.phase).toBe('Full Moon')
  })

  it('walks the phases in order across one synodic month', () => {
    const seen: string[] = []
    for (let d = 0; d < SYNODIC_DAYS; d += 1) {
      const phase = moonInfo(NEW_MOON_2024 + d * DAY).phase
      if (seen[seen.length - 1] !== phase) seen.push(phase)
    }
    expect(seen).toEqual([
      'New Moon',
      'Waxing Crescent',
      'First Quarter',
      'Waxing Gibbous',
      'Full Moon',
      'Waning Gibbous',
      'Last Quarter',
      'Waning Crescent',
      'New Moon'
    ])
  })

  it('predicts next full and next new in the future, within one month', () => {
    const t = NEW_MOON_2024 + 3 * DAY
    const m = moonInfo(t)
    expect(m.nextFull).toBeGreaterThan(t)
    expect(m.nextFull - t).toBeLessThanOrEqual(SYNODIC_DAYS * DAY)
    expect(m.nextNew).toBeGreaterThan(t)
    expect(m.nextNew - t).toBeLessThanOrEqual(SYNODIC_DAYS * DAY)
    // 3 days past new: full comes first, then the next new.
    expect(m.nextFull).toBeLessThan(m.nextNew)
  })

  it('keeps illumination inside [0, 1]', () => {
    for (let d = 0; d < 60; d += 0.7) {
      const { illumination } = moonInfo(NEW_MOON_2024 + d * DAY)
      expect(illumination).toBeGreaterThanOrEqual(0)
      expect(illumination).toBeLessThanOrEqual(1)
    }
  })
})
