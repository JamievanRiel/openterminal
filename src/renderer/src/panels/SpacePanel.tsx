import { useQuery } from '@tanstack/react-query'
import type { SpaceResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { ErrorState, LoadingState } from '../components/PanelStates'
import WorldMap from '../components/WorldMap'

function fmtCountdown(target: number): string {
  const ms = target - Date.now()
  if (ms <= 0) return 'now'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`
}

function KpBadge({ kp }: { kp: number | null }): JSX.Element {
  if (kp === null) return <span className="text-term-dim">—</span>
  // Riel thresholds: ≥5 = geomagnetic storm, ≥4 = active.
  const cls = kp >= 5 ? 'text-term-down' : kp >= 4 ? 'text-term-amber' : 'text-term-up'
  return <span className={cls}>{kp.toFixed(1)}</span>
}

/** SPACE — ISS live position, geomagnetic Kp, moon phase, upcoming launches. */
export default function SpacePanel(): JSX.Element {
  const space = useQuery({
    queryKey: ['space'],
    queryFn: () => invoke<SpaceResult>('space:get'),
    refetchInterval: 60_000,
    retry: 0
  })

  if (space.isLoading) return <LoadingState label="space dashboard" />
  if (space.isError) return <ErrorState error={space.error as Error} />

  const d = space.data as SpaceResult
  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-term-border px-2 py-1 text-[11px]">
        <span className="font-bold text-term-amber">SPACE</span>
        <span className="text-term-text">
          <span className="text-term-dim">ISS </span>
          {d.iss ? `${d.iss.lat.toFixed(1)}, ${d.iss.lon.toFixed(1)} · ${Math.round(d.iss.altitudeKm)} km · ${Math.round(d.iss.velocityKmh).toLocaleString('en-US')} km/h` : '—'}
        </span>
        <span className="text-term-text">
          <span className="text-term-dim">KP </span>
          <KpBadge kp={d.kp} />
        </span>
        <span className="text-term-text">
          <span className="text-term-dim">MOON </span>
          {d.moon.phase.toUpperCase()} {Math.round(d.moon.illumination * 100)}%
          <span className="text-term-dim"> · full {fmtCountdown(d.moon.nextFull)} · new {fmtCountdown(d.moon.nextNew)}</span>
        </span>
      </div>
      <div className="min-h-0 shrink-0 basis-1/2 border-b border-term-border">
        <WorldMap
          markers={
            d.iss
              ? [{ lat: d.iss.lat, lon: d.iss.lon, color: '#ff9800', glyph: '◉', rotation: 90, label: `ISS · ${d.iss.visibility}` }]
              : []
          }
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-term-panel text-left text-[9px] uppercase text-term-dim">
              <th className="px-2 py-1">Launch</th>
              <th className="px-2 py-1">Mission</th>
              <th className="px-2 py-1">Provider</th>
              <th className="px-2 py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {d.launches.map((l, i) => (
              <tr key={`${l.name}-${i}`} className="border-b border-term-border text-term-text">
                <td className="whitespace-nowrap px-2 py-1">
                  {l.net === null ? 'TBD' : new Date(l.net).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                </td>
                <td className="px-2 py-1" title={l.pad}>
                  {l.name}
                </td>
                <td className="px-2 py-1">{l.provider}</td>
                <td className={'px-2 py-1 ' + (l.status === 'Go' ? 'text-term-up' : 'text-term-dim')}>{l.status || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.launches.length === 0 && <div className="p-4 text-[11px] uppercase text-term-dim">No launch data.</div>}
      </div>
    </div>
  )
}
