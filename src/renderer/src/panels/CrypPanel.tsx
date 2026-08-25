import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts'
import type { CryptoDetail, CryptoMarkets, CryptoMarketRow } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { useLiveTick } from '../lib/live'
import { formatFinancialNumber, fmtPct, upDownClass } from '../lib/format'
import { Flash, Sparkline } from '../components/LiveBits'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { paneOptions, COLORS } from '../components/chart/chartTheme'

const ROW_HEIGHT = 30
/** CoinGecko ids that also tick live on the Finnhub WS */
const LIVE_MAP: Record<string, string> = { bitcoin: 'BTC-USD', ethereum: 'ETH-USD' }

function adaptivePrice(v: number): string {
  const decimals = v >= 1000 ? 2 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)
}

function CryptoRow({ row, onOpen }: { row: CryptoMarketRow; onOpen: () => void }): JSX.Element {
  const live = useLiveTick(LIVE_MAP[row.id] ?? null)
  const price = live?.price ?? row.price
  return (
    <button
      className="grid w-full grid-cols-[36px_1fr_100px_70px_70px_90px_90px_100px] items-center gap-2 border-b border-term-border px-2 text-left text-[11px] hover:bg-[#121212]"
      style={{ height: ROW_HEIGHT }}
      onClick={onOpen}
    >
      <span className="text-term-dim">{row.rank}</span>
      <span className="truncate">
        <span className="font-bold text-term-amber">{row.symbol}</span>
        <span className="ml-2 text-term-dim">{row.name}</span>
        {LIVE_MAP[row.id] && <span className="ml-1 text-[8px] uppercase text-term-up">live</span>}
      </span>
      <Flash flashSeq={live?.seq} dir={live?.dir ?? 0} className="text-right text-term-text">
        {adaptivePrice(price)}
      </Flash>
      <span className={'text-right ' + upDownClass(row.change24hPct ?? 0)}>{row.change24hPct !== null ? fmtPct(row.change24hPct) : '—'}</span>
      <span className={'text-right ' + upDownClass(row.change7dPct ?? 0)}>{row.change7dPct !== null ? fmtPct(row.change7dPct) : '—'}</span>
      <span className="text-right text-term-text">{formatFinancialNumber(row.marketCap)}</span>
      <span className="text-right text-term-dim">{formatFinancialNumber(row.volume24h)}</span>
      <span className="pl-2">
        <Sparkline values={row.sparkline7d} width={90} height={22} />
      </span>
    </button>
  )
}

