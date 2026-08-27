import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { NewsItem, NewsPage } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtRelativeTime } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'

export function SentimentBadge({ score }: { score: number }): JSX.Element {
  const label = score > 0.15 ? 'BULLISH' : score < -0.15 ? 'BEARISH' : 'NEUTRAL'
  const cls = score > 0.15 ? 'border-term-up text-term-up' : score < -0.15 ? 'border-term-down text-term-down' : 'border-term-border text-term-dim'
  return <span className={'border px-1 text-[8px] uppercase ' + cls}>{label}</span>
}

function NewsRow({ item, isNew }: { item: NewsItem; isNew: boolean }): JSX.Element {
  return (
    <button
      className={'block w-full border-b border-term-border px-2 py-1.5 text-left hover:bg-[#121212] ' + (isNew ? 'news-new' : '')}
      onClick={() => window.open(item.url)}
      title={item.summary || item.headline}
    >
      <div className="flex items-baseline gap-2 font-mono text-[9px] uppercase text-term-dim">
        <span>{item.source}</span>
        <span>{fmtRelativeTime(item.datetime)}</span>
        {item.tickers.map((t) => (
          <span key={t} className="text-term-amber">
            {t}
          </span>
        ))}
        {typeof item.sentiment === 'number' && <SentimentBadge score={item.sentiment} />}
      </div>
      <div className="mt-0.5 font-mono text-[11px] leading-snug text-term-text">{item.headline}</div>
    </button>
  )
}

/** Shared stream for N (company, link-group ticker) and TOP (tickerless market news). */
export default function NewsPanel({ ticker }: { ticker: string | null }): JSX.Element {
  const [maxPage, setMaxPage] = useState(0)
  const seenRef = useRef<Set<string>>(new Set())
  const [older, setOlder] = useState<NewsItem[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset accumulation when the link-group ticker changes.
  useEffect(() => {
    seenRef.current = new Set()
    setOlder([])
    setMaxPage(0)
  }, [ticker])

  const feed = useQuery({
    queryKey: ['news', ticker, 0],
    queryFn: () => invoke<NewsPage>('news:get', { symbol: ticker, page: 0 }),
    refetchInterval: 60_000,
    retry: 0
  })
  // Aggregate company sentiment (session-gated in main; null when the plan lacks it).
  const sentiment = useQuery({
    queryKey: ['news-sentiment', ticker],
    queryFn: () => invoke<number | null>('news:sentiment', { symbol: ticker }),
    staleTime: Infinity,
    retry: 0,
    enabled: ticker !== null
  })

  // Merge current page with accumulated older pages; dedupe by id, then URL.
  const items = useMemo(() => {
    const byId = new Map<string, NewsItem>()
    const byUrl = new Set<string>()
    for (const item of [...(feed.data?.items ?? []), ...older]) {
      if (byId.has(item.id) || byUrl.has(item.url)) continue
      byId.set(item.id, item)
      byUrl.add(item.url)
    }
    return [...byId.values()].sort((a, b) => b.datetime - a.datetime)
  }, [feed.data, older])

  // Track which ids are new this render (slide-in highlight), then mark seen.
  const newIds = useMemo(() => {
    const first = seenRef.current.size === 0
    const fresh = new Set<string>()
    for (const item of items) {
      if (!seenRef.current.has(item.id)) {
        if (!first) fresh.add(item.id)
        seenRef.current.add(item.id)
      }
    }
    return fresh
  }, [items])

  const loadOlder = (): void => {
    if (ticker === null || maxPage >= 8 || feed.isLoading) return
    const next = maxPage + 1
    setMaxPage(next)
    void invoke<NewsPage>('news:get', { symbol: ticker, page: next })
      .then((page) => setOlder((prev) => [...prev, ...page.items]))
      .catch(() => undefined)
  }

  if (feed.isLoading) return <LoadingState label={ticker ? `${ticker} news` : 'market news'} />
  if (feed.isError && items.length === 0) return <ErrorState error={feed.error as Error} />

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1 font-mono">
        <span className="text-[11px] font-bold text-term-amber">{ticker ? `${ticker} — NEWS` : 'TOP — MARKET NEWS'}</span>
        {typeof sentiment.data === 'number' && <SentimentBadge score={sentiment.data} />}
        {feed.data?.provider === 'marketaux' && <span className="text-[9px] uppercase text-term-dim">via marketaux</span>}
        <span className="ml-auto text-[9px] uppercase text-term-dim">{items.length} items · 60s poll</span>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) loadOlder()
        }}
      >
        {items.map((item) => (
          <NewsRow key={item.id} item={item} isNew={newIds.has(item.id)} />
        ))}
        {items.length === 0 && <div className="p-4 font-mono text-[11px] uppercase text-term-dim">No articles in range.</div>}
        {ticker !== null && maxPage < 8 && items.length > 0 && (
          <button className="w-full py-2 font-mono text-[10px] uppercase text-term-dim hover:text-term-amber" onClick={loadOlder}>
            Load older…
          </button>
        )}
      </div>
    </div>
  )
}
