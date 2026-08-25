import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { FredSeries } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { ErrorState, LoadingState } from '../components/PanelStates'

const MATURITIES: Array<[string, string]> = [
  ['DGS1MO', '1M'],
  ['DGS3MO', '3M'],
  ['DGS6MO', '6M'],
  ['DGS1', '1Y'],
  ['DGS2', '2Y'],
  ['DGS3', '3Y'],
  ['DGS5', '5Y'],
  ['DGS7', '7Y'],
  ['DGS10', '10Y'],
  ['DGS20', '20Y'],
  ['DGS30', '30Y']
]

/** Latest non-null value at-or-before an index, carrying prior business days through FRED "." gaps. */
function valueAt(series: FredSeries | undefined, backDays: number): number | null {
  if (!series) return null
  const obs = series.observations
  const targetIdx = obs.length - 1 - backDays
  for (let i = Math.min(targetIdx, obs.length - 1); i >= 0; i--) {
    const v = obs[i]?.value
    if (v !== null && v !== undefined) return v
  }
  return null
}

interface CurveSet {
  label: string
  color: string
  values: Array<number | null>
}

export default function GcPanel(): JSX.Element {
  const yields = useQuery({
    queryKey: ['yields'],
    queryFn: () => invoke<Record<string, FredSeries>>('yields:get'),
    staleTime: 12 * 3600_000,
    retry: 0
  })

  const curves = useMemo((): CurveSet[] => {
    const data = yields.data
    if (!data) return []
    // FRED daily series ≈ 5 obs/week: ~22 rows back = 1 month, ~260 = 1 year.
    return [
      { label: 'LATEST', color: '#ff9800', values: MATURITIES.map(([id]) => valueAt(data[id], 0)) },
      { label: '1M AGO', color: '#64b5f6', values: MATURITIES.map(([id]) => valueAt(data[id], 22)) },
      { label: '1Y AGO', color: '#7a7a7a', values: MATURITIES.map(([id]) => valueAt(data[id], 260)) }
    ]
  }, [yields.data])

  if (yields.isLoading) return <LoadingState label="yield curve" />
  if (yields.isError) return <ErrorState error={yields.error as Error} />

  const all = curves.flatMap((c) => c.values).filter((v): v is number => v !== null)
  const min = Math.floor(Math.min(...all, 0) * 2) / 2
  const max = Math.ceil(Math.max(...all) * 2) / 2
  const span = max - min || 1

  const W = 560
  const H = 220
  const padL = 36
  const padB = 24
  const padT = 10
  const plotW = W - padL - 12
  const plotH = H - padT - padB
  const xAt = (i: number): number => padL + (i / (MATURITIES.length - 1)) * plotW
  const yAt = (v: number): number => padT + plotH - ((v - min) / span) * plotH

  const latest = curves[0]?.values ?? []
  const y2 = latest[4]
  const y10 = latest[8]
  const spreadBp = y2 !== null && y10 !== null && y2 !== undefined && y10 !== undefined ? Math.round((y10 - y2) * 100) : null
  const inverted = spreadBp !== null && spreadBp < 0

  return (
    <div className="h-full overflow-y-auto p-3 font-mono">
      <div className="flex items-center gap-3">
        <span className="text-[14px] font-bold text-term-amber">GC — US TREASURY YIELD CURVE</span>
        {spreadBp !== null && (
          <span
            className={
              'border px-2 py-0.5 text-[10px] font-bold uppercase ' +
              (inverted ? 'border-term-down bg-[#1a0808] text-term-down' : 'border-term-border text-term-dim')
            }
          >
            {inverted ? '⚠ INVERTED · ' : '10Y−2Y '}
            {spreadBp} bp
          </span>
        )}
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-2">
        {[min, min + span / 2, max].map((v) => (
          <g key={v}>
            <line x1={padL} y1={yAt(v)} x2={W - 12} y2={yAt(v)} stroke="#1c1c1c" strokeWidth="1" />
            <text x={padL - 4} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill="#7a7a7a" fontFamily="JetBrains Mono, monospace">
              {v.toFixed(1)}%
            </text>
          </g>
        ))}
        {MATURITIES.map(([id, label], i) => (
          <text key={id} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#7a7a7a" fontFamily="JetBrains Mono, monospace">
            {label}
          </text>
        ))}
        {curves.map((curve) => {
          const points = curve.values
            .map((v, i) => (v !== null ? `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}` : null))
            .filter((p): p is string => p !== null)
            .join(' ')
          return (
            <g key={curve.label}>
              <polyline points={points} fill="none" stroke={curve.color} strokeWidth={curve.label === 'LATEST' ? 2 : 1} />
              {curve.values.map((v, i) =>
                v !== null ? <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2" fill={curve.color} /> : null
              )}
            </g>
          )
        })}
      </svg>
      <div className="flex gap-4 text-[9px] uppercase">
        {curves.map((c) => (
          <span key={c.label} style={{ color: c.color }}>
            ── {c.label}
          </span>
        ))}
      </div>

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="border-b border-term-border text-[9px] uppercase text-term-dim">
            <th className="py-1 pl-2 text-left">Curve</th>
            {MATURITIES.map(([id, label]) => (
              <th key={id} className="px-1 text-right">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {curves.map((c) => (
            <tr key={c.label} className="border-b border-term-border">
              <td className="py-1 pl-2 text-[9px] uppercase" style={{ color: c.color }}>
                {c.label}
              </td>
              {c.values.map((v, i) => (
                <td key={i} className="px-1 text-right text-term-text">
                  {v !== null ? v.toFixed(2) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[8px] uppercase text-term-dim">Source: FRED daily constant-maturity series (holiday gaps carried forward)</div>
    </div>
  )
}
