import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { OptionFlowContract, OptionsFlowResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtCompact, fmtPrice, fmtRelativeTime } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'

const DEFAULT_SYMBOL = 'SPY'

/** More puts than calls reads bearish, so the ratio is colored against 1.0. */
function ratioClass(ratio: number): string {
  if (ratio > 1.05) return 'text-term-down'
  if (ratio < 0.95) return 'text-term-up'
  return 'text-term-text'
}

/** Call/put share of the day's volume, as one split bar. */
function VolumeSplit({ calls, puts }: { calls: number; puts: number }): JSX.Element {
  const total = calls + puts
  const callPct = total > 0 ? (calls / total) * 100 : 50
  return (
    <div className="flex h-[3px] w-24 overflow-hidden bg-term-border" title={`${fmtCompact(calls)} call vs ${fmtCompact(puts)} put contracts`}>
      <div className="bg-term-up" style={{ width: `${callPct}%` }} />
      <div className="bg-term-down" style={{ width: `${100 - callPct}%` }} />
    </div>
  )
}

function FlowRow({ row, maxVolume }: { row: OptionFlowContract; maxVolume: number }): JSX.Element {
  const isCall = row.type === 'call'
  return (
    <tr className="border-b border-term-border text-term-text" title={row.contract}>
      <td className={'px-2 py-1 uppercase ' + (isCall ? 'text-term-up' : 'text-term-down')}>{row.type}</td>
      <td className="px-2 py-1 text-right font-bold">{fmtPrice(row.strike)}</td>
      <td className="px-2 py-1 text-right">{fmtPrice(row.last)}</td>
      <td className="relative px-2 py-1 text-right">
        {/* volume bar sits behind the number so the busiest strikes read at a glance */}
        <div
          className={'absolute inset-y-[3px] right-0 ' + (isCall ? 'bg-term-up' : 'bg-term-down')}
          style={{ width: maxVolume > 0 ? `${(row.volume / maxVolume) * 100}%` : 0, opacity: 0.15 }}
        />
        <span className="relative">{fmtCompact(row.volume)}</span>
      </td>
      <td className="px-2 py-1 text-right">{fmtCompact(row.openInterest)}</td>
      <td className="px-2 py-1 text-right">{row.impliedVol > 0 ? (row.impliedVol * 100).toFixed(1) + '%' : '—'}</td>
      <td className="px-2 py-1">
        {row.unusual && <span className="border border-term-amber px-1 text-[8px] uppercase text-term-amber">unusual</span>}
      </td>
    </tr>
  )
}

/** FLOW — nearest-expiry options flow: P/C ratio and volume that outruns open interest. */
export default function FlowPanel({ ticker }: { ticker: string | null }): JSX.Element {
  const [unusualOnly, setUnusualOnly] = useState(false)
  const symbol = (ticker ?? DEFAULT_SYMBOL).toUpperCase()

  const flow = useQuery({
    queryKey: ['options-flow', symbol],
    queryFn: () => invoke<OptionsFlowResult>('options:flow', { symbol }),
    refetchInterval: 300_000, // matches the service cache; Yahoo throttles hard
    retry: 0
  })

  if (flow.isLoading) return <LoadingState label={`${symbol} options flow`} />
  if (flow.isError) return <ErrorState error={flow.error as Error} />

  const d = flow.data as OptionsFlowResult
  const rows = unusualOnly ? d.contracts.filter((c) => c.unusual) : d.contracts
  const maxVolume = d.contracts.reduce((m, c) => Math.max(m, c.volume), 0)
  const unusual = d.contracts.filter((c) => c.unusual).length

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border px-2 py-1">
        <span className="text-[11px] font-bold text-term-amber">{symbol} — FLOW</span>
        <span className="text-[9px] uppercase text-term-dim">
          exp <span className="text-term-text">{d.expiry}</span>
          {d.spot !== null && (
            <>
              <span> · spot </span>
              <span className="text-term-amber">{fmtPrice(d.spot)}</span>
            </>
          )}
        </span>
        <span className="text-[9px] uppercase text-term-dim">
          p/c{' '}
          <span className={'font-bold ' + (d.putCallRatio === null ? 'text-term-dim' : ratioClass(d.putCallRatio))}>
            {d.putCallRatio === null ? '—' : d.putCallRatio.toFixed(2)}
          </span>
        </span>
        <VolumeSplit calls={d.totalCallVolume} puts={d.totalPutVolume} />
        <span className="text-[9px] uppercase">
          <span className="text-term-up">C {fmtCompact(d.totalCallVolume)}</span>
          <span className="text-term-dim"> · </span>
          <span className="text-term-down">P {fmtCompact(d.totalPutVolume)}</span>
        </span>
        {(['ALL', 'UNUSUAL'] as const).map((chip) => (
          <button
            key={chip}
            onClick={() => setUnusualOnly(chip === 'UNUSUAL')}
            className={
              'border px-2 text-[9px] uppercase ' +
              ((chip === 'UNUSUAL') === unusualOnly ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {chip}
          </button>
        ))}
        <span className="ml-auto text-[9px] uppercase text-term-dim">
          {unusual} unusual · {fmtRelativeTime(d.fetchedAt)} · Yahoo
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-term-panel text-left text-[9px] uppercase text-term-dim">
              <th className="px-2 py-1">Type</th>
              <th className="px-2 py-1 text-right">Strike</th>
              <th className="px-2 py-1 text-right">Last</th>
              <th className="px-2 py-1 text-right">Volume</th>
              <th className="px-2 py-1 text-right">OI</th>
              <th className="px-2 py-1 text-right">IV</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FlowRow key={row.contract} row={row} maxVolume={maxVolume} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-4 text-[11px] uppercase text-term-dim">
            {unusualOnly ? 'No contract cleared the unusual-volume threshold.' : 'No contracts traded in this expiry.'}
          </div>
        )}
      </div>
    </div>
  )
}
