import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { Metric52w, Quote, SavedScreen, ScreenerFilters, ScreenerResult, ScreenerRow } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { formatFinancialNumber, fmtCompact, fmtPct, fmtPrice, upDownClass } from '../lib/format'
import { ErrorState } from '../components/PanelStates'
import { useWorkspace } from '../state/workspace'

const SECTORS = [
  'Technology',
  'Financial Services',
  'Healthcare',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Industrials',
  'Basic Materials',
  'Real Estate',
  'Utilities',
  'Communication Services'
]
const EXCHANGES = ['NYSE', 'NASDAQ', 'AMEX']

const EMPTY: ScreenerFilters = {
  sector: null,
  exchange: null,
  marketCapMin: null,
  marketCapMax: null,
  priceMin: null,
  priceMax: null,
  volumeMin: null,
  dividendMin: null,
  limit: 100
}

interface Refinement {
  changeMin: number | null
  changeMax: number | null
  near52wHighPct: number | null
}

interface RefinedData {
  change: Map<string, number>
  near52wHigh: Map<string, number>
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R | null>): Promise<Array<R | null>> {
  const out: Array<R | null> = new Array(items.length).fill(null)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      try {
        out[i] = await fn(items[i])
      } catch {
        out[i] = null
      }
    }
  })
  await Promise.all(workers)
  return out
}

type SortKey = 'symbol' | 'marketCap' | 'price' | 'dividendYield' | 'volume' | 'change'

