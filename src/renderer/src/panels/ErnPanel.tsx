import { useQuery } from '@tanstack/react-query'
import type { EarningsFull, EarningsSurprise } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { formatFinancialNumber } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'

/** Dot-pair surprise chart: hollow gray = estimate, filled green/red = actual. */
function SurpriseChart({ surprises }: { surprises: EarningsSurprise[] }): JSX.Element | null {
  const rows = surprises.filter((s) => s.actual !== null || s.estimate !== null).slice(-8)
  if (rows.length === 0) return null
  const values = rows.flatMap((s) => [s.actual, s.estimate]).filter((v): v is number => v !== null)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const W = 460
  const H = 130
  const padX = 34
  const padTop = 16
  const plotH = H - padTop - 30
  const step = (W - padX * 2) / Math.max(1, rows.length - 1)
  const y = (v: number): number => padTop + plotH - ((v - min) / span) * plotH

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-2">
      {rows.map((s, i) => {
        const x = padX + i * step
        const beat = s.actual !== null && s.estimate !== null ? s.actual >= s.estimate : null
        return (
          <g key={s.period}>
            {s.actual !== null && s.estimate !== null && (
              <line x1={x} y1={y(s.estimate)} x2={x} y2={y(s.actual)} stroke="#3a3a3a" strokeWidth="1" />
            )}
            {s.estimate !== null && <circle cx={x} cy={y(s.estimate)} r="4" fill="none" stroke="#7a7a7a" strokeWidth="1.5" />}
            {s.actual !== null && (
              <circle cx={x} cy={y(s.actual)} r="4" fill={beat === false ? '#ff1744' : '#00c853'} />
            )}
            {s.surprisePct !== null && (
              <text
                x={x}
                y={padTop - 4}
                textAnchor="middle"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                fill={s.surprisePct >= 0 ? '#00c853' : '#ff1744'}
              >
                {(s.surprisePct >= 0 ? '+' : '') + s.surprisePct.toFixed(1)}%
              </text>
            )}
            <text x={x} y={H - 14} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#7a7a7a">
              {s.period.slice(0, 7)}
            </text>
          </g>
        )
      })}
      <text x={padX} y={H - 2} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#4a4a4a">
        ○ estimate · ● actual (green beat / red miss)
      </text>
    </svg>
  )
}

export default function ErnPanel({ ticker }: { ticker: string }): JSX.Element {
  const ern = useQuery({
    queryKey: ['earnings-full', ticker],
    queryFn: () => invoke<EarningsFull>('earnings:full', { symbol: ticker }),
    staleTime: 24 * 3600_000,
    retry: 0
  })

  if (ern.isLoading) return <LoadingState label={`${ticker} earnings`} />
  if (ern.isError) return <ErrorState error={ern.error as Error} />

  const data = ern.data as EarningsFull
  const daysToNext = data.nextDate
    ? Math.max(0, Math.ceil((Date.parse(data.nextDate) - Date.now()) / 86_400_000))
    : null
  const history = [...data.surprises].reverse()

  return (
    <div className="h-full overflow-y-auto p-3 font-mono">
      <div className="text-[14px] font-bold text-term-amber">{ticker} — EARNINGS</div>

      <div className="mt-2 border border-term-border bg-term-bg p-2">
        {data.nextDate ? (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-[10px] uppercase text-term-dim">Next report</span>
            <span className="text-[14px] font-bold text-term-text">{data.nextDate}</span>
            <span className="text-[11px] text-term-amber">{daysToNext === 0 ? 'TODAY' : `in ${daysToNext}d`}</span>
            {data.nextEpsEstimate !== null && (
              <span className="text-[11px] text-term-dim">
                EPS est <span className="text-term-text">{formatFinancialNumber(data.nextEpsEstimate, { style: 'ratio' })}</span>
              </span>
            )}
            {data.nextRevenueEstimate !== null && (
              <span className="text-[11px] text-term-dim">
                Rev est <span className="text-term-text">{formatFinancialNumber(data.nextRevenueEstimate)}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] uppercase text-term-dim">No upcoming earnings date on the calendar.</div>
        )}
      </div>

      {data.surprises.length > 0 ? (
        <>
          <div className="mt-3 text-[10px] uppercase tracking-widest text-term-dim">EPS surprise history</div>
          <SurpriseChart surprises={data.surprises} />
          <table className="mt-2 w-full text-[11px]">
            <thead>
              <tr className="border-b border-term-border text-[9px] uppercase text-term-dim">
                <th className="py-1 pl-2 text-left">Period</th>
                <th className="px-2 text-right">EPS est</th>
                <th className="px-2 text-right">EPS actual</th>
                <th className="px-2 text-right">Surprise</th>
                <th className="px-2 text-right">Revenue</th>
                <th className="px-2 text-right">Rev est</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.period} className="border-b border-term-border">
                  <td className="py-1 pl-2 text-term-text">{s.period}</td>
                  <td className="px-2 text-right text-term-dim">{formatFinancialNumber(s.estimate, { style: 'ratio' })}</td>
                  <td className={'px-2 text-right ' + ((s.surprisePct ?? 0) >= 0 ? 'text-term-up' : 'text-term-down')}>
                    {formatFinancialNumber(s.actual, { style: 'ratio' })}
                  </td>
                  <td className={'px-2 text-right ' + ((s.surprisePct ?? 0) >= 0 ? 'text-term-up' : 'text-term-down')}>
                    {s.surprisePct === null ? '—' : (s.surprisePct >= 0 ? '+' : '') + s.surprisePct.toFixed(1) + '%'}
                  </td>
                  <td className="px-2 text-right text-term-text">{formatFinancialNumber(s.revenueActual)}</td>
                  <td className="px-2 text-right text-term-dim">{formatFinancialNumber(s.revenueEstimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="mt-3 text-[11px] uppercase text-term-dim">No earnings history available.</div>
      )}
    </div>
  )
}
