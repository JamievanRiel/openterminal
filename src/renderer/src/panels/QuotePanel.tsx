import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Metric52w, Quote } from '../../../shared/types'
import { usSessionState } from '../../../shared/marketHours'
import { invoke } from '../lib/ipc'
import { useLiveTick } from '../lib/live'
import { fmtCompact, fmtPct, fmtPrice, fmtSigned, fmtTimeET, upDownClass } from '../lib/format'
import { Flash, RangeBar } from '../components/LiveBits'
import { ErrorState, LoadingState } from '../components/PanelStates'

export default function QuotePanel({ ticker }: { ticker: string }): JSX.Element {
  const live = useLiveTick(ticker)
  const [session, setSession] = useState(usSessionState())
  useEffect(() => {
    const id = window.setInterval(() => setSession(usSessionState()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const quote = useQuery({
    queryKey: ['quote', ticker],
    queryFn: () => invoke<Quote>('quote:get', { symbol: ticker }),
    refetchInterval: session === 'open' ? 30_000 : 5 * 60_000,
    retry: 0
  })
  const metric = useQuery({
    queryKey: ['metric', ticker],
    queryFn: () => invoke<Metric52w>('metric:get', { symbol: ticker }),
    staleTime: 24 * 3600_000,
    retry: 0
  })

  if (quote.isLoading) return <LoadingState label={ticker} />
  if (quote.isError) return <ErrorState error={quote.error as Error} />

  const q = quote.data as Quote
  const isCrypto = ticker.endsWith('-USD')
  const marketLive = session === 'open' || isCrypto
  const last = live?.price ?? q.current
  const change = q.prevClose ? last - q.prevClose : q.change
  const pct = q.prevClose ? (change / q.prevClose) * 100 : q.percentChange
  const decimals = last < 5 ? 4 : 2
  const volume = q.volume !== undefined ? q.volume + (live?.sessionVolume ?? 0) : live?.sessionVolume
  const lastTradeTs = live?.ts ?? q.timestamp
  const dayHigh = live ? Math.max(q.high, live.price) : q.high
  const dayLow = live ? Math.min(q.low, live.price) : q.low

  const grid: Array<[string, string, string?]> = [
    ['OPEN', fmtPrice(q.open, decimals)],
    ['PREV CLOSE', fmtPrice(q.prevClose, decimals)],
    ['DAY HIGH', fmtPrice(dayHigh, decimals), 'text-term-up'],
    ['DAY LOW', fmtPrice(dayLow, decimals), 'text-term-down']
  ]

  return (
    <div className="h-full overflow-y-auto p-3 font-mono">
      <div className="flex items-baseline justify-between">
        <div className="text-[14px] font-bold text-term-amber">{ticker} — QUOTE MONITOR</div>
        <div className="flex items-center gap-2 text-[10px] uppercase">
          {session === 'pre' && <span className="border border-term-amber px-1 text-term-amber">PRE</span>}
          {session === 'post' && <span className="border border-term-amber px-1 text-term-amber">POST</span>}
          {q.stale && <span className="text-term-amber">DELAYED</span>}
          {q.source === 'alpaca' && <span className="text-term-dim">IEX</span>}
        </div>
      </div>

      {!marketLive && session !== 'pre' && session !== 'post' && (
        <div className="mt-1 text-[10px] uppercase text-term-dim">MKT CLOSED — LAST CLOSE</div>
      )}

      <div className="mt-2 flex items-baseline gap-4">
        <Flash
          flashSeq={marketLive ? live?.seq : undefined}
          dir={live?.dir ?? 0}
          className={'text-[34px] font-bold leading-none ' + (marketLive ? 'text-term-amber' : 'text-term-amberDim')}
        >
          {fmtPrice(last, decimals)}
        </Flash>
        <div className={'text-[14px] ' + upDownClass(change)}>
          {fmtSigned(change, decimals)}
          <span className="ml-2">{fmtPct(pct)}</span>
        </div>
      </div>

      {q.bid !== undefined && q.ask !== undefined && (
        <div className="mt-2 flex gap-6 text-[12px]">
          <span>
            <span className="uppercase text-term-dim">BID </span>
            <span className="text-term-text">{fmtPrice(q.bid, decimals)}</span>
            {q.bidSize !== undefined && <span className="text-term-dim"> ×{q.bidSize}</span>}
          </span>
          <span>
            <span className="uppercase text-term-dim">ASK </span>
            <span className="text-term-text">{fmtPrice(q.ask, decimals)}</span>
            {q.askSize !== undefined && <span className="text-term-dim"> ×{q.askSize}</span>}
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
        {grid.map(([label, value, cls]) => (
          <div key={label} className="flex justify-between border-b border-term-border py-0.5">
            <span className="uppercase text-term-dim">{label}</span>
            <span className={cls ?? 'text-term-text'}>{value}</span>
          </div>
        ))}
        <div className="flex justify-between border-b border-term-border py-0.5">
          <span className="uppercase text-term-dim">VOLUME</span>
          <span className="text-term-text">{volume !== undefined && volume > 0 ? fmtCompact(volume) : '—'}</span>
        </div>
        <div className="flex justify-between border-b border-term-border py-0.5">
          <span className="uppercase text-term-dim">LAST TRADE</span>
          <span className="text-term-text">{fmtTimeET(lastTradeTs)}</span>
        </div>
      </div>

      <div className="mt-4 text-[10px] uppercase text-term-dim">
        Day range {fmtPrice(dayLow, decimals)} – {fmtPrice(dayHigh, decimals)}
      </div>
      <div className="mt-1">
        <RangeBar low={dayLow} high={dayHigh} value={last} />
      </div>

      {metric.data && (
        <>
          <div className="mt-3 text-[10px] uppercase text-term-dim">
            52-week range {fmtPrice(metric.data.low52, decimals)} – {fmtPrice(metric.data.high52, decimals)}
          </div>
          <div className="mt-1">
            <RangeBar low={metric.data.low52} high={metric.data.high52} value={last} />
          </div>
        </>
      )}
    </div>
  )
}
