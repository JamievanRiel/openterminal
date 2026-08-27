import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import type { WireItem, WireResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtRelativeTime } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { SentimentBadge } from './NewsPanel'

type Category = 'all' | 'markets' | 'crypto'
const CATEGORIES: Array<[Category, string]> = [
  ['all', 'ALL'],
  ['markets', 'MARKETS'],
  ['crypto', 'CRYPTO']
]

function WireRow({ item, isNew }: { item: WireItem; isNew: boolean }): JSX.Element {
  return (
    <button
      className={'block w-full border-b border-term-border px-2 py-1.5 text-left hover:bg-[#121212] ' + (isNew ? 'news-new' : '')}
      onClick={() => window.open(item.url)}
      title={item.summary || item.title}
    >
      <div className="flex items-baseline gap-2 font-mono text-[9px] uppercase text-term-dim">
        <span>{item.source}</span>
        <span>{fmtRelativeTime(item.published)}</span>
        <span className="border border-term-border px-1 text-[8px]">{item.category}</span>
        {typeof item.sentiment === 'number' && <SentimentBadge score={item.sentiment} />}
      </div>
      <div className="mt-0.5 font-mono text-[11px] leading-snug text-term-text">{item.title}</div>
    </button>
  )
}

/** WIRE — keyless RSS wire (Riel feed list) with lexicon sentiment. */
export default function WirePanel(): JSX.Element {
  const [category, setCategory] = useState<Category>('all')
  const seenRef = useRef<Set<string>>(new Set())

  const feed = useQuery({
    queryKey: ['wire'],
    queryFn: () => invoke<WireResult>('wire:get'),
    refetchInterval: 120_000,
    retry: 0
  })

  const items = feed.data?.items ?? []
  // Flag rows unseen since the previous fetch (news-new slide-in), then mark seen.
  const newUrls = useMemo(() => {
    const first = seenRef.current.size === 0
    const fresh = new Set<string>()
    for (const item of items) {
      if (!seenRef.current.has(item.url)) {
        if (!first) fresh.add(item.url)
        seenRef.current.add(item.url)
      }
    }
    return fresh
  }, [feed.data])

  if (feed.isLoading) return <LoadingState label="news wire" />
  if (feed.isError) return <ErrorState error={feed.error as Error} />

  const agg = (feed.data as WireResult).sentiment
  const rows = category === 'all' ? items : items.filter((i) => i.category === category)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border px-2 py-1 font-mono">
        <span className="text-[11px] font-bold text-term-amber">WIRE — NEWS WIRE</span>
        <span className="text-[9px] uppercase">
          <span className="text-term-up">BULL {Math.round(agg.bullish)}%</span>
          <span className="text-term-dim"> · </span>
          <span className="text-term-down">BEAR {Math.round(agg.bearish)}%</span>
          <span className="text-term-dim"> · AVG {(agg.score >= 0 ? '+' : '') + agg.score.toFixed(2)}</span>
        </span>
        {CATEGORIES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={
              'border px-2 text-[9px] uppercase ' +
              (category === key ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[9px] uppercase text-term-dim">{rows.length} items · 2m poll</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((item) => (
          <WireRow key={item.url} item={item} isNew={newUrls.has(item.url)} />
        ))}
        {rows.length === 0 && <div className="p-4 font-mono text-[11px] uppercase text-term-dim">No items in this category.</div>}
      </div>
    </div>
  )
}
