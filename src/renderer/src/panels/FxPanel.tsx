import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { CandleResponse, ChartSettings, FxPairQuote } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtPct, fmtSigned, upDownClass } from '../lib/format'
import { Sparkline } from '../components/LiveBits'
import { LoadingState } from '../components/PanelStates'
import TerminalChart from '../components/chart/TerminalChart'

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY']

function normalizePair(raw: string | null): string | null {
  if (!raw) return null
  const up = raw.toUpperCase().replace(/[^A-Z/]/g, '')
  if (up.includes('/')) return PAIRS.includes(up) ? up : null
  if (up.length === 6) {
    const withSlash = up.slice(0, 3) + '/' + up.slice(3)
    return PAIRS.includes(withSlash) ? withSlash : null
  }
  return null
}

function pairDecimals(pair: string): number {
  return pair.includes('JPY') ? 3 : 5
}

function PairCard({ entry, onOpen }: { entry: FxPairQuote; onOpen: () => void }): JSX.Element {
  const spark = useQuery({
    queryKey: ['candles', entry.pair, '15m', '1D', 0],
    queryFn: () => invoke<CandleResponse>('candles:get', { symbol: entry.pair, interval: '15m', range: '1D', priority: false }),
    staleTime: 15 * 60_000,
    retry: 0,
    enabled: entry.quote !== null
  })
  const q = entry.quote
  const stale = entry.asOf > 0 && Date.now() - entry.asOf > 3 * 60_000
  return (
    <button className="border border-term-border bg-term-bg p-2 text-left hover:border-term-amber" onClick={onOpen}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold text-term-amber">{entry.pair}</span>
        {(stale || q?.stale) && <span className="font-mono text-[8px] uppercase text-term-dim">DELAYED</span>}
      </div>
      {q ? (
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="font-mono">
            <div className="text-[15px] font-bold text-term-text">{q.current.toFixed(pairDecimals(entry.pair))}</div>
            <div className={'text-[10px] ' + upDownClass(q.change)}>
              {fmtSigned(q.change, pairDecimals(entry.pair))} {fmtPct(q.percentChange)}
            </div>
          </div>
          {spark.data && <Sparkline values={spark.data.candles.map((c) => c.close)} width={80} height={26} />}
        </div>
      ) : (
        <div className="mt-1 font-mono text-[10px] uppercase text-term-dim">waiting for rotation…</div>
      )}
    </button>
  )
}

export default function FxPanel({ ticker }: { ticker: string | null }): JSX.Element {
  const [detail, setDetail] = useState<string | null>(normalizePair(ticker))
  const [chart, setChart] = useState<ChartSettings>({
    seriesType: 'line',
    interval: '15m',
    range: '5D',
    indicators: [],
    compare: null
  })

  const pairs = useQuery({
    queryKey: ['fx-pairs'],
    queryFn: () => invoke<FxPairQuote[]>('fx:pairs'),
    // Each poll refreshes the 2 stalest pairs in main → full cycle ≈ 2.5 min inside the TD bucket.
    refetchInterval: 30_000,
    staleTime: 25_000
  })

  if (detail) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1 font-mono">
          <button className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber" onClick={() => setDetail(null)}>
            ← FX grid
          </button>
          <span className="text-[11px] font-bold text-term-amber">{detail}</span>
          <span className="ml-auto text-[8px] uppercase text-term-dim">Twelve Data candles · DELAYED as applicable</span>
        </div>
        <div className="min-h-0 flex-1">
          <TerminalChart symbol={detail} settings={chart} onSettings={setChart} variant="GP" isActivePanel />
        </div>
      </div>
    )
  }

  if (pairs.isLoading) return <LoadingState label="FX pairs" />

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1">
        <span className="text-[11px] font-bold text-term-amber">FX — CURRENCY DASHBOARD</span>
        <span className="ml-auto text-[8px] uppercase text-term-dim">round-robin refresh ≤ 2.5 min · click pair for chart · FX EURUSD jumps straight in</span>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2 lg:grid-cols-3 2xl:grid-cols-5">
        {(pairs.data ?? []).map((entry) => (
          <PairCard key={entry.pair} entry={entry} onOpen={() => setDetail(entry.pair)} />
        ))}
      </div>
    </div>
  )
}
