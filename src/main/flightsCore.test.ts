import { describe, expect, it } from 'vitest'
import { prepareFlights } from './flightsCore'

// OpenSky state-vector index layout (documented & stable):
// 0 icao24, 1 callsign, 2 origin_country, 5 lon, 6 lat, 7 baro_altitude,
// 8 on_ground, 9 velocity, 10 true_track
const vector = (
  icao: string,
  callsign: string | null,
  lon: number | null,
  lat: number | null,
  velocity: number | null = 200
): unknown[] => [icao, callsign, 'United States', 0, 0, lon, lat, 10000, false, velocity, 90, 0, null, null, null, null, false]

describe('prepareFlights', () => {
  it('parses vectors, trims callsigns and drops rows without coordinates', () => {
    const { flights, total } = prepareFlights({ states: [vector('abc123', 'UAL123  ', -100, 40), vector('nocoord', 'X', null, 40)] }, 10)
    expect(total).toBe(1)
    expect(flights).toHaveLength(1)
    expect(flights[0].icao24).toBe('abc123')
    expect(flights[0].callsign).toBe('UAL123')
    expect(flights[0].country).toBe('United States')
    expect(flights[0].lat).toBe(40)
    expect(flights[0].lon).toBe(-100)
    expect(flights[0].heading).toBe(90)
    expect(flights[0].onGround).toBe(false)
  })

  it('flags business jets by callsign prefix', () => {
    const { flights } = prepareFlights({ states: [vector('a', 'EJA731', -100, 40), vector('b', 'UAL1', -101, 41)] }, 10)
    expect(flights.find((f) => f.callsign === 'EJA731')?.jet).toBe(true)
    expect(flights.find((f) => f.callsign === 'UAL1')?.jet).toBe(false)
  })

  it('sorts jets first, then by velocity descending, and caps with a true total', () => {
    const { flights, total } = prepareFlights(
      {
        states: [
          vector('a', 'SLOW1', -100, 40, 100),
          vector('b', 'FAST1', -101, 41, 300),
          vector('c', 'LXJ55', -102, 42, 50),
          vector('d', 'MID1', -103, 43, 200)
        ]
      },
      3
    )
    expect(total).toBe(4)
    expect(flights.map((f) => f.callsign)).toEqual(['LXJ55', 'FAST1', 'MID1'])
  })

  it('handles null velocity/altitude and junk input', () => {
    const { flights } = prepareFlights({ states: [vector('a', null, -100, 40, null)] }, 10)
    expect(flights[0].callsign).toBe('')
    expect(flights[0].velocityMs).toBeNull()
    expect(prepareFlights(null, 10)).toEqual({ flights: [], total: 0 })
    expect(prepareFlights({ states: 'junk' }, 10)).toEqual({ flights: [], total: 0 })
  })
})
