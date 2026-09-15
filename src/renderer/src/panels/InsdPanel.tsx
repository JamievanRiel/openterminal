import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'
import type { InsiderFiling, InsiderResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtRelativeTime } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'

function FilingRow({ filing, isNew }: { filing: InsiderFiling; isNew: boolean }): JSX.Element {
  return (
    <button
      className={'block w-full border-b border-term-border px-2 py-1.5 text-left hover:bg-[#121212] ' + (isNew ? 'news-new' : '')}
      onClick={() => window.open(filing.url)}
      title={filing.url}
    >
      <div className="flex items-baseline gap-2 font-mono text-[9px] uppercase text-term-dim">
        <span>{fmtRelativeTime(filing.filedAt)}</span>
        <span className="border border-term-border px-1 text-[8px]">{filing.form}</span>
        <span className="text-term-amber">{filing.ticker ?? '—'}</span>
        {filing.company !== null && <span className="truncate">{filing.company}</span>}
      </div>
      <div className="mt-0.5 font-mono text-[11px] leading-snug text-term-text">{filing.filer}</div>
    </button>
  )
}

/** INSD — market-wide SEC Form 4 stream; per-ticker ownership lives in CACS. */
export default function InsdPanel(): JSX.Element {
  const seenRef = useRef<Set<string>>(new Set())

  const feed = useQuery({
    queryKey: ['insider-latest'],
    queryFn: () => invoke<InsiderResult>('insider:latest'),
    refetchInterval: 120_000,
    retry: 0
  })

  const filings = feed.data?.filings ?? []
  // Flag rows unseen since the previous fetch (news-new slide-in), then mark seen.
  const newUrls = useMemo(() => {
    const first = seenRef.current.size === 0
    const fresh = new Set<string>()
    for (const filing of filings) {
      if (!seenRef.current.has(filing.url)) {
        if (!first) fresh.add(filing.url)
        seenRef.current.add(filing.url)
      }
    }
    return fresh
  // Keyed on the fetch on purpose: filings is a fresh array every render, so
  // depending on it would recompute — and blank the new-row flash — every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.data])

  if (feed.isLoading) return <LoadingState label="insider filings" />
  if (feed.isError) return <ErrorState error={feed.error as Error} />

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1 font-mono">
        <span className="text-[11px] font-bold text-term-amber">INSD — INSIDER FILINGS (FORM 4)</span>
        <span className="ml-auto text-[9px] uppercase text-term-dim">{filings.length} filings · 2m poll</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filings.map((filing) => (
          <FilingRow key={filing.url} filing={filing} isNew={newUrls.has(filing.url)} />
        ))}
        {filings.length === 0 && <div className="p-4 font-mono text-[11px] uppercase text-term-dim">No recent filings.</div>}
      </div>
    </div>
  )
}
