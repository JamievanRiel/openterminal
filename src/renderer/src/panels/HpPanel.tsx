import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { CandleInterval, CandleResponse, ChartRange } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { formatFinancialNumber, fmtCompact, fmtPrice } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'

const HP_RANGES: ChartRange[] = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']
const HP_INTERVALS: Array<[CandleInterval, string]> = [
  ['1D', 'D'],
  ['1W', 'W'],
  ['1M', 'M']
]
const ROW_HEIGHT = 22

interface HpRow {
  date: string
  open: number
  high: number
  low: number
  close: number
  change: number | null
  changePct: number | null
  volume: number
}

export default function HpPanel({ ticker }: { ticker: string }): JSX.Element {
  const [range, setRange] = useState<ChartRange>('1Y')
  const [interval, setInterval_] = useState<CandleInterval>('1D')
  const [scrollTop, setScrollTop] = useState(0)
  const [exportMsg, setExportMsg] = useState('')

  // Same channel + caches as GP: a symbol charted this session renders with zero network calls.
  const candles = useQuery({
    queryKey: ['candles', ticker, interval, range, 0],
    queryFn: () => invoke<CandleResponse>('candles:get', { symbol: ticker, interval, range, priority: true }),
    staleTime: 3600_000,
    retry: 0
  })

  const rows = useMemo((): HpRow[] => {
    const cs = candles.data?.candles ?? []
    const out: HpRow[] = []
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i]
      const prev = i > 0 ? cs[i - 1] : null
      out.push({
        date: new Date(c.time * 1000).toISOString().slice(0, 10),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        change: prev ? c.close - prev.close : null,
        changePct: prev && prev.close !== 0 ? ((c.close - prev.close) / prev.close) * 100 : null,
        volume: c.volume
      })
    }
    return out.reverse() // newest first
  }, [candles.data])

  const summary = useMemo(() => {
    if (rows.length === 0) return null
    const high = Math.max(...rows.map((r) => r.high))
    const low = Math.min(...rows.map((r) => r.low))
    const first = rows[rows.length - 1]
    const last = rows[0]
    const ret = first.open !== 0 ? ((last.close - first.open) / first.open) * 100 : 0
    return { high, low, ret, bars: rows.length }
  }, [rows])

  if (candles.isLoading) return <LoadingState label={`${ticker} history`} />
  if (candles.isError) return <ErrorState error={candles.error as Error} />

  const exportCsv = async (): Promise<void> => {
    try {
      const result = await invoke<{ saved: boolean; path?: string }>('export:csv', {
        name: `${ticker}-history.csv`,
        headers: ['date', 'open', 'high', 'low', 'close', 'change', 'change_pct', 'volume'],
        rows: rows.map((r) => [r.date, r.open, r.high, r.low, r.close, r.change, r.changePct, r.volume])
      })
      setExportMsg(result.saved ? `Exported → ${result.path}` : 'Export cancelled.')
    } catch (err) {
      setExportMsg((err as Error).message)
    }
  }

  const btn = (active: boolean): string =>
    'border px-1.5 py-0.5 text-[9px] uppercase ' +
    (active ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')

  // Windowed rendering for long ranges.
  const virtual = rows.length > 100
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10) : 0
  const visible = virtual ? rows.slice(start, start + 60) : rows

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-term-border px-2 py-1">
        <span className="mr-2 text-[11px] font-bold text-term-amber">{ticker} — HP</span>
        {HP_RANGES.map((r) => (
          <button key={r} className={btn(range === r)} onClick={() => setRange(r)}>
            {r}
          </button>
        ))}
        <span className="mx-1 text-term-border">|</span>
        {HP_INTERVALS.map(([i, label]) => (
          <button key={i} className={btn(interval === i)} onClick={() => setInterval_(i)}>
            {label}
          </button>
        ))}
        {candles.data?.fromDiskCache && <span className="ml-1 text-[9px] uppercase text-term-amber">CACHED</span>}
        <button className="ml-auto border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber" onClick={() => void exportCsv()}>
          Export CSV
        </button>
      </div>
      {exportMsg && <div className="shrink-0 px-2 py-0.5 text-[9px] text-term-dim">{exportMsg}</div>}

      <div className="grid shrink-0 grid-cols-[86px_1fr_1fr_1fr_1fr_76px_66px_80px] gap-1 border-b border-term-border px-2 py-1 text-[9px] uppercase text-term-dim">
        <span>Date</span>
        <span className="text-right">Open</span>
        <span className="text-right">High</span>
        <span className="text-right">Low</span>
        <span className="text-right">Close</span>
        <span className="text-right">Chg</span>
        <span className="text-right">%Chg</span>
        <span className="text-right">Volume</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" onScroll={(e) => virtual && setScrollTop(e.currentTarget.scrollTop)}>
        {virtual && <div style={{ height: start * ROW_HEIGHT }} />}
        {visible.map((r) => (
          <div
            key={r.date}
            className="grid grid-cols-[86px_1fr_1fr_1fr_1fr_76px_66px_80px] items-center gap-1 border-b border-term-border px-2 text-[11px]"
            style={{ height: ROW_HEIGHT }}
          >
            <span className="text-term-dim">{r.date}</span>
            <span className="text-right text-term-text">{fmtPrice(r.open)}</span>
            <span className="text-right text-term-text">{fmtPrice(r.high)}</span>
            <span className="text-right text-term-text">{fmtPrice(r.low)}</span>
            <span className="text-right font-bold text-term-text">{fmtPrice(r.close)}</span>
            <span className={'text-right ' + ((r.change ?? 0) > 0 ? 'text-term-up' : (r.change ?? 0) < 0 ? 'text-term-down' : 'text-term-dim')}>
              {r.change === null ? '—' : formatFinancialNumber(r.change, { style: 'ratio', negParens: false })}
            </span>
            <span className={'text-right ' + ((r.changePct ?? 0) > 0 ? 'text-term-up' : (r.changePct ?? 0) < 0 ? 'text-term-down' : 'text-term-dim')}>
              {r.changePct === null ? '—' : (r.changePct >= 0 ? '+' : '') + r.changePct.toFixed(2) + '%'}
            </span>
            <span className="text-right text-term-dim">{fmtCompact(r.volume)}</span>
          </div>
        ))}
        {virtual && <div style={{ height: Math.max(0, (rows.length - start - visible.length)) * ROW_HEIGHT }} />}
      </div>

      {summary && (
        <div className="flex shrink-0 items-center gap-5 border-t border-term-border px-2 py-1 text-[10px] uppercase text-term-dim">
          <span>
            High <span className="text-term-up">{fmtPrice(summary.high)}</span>
          </span>
          <span>
            Low <span className="text-term-down">{fmtPrice(summary.low)}</span>
          </span>
          <span>
            Return <span className={summary.ret >= 0 ? 'text-term-up' : 'text-term-down'}>{(summary.ret >= 0 ? '+' : '') + summary.ret.toFixed(2)}%</span>
          </span>
          <span className="ml-auto">{summary.bars} bars</span>
        </div>
      )}
    </div>
  )
}