export default function EqsPanel({ ticker }: { ticker: string | null }): JSX.Element {
  const queryClient = useQueryClient()
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const [filters, setFilters] = useState<ScreenerFilters>(EMPTY)
  const [refine, setRefine] = useState<Refinement>({ changeMin: null, changeMax: null, near52wHighPct: null })
  const [refined, setRefined] = useState<RefinedData | null>(null)
  const [refining, setRefining] = useState(false)
  const [result, setResult] = useState<ScreenerResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [running, setRunning] = useState(false)
  const [screens, setScreens] = useState<SavedScreen[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('marketCap')
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    void invoke<SavedScreen[]>('screener:screens').then(setScreens).catch(() => undefined)
  }, [])

  const run = async (f: ScreenerFilters): Promise<void> => {
    setRunning(true)
    setError(null)
    setRefined(null)
    try {
      setResult(await invoke<ScreenerResult>('screener:run', f))
    } catch (err) {
      setError(err as Error)
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  // `EQS <name>` from the command line: load + auto-run the saved screen.
  useEffect(() => {
    if (!ticker) return
    void invoke<SavedScreen[]>('screener:screens').then((all) => {
      const screen = all.find((s) => s.name === ticker.toUpperCase())
      if (screen) {
        setFilters(screen.filters)
        void run(screen.filters)
      } else {
        setError(new Error(`No saved screen named "${ticker}". Save one first.`))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker])

  const runRefinement = async (): Promise<void> => {
    if (!result) return
    setRefining(true)
    // Cache-first quote/metric pulls, capped at 50 symbols, low concurrency.
    const symbols = result.rows.slice(0, 50).map((r) => r.symbol)
    const change = new Map<string, number>()
    const near = new Map<string, number>()
    await mapLimit(symbols, 4, async (symbol) => {
      const q = await queryClient.fetchQuery({
        queryKey: ['quote', symbol],
        queryFn: () => invoke<Quote>('quote:get', { symbol }),
        staleTime: 60_000
      })
      change.set(symbol, q.percentChange)
      if (refine.near52wHighPct !== null) {
        const m = await queryClient.fetchQuery({
          queryKey: ['metric', symbol],
          queryFn: () => invoke<Metric52w>('metric:get', { symbol }),
          staleTime: 24 * 3600_000
        })
        if (m.high52 > 0) near.set(symbol, ((m.high52 - q.current) / m.high52) * 100)
      }
      return null
    })
    setRefined({ change, near52wHigh: near })
    setRefining(false)
  }

  const rows = useMemo((): ScreenerRow[] => {
    let out = result?.rows ?? []
    if (refined) {
      out = out.filter((r) => {
        const chg = refined.change.get(r.symbol)
        if (refine.changeMin !== null && (chg === undefined || chg < refine.changeMin)) return false
        if (refine.changeMax !== null && (chg === undefined || chg > refine.changeMax)) return false
        if (refine.near52wHighPct !== null) {
          const d = refined.near52wHigh.get(r.symbol)
          if (d === undefined || d > refine.near52wHighPct) return false
        }
        return true
      })
    }
    const val = (r: ScreenerRow): number | string => {
      if (sortKey === 'symbol') return r.symbol
      if (sortKey === 'change') return refined?.change.get(r.symbol) ?? -Infinity
      return r[sortKey] ?? -Infinity
    }
    return [...out].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDesc ? -cmp : cmp
    })
  }, [result, refined, refine, sortKey, sortDesc])

  const numInput = (label: string, key: keyof ScreenerFilters, scale = 1): JSX.Element => (
    <label className="flex items-center gap-1 font-mono text-[9px] uppercase text-term-dim">
      {label}
      <input
        type="number"
        value={filters[key] === null ? '' : Number(filters[key]) / scale}
        onChange={(e) =>
          setFilters({ ...filters, [key]: e.target.value === '' ? null : Number(e.target.value) * scale })
        }
        className="w-16 border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-text outline-none focus:border-term-amber"
      />
    </label>
  )

  const header = (key: SortKey, label: string, align = 'text-right'): JSX.Element => (
    <button
      className={align + ' uppercase hover:text-term-amber'}
      onClick={() => {
        if (sortKey === key) setSortDesc((d) => !d)
        else {
          setSortKey(key)
          setSortDesc(key !== 'symbol')
        }
      }}
    >
      {label}
      {sortKey === key ? (sortDesc ? ' ▼' : ' ▲') : ''}
    </button>
  )

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="shrink-0 border-b border-term-border p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-term-amber">EQS — SCREENER</span>
          <select
            value={filters.sector ?? ''}
            onChange={(e) => setFilters({ ...filters, sector: e.target.value || null })}
            className="border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-text outline-none"
          >
            <option value="">All sectors</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filters.exchange ?? ''}
            onChange={(e) => setFilters({ ...filters, exchange: e.target.value || null })}
            className="border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-text outline-none"
          >
            <option value="">All exchanges</option>
            {EXCHANGES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          {numInput('MCAP ≥ $B', 'marketCapMin', 1e9)}
          {numInput('MCAP ≤ $B', 'marketCapMax', 1e9)}
          {numInput('PX ≥', 'priceMin')}
          {numInput('PX ≤', 'priceMax')}
          {numInput('VOL ≥ M', 'volumeMin', 1e6)}
          {numInput('DIV ≥ $', 'dividendMin')}
          <button
            disabled={running}
            onClick={() => void run(filters)}
            className="border border-term-amber px-3 py-0.5 text-[10px] font-bold uppercase text-term-amber hover:bg-[#181206] disabled:opacity-40"
          >
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[9px] uppercase text-term-dim">Refine (client-side, ≤50 rows):</span>
          <label className="flex items-center gap-1 text-[9px] uppercase text-term-dim">
            %chg ≥
            <input
              type="number"
              value={refine.changeMin ?? ''}
              onChange={(e) => setRefine({ ...refine, changeMin: e.target.value === '' ? null : Number(e.target.value) })}
              className="w-12 border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-text outline-none"
            />
          </label>
          <label className="flex items-center gap-1 text-[9px] uppercase text-term-dim">
            %chg ≤
            <input
              type="number"
              value={refine.changeMax ?? ''}
              onChange={(e) => setRefine({ ...refine, changeMax: e.target.value === '' ? null : Number(e.target.value) })}
              className="w-12 border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-text outline-none"
            />
          </label>
          <label className="flex items-center gap-1 text-[9px] uppercase text-term-dim">
            ≤ % off 52w high
            <input
              type="number"
              value={refine.near52wHighPct ?? ''}
              onChange={(e) => setRefine({ ...refine, near52wHighPct: e.target.value === '' ? null : Number(e.target.value) })}
              className="w-12 border border-term-border bg-term-bg px-1 py-0.5 text-[10px] text-term-text outline-none"
            />
          </label>
          <button
            disabled={!result || refining}
            onClick={() => void runRefinement()}
            className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber disabled:opacity-40"
          >
            {refining ? 'Refining…' : 'Refine'}
          </button>
          <span className="mx-1 text-term-border">|</span>
          <select
            value=""
            onChange={(e) => {
              const screen = screens.find((s) => s.name === e.target.value)
              if (screen) {
                setFilters(screen.filters)
                void run(screen.filters)
              }
            }}
            className="border border-term-border bg-term-bg px-1 py-0.5 text-[9px] uppercase text-term-text outline-none"
          >
            <option value="">Saved screens…</option>
            {screens.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
            onClick={() => {
              const name = window.prompt('Save screen as (≤16 chars, usable as EQS <name>):')
              if (name?.trim()) {
                void invoke<SavedScreen[]>('screener:save-screen', { name: name.trim().toUpperCase(), filters }).then(setScreens)
              }
            }}
          >
            Save
          </button>
          {screens.length > 0 && (
            <button
              className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-down"
              onClick={() => {
                const name = window.prompt('Delete which screen? ' + screens.map((s) => s.name).join(', '))
                if (name?.trim()) {
                  void invoke<SavedScreen[]>('screener:delete-screen', { name: name.trim().toUpperCase() }).then(setScreens)
                }
              }}
            >
              Del
            </button>
          )}
          {result && (
            <>
              <button
                className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
                onClick={() =>
                  void invoke('export:csv', {
                    name: 'screener-results.csv',
                    headers: ['symbol', 'name', 'sector', 'market_cap', 'price', 'dividend_yield', 'percent_change', 'volume'],
                    rows: rows.map((r) => [
                      r.symbol,
                      r.name,
                      r.sector,
                      r.marketCap,
                      r.price,
                      r.dividendYield,
                      refined?.change.get(r.symbol) ?? null,
                      r.volume
                    ])
                  }).catch(() => undefined)
                }
              >
                CSV
              </button>
              <span className="ml-auto text-[9px] uppercase text-term-dim">
                {rows.length} results {result.fromCache ? '· CACHED' : ''} ·{' '}
                {new Date(result.fetchedAt).toLocaleTimeString('en-GB', { hour12: false })}
              </span>
            </>
          )}
        </div>
      </div>

      {error && <ErrorState error={error} />}
      {!error && !result && !running && (
        <div className="p-4 text-[11px] uppercase text-term-dim">Set filters and press RUN. Screens can be saved and run as EQS &lt;name&gt;.</div>
      )}
      {result && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[64px_1fr_120px_80px_70px_60px_60px_70px] gap-2 border-b border-term-border bg-term-panel px-2 py-1 text-[9px] text-term-dim">
            {header('symbol', 'Symbol', 'text-left')}
            <span className="uppercase">Name</span>
            <span className="uppercase">Sector</span>
            {header('marketCap', 'MCap')}
            {header('price', 'Price')}
            {header('dividendYield', 'Yield')}
            {header('change', '%Chg')}
            {header('volume', 'Volume')}
          </div>
          {rows.map((r) => {
            const chg = refined?.change.get(r.symbol)
            return (
              <button
                key={r.symbol}
                className="grid w-full grid-cols-[64px_1fr_120px_80px_70px_60px_60px_70px] gap-2 border-b border-term-border px-2 py-1 text-left text-[11px] hover:bg-[#121212]"
                onClick={() => loadTicker(r.symbol)}
              >
                <span className="font-bold text-term-amber">{r.symbol}</span>
                <span className="truncate text-term-text">{r.name}</span>
                <span className="truncate text-term-dim">{r.sector}</span>
                <span className="text-right text-term-text">{formatFinancialNumber(r.marketCap)}</span>
                <span className="text-right text-term-text">{r.price !== null ? fmtPrice(r.price) : '—'}</span>
                <span className="text-right text-term-dim">
                  {r.dividendYield !== null ? (r.dividendYield * 100).toFixed(2) + '%' : '—'}
                </span>
                <span className={'text-right ' + (chg === undefined ? 'text-term-dim' : upDownClass(chg))}>
                  {chg === undefined ? '—' : fmtPct(chg)}
                </span>
                <span className="text-right text-term-dim">{r.volume !== null ? fmtCompact(r.volume) : '—'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
