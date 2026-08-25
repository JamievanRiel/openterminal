import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { KeyStatus, OptionChain, OptionSide, OptionsExpiration, Quote } from '../../../shared/types'
import { invoke, type IpcError } from '../lib/ipc'
import { fmtCompact, fmtPrice } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { useWorkspace } from '../state/workspace'

const ROW_HEIGHT = 24

interface AppSettings {
  optEnabled: boolean
}

function SideCells({ side, showGreeks, right }: { side: OptionSide | null; showGreeks: boolean; right: boolean }): JSX.Element {
  const cells: Array<string> = side
    ? [
        side.bid !== null ? fmtPrice(side.bid) : '—',
        side.ask !== null ? fmtPrice(side.ask) : '—',
        side.last !== null ? fmtPrice(side.last) : '—',
        side.volume !== null ? fmtCompact(side.volume) : '—',
        side.openInterest !== null ? fmtCompact(side.openInterest) : '—',
        ...(showGreeks
          ? [side.iv !== null ? (side.iv * 100).toFixed(1) + '%' : '—', side.delta !== null ? side.delta.toFixed(2) : '—']
          : [])
      ]
    : new Array(showGreeks ? 7 : 5).fill('')
  const ordered = right ? cells : [...cells].reverse()
  return (
    <>
      {ordered.map((c, i) => (
        <span key={i} className="text-right text-term-text">
          {c}
        </span>
      ))}
    </>
  )
}

