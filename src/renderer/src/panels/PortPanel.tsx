import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts'
import type { CandleResponse, CompanyProfile, Portfolio, PortfolioCurrency, Position, Quote, SymbolHit } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { useLiveTick } from '../lib/live'
import { formatFinancialNumber, fmtPct, fmtPrice, fmtSigned, upDownClass } from '../lib/format'
import { Flash } from '../components/LiveBits'
import { LoadingState } from '../components/PanelStates'
import { paneOptions, COLORS } from '../components/chart/chartTheme'
import { useWorkspace } from '../state/workspace'

/** position currency → display currency multiplier given the EUR/USD rate */
function fxFactor(from: PortfolioCurrency, to: PortfolioCurrency, eurUsd: number | undefined): number | null {
  if (from === to) return 1
  if (eurUsd === undefined || !Number.isFinite(eurUsd) || eurUsd === 0) return null
  return from === 'EUR' ? eurUsd : 1 / eurUsd
}

function PositionRow({
  pos,
  display,
  eurUsd,
  quote,
  weight,
  onRemove
}: {
  pos: Position
  display: PortfolioCurrency
  eurUsd: number | undefined
  quote: Quote | undefined
  weight: number | null
  onRemove: () => void
}): JSX.Element {
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const live = useLiveTick(pos.symbol)
  const last = live?.price ?? quote?.current
  const fx = fxFactor(pos.currency, display, eurUsd)
  const converted = pos.currency !== display
  const mv = last !== undefined && fx !== null ? pos.qty * last * fx : null
  const cost = fx !== null ? pos.qty * pos.avgCost * fx : null
  const dayPnl = last !== undefined && quote?.prevClose && fx !== null ? pos.qty * (last - quote.prevClose) * fx : null
  const totalPnl = mv !== null && cost !== null ? mv - cost : null
  const totalPct = totalPnl !== null && cost !== null && cost !== 0 ? (totalPnl / Math.abs(cost)) * 100 : null

  return (
    <div
      className="grid cursor-pointer grid-cols-[64px_60px_70px_80px_90px_90px_90px_66px_54px_20px] items-center gap-1 border-b border-term-border px-2 py-1 text-[11px] hover:bg-[#121212]"
      onClick={() => loadTicker(pos.symbol)}
    >
      <span className="font-bold text-term-amber">
        {pos.symbol}
        {converted && <span title={`converted ${pos.currency}→${display}`} className="ml-0.5 text-term-dim">⇄</span>}
      </span>
      <span className="text-right text-term-text">{pos.qty}</span>
      <span className="text-right text-term-dim">{fmtPrice(pos.avgCost)}</span>
      <Flash flashSeq={live?.seq} dir={live?.dir ?? 0} className="text-right text-term-text">
        {last !== undefined ? fmtPrice(last) : '—'}
      </Flash>
      <span className="text-right text-term-text">{mv !== null ? formatFinancialNumber(mv) : '—'}</span>
      <Flash flashSeq={live?.seq} dir={live?.dir ?? 0} className={'text-right ' + upDownClass(dayPnl ?? 0)}>
        {dayPnl !== null ? fmtSigned(dayPnl) : '—'}
      </Flash>
      <span className={'text-right ' + upDownClass(totalPnl ?? 0)}>{totalPnl !== null ? fmtSigned(totalPnl) : '—'}</span>
      <span className={'text-right ' + upDownClass(totalPct ?? 0)}>{totalPct !== null ? fmtPct(totalPct) : '—'}</span>
      <span className="text-right text-term-dim">{weight !== null ? weight.toFixed(1) + '%' : '—'}</span>
      <button
        className="text-term-dim hover:text-term-down"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        ×
      </button>
    </div>
  )
}

