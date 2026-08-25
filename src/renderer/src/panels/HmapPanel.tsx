import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Quote } from '../../../shared/types'
import { SP500_SECTORS, type SectorDef } from '../../../shared/data/sp500Sectors'
import { invoke } from '../lib/ipc'
import { useLiveTick } from '../lib/live'
import { fmtPct } from '../lib/format'
import { heatColor, squarify } from '../lib/treemap'
import { useWorkspace } from '../state/workspace'

function useSize(): [React.RefObject<HTMLDivElement>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 360 })
  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      // Defer to the next frame — avoids Chrome's "ResizeObserver loop" warning.
      if (r && r.width > 0 && r.height > 0) {
        requestAnimationFrame(() => setSize({ w: r.width, h: r.height }))
      }
    })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, size]
}

function SectorTile({
  sector,
  rect,
  onClick
}: {
  sector: SectorDef
  rect: { x: number; y: number; w: number; h: number }
  onClick: () => void
}): JSX.Element {
  const live = useLiveTick(sector.etf)
  const queryClient = useQueryClient()
  const [pct, setPct] = useState<number | null>(null)
  const quote = queryClient.getQueryData<Quote>(['quote', sector.etf])

  useEffect(() => {
    void queryClient
      .fetchQuery({
        queryKey: ['quote', sector.etf],
        queryFn: () => invoke<Quote>('quote:get', { symbol: sector.etf }),
        staleTime: 60_000
      })
      .then((q) => setPct(q.percentChange))
      .catch(() => undefined)
  }, [sector.etf, queryClient])

  // Live last + snapshot prevClose beats the 60s REST %change during market hours.
  const displayPct =
    live && quote?.prevClose ? ((live.price - quote.prevClose) / quote.prevClose) * 100 : pct

  const big = rect.w > 110 && rect.h > 50
  return (
    <button
      className="absolute overflow-hidden border border-black text-left transition-colors duration-500 hover:brightness-125"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, backgroundColor: heatColor(displayPct) }}
      onClick={onClick}
      title={`${sector.name} (${sector.etf}) — drill down`}
    >
      <div className="p-1 font-mono">
        <div className={'font-bold uppercase text-white ' + (big ? 'text-[11px]' : 'text-[8px]')}>
          {big ? sector.name : sector.etf}
        </div>
        <div className={'text-white/80 ' + (big ? 'text-[10px]' : 'text-[8px]')}>
          {displayPct !== null ? fmtPct(displayPct) : '…'}
        </div>
      </div>
    </button>
  )
}

function HoldingTile({
  symbol,
  rect,
  pct,
  onClick
}: {
  symbol: string
  rect: { x: number; y: number; w: number; h: number }
  pct: number | null
  onClick: () => void
}): JSX.Element {
  return (
    <button
      className="absolute overflow-hidden border border-black text-left hover:brightness-125"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, backgroundColor: heatColor(pct) }}
      onClick={onClick}
    >
      <div className="p-1 font-mono">
        <div className="text-[10px] font-bold text-white">{symbol}</div>
        <div className="text-[9px] text-white/80">{pct !== null ? fmtPct(pct) : '…'}</div>
      </div>
    </button>
  )
}

export default function HmapPanel(): JSX.Element {
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const [drill, setDrill] = useState<SectorDef | null>(null)
  const [ref, size] = useSize()

  // Drill-down: ≤10 cache-first quote calls, only for the opened sector.
  const holdingQueries = useQueries({
    queries: (drill?.holdings ?? []).map((symbol) => ({
      queryKey: ['quote', symbol],
      queryFn: () => invoke<Quote>('quote:get', { symbol }),
      staleTime: 60_000,
      retry: 0
    }))
  })

  const rects = drill
    ? squarify(drill.holdings.map(() => 1), size.w, size.h) // equal-weight tiles for top-10 holdings
    : squarify(SP500_SECTORS.map((s) => s.weight), size.w, size.h)

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1">
        <span className="text-[11px] font-bold text-term-amber">HMAP — S&P 500 SECTORS</span>
        {drill && (
          <>
            <button className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber" onClick={() => setDrill(null)}>
              ← All sectors
            </button>
            <span className="text-[10px] uppercase text-term-text">
              {drill.name} · top {drill.holdings.length} holdings
            </span>
          </>
        )}
        <span className="ml-auto text-[8px] uppercase text-term-dim">
          {drill ? 'click holding → link group' : 'live ETF proxies · click sector to drill down'}
        </span>
      </div>
      <div ref={ref} className="relative min-h-0 flex-1">
        {!drill &&
          SP500_SECTORS.map((sector, i) => (
            <SectorTile key={sector.etf} sector={sector} rect={rects[i]} onClick={() => setDrill(sector)} />
          ))}
        {drill &&
          drill.holdings.map((symbol, i) => (
            <HoldingTile
              key={symbol}
              symbol={symbol}
              rect={rects[i]}
              pct={holdingQueries[i]?.data?.percentChange ?? null}
              onClick={() => loadTicker(symbol)}
            />
          ))}
      </div>
    </div>
  )
}
