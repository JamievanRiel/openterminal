import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Fundamentals, MetricRecord, PeerMetricsRow, StatementRow, StatementTable } from '../../../shared/types'
import { invoke, type IpcError } from '../lib/ipc'
import { formatFinancialNumber } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'

type Tab = 'overview' | 'income' | 'balance' | 'cashflow' | 'ratios' | 'growth'
const TABS: Array<[Tab, string]> = [
  ['overview', 'OVERVIEW'],
  ['income', 'INCOME'],
  ['balance', 'BALANCE'],
  ['cashflow', 'CASH FLOW'],
  ['ratios', 'RATIOS'],
  ['growth', 'GROWTH']
]

function MiniBars({ values }: { values: Array<number | null> }): JSX.Element | null {
  const last5 = values.slice(-5)
  const nums = last5.filter((v): v is number => v !== null && Number.isFinite(v))
  if (nums.length < 2) return null
  const maxAbs = Math.max(...nums.map(Math.abs)) || 1
  const W = 44
  const H = 16
  const bw = 6
  const hasNeg = nums.some((v) => v < 0)
  return (
    <svg width={W} height={H} className="shrink-0">
      {last5.map((v, i) => {
        if (v === null || !Number.isFinite(v)) return null
        const scale = hasNeg ? H / 2 - 1 : H - 2
        const h = Math.max(1, (Math.abs(v) / maxAbs) * scale)
        const y = hasNeg ? (v >= 0 ? H / 2 - h : H / 2) : H - h
        return <rect key={i} x={i * (bw + 3)} y={y} width={bw} height={h} fill={v >= 0 ? 'rgba(0,200,83,0.7)' : 'rgba(255,23,68,0.7)'} />
      })}
    </svg>
  )
}

