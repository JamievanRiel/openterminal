import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import type { Metric52w, Quote, SymbolHit, Watchlist } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { useLiveTick } from '../lib/live'
import { fmtCompact, fmtPct, fmtPrice, fmtSigned, upDownClass } from '../lib/format'
import { Flash, RangeBar } from '../components/LiveBits'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { useWorkspace } from '../state/workspace'

type SortKey = 'manual' | 'symbol' | 'last' | 'change' | 'percentChange' | 'volume'

const ROW_HEIGHT = 26
const VIRTUALIZE_AT = 50

function WatchRow({
  symbol,
  quote,
  metric,
  onRemove,
  draggable,
  onDragStart,
  onDragOver,
  onDrop
}: {
  symbol: string
  quote: Quote | undefined
  metric: Metric52w | undefined
  onRemove: () => void
  draggable: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
}): JSX.Element {
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const live = useLiveTick(symbol)
  const last = live?.price ?? quote?.current
  const prevClose = quote?.prevClose
  const change = last !== undefined && prevClose ? last - prevClose : quote?.change
  const pct = change !== undefined && prevClose ? (change / prevClose) * 100 : quote?.percentChange
  const decimals = last !== undefined && last < 5 ? 4 : 2
  const dayHigh = quote && live ? Math.max(quote.high, live.price) : quote?.high
  const dayLow = quote && live ? Math.min(quote.low, live.price) : quote?.low

  return (
    <div
      className="grid cursor-pointer grid-cols-[70px_80px_75px_70px_70px_1fr_1fr_20px] items-center gap-2 border-b border-term-border px-2 font-mono text-[11px] hover:bg-[#121212]"
      style={{ height: ROW_HEIGHT }}
      onClick={() => loadTicker(symbol)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="font-bold text-term-amber">{symbol}</span>
      <Flash flashSeq={live?.seq} dir={live?.dir ?? 0} className="text-right text-term-text">
        {last !== undefined ? fmtPrice(last, decimals) : '—'}
      </Flash>
      <span className={'text-right ' + upDownClass(change ?? 0)}>{change !== undefined ? fmtSigned(change, decimals) : '—'}</span>
      <span className={'text-right ' + upDownClass(pct ?? 0)}>{pct !== undefined ? fmtPct(pct) : '—'}</span>
      <span className="text-right text-term-dim">{quote?.volume ? fmtCompact(quote.volume) : '—'}</span>
      <span className="px-1">
        {dayLow !== undefined && dayHigh !== undefined && last !== undefined && (
          <RangeBar low={dayLow} high={dayHigh} value={last} />
        )}
      </span>
      <span className="px-1">
        {metric && last !== undefined && <RangeBar low={metric.low52} high={metric.high52} value={last} />}
      </span>
      <button
        className="text-term-dim hover:text-term-down"
        title="Remove"
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

function AddSymbol({ onAdd }: { onAdd: (symbol: string) => void }): JSX.Element {
  const [value, setValue] = useState('')
  const [hits, setHits] = useState<SymbolHit[]>([])
  const timer = useRef<number>()

  const search = (raw: string): void => {
    setValue(raw.toUpperCase())
    window.clearTimeout(timer.current)
    const q = raw.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    timer.current = window.setTimeout(() => {
      invoke<SymbolHit[]>('search:symbols', { query: q })
        .then((r) => setHits(r.slice(0, 5)))
        .catch(() => setHits([]))
    }, 300)
  }

  const commit = (symbol: string): void => {
    onAdd(symbol)
    setValue('')
    setHits([])
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) commit(value.trim())
          if (e.key === 'Escape') setHits([])
        }}
        placeholder="+ ADD SYMBOL"
        spellCheck={false}
        className="w-32 border border-term-border bg-term-bg px-2 py-0.5 font-mono text-[10px] uppercase text-term-amber placeholder-term-dim outline-none focus:border-term-amber"
      />
      {hits.length > 0 && (
        <div className="absolute left-0 top-full z-50 w-64 border border-term-border bg-term-panel">
          {hits.map((hit) => (
            <button
              key={hit.symbol}
              className="flex w-full justify-between px-2 py-1 text-left font-mono text-[10px] hover:bg-[#1a1a1a]"
              onClick={() => commit(hit.symbol)}
            >
              <span className="text-term-amber">{hit.symbol}</span>
              <span className="ml-2 truncate text-term-dim">{hit.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WatchlistPanel(): JSX.Element {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(window.localStorage.getItem('watchlist-active'))
  const [sortKey, setSortKey] = useState<SortKey>('manual')
  const [sortDesc, setSortDesc] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)
  const dragFrom = useRef<number | null>(null)
  const [exportMsg, setExportMsg] = useState('')

  const listsQuery = useQuery({
    queryKey: ['watchlists'],
    queryFn: () => invoke<Watchlist[]>('watchlist:list')
  })

  const saveList = useMutation({
    mutationFn: (list: Watchlist) => invoke<Watchlist[]>('watchlist:save', list),
    onSuccess: (lists) => queryClient.setQueryData(['watchlists'], lists)
  })

  const lists = listsQuery.data ?? []
  const active = lists.find((l) => l.id === activeId) ?? lists[0]
  const symbols = useMemo(() => active?.symbols ?? [], [active])

  const quoteResults = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['quote', symbol],
      queryFn: () => invoke<Quote>('quote:get', { symbol }),
      refetchInterval: 60_000,
      retry: 0
    }))
  })
  const metricResults = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['metric', symbol],
      queryFn: () => invoke<Metric52w>('metric:get', { symbol }),
      staleTime: 24 * 3600_000,
      retry: 0
    }))
  })
  const quoteMap = new Map<string, Quote>()
  symbols.forEach((s, i) => {
    const q = quoteResults[i]?.data
    if (q) quoteMap.set(s, q)
  })
  const metricMap = new Map<string, Metric52w>()
  symbols.forEach((s, i) => {
    const m = metricResults[i]?.data
    if (m) metricMap.set(s, m)
  })

  // Sorting uses the 60s REST snapshots; manual order enables drag-to-reorder.
  const sorted = useMemo(() => {
    if (sortKey === 'manual') return symbols
    const val = (s: string): number | string => {
      const q = quoteMap.get(s)
      switch (sortKey) {
        case 'symbol':
          return s
        case 'last':
          return q?.current ?? -Infinity
        case 'change':
          return q?.change ?? -Infinity
        case 'percentChange':
          return q?.percentChange ?? -Infinity
        case 'volume':
          return q?.volume ?? -Infinity
        default:
          return 0
      }
    }
    return [...symbols].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDesc ? -cmp : cmp
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, sortKey, sortDesc, quoteResults])

  if (listsQuery.isLoading) return <LoadingState label="watchlists" />
  if (listsQuery.isError) return <ErrorState error={listsQuery.error as Error} />
  if (!active) return <LoadingState label="watchlists" />

  const selectList = (id: string): void => {
    setActiveId(id)
    window.localStorage.setItem('watchlist-active', id)
  }

  // Header click cycles desc → asc → back to manual order.
  const setSort = (key: SortKey): void => {
    if (sortKey === key && sortDesc) {
      setSortDesc(false)
    } else if (sortKey === key) {
      setSortKey('manual')
    } else {
      setSortKey(key)
      setSortDesc(key !== 'symbol')
    }
  }

  const reorder = (from: number, to: number): void => {
    if (from === to) return
    const next = [...symbols]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    saveList.mutate({ ...active, symbols: next })
  }

  const exportCsv = async (): Promise<void> => {
    const rows = sorted.map((symbol) => {
      const q = quoteMap.get(symbol)
      return [symbol, q?.current ?? null, q?.change ?? null, q?.percentChange ?? null, q?.volume ?? null]
    })
    try {
      const result = await invoke<{ saved: boolean; path?: string }>('export:csv', {
        name: `${active.name}-watchlist.csv`,
        headers: ['symbol', 'last', 'change', 'percent_change', 'volume'],
        rows
      })
      setExportMsg(result.saved ? `Exported → ${result.path}` : 'Export cancelled.')
    } catch (err) {
      setExportMsg((err as Error).message)
    }
  }

  // Cheap windowing for big lists; small lists render everything.
  const virtual = sorted.length > VIRTUALIZE_AT
  const viewCount = 40
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5) : 0
  const visible = virtual ? sorted.slice(start, start + viewCount) : sorted

  const headers: Array<[SortKey, string, string]> = [
    ['symbol', 'SYMBOL', 'text-left'],
    ['last', 'LAST', 'text-right'],
    ['change', 'CHG', 'text-right'],
    ['percentChange', '%CHG', 'text-right'],
    ['volume', 'VOL', 'text-right']
  ]

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border p-2">
        <select
          value={active.id}
          onChange={(e) => selectList(e.target.value)}
          className="border border-term-border bg-term-bg px-1 py-0.5 text-[11px] text-term-amber outline-none"
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          className="border border-term-border px-2 py-0.5 text-[10px] uppercase text-term-dim hover:text-term-amber"
          onClick={() => {
            const name = window.prompt('New watchlist name:')
            if (name?.trim()) {
              void invoke<Watchlist[]>('watchlist:create', { name: name.trim() }).then((updated) => {
                queryClient.setQueryData(['watchlists'], updated)
                const created = updated[updated.length - 1]
                if (created) selectList(created.id)
              })
            }
          }}
        >
          + List
        </button>
        {lists.length > 1 && (
          <button
            className="border border-term-border px-2 py-0.5 text-[10px] uppercase text-term-dim hover:text-term-down"
            onClick={() => {
              if (window.confirm(`Delete watchlist "${active.name}"?`)) {
                void invoke<Watchlist[]>('watchlist:delete', { id: active.id }).then((updated) => {
                  queryClient.setQueryData(['watchlists'], updated)
                  if (updated[0]) selectList(updated[0].id)
                })
              }
            }}
          >
            Delete
          </button>
        )}
        <AddSymbol
          onAdd={(symbol) => {
            if (!symbols.includes(symbol)) saveList.mutate({ ...active, symbols: [...symbols, symbol] })
          }}
        />
        <button
          className="ml-auto border border-term-border px-2 py-0.5 text-[10px] uppercase text-term-dim hover:text-term-amber"
          onClick={() => void exportCsv()}
        >
          Export CSV
        </button>
      </div>

      {exportMsg && <div className="shrink-0 px-2 py-0.5 text-[10px] text-term-dim">{exportMsg}</div>}

      <div className="grid shrink-0 grid-cols-[70px_80px_75px_70px_70px_1fr_1fr_20px] gap-2 border-b border-term-border px-2 py-1 text-[9px] uppercase text-term-dim">
        {headers.map(([key, label, align]) => (
          <button key={key} className={align + ' uppercase hover:text-term-amber'} onClick={() => setSort(key)}>
            {label}
            {sortKey === key ? (sortDesc ? ' ▼' : ' ▲') : ''}
          </button>
        ))}
        <span className="px-1">DAY RANGE</span>
        <span className="px-1">52W</span>
        <span />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onScroll={(e) => virtual && setScrollTop(e.currentTarget.scrollTop)}>
        {virtual && <div style={{ height: start * ROW_HEIGHT }} />}
        {visible.map((symbol) => {
          const realIndex = symbols.indexOf(symbol)
          return (
            <WatchRow
              key={symbol}
              symbol={symbol}
              quote={quoteMap.get(symbol)}
              metric={metricMap.get(symbol)}
              draggable={sortKey === 'manual'}
              onDragStart={() => (dragFrom.current = realIndex)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null) reorder(dragFrom.current, realIndex)
                dragFrom.current = null
              }}
              onRemove={() => saveList.mutate({ ...active, symbols: symbols.filter((s) => s !== symbol) })}
            />
          )
        })}
        {virtual && <div style={{ height: Math.max(0, (sorted.length - start - visible.length)) * ROW_HEIGHT }} />}
        {symbols.length === 0 && (
          <div className="p-4 text-[11px] uppercase text-term-dim">Empty list — add a symbol above.</div>
        )}
      </div>

      <div className="shrink-0 border-t border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim">
        {symbols.length} symbols · {sortKey === 'manual' ? 'drag rows to reorder' : 'sorted — click header again for manual order'} · click row → active panel
      </div>
    </div>
  )
}
