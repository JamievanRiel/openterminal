import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { MoversResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtCompact, fmtPct, fmtPrice, fmtSigned, upDownClass } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { useWorkspace } from '../state/workspace'

type Tab = 'gainers' | 'losers' | 'actives'
const TABS: Array<[Tab, string]> = [
  ['gainers', 'TOP GAINERS'],
  ['losers', 'TOP LOSERS'],
  ['actives', 'MOST ACTIVE']
]

export default function MoversPanel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('actives')
  const loadTicker = useWorkspace((s) => s.loadTicker)

  const movers = useQuery({
    queryKey: ['movers', tab],
    queryFn: () => invoke<MoversResult>('movers:get', { tab }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 0
  })

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-1 border-b border-term-border p-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              'border px-2 py-0.5 text-[10px] uppercase ' +
              (tab === key
                ? 'border-term-amber text-term-amber'
                : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {label}
          </button>
        ))}
        {movers.data && (
          <span className="ml-auto text-[9px] uppercase text-term-dim">
            {movers.data.fromCache ? 'CACHED ' : 'AS OF '}
            {new Date(movers.data.asOf).toLocaleTimeString('en-GB', { hour12: false })}
          </span>
        )}
      </div>

      {movers.isLoading ? (
        <LoadingState label={tab} />
      ) : movers.isError ? (
        <ErrorState error={movers.error as Error} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 grid grid-cols-[64px_1fr_76px_76px_70px_76px] gap-2 border-b border-term-border bg-term-panel px-2 py-1 text-[9px] uppercase text-term-dim">
            <span>Symbol</span>
            <span>Name</span>
            <span className="text-right">Last</span>
            <span className="text-right">Chg</span>
            <span className="text-right">%Chg</span>
            <span className="text-right">Volume</span>
          </div>
          {(movers.data as MoversResult).items.map((m) => (
            <button
              key={m.symbol}
              className="grid w-full grid-cols-[64px_1fr_76px_76px_70px_76px] gap-2 border-b border-term-border px-2 py-1 text-left text-[11px] hover:bg-[#121212]"
              onClick={() => loadTicker(m.symbol)}
            >
              <span className="font-bold text-term-amber">{m.symbol}</span>
              <span className="truncate text-term-text">{m.name}</span>
              <span className="text-right text-term-text">{fmtPrice(m.last, m.last < 5 ? 4 : 2)}</span>
              <span className={'text-right ' + upDownClass(m.change)}>{fmtSigned(m.change, m.last < 5 ? 4 : 2)}</span>
              <span className={'text-right ' + upDownClass(m.percentChange)}>{fmtPct(m.percentChange)}</span>
              <span className="text-right text-term-dim">{m.volume !== null ? fmtCompact(m.volume) : '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
