import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Quote, Watchlist } from '../../../shared/types'
import { usSessionState } from '../../../shared/marketHours'
import { invoke } from '../lib/ipc'
import { cryptoTicking, useLiveTick } from '../lib/live'
import { fmtPct, fmtPrice, upDownClass } from '../lib/format'
import { useWorkspace } from '../state/workspace'
import { Flash } from './LiveBits'

const BASE_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM', 'EUR/USD', 'BTC-USD']

function TapeEntry({ symbol }: { symbol: string }): JSX.Element | null {
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const live = useLiveTick(symbol)
  const snapshot = useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => invoke<Quote>('quote:get', { symbol }),
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 0
  })

  const q = snapshot.data
  if (!q && !live) return null
  const last = live?.price ?? q?.current
  if (last === undefined || !Number.isFinite(last)) return null
  const prevClose = q?.prevClose
  const pct =
    prevClose && prevClose !== 0 ? ((last - prevClose) / prevClose) * 100 : q?.percentChange ?? 0
  const delayed = live?.delayed ?? q?.stale ?? false

  return (
    <button
      className="mx-4 inline-flex items-baseline gap-2 font-mono text-[11px] hover:bg-[#141414]"
      onClick={() => loadTicker(symbol)}
      tabIndex={-1}
    >
      <span className="text-term-amber">{symbol}</span>
      <Flash flashSeq={live?.seq} dir={live?.dir ?? 0} className="text-term-text">
        {fmtPrice(last, last < 5 ? 4 : 2)}
      </Flash>
      <span className={upDownClass(pct)}>{fmtPct(pct)}</span>
      {delayed && <span className="text-[9px] text-term-dim">DELAYED</span>}
    </button>
  )
}

export default function TickerTape(): JSX.Element {
  const [hidden, setHidden] = useState(document.hidden)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const onVisibility = (): void => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    // Re-evaluate the pause condition (market state / crypto activity) every 30s.
    const id = window.setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(id)
    }
  }, [])

  const lists = useQuery({
    queryKey: ['watchlists'],
    queryFn: () => invoke<Watchlist[]>('watchlist:list'),
    staleTime: 30_000
  })
  const watchSymbols = lists.data?.[0]?.symbols ?? []
  const symbols = [...BASE_SYMBOLS, ...watchSymbols.filter((s) => !BASE_SYMBOLS.includes(s))]

  // Marquee pauses when the window is hidden, and outside US hours unless crypto is still ticking.
  const marketActive = usSessionState() !== 'closed'
  const paused = hidden || (!marketActive && !cryptoTicking())

  const strip = symbols.map((symbol) => <TapeEntry key={symbol} symbol={symbol} />)

  return (
    <div className="h-7 shrink-0 overflow-hidden border-b border-term-border bg-term-bg">
      <div className={'marquee flex h-full w-max items-center whitespace-nowrap ' + (paused ? 'paused' : '')}>
        <div className="flex items-center">{strip}</div>
        <div className="flex items-center" aria-hidden>
          {strip}
        </div>
      </div>
    </div>
  )
}
