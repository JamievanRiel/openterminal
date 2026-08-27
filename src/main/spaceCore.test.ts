import { describe, expect, it } from 'vitest'
import { normalizeIss, normalizeLaunches, parseKp } from './spaceCore'

describe('parseKp', () => {
  it('reads the current NOAA object rows (latest entry wins)', () => {
    const data = [
      { time_tag: '2026-08-27T00:00:00', Kp: 1.33 },
      { time_tag: '2026-08-27T03:00:00', Kp: 4.67 }
    ]
    expect(parseKp(data)).toBe(4.67)
  })

  it('reads the legacy tabular rows (header + string values)', () => {
    const data = [
      ['time_tag', 'Kp', 'a_running'],
      ['2026-08-27T00:00:00', '2.67', '12']
    ]
    expect(parseKp(data)).toBe(2.67)
  })

  it('returns null for junk or empty input', () => {
    expect(parseKp(null)).toBeNull()
    expect(parseKp([])).toBeNull()
    expect(parseKp({ not: 'a list' })).toBeNull()
    expect(parseKp([{ time_tag: 'x' }])).toBeNull()
  })
})

describe('normalizeLaunches', () => {
  it('maps Space Devs results and parses net timestamps', () => {
    const raw = {
      results: [
        {
          name: 'Falcon 9 | Starlink',
          net: '2026-08-28T04:10:00Z',
          launch_service_provider: { name: 'SpaceX' },
          pad: { name: 'SLC-40' },
          status: { abbrev: 'Go' }
        },
        { name: 'Mystery', net: 'not-a-date' }
      ]
    }
    const launches = normalizeLaunches(raw)
    expect(launches).toHaveLength(2)
    expect(launches[0]).toEqual({
      name: 'Falcon 9 | Starlink',
      provider: 'SpaceX',
      pad: 'SLC-40',
      net: Date.parse('2026-08-28T04:10:00Z'),
      status: 'Go'
    })
    expect(launches[1].net).toBeNull()
    expect(launches[1].provider).toBe('')
  })

  it('returns [] for junk input', () => {
    expect(normalizeLaunches(null)).toEqual([])
    expect(normalizeLaunches({})).toEqual([])
  })
})

describe('normalizeIss', () => {
  it('maps wheretheiss.at fields', () => {
    const iss = normalizeIss({
      latitude: -22.39,
      longitude: 59.78,
      altitude: 426.5,
      velocity: 27555.19,
      visibility: 'daylight'
    })
    expect(iss).toEqual({ lat: -22.39, lon: 59.78, altitudeKm: 426.5, velocityKmh: 27555.19, visibility: 'daylight' })
  })

  it('returns null when coordinates are missing', () => {
    expect(normalizeIss({ altitude: 400 })).toBeNull()
    expect(normalizeIss(null)).toBeNull()
  })
})