function DetailView({ id, onBack }: { id: string; onBack: () => void }): JSX.Element {
  const [days, setDays] = useState<1 | 7 | 30 | 365>(7)
  const chartRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<IChartApi>()

  const detail = useQuery({
    queryKey: ['crypto-detail', id, days],
    queryFn: () => invoke<CryptoDetail>('crypto:detail', { id, days }),
    staleTime: 10 * 60_000,
    retry: 0
  })

  useEffect(() => {
    if (!chartRef.current || !detail.data || detail.data.prices.length === 0) return
    apiRef.current?.remove()
    const chart = createChart(chartRef.current, paneOptions(true, days <= 7))
    apiRef.current = chart
    // CoinGecko provides prices, not OHLC at this granularity — line/area only, no fake candles.
    const series = chart.addAreaSeries({
      lineColor: COLORS.amber,
      topColor: 'rgba(255,152,0,0.25)',
      bottomColor: 'rgba(255,152,0,0.02)',
      lineWidth: 2
    })
    series.setData(detail.data.prices.map(([t, p]) => ({ time: Math.floor(t / 1000) as UTCTimestamp, value: p })))
    chart.timeScale().fitContent()
    return () => {
      apiRef.current?.remove()
      apiRef.current = undefined
    }
  }, [detail.data, days])

  const d = detail.data
  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1">
        <button className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber" onClick={onBack}>
          ← Top 100
        </button>
        <span className="text-[11px] font-bold text-term-amber">{d ? `${d.name} (${d.symbol})` : id}</span>
        {([1, 7, 30, 365] as const).map((n) => (
          <button
            key={n}
            onClick={() => setDays(n)}
            className={
              'border px-2 py-0.5 text-[9px] uppercase ' +
              (days === n ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {n === 1 ? '1D' : n === 365 ? '1Y' : `${n}D`}
          </button>
        ))}
      </div>
      {detail.isLoading && <LoadingState label={id} />}
      {detail.isError && <ErrorState error={detail.error as Error} />}
      <div ref={chartRef} className="min-h-0 flex-1" />
      {d && (
        <div className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1 border-t border-term-border p-2 text-[11px] md:grid-cols-6">
          {[
            ['Rank', d.rank !== null ? '#' + d.rank : '—'],
            ['Mkt cap', formatFinancialNumber(d.marketCap)],
            ['ATH', d.ath !== null ? adaptivePrice(d.ath) : '—'],
            ['vs ATH', d.athChangePct !== null ? fmtPct(d.athChangePct) : '—'],
            ['Circulating', formatFinancialNumber(d.circulatingSupply)],
            ['Total supply', d.totalSupply !== null ? formatFinancialNumber(d.totalSupply) : '∞']
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-term-border py-0.5">
              <span className="uppercase text-term-dim">{label}</span>
              <span className="text-term-text">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type SortKey = 'rank' | 'price' | 'change24hPct' | 'change7dPct' | 'marketCap' | 'volume24h'

export default function CrypPanel(): JSX.Element {
  const [detail, setDetail] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDesc, setSortDesc] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)

  const markets = useQuery({
    queryKey: ['crypto-markets'],
    queryFn: () => invoke<CryptoMarkets>('crypto:markets'),
    refetchInterval: 60_000,
    staleTime: 55_000,
    retry: 0
  })

  const rows = useMemo(() => {
    const list = markets.data?.rows ?? []
    return [...list].sort((a, b) => {
      const va = a[sortKey] ?? -Infinity
      const vb = b[sortKey] ?? -Infinity
      return sortDesc ? (vb as number) - (va as number) : (va as number) - (vb as number)
    })
  }, [markets.data, sortKey, sortDesc])

  if (detail) return <DetailView id={detail} onBack={() => setDetail(null)} />
  if (markets.isLoading) return <LoadingState label="crypto markets" />
  if (markets.isError) return <ErrorState error={markets.error as Error} />

  const header = (key: SortKey, label: string, align = 'text-right'): JSX.Element => (
    <button
      className={align + ' uppercase hover:text-term-amber'}
      onClick={() => {
        if (sortKey === key) setSortDesc((v) => !v)
        else {
          setSortKey(key)
          setSortDesc(key !== 'rank')
        }
      }}
    >
      {label}
      {sortKey === key ? (sortDesc ? ' ▼' : ' ▲') : ''}
    </button>
  )

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5)
  const visible = rows.slice(start, start + 30)

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1">
        <span className="text-[11px] font-bold text-term-amber">CRYP — TOP 100</span>
        <button
          className="ml-auto border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
          onClick={() =>
            void invoke('export:csv', {
              name: 'crypto-top100.csv',
              headers: ['rank', 'symbol', 'name', 'price_usd', 'change_24h_pct', 'change_7d_pct', 'market_cap', 'volume_24h'],
              rows: rows.map((r) => [r.rank, r.symbol, r.name, r.price, r.change24hPct, r.change7dPct, r.marketCap, r.volume24h])
            }).catch(() => undefined)
          }
        >
          CSV
        </button>
        <span className="text-[8px] uppercase text-term-dim">
          {markets.data?.fromCache ? 'CACHED · ' : ''}60s poll · BTC/ETH live via WS · data by CoinGecko
        </span>
      </div>
      <div className="grid shrink-0 grid-cols-[36px_1fr_100px_70px_70px_90px_90px_100px] gap-2 border-b border-term-border px-2 py-1 text-[9px] text-term-dim">
        {header('rank', '#', 'text-left')}
        <span className="uppercase">Name</span>
        {header('price', 'Price')}
        {header('change24hPct', '24h')}
        {header('change7dPct', '7d')}
        {header('marketCap', 'Mkt cap')}
        {header('volume24h', 'Volume')}
        <span className="pl-2 uppercase">7d</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: start * ROW_HEIGHT }} />
        {visible.map((row) => (
          <CryptoRow key={row.id} row={row} onOpen={() => setDetail(row.id)} />
        ))}
        <div style={{ height: Math.max(0, (rows.length - start - visible.length)) * ROW_HEIGHT }} />
      </div>
    </div>
  )
}
