import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { CalendarResult, EconomicEvent } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { ErrorState, LoadingState } from '../components/PanelStates'

type ImpactFilter = 'all' | 'medium' | 'high'
const IMPACTS: Array<[ImpactFilter, string]> = [
  ['all', 'ALL'],
  ['medium', 'MED+'],
  ['high', 'HIGH']
]
const COUNTRIES = ['US', 'EU', 'GB', 'JP', 'ALL'] as const
type Country = (typeof COUNTRIES)[number]

function ImpactBadge({ impact }: { impact: EconomicEvent['impact'] }): JSX.Element {
  const cls =
    impact === 'high'
      ? 'border-term-down text-term-down'
      : impact === 'medium'
        ? 'border-term-amber text-term-amber'
        : 'border-term-border text-term-dim'
  return <span className={'border px-1 text-[8px] uppercase ' + cls}>{impact}</span>
}

function fmtEventTime(time: number | null): string {
  if (time === null) return '—'
  const d = new Date(time)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const hm = d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })
  return `${day} ${hm}`
}

function chipClass(active: boolean): string {
  return 'border px-2 text-[9px] uppercase ' + (active ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
}

/** ECAL — this week's macro calendar (Forex Factory mirror, keyless). */
export default function EcalPanel(): JSX.Element {
  const [impact, setImpact] = useState<ImpactFilter>('all')
  const [country, setCountry] = useState<Country>('US')

  const cal = useQuery({
    queryKey: ['calendar'],
    queryFn: () => invoke<CalendarResult>('calendar:get'),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 0
  })

  if (cal.isLoading) return <LoadingState label="economic calendar" />
  if (cal.isError) return <ErrorState error={cal.error as Error} />

  const now = Date.now()
  const rows = (cal.data as CalendarResult).events.filter((e) => {
    if (impact === 'high' && e.impact !== 'high') return false
    if (impact === 'medium' && e.impact === 'low') return false
    if (country !== 'ALL' && e.country !== country) return false
    return true
  })
  const nextIdx = rows.findIndex((e) => e.time !== null && e.time >= now)

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-term-border px-2 py-1">
        <span className="mr-2 text-[11px] font-bold text-term-amber">ECAL — ECONOMIC CALENDAR</span>
        {IMPACTS.map(([key, label]) => (
          <button key={key} onClick={() => setImpact(key)} className={chipClass(impact === key)}>
            {label}
          </button>
        ))}
        <span className="mx-1 text-term-dim">·</span>
        {COUNTRIES.map((c) => (
          <button key={c} onClick={() => setCountry(c)} className={chipClass(country === c)}>
            {c}
          </button>
        ))}
        <span className="ml-auto text-[9px] uppercase text-term-dim">{rows.length} events · this week</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-term-panel text-left text-[9px] uppercase text-term-dim">
              <th className="px-2 py-1">Time</th>
              <th className="px-2 py-1">Ctry</th>
              <th className="px-2 py-1">Imp</th>
              <th className="px-2 py-1">Event</th>
              <th className="px-2 py-1 text-right">Actual</th>
              <th className="px-2 py-1 text-right">Forecast</th>
              <th className="px-2 py-1 text-right">Previous</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => {
              const past = e.time !== null && e.time < now
              return (
                <tr
                  key={`${e.time ?? 'tba'}-${e.country}-${e.title}-${i}`}
                  className={'border-b border-term-border ' + (i === nextIdx ? 'bg-[#1a1200] ' : '') + (past ? 'text-term-dim' : 'text-term-text')}
                >
                  <td className="whitespace-nowrap px-2 py-1">{fmtEventTime(e.time)}</td>
                  <td className="px-2 py-1">{e.country}</td>
                  <td className="px-2 py-1">
                    <ImpactBadge impact={e.impact} />
                  </td>
                  <td className="px-2 py-1">{e.title}</td>
                  <td className="px-2 py-1 text-right">{e.actual || '—'}</td>
                  <td className="px-2 py-1 text-right">{e.forecast || '—'}</td>
                  <td className="px-2 py-1 text-right">{e.previous || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-4 text-[11px] uppercase text-term-dim">No events match the filters.</div>}
      </div>
    </div>
  )
}