function yoyDelta(row: StatementRow, period: 'annual' | 'quarter'): number | null {
  const v = row.values
  const i = v.length - 1
  const back = period === 'quarter' && v.length > 4 ? 4 : 1
  const cur = v[i]
  const prev = v[i - back]
  if (cur === null || prev === null || prev === 0 || cur === undefined || prev === undefined) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

function StatementView({ table, period }: { table: StatementTable; period: 'annual' | 'quarter' }): JSX.Element {
  if (table.rows.length === 0) {
    return <div className="p-4 font-mono text-[11px] uppercase text-term-dim">No data for this statement.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-[11px]">
        <thead>
          <tr className="border-b border-term-border text-[9px] uppercase text-term-dim">
            <th className="py-1 pl-2 text-left">Line item</th>
            {table.periods.map((p) => (
              <th key={p} className="px-2 py-1 text-right">
                {p}
              </th>
            ))}
            <th className="px-2 py-1 text-right">YoY</th>
            <th className="px-2 py-1 text-left">Trend</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => {
            const delta = yoyDelta(row, period)
            return (
              <tr key={row.label} className={'border-b border-term-border ' + (row.emphasis ? 'bg-[#101010]' : '')}>
                <td
                  className={'py-1 pr-2 ' + (row.emphasis ? 'font-bold text-term-text' : 'text-term-dim')}
                  style={{ paddingLeft: 8 + row.indent * 14 }}
                >
                  {row.label}
                </td>
                {row.values.map((v, i) => (
                  <td key={i} className={'px-2 py-1 text-right ' + (v !== null && v < 0 ? 'text-term-down' : 'text-term-text')}>
                    {formatFinancialNumber(v, { style: row.percent ? 'percent' : 'compact' })}
                  </td>
                ))}
                <td className={'px-2 py-1 text-right ' + (delta === null ? 'text-term-dim' : delta >= 0 ? 'text-term-up' : 'text-term-down')}>
                  {delta === null ? '—' : (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%'}
                </td>
                <td className="px-2 py-0.5">
                  <MiniBars values={row.values} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PeersTable({ symbol }: { symbol: string }): JSX.Element | null {
  const peers = useQuery({
    queryKey: ['peers-metrics', symbol],
    queryFn: () => invoke<PeerMetricsRow[]>('fundamentals:peers', { symbol }),
    staleTime: 24 * 3600_000,
    retry: 0
  })
  if (peers.isError) return null
  if (peers.isLoading) return <div className="mt-2 font-mono text-[10px] uppercase text-term-dim">Loading peers…</div>
  const pct = (v: number | null): string => (v === null ? '—' : v.toFixed(1) + '%')
  return (
    <div className="mt-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-term-dim">Peer comparison</div>
      <table className="mt-1 w-full font-mono text-[11px]">
        <thead>
          <tr className="border-b border-term-border text-[9px] uppercase text-term-dim">
            <th className="py-1 pl-2 text-left">Symbol</th>
            <th className="px-2 text-right">P/E</th>
            <th className="px-2 text-right">EV/EBITDA</th>
            <th className="px-2 text-right">Gross</th>
            <th className="px-2 text-right">Oper</th>
            <th className="px-2 text-right">Net</th>
            <th className="px-2 text-right">Rev growth</th>
          </tr>
        </thead>
        <tbody>
          {(peers.data ?? []).map((p) => (
            <tr key={p.symbol} className={'border-b border-term-border ' + (p.symbol === symbol ? 'bg-[#181206]' : '')}>
              <td className={'py-1 pl-2 font-bold ' + (p.symbol === symbol ? 'text-term-amber' : 'text-term-text')}>{p.symbol}</td>
              <td className="px-2 text-right text-term-text">{formatFinancialNumber(p.pe, { style: 'ratio', decimals: 1 })}</td>
              <td className="px-2 text-right text-term-text">{formatFinancialNumber(p.evEbitda, { style: 'ratio', decimals: 1 })}</td>
              <td className="px-2 text-right text-term-text">{pct(p.grossMargin)}</td>
              <td className="px-2 text-right text-term-text">{pct(p.operatingMargin)}</td>
              <td className="px-2 text-right text-term-text">{pct(p.netMargin)}</td>
              <td className={'px-2 text-right ' + ((p.revenueGrowth ?? 0) >= 0 ? 'text-term-up' : 'text-term-down')}>{pct(p.revenueGrowth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Reduced FA when FMP is unavailable: Finnhub basic financials only. */
function MetricFallback({ ticker, reason }: { ticker: string; reason: string }): JSX.Element {
  const metric = useQuery({
    queryKey: ['metric-full', ticker],
    queryFn: () => invoke<MetricRecord>('metric:full', { symbol: ticker }),
    staleTime: 24 * 3600_000,
    retry: 0
  })
  if (metric.isLoading) return <LoadingState label={`${ticker} metrics`} />
  if (metric.isError) return <ErrorState error={metric.error as Error} />
  const m = metric.data as MetricRecord
  const g = (keys: string[]): number | null => {
    for (const k of keys) {
      const v = m[k]
      if (typeof v === 'number' && Number.isFinite(v)) return v
    }
    return null
  }
  const rows: Array<[string, number | null, boolean]> = [
    ['P/E (TTM)', g(['peTTM', 'peBasicExclExtraTTM', 'peAnnual']), false],
    ['P/S (TTM)', g(['psTTM', 'psAnnual']), false],
    ['P/B', g(['pbAnnual', 'pbQuarterly', 'pb']), false],
    ['Gross margin', g(['grossMarginTTM', 'grossMarginAnnual']), true],
    ['Operating margin', g(['operatingMarginTTM', 'operatingMarginAnnual']), true],
    ['Net margin', g(['netProfitMarginTTM', 'netProfitMarginAnnual']), true],
    ['ROE', g(['roeTTM', 'roeRfy']), true],
    ['ROA', g(['roaTTM', 'roaRfy']), true],
    ['Current ratio', g(['currentRatioAnnual', 'currentRatioQuarterly']), false],
    ['Debt / equity', g(['totalDebt/totalEquityAnnual', 'totalDebt/totalEquityQuarterly']), false],
    ['52w high', g(['52WeekHigh']), false],
    ['52w low', g(['52WeekLow']), false]
  ]
  return (
    <div className="p-3">
      <div className="border border-term-amber bg-[#181206] px-2 py-1 font-mono text-[10px] uppercase text-term-amber">
        Overview only — {reason}. Full statements return when FMP is available.
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-[12px] md:grid-cols-3">
        {rows.map(([label, value, isPct]) => (
          <div key={label} className="flex justify-between border-b border-term-border py-1">
            <span className="uppercase text-term-dim">{label}</span>
            <span className="text-term-text">
              {value === null ? '—' : isPct ? value.toFixed(1) + '%' : formatFinancialNumber(value, { style: 'ratio' })}
            </span>
          </div>
        ))}
      </div>
      <PeersTable symbol={ticker} />
    </div>
  )
}

export default function FaPanel({ ticker }: { ticker: string }): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview')
  const [period, setPeriod] = useState<'annual' | 'quarter'>('annual')

  const fa = useQuery({
    queryKey: ['fundamentals', ticker, period],
    queryFn: () => invoke<Fundamentals>('fundamentals:statements', { symbol: ticker, period }),
    staleTime: 24 * 3600_000,
    retry: 0
  })

  if (fa.isLoading) return <LoadingState label={`${ticker} fundamentals`} />
  if (fa.isError) {
    const err = fa.error as IpcError
    if (['RATE_LIMITED', 'NO_KEY', 'UNSUPPORTED', 'NETWORK'].includes(err.name)) {
      const reason = err.name === 'NO_KEY' ? 'FMP key not configured' : err.name === 'RATE_LIMITED' ? 'FMP daily budget exhausted' : 'FMP unavailable'
      return (
        <div className="h-full overflow-y-auto">
          <div className="border-b border-term-border px-2 py-1 font-mono text-[11px] font-bold text-term-amber">{ticker} — FINANCIAL ANALYSIS</div>
          <MetricFallback ticker={ticker} reason={reason} />
        </div>
      )
    }
    return <ErrorState error={err} />
  }

  const data = fa.data as Fundamentals
  const table: StatementTable | null =
    tab === 'income' ? data.income : tab === 'balance' ? data.balance : tab === 'cashflow' ? data.cashflow : tab === 'ratios' ? data.ratios : tab === 'growth' ? data.growth : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-term-border px-2 py-1">
        <span className="mr-2 font-mono text-[11px] font-bold text-term-amber">{ticker} — FA</span>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              'border px-2 py-0.5 font-mono text-[9px] uppercase ' +
              (tab === key ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {label}
          </button>
        ))}
        <span className="mx-1 text-term-border">|</span>
        {(['annual', 'quarter'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={
              'border px-2 py-0.5 font-mono text-[9px] uppercase ' +
              (period === p ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {p === 'annual' ? 'FY' : 'Q'}
          </button>
        ))}
        {table && (
          <button
            className="ml-auto border border-term-border px-2 py-0.5 font-mono text-[9px] uppercase text-term-dim hover:text-term-amber"
            onClick={() =>
              void invoke('export:csv', {
                name: `${ticker}-${tab}-${period}.csv`,
                headers: ['line_item', ...table.periods],
                rows: table.rows.map((r) => [r.label, ...r.values])
              }).catch(() => undefined)
            }
          >
            CSV
          </button>
        )}
        {data.fromCache && <span className={'font-mono text-[9px] uppercase text-term-amber ' + (table ? '' : 'ml-auto')}>CACHED</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'overview' ? (
          <div className="p-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-[12px] md:grid-cols-3">
              {data.overview.map((o) => (
                <div key={o.label} className="flex justify-between border-b border-term-border py-1">
                  <span className="uppercase text-term-dim">{o.label}</span>
                  <span className={'text-term-text ' + (o.value !== null && o.value < 0 ? 'text-term-down' : '')}>
                    {formatFinancialNumber(o.value, { style: o.percent ? 'percent' : 'ratio', decimals: o.percent ? 1 : 2 })}
                  </span>
                </div>
              ))}
            </div>
            <PeersTable symbol={ticker} />
          </div>
        ) : (
          table && <StatementView table={table} period={period} />
        )}
      </div>
    </div>
  )
}