export default function OptPanel({ ticker }: { ticker: string }): JSX.Element {
  const applyCommand = useWorkspace((s) => s.applyCommand)
  const [expiration, setExpiration] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [scrollTop, setScrollTop] = useState(0)

  const settings = useQuery({ queryKey: ['app-settings'], queryFn: () => invoke<AppSettings>('settings:get') })
  const keyStatus = useQuery({ queryKey: ['key-status'], queryFn: () => invoke<KeyStatus[]>('keys:status') })
  const polygonConfigured = keyStatus.data?.find((k) => k.provider === 'polygon')?.configured ?? false
  const enabled = Boolean(settings.data?.optEnabled) && polygonConfigured

  const expirations = useQuery({
    queryKey: ['opt-expirations', ticker],
    queryFn: () => invoke<OptionsExpiration[]>('options:expirations', { symbol: ticker }),
    staleTime: 3600_000,
    retry: 0,
    enabled
  })
  const activeExp = expiration ?? expirations.data?.[0]?.date ?? null
  const chain = useQuery({
    queryKey: ['opt-chain', ticker, activeExp],
    queryFn: () => invoke<OptionChain>('options:chain', { symbol: ticker, expiration: activeExp }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 0,
    enabled: enabled && activeExp !== null
  })
  const underlying = useQuery({
    queryKey: ['quote', ticker],
    queryFn: () => invoke<Quote>('quote:get', { symbol: ticker }),
    staleTime: 60_000,
    retry: 0,
    enabled
  })

  const atmIndex = useMemo(() => {
    const rows = chain.data?.rows ?? []
    const px = underlying.data?.current
    if (rows.length === 0 || !px) return Math.floor(rows.length / 2)
    let best = 0
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].strike - px) < Math.abs(rows[best].strike - px)) best = i
    }
    return best
  }, [chain.data, underlying.data])

  if (!enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center font-mono">
        <div className="text-[14px] font-bold text-term-amber">OPT — OPTIONS CHAIN</div>
        <div className="max-w-md text-[11px] leading-relaxed text-term-text">
          The options chain shows calls and puts by expiration with bid/ask, volume and open interest, centered on the
          at-the-money strike. It needs a <span className="text-term-amber">Polygon.io</span> API key (options data is a
          paid Polygon subscription; free keys are delayed and limited).
        </div>
        <div className="text-[10px] uppercase text-term-dim">
          {polygonConfigured ? 'Key found — enable the OPT feature flag in SET → Behavior.' : 'Add a Polygon key in SET → API keys, then enable OPT in SET → Behavior.'}
        </div>
        <button
          className="mt-1 border border-term-border px-3 py-1 text-[10px] uppercase text-term-amber hover:bg-[#181206]"
          onClick={() => applyCommand('SET', null, false)}
        >
          Open SET →
        </button>
      </div>
    )
  }

  if (expirations.isLoading) return <LoadingState label={`${ticker} expirations`} />
  if (expirations.isError) return <ErrorState error={expirations.error as IpcError} />

  const showGreeks = chain.data?.hasGreeks ?? false
  const cols = showGreeks ? 7 : 5
  const grid = `repeat(${cols}, minmax(52px, 1fr)) 74px repeat(${cols}, minmax(52px, 1fr))`
  const headerCells = showGreeks
    ? ['Bid', 'Ask', 'Last', 'Vol', 'OI', 'IV', 'Δ']
    : ['Bid', 'Ask', 'Last', 'Vol', 'OI']
  const rows = chain.data?.rows ?? []
  const start = rows.length > 60 ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10) : 0
  const visible = rows.length > 60 ? rows.slice(start, start + 50) : rows

  const copyOcc = (side: OptionSide | null): void => {
    if (!side?.occSymbol) return
    void navigator.clipboard.writeText(side.occSymbol).then(() => {
      setToast(`Copied ${side.occSymbol}`)
      window.setTimeout(() => setToast(''), 2000)
    })
  }

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-term-border px-2 py-1">
        <span className="mr-1 text-[11px] font-bold text-term-amber">{ticker} — OPT</span>
        {(expirations.data ?? []).slice(0, 10).map((e) => (
          <button
            key={e.date}
            onClick={() => setExpiration(e.date)}
            className={
              'border px-1.5 py-0.5 text-[9px] ' +
              (activeExp === e.date ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
            title={`${e.contractCount} contracts`}
          >
            {e.date.slice(5)}
          </button>
        ))}
        {chain.data?.delayed && <span className="ml-2 text-[9px] uppercase text-term-dim">DELAYED</span>}
        {underlying.data && (
          <span className="ml-auto text-[10px] text-term-dim">
            spot <span className="text-term-amber">{fmtPrice(underlying.data.current)}</span> · click row copies OCC symbol
          </span>
        )}
      </div>
      {toast && <div className="shrink-0 bg-[#181206] px-2 py-0.5 text-[10px] text-term-amber">{toast}</div>}
      {chain.isLoading && <LoadingState label={`${ticker} ${activeExp ?? ''} chain`} />}
      {chain.isError && <ErrorState error={chain.error as IpcError} />}
      {chain.data && (
        <>
          <div className="grid shrink-0 items-center gap-1 border-b border-term-border px-2 py-1 text-[8px] uppercase text-term-dim" style={{ gridTemplateColumns: grid }}>
            {[...headerCells].reverse().map((h, i) => (
              <span key={'c' + i} className="text-right">
                {h}
              </span>
            ))}
            <span className="text-center font-bold text-term-text">Strike</span>
            {headerCells.map((h, i) => (
              <span key={'p' + i} className="text-right">
                {h}
              </span>
            ))}
          </div>
          <div className="grid shrink-0 px-2 text-[8px] uppercase text-term-dim" style={{ gridTemplateColumns: '1fr 74px 1fr' }}>
            <span className="text-center text-term-up">CALLS</span>
            <span />
            <span className="text-center text-term-down">PUTS</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
            <div style={{ height: start * ROW_HEIGHT }} />
            {visible.map((row, vi) => {
              const i = start + vi
              const isAtm = i === atmIndex
              return (
                <div key={row.strike}>
                  {isAtm && <div className="h-[2px] bg-term-amber opacity-70" title="At the money" />}
                  <div
                    className="grid cursor-pointer items-center gap-1 border-b border-term-border px-2 text-[10px] hover:bg-[#121212]"
                    style={{ gridTemplateColumns: grid, height: ROW_HEIGHT }}
                    onClick={() => copyOcc(row.call ?? row.put)}
                  >
                    <SideCells side={row.call} showGreeks={showGreeks} right={false} />
                    <span className={'text-center font-bold ' + (isAtm ? 'text-term-amber' : 'text-term-text')}>{fmtPrice(row.strike)}</span>
                    <SideCells side={row.put} showGreeks={showGreeks} right />
                  </div>
                </div>
              )
            })}
            <div style={{ height: Math.max(0, (rows.length - start - visible.length)) * ROW_HEIGHT }} />
          </div>
        </>
      )}
    </div>
  )
}
