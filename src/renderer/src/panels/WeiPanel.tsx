import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { IntlIndexQuote, Quote } from '../../../shared/types'
import { isExchangeOpen } from '../../../shared/marketHours'
import { invoke } from '../lib/ipc'
import { useLiveTick } from '../lib/live'
import { fmtPct, fmtPrice, fmtSigned, upDownClass } from '../lib/format'
import { Flash, Sparkline } from '../components/LiveBits'
import { ErrorState } from '../components/PanelStates'

interface CardDef {
  name: string
  /** streamed ETF proxy (US) — mutually exclusive with tdSymbol */
  proxy?: string
  /** Twelve Data index symbol (international, delayed) */
  tdSymbol?: string
  exchange: string
  region: 'AMERICAS' | 'EMEA' | 'APAC'
}

const CARDS: CardDef[] = [
  { name: 'S&P 500', proxy: 'SPY', exchange: 'NYSE', region: 'AMERICAS' },
  { name: 'NASDAQ 100', proxy: 'QQQ', exchange: 'NYSE', region: 'AMERICAS' },
  { name: 'DOW JONES', proxy: 'DIA', exchange: 'NYSE', region: 'AMERICAS' },
  { name: 'RUSSELL 2000', proxy: 'IWM', exchange: 'NYSE', region: 'AMERICAS' },
  { name: 'AEX', tdSymbol: 'AEX', exchange: 'AMS', region: 'EMEA' },
  { name: 'DAX', tdSymbol: 'DAX', exchange: 'FRA', region: 'EMEA' },
  { name: 'FTSE 100', tdSymbol: 'FTSE', exchange: 'LSE', region: 'EMEA' },
  { name: 'CAC 40', tdSymbol: 'CAC', exchange: 'PAR', region: 'EMEA' },
  { name: 'NIKKEI 225', tdSymbol: 'N225', exchange: 'TSE', region: 'APAC' },
  { name: 'HANG SENG', tdSymbol: 'HSI', exchange: 'HKEX', region: 'APAC' },
  { name: 'ASX 200', tdSymbol: 'XJO', exchange: 'ASX', region: 'APAC' }
]

function MarketDot({ exchange, now }: { exchange: string; now: Date }): JSX.Element {
  const open = isExchangeOpen(exchange, now)
  return (
    <span
      className={'dot inline-block h-2 w-2 ' + (open ? 'bg-term-up' : 'bg-[#3a3a3a]')}
      title={exchange + (open ? ' open' : ' closed')}
    />
  )
}

function CardShell({
  def,
  now,
  children
}: {
  def: CardDef
  now: Date
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="border border-term-border bg-term-bg p-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase text-term-text">
          {def.name}
          {def.proxy && <span className="ml-1 font-normal text-term-dim">· {def.proxy} PROXY</span>}
        </span>
        <MarketDot exchange={def.exchange} now={now} />
      </div>
      {children}
    </div>
  )
}

function ProxyCard({ def, now }: { def: CardDef; now: Date }): JSX.Element {
  const symbol = def.proxy as string
  const live = useLiveTick(symbol)
  const snapshot = useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => invoke<Quote>('quote:get', { symbol }),
    refetchInterval: 60_000,
    retry: 0
  })
  const spark = useQuery({
    queryKey: ['sparkline', symbol],
    queryFn: () => invoke<number[]>('wei:sparkline', { symbol }),
    staleTime: 10 * 60_000,
    retry: 0
  })

  const q = snapshot.data
  const last = live?.price ?? q?.current
  const change = last !== undefined && q?.prevClose ? last - q.prevClose : q?.change
  const pct = change !== undefined && q?.prevClose ? (change / q.prevClose) * 100 : q?.percentChange

  return (
    <CardShell def={def} now={now}>
      {snapshot.isError && !q ? (
        <div className="mt-1 font-mono text-[10px] text-term-dim">{(snapshot.error as Error).message}</div>
      ) : (
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="font-mono">
            <Flash flashSeq={live?.seq} dir={live?.dir ?? 0} className="text-[16px] font-bold text-term-text">
              {last !== undefined ? fmtPrice(last) : '—'}
            </Flash>
            <div className={'text-[10px] ' + upDownClass(change ?? 0)}>
              {change !== undefined ? fmtSigned(change) : '—'} {pct !== undefined ? fmtPct(pct) : ''}
            </div>
          </div>
          {spark.data && <Sparkline values={spark.data} />}
        </div>
      )}
    </CardShell>
  )
}

function IntlCard({ def, now }: { def: CardDef; now: Date }): JSX.Element {
  const tdSymbol = def.tdSymbol as string
  const quote = useQuery({
    queryKey: ['wei-intl', tdSymbol],
    queryFn: () => invoke<IntlIndexQuote>('wei:international', { symbol: tdSymbol }),
    refetchInterval: 90_000,
    retry: 0
  })
  const spark = useQuery({
    queryKey: ['sparkline', tdSymbol],
    queryFn: () => invoke<number[]>('wei:sparkline', { symbol: tdSymbol }),
    staleTime: 10 * 60_000,
    retry: 0,
    enabled: quote.isSuccess
  })

  const q = quote.data
  return (
    <CardShell def={def} now={now}>
      {quote.isError ? (
        <div className="mt-1 font-mono text-[10px] text-term-dim">
          {(quote.error as Error).name === 'UNSUPPORTED'
            ? 'Not licensed on free tier'
            : (quote.error as Error).message}
        </div>
      ) : q ? (
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="font-mono">
            <div className="text-[16px] font-bold text-term-text">{fmtPrice(q.last)}</div>
            <div className={'text-[10px] ' + upDownClass(q.change)}>
              {fmtSigned(q.change)} {fmtPct(q.percentChange)}
              <span className="ml-1 uppercase text-term-dim">DELAYED</span>
            </div>
          </div>
          {spark.data && <Sparkline values={spark.data} />}
        </div>
      ) : (
        <div className="mt-1 font-mono text-[10px] uppercase text-term-dim">Loading…</div>
      )}
    </CardShell>
  )
}

export default function WeiPanel(): JSX.Element {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Surface the no-key state once instead of on every card.
  const probe = useQuery({
    queryKey: ['quote', 'SPY'],
    queryFn: () => invoke<Quote>('quote:get', { symbol: 'SPY' }),
    retry: 0
  })
  if (probe.isError && (probe.error as Error).name === 'NO_KEY') {
    return <ErrorState error={probe.error as Error} />
  }

  const regions: Array<'AMERICAS' | 'EMEA' | 'APAC'> = ['AMERICAS', 'EMEA', 'APAC']
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="font-mono text-[14px] font-bold text-term-amber">WEI — WORLD EQUITY INDICES</div>
      {regions.map((region) => (
        <div key={region} className="mt-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-term-dim">{region}</div>
          <div className="mt-1 grid grid-cols-2 gap-2 2xl:grid-cols-4">
            {CARDS.filter((c) => c.region === region).map((def) =>
              def.proxy ? (
                <ProxyCard key={def.name} def={def} now={now} />
              ) : (
                <IntlCard key={def.name} def={def} now={now} />
              )
            )}
          </div>
        </div>
      ))}
      <div className="mt-3 font-mono text-[9px] uppercase text-term-dim">
        US cards stream ETF proxies live · international indices are Twelve Data REST, delayed
      </div>
    </div>
  )
}
