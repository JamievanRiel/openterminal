import { useQuery } from '@tanstack/react-query'
import type { CompanyProfile, Quote } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtCompact, fmtPct, fmtPrice, fmtSigned, upDownClass } from '../lib/format'
import { useWorkspace } from '../state/workspace'

function Stat({ label, value, className }: { label: string; value: string; className?: string }): JSX.Element {
  return (
    <div className="border border-term-border bg-term-bg px-2 py-1.5">
      <div className="font-label text-[10px] uppercase tracking-widest text-term-dim">{label}</div>
      <div className={'mt-0.5 font-mono text-[13px] ' + (className ?? 'text-term-text')}>{value}</div>
    </div>
  )
}

export default function DesPanel({ ticker }: { ticker: string }): JSX.Element {
  const applyCommand = useWorkspace((s) => s.applyCommand)

  const profile = useQuery({
    queryKey: ['profile', ticker],
    queryFn: () => invoke<CompanyProfile>('profile:get', { symbol: ticker })
  })
  const quote = useQuery({
    queryKey: ['quote', ticker],
    queryFn: () => invoke<Quote>('quote:get', { symbol: ticker }),
    refetchInterval: 30_000
  })
  const peers = useQuery({
    queryKey: ['peers', ticker],
    queryFn: () => invoke<string[]>('peers:get', { symbol: ticker })
  })

  if (profile.isLoading) {
    return <div className="p-4 font-mono text-[11px] uppercase text-term-dim">Loading {ticker}…</div>
  }
  if (profile.isError) {
    const err = profile.error as Error
    return (
      <div className="p-4 font-mono text-[11px]">
        <div className="uppercase text-term-down">{err.name === 'NO_KEY' ? 'No API key' : 'Data unavailable'}</div>
        <div className="mt-1 text-term-dim">{err.message}</div>
        {err.name === 'NO_KEY' && (
          <button
            className="mt-3 border border-term-border px-2 py-1 uppercase text-term-amber hover:bg-[#1a1a1a]"
            onClick={() => applyCommand('SET', null, false)}
          >
            Open settings
          </button>
        )}
      </div>
    )
  }

  const p = profile.data as CompanyProfile
  const q = quote.data

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[16px] font-bold text-term-amber">
            {p.symbol} <span className="text-term-text">{p.name.toUpperCase()}</span>
          </div>
          <div className="mt-0.5 font-label text-[11px] uppercase tracking-wider text-term-dim">
            {p.exchange} · {p.industry} · {p.country} · IPO {p.ipo}
          </div>
        </div>
        {p.logo && <img src={p.logo} alt="" className="h-9 w-9 border border-term-border bg-white object-contain" />}
      </div>

      {q && (
        <div className="mt-3 flex items-baseline gap-4 border border-term-border bg-term-bg px-3 py-2">
          <span className="font-mono text-[24px] font-bold text-term-text">{fmtPrice(q.current)}</span>
          <span className={'font-mono text-[14px] ' + upDownClass(q.change)}>
            {fmtSigned(q.change)} ({fmtPct(q.percentChange)})
          </span>
          <span className="font-mono text-[11px] text-term-dim">{p.currency}</span>
          {q.stale && <span className="font-mono text-[10px] uppercase text-term-amber">DELAYED</span>}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Stat label="Market cap" value={fmtCompact(p.marketCap)} />
        <Stat label="Shares out" value={fmtCompact(p.sharesOutstanding)} />
        <Stat label="Prev close" value={q ? fmtPrice(q.prevClose) : '—'} />
        <Stat label="Open" value={q ? fmtPrice(q.open) : '—'} />
        <Stat label="Day high" value={q ? fmtPrice(q.high) : '—'} className="text-term-up" />
        <Stat label="Day low" value={q ? fmtPrice(q.low) : '—'} className="text-term-down" />
      </div>

      <div className="mt-3">
        <div className="font-label text-[10px] uppercase tracking-widest text-term-dim">Peers</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(peers.data ?? []).map((peer) => (
            <button
              key={peer}
              className="border border-term-border px-2 py-0.5 font-mono text-[11px] text-term-amber hover:bg-[#1a1a1a]"
              onClick={() => applyCommand('DES', peer, false)}
            >
              {peer}
            </button>
          ))}
          {peers.data?.length === 0 && <span className="font-mono text-[11px] text-term-dim">—</span>}
        </div>
      </div>
    </div>
  )
}
