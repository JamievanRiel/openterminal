import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Flight, FlightsResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { ErrorState, LoadingState } from '../components/PanelStates'
import WorldMap from '../components/WorldMap'

const US_REGION = { latMin: 24, latMax: 50, lonMin: -125, lonMax: -66 }
const MAP_CAP = 250
const TABLE_CAP = 100
const JET_COLOR = '#ff9800'
const FLIGHT_COLOR = '#5a9bd4'

function label(f: Flight): string {
  const alt = f.altitudeM === null ? '?' : `${Math.round(f.altitudeM)} m`
  const spd = f.velocityMs === null ? '?' : `${Math.round(f.velocityMs * 3.6)} km/h`
  return `${f.callsign || f.icao24} · ${f.country} · ${alt} · ${spd}${f.jet ? ' · JET' : ''}`
}

/** FLT — live US airspace via anonymous OpenSky; business jets highlighted. */
export default function FltPanel(): JSX.Element {
  const [jetsOnly, setJetsOnly] = useState(false)

  const feed = useQuery({
    queryKey: ['flights'],
    queryFn: () => invoke<FlightsResult>('flights:get'),
    refetchInterval: 600_000, // anonymous OpenSky credits are scarce — 10 min
    retry: 0
  })

  if (feed.isLoading) return <LoadingState label="US airspace" />
  if (feed.isError) return <ErrorState error={feed.error as Error} />

  const d = feed.data as FlightsResult
  const rows = jetsOnly ? d.flights.filter((f) => f.jet) : d.flights
  const jets = d.flights.filter((f) => f.jet).length

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border px-2 py-1">
        <span className="text-[11px] font-bold text-term-amber">FLT — US AIRSPACE</span>
        {(['ALL', 'JETS'] as const).map((chip) => (
          <button
            key={chip}
            onClick={() => setJetsOnly(chip === 'JETS')}
            className={
              'border px-2 text-[9px] uppercase ' +
              ((chip === 'JETS') === jetsOnly ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {chip}
          </button>
        ))}
        <span className="ml-auto text-[9px] uppercase text-term-dim">
          {jets} jets · showing {rows.length}/{d.total} · 10m poll · OpenSky anon
        </span>
      </div>
      <div className="min-h-0 shrink-0 basis-1/2 border-b border-term-border">
        <WorldMap
          region={US_REGION}
          markers={rows.slice(0, MAP_CAP).map((f) => ({
            lat: f.lat,
            lon: f.lon,
            color: f.jet ? JET_COLOR : FLIGHT_COLOR,
            glyph: '✈',
            rotation: f.heading,
            label: label(f)
          }))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-term-panel text-left text-[9px] uppercase text-term-dim">
              <th className="px-2 py-1">Callsign</th>
              <th className="px-2 py-1">Country</th>
              <th className="px-2 py-1 text-right">Alt m</th>
              <th className="px-2 py-1 text-right">Km/h</th>
              <th className="px-2 py-1 text-right">Hdg</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, TABLE_CAP).map((f) => (
              <tr key={f.icao24} className="border-b border-term-border text-term-text">
                <td className="px-2 py-1">{f.callsign || f.icao24}</td>
                <td className="px-2 py-1">{f.country}</td>
                <td className="px-2 py-1 text-right">{f.altitudeM === null ? '—' : Math.round(f.altitudeM)}</td>
                <td className="px-2 py-1 text-right">{f.velocityMs === null ? '—' : Math.round(f.velocityMs * 3.6)}</td>
                <td className="px-2 py-1 text-right">{Math.round(f.heading)}</td>
                <td className="px-2 py-1">{f.jet && <span className="border border-term-amber px-1 text-[8px] uppercase text-term-amber">jet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-4 text-[11px] uppercase text-term-dim">No aircraft match the filter.</div>}
      </div>
    </div>
  )
}