function Donut({ slices }: { slices: Array<{ label: string; value: number }> }): JSX.Element | null {
  const total = slices.reduce((a, s) => a + s.value, 0)
  if (total <= 0) return null
  const PALETTE = ['#ff9800', '#64b5f6', '#00c853', '#ba68c8', '#4dd0e1', '#fff176', '#f06292', '#90a4ae', '#ff8a65', '#aed581']
  const R = 44
  const C = 55
  let angle = -Math.PI / 2
  const arcs = slices.map((s, i) => {
    const frac = s.value / total
    const a0 = angle
    const a1 = (angle += frac * 2 * Math.PI)
    const large = frac > 0.5 ? 1 : 0
    const p0 = [C + R * Math.cos(a0), C + R * Math.sin(a0)]
    const p1 = [C + R * Math.cos(a1), C + R * Math.sin(a1)]
    return { d: `M ${p0[0]} ${p0[1]} A ${R} ${R} 0 ${large} 1 ${p1[0]} ${p1[1]}`, color: PALETTE[i % PALETTE.length], label: s.label, frac }
  })
  return (
    <div className="flex items-center gap-3">
      <svg width="110" height="110">
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill="none" stroke={a.color} strokeWidth="14" />
        ))}
      </svg>
      <div className="flex flex-col gap-0.5 text-[9px] uppercase">
        {arcs.slice(0, 8).map((a) => (
          <span key={a.label} style={{ color: a.color }}>
            {a.label} {(a.frac * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  )
}

/** Portfolio %-performance vs SPY reconstructed from cached daily candles. */
function PerfChart({ portfolio, eurUsd }: { portfolio: Portfolio; eurUsd: number | undefined }): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi>()
  const queryClient = useQueryClient()
  const symbols = useMemo(() => [...new Set(portfolio.positions.map((p) => p.symbol))], [portfolio.positions])

  useEffect(() => {
    if (!ref.current || symbols.length === 0) return
    let disposed = false
    const build = async (): Promise<void> => {
      const fetchCandles = (symbol: string): Promise<CandleResponse | null> =>
        queryClient
          .fetchQuery({
            queryKey: ['candles', symbol, '1D', '1Y', 0],
            queryFn: () => invoke<CandleResponse>('candles:get', { symbol, interval: '1D', range: '1Y', priority: false }),
            staleTime: 3600_000
          })
          .catch(() => null)
      const [spy, ...rest] = await Promise.all(['SPY', ...symbols].map(fetchCandles))
      if (disposed || !spy || spy.candles.length === 0) return
      const closeMaps = new Map<string, Map<number, number>>()
      rest.forEach((resp, i) => {
        if (resp) closeMaps.set(symbols[i], new Map(resp.candles.map((c) => [c.time, c.close])))
      })
      const lastKnown = new Map<string, number>()
      const points: Array<{ time: number; value: number }> = []
      for (const bar of spy.candles) {
        const day = new Date(bar.time * 1000).toISOString().slice(0, 10)
        let value = portfolio.cash
        for (const pos of portfolio.positions) {
          if (day < pos.openedAt) continue
          const close = closeMaps.get(pos.symbol)?.get(bar.time) ?? lastKnown.get(pos.symbol)
          if (close === undefined) continue
          lastKnown.set(pos.symbol, close)
          const fx = fxFactor(pos.currency, portfolio.displayCurrency, eurUsd) ?? 1
          value += pos.qty * close * fx
        }
        if (value > 0) points.push({ time: bar.time, value })
      }
      if (points.length < 2) return
      const base = points[0].value
      const portPct = points.map((p) => ({ time: p.time as UTCTimestamp, value: (p.value / base - 1) * 100 }))
      const spyBase = spy.candles.find((c) => c.time >= points[0].time)?.close ?? spy.candles[0].close
      const spyPct = spy.candles
        .filter((c) => c.time >= points[0].time)
        .map((c) => ({ time: c.time as UTCTimestamp, value: (c.close / spyBase - 1) * 100 }))

      chartRef.current?.remove()
      if (!ref.current) return
      const chart = createChart(ref.current, paneOptions(true, false))
      chartRef.current = chart
      const port = chart.addLineSeries({ color: COLORS.amber, lineWidth: 2 })
      port.setData(portPct)
      const spySeries = chart.addLineSeries({ color: '#64b5f6', lineWidth: 1 })
      spySeries.setData(spyPct)
      chart.timeScale().fitContent()
    }
    void build()
    return () => {
      disposed = true
      chartRef.current?.remove()
      chartRef.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio.id, symbols.join(','), portfolio.displayCurrency, eurUsd === undefined])

  if (symbols.length === 0) return null
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-widest text-term-dim">
        Performance vs <span style={{ color: '#64b5f6' }}>SPY</span> (1Y, % change)
      </div>
      <div ref={ref} className="mt-1 h-40 w-full" />
    </div>
  )
}

export default function PortPanel(): JSX.Element {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(window.localStorage.getItem('portfolio-active'))
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ symbol: '', qty: '', avgCost: '', currency: 'USD' as PortfolioCurrency, openedAt: new Date().toISOString().slice(0, 10) })
  const [hits, setHits] = useState<SymbolHit[]>([])
  const [message, setMessage] = useState('')

  const listQuery = useQuery({ queryKey: ['portfolios'], queryFn: () => invoke<Portfolio[]>('portfolio:list') })
  const portfoliosList = listQuery.data ?? []
  const portfolio = portfoliosList.find((p) => p.id === activeId) ?? portfoliosList[0]

  const needsFx = portfolio?.positions.some((p) => p.currency !== portfolio.displayCurrency) ?? false
  const fxQuery = useQuery({
    queryKey: ['quote', 'EUR/USD'],
    queryFn: () => invoke<Quote>('quote:get', { symbol: 'EUR/USD' }),
    staleTime: 5 * 60_000,
    retry: 0,
    enabled: needsFx
  })
  const eurUsd = fxQuery.data?.current

  const symbols = useMemo(() => [...new Set((portfolio?.positions ?? []).map((p) => p.symbol))], [portfolio])
  const quoteResults = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['quote', symbol],
      queryFn: () => invoke<Quote>('quote:get', { symbol }),
      refetchInterval: 60_000,
      retry: 0
    }))
  })
  const quoteMap = new Map<string, Quote>()
  symbols.forEach((s, i) => {
    const q = quoteResults[i]?.data
    if (q) quoteMap.set(s, q)
  })
  const profileResults = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['profile', symbol],
      queryFn: () => invoke<CompanyProfile>('profile:get', { symbol }),
      staleTime: 24 * 3600_000,
      retry: 0
    }))
  })

  const totals = useMemo(() => {
    if (!portfolio) return null
    let mv = portfolio.cash
    let cost = 0
    let day = 0
    const perPosition = new Map<Position, number>()
    for (const pos of portfolio.positions) {
      const q = quoteMap.get(pos.symbol)
      const fx = fxFactor(pos.currency, portfolio.displayCurrency, eurUsd)
      if (!q || fx === null) continue
      const v = pos.qty * q.current * fx
      perPosition.set(pos, v)
      mv += v
      cost += pos.qty * pos.avgCost * fx
      day += pos.qty * (q.current - q.prevClose) * fx
    }
    const pnl = mv - portfolio.cash - cost
    return { mv, cost, day, pnl, pnlPct: cost !== 0 ? (pnl / cost) * 100 : 0, perPosition }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, eurUsd, quoteResults])

  const sectorSlices = useMemo(() => {
    if (!portfolio || !totals) return []
    const bySector = new Map<string, number>()
    portfolio.positions.forEach((pos) => {
      const idx = symbols.indexOf(pos.symbol)
      const sector = profileResults[idx]?.data?.industry ?? 'Unknown'
      const v = totals.perPosition.get(pos) ?? 0
      bySector.set(sector, (bySector.get(sector) ?? 0) + v)
    })
    return [...bySector.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, totals, profileResults])

  if (listQuery.isLoading || !portfolio) return <LoadingState label="portfolios" />

  const save = (next: Portfolio): void => {
    void invoke<Portfolio[]>('portfolio:save', next).then((all) => queryClient.setQueryData(['portfolios'], all))
  }
  const selectPortfolio = (id: string): void => {
    setActiveId(id)
    window.localStorage.setItem('portfolio-active', id)
  }
  const cur = portfolio.displayCurrency === 'USD' ? '$' : '€'

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border p-2">
        <span className="text-[11px] font-bold text-term-amber">PORT</span>
        <select
          value={portfolio.id}
          onChange={(e) => selectPortfolio(e.target.value)}
          className="border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-amber outline-none"
        >
          {portfoliosList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
          onClick={() => {
            const name = window.prompt('New portfolio name:')
            if (name?.trim()) {
              void invoke<Portfolio[]>('portfolio:create', { name: name.trim() }).then((all) => {
                queryClient.setQueryData(['portfolios'], all)
                selectPortfolio(all[all.length - 1].id)
              })
            }
          }}
        >
          + New
        </button>
        <select
          value={portfolio.displayCurrency}
          onChange={(e) => save({ ...portfolio, displayCurrency: e.target.value as PortfolioCurrency })}
          className="border border-term-border bg-term-bg px-1 py-0.5 text-[9px] uppercase text-term-text outline-none"
          title="Display currency"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
        <label className="flex items-center gap-1 text-[9px] uppercase text-term-dim">
          Cash
          <input
            type="number"
            defaultValue={portfolio.cash}
            key={portfolio.id + portfolio.cash}
            onBlur={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v >= 0 && v !== portfolio.cash) save({ ...portfolio, cash: v })
            }}
            className="w-24 border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-text outline-none"
          />
        </label>
        <button className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber" onClick={() => setAdding((a) => !a)}>
          + Position
        </button>
        <span className="mx-1 text-term-border">|</span>
        <button
          className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
          onClick={() => void invoke<{ saved: boolean; path?: string }>('portfolio:export').then((r) => setMessage(r.saved ? `Exported → ${r.path}` : 'Cancelled.'))}
        >
          Export
        </button>
        <button
          className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
          title="Positions as CSV"
          onClick={() =>
            void invoke('export:csv', {
              name: `${portfolio.name}-positions.csv`,
              headers: ['symbol', 'qty', 'avg_cost', 'currency', 'opened_at', 'last', 'prev_close'],
              rows: portfolio.positions.map((p) => {
                const q = quoteMap.get(p.symbol)
                return [p.symbol, p.qty, p.avgCost, p.currency, p.openedAt, q?.current ?? null, q?.prevClose ?? null]
              })
            }).then((r) => setMessage((r as { saved: boolean; path?: string }).saved ? 'CSV exported.' : 'Cancelled.'))
          }
        >
          CSV
        </button>
        <button
          className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
          onClick={() =>
            void invoke<{ imported: boolean; count?: number; error?: string }>('portfolio:import').then((r) => {
              setMessage(r.imported ? `Imported ${r.count} portfolio(s).` : r.error ?? 'Cancelled.')
              void queryClient.invalidateQueries({ queryKey: ['portfolios'] })
            })
          }
        >
          Import
        </button>
        {portfoliosList.length > 1 && (
          <button
            className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-down"
            onClick={() => {
              if (window.confirm(`Delete portfolio "${portfolio.name}"?`)) {
                void invoke<Portfolio[]>('portfolio:delete', { id: portfolio.id }).then((all) => {
                  queryClient.setQueryData(['portfolios'], all)
                  if (all[0]) selectPortfolio(all[0].id)
                })
              }
            }}
          >
            Delete
          </button>
        )}
      </div>
      {message && <div className="shrink-0 px-2 py-0.5 text-[9px] text-term-dim">{message}</div>}

      {adding && (
        <div className="relative flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border bg-term-bg p-2 text-[10px]">
          <input
            value={form.symbol}
            onChange={(e) => {
              const raw = e.target.value.toUpperCase()
              setForm({ ...form, symbol: raw })
              if (raw.length >= 2) {
                void invoke<SymbolHit[]>('search:symbols', { query: raw }).then((r) => setHits(r.slice(0, 5))).catch(() => setHits([]))
              } else setHits([])
            }}
            placeholder="SYMBOL"
            className="w-24 border border-term-border bg-term-panel px-1 py-0.5 uppercase text-term-amber outline-none"
          />
          {hits.length > 0 && (
            <div className="absolute left-2 top-full z-50 w-64 border border-term-border bg-term-panel">
              {hits.map((h) => (
                <button key={h.symbol} className="flex w-full justify-between px-2 py-1 text-left hover:bg-[#1a1a1a]" onClick={() => { setForm({ ...form, symbol: h.symbol }); setHits([]) }}>
                  <span className="text-term-amber">{h.symbol}</span>
                  <span className="ml-2 truncate text-term-dim">{h.description}</span>
                </button>
              ))}
            </div>
          )}
          <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="QTY" className="w-20 border border-term-border bg-term-panel px-1 py-0.5 text-term-text outline-none" />
          <input type="number" value={form.avgCost} onChange={(e) => setForm({ ...form, avgCost: e.target.value })} placeholder="AVG COST" className="w-24 border border-term-border bg-term-panel px-1 py-0.5 text-term-text outline-none" />
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as PortfolioCurrency })} className="border border-term-border bg-term-panel px-1 py-0.5 text-term-text outline-none">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
          <input type="date" value={form.openedAt} onChange={(e) => setForm({ ...form, openedAt: e.target.value })} className="border border-term-border bg-term-panel px-1 py-0.5 text-term-text outline-none" />
          <button
            className="border border-term-amber px-3 py-0.5 uppercase text-term-amber hover:bg-[#181206]"
            onClick={() => {
              const qty = Number(form.qty)
              const avgCost = Number(form.avgCost)
              if (!form.symbol || !Number.isFinite(qty) || qty === 0 || !Number.isFinite(avgCost) || avgCost < 0) return
              save({
                ...portfolio,
                positions: [...portfolio.positions, { symbol: form.symbol, qty, avgCost, currency: form.currency, openedAt: form.openedAt }]
              })
              setForm({ ...form, symbol: '', qty: '', avgCost: '' })
              setAdding(false)
            }}
          >
            Add
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[64px_60px_70px_80px_90px_90px_90px_66px_54px_20px] gap-1 border-b border-term-border px-2 py-1 text-[9px] uppercase text-term-dim">
          <span>Symbol</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Avg cost</span>
          <span className="text-right">Last</span>
          <span className="text-right">Mkt value</span>
          <span className="text-right">Day P&L</span>
          <span className="text-right">Total P&L</span>
          <span className="text-right">%</span>
          <span className="text-right">Wgt</span>
          <span />
        </div>
        {portfolio.positions.map((pos, i) => (
          <PositionRow
            key={pos.symbol + i}
            pos={pos}
            display={portfolio.displayCurrency}
            eurUsd={eurUsd}
            quote={quoteMap.get(pos.symbol)}
            weight={totals && totals.mv > 0 ? ((totals.perPosition.get(pos) ?? 0) / totals.mv) * 100 : null}
            onRemove={() => save({ ...portfolio, positions: portfolio.positions.filter((_, j) => j !== i) })}
          />
        ))}
        {portfolio.positions.length === 0 && (
          <div className="p-4 text-[11px] uppercase text-term-dim">No positions — add one above.</div>
        )}
        {totals && portfolio.positions.length > 0 && (
          <div className="grid grid-cols-[64px_60px_70px_80px_90px_90px_90px_66px_54px_20px] gap-1 border-b border-term-amber bg-[#101010] px-2 py-1 text-[11px] font-bold">
            <span className="text-term-amber">TOTAL</span>
            <span />
            <span />
            <span />
            <span className="text-right text-term-text">{cur}{formatFinancialNumber(totals.mv, { negParens: false })}</span>
            <span className={'text-right ' + upDownClass(totals.day)}>{fmtSigned(totals.day)}</span>
            <span className={'text-right ' + upDownClass(totals.pnl)}>{fmtSigned(totals.pnl)}</span>
            <span className={'text-right ' + upDownClass(totals.pnlPct)}>{fmtPct(totals.pnlPct)}</span>
            <span className="text-right text-term-dim">100%</span>
            <span />
          </div>
        )}

        {portfolio.positions.length > 0 && (
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-widest text-term-dim">Allocation</div>
            <div className="mt-1">
              <Donut slices={sectorSlices} />
            </div>
            <PerfChart portfolio={portfolio} eurUsd={eurUsd} />
          </div>
        )}
      </div>
    </div>
  )
}
