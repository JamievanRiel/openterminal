import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import type { SocialPost, SocialResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { fmtRelativeTime } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { SentimentBadge } from './NewsPanel'

const SUBS: Array<[string, string]> = [
  ['all', 'ALL'],
  ['wallstreetbets', 'WSB'],
  ['stocks', 'STOCKS'],
  ['investing', 'INVESTING'],
  ['CryptoCurrency', 'CRYPTO']
]

function PostRow({ post, isNew }: { post: SocialPost; isNew: boolean }): JSX.Element {
  return (
    <button
      className={'block w-full border-b border-term-border px-2 py-1.5 text-left hover:bg-[#121212] ' + (isNew ? 'news-new' : '')}
      onClick={() => window.open(post.url)}
      title={post.title}
    >
      <div className="flex items-baseline gap-2 font-mono text-[9px] uppercase text-term-dim">
        <span className="border border-term-border px-1 text-[8px]">r/{post.subreddit}</span>
        <span>{fmtRelativeTime(post.published)}</span>
        {typeof post.sentiment === 'number' && <SentimentBadge score={post.sentiment} />}
      </div>
      <div className="mt-0.5 font-mono text-[11px] leading-snug text-term-text">{post.title}</div>
    </button>
  )
}

/** SOCL — Reddit hot posts over RSS with the same lexicon sentiment as WIRE. */
export default function SoclPanel(): JSX.Element {
  const [sub, setSub] = useState('all')
  const seenRef = useRef<Set<string>>(new Set())

  const feed = useQuery({
    queryKey: ['social'],
    queryFn: () => invoke<SocialResult>('social:get'),
    refetchInterval: 300_000, // Reddit throttles keyless clients — match the cache
    retry: 0
  })

  const posts = feed.data?.posts ?? []
  // Flag rows unseen since the previous fetch (news-new slide-in), then mark seen.
  const newUrls = useMemo(() => {
    const first = seenRef.current.size === 0
    const fresh = new Set<string>()
    for (const post of posts) {
      if (!seenRef.current.has(post.url)) {
        if (!first) fresh.add(post.url)
        seenRef.current.add(post.url)
      }
    }
    return fresh
    // Keyed on the fetch on purpose: posts is a fresh array every render, so
    // depending on it would recompute — and blank the new-row flash — every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.data])

  if (feed.isLoading) return <LoadingState label="reddit stream" />
  if (feed.isError) return <ErrorState error={feed.error as Error} />

  const agg = (feed.data as SocialResult).sentiment
  const rows = sub === 'all' ? posts : posts.filter((p) => p.subreddit === sub)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border px-2 py-1 font-mono">
        <span className="text-[11px] font-bold text-term-amber">SOCL — REDDIT</span>
        <span className="text-[9px] uppercase">
          <span className="text-term-up">BULL {Math.round(agg.bullish)}%</span>
          <span className="text-term-dim"> · </span>
          <span className="text-term-down">BEAR {Math.round(agg.bearish)}%</span>
          <span className="text-term-dim"> · AVG {(agg.score >= 0 ? '+' : '') + agg.score.toFixed(2)}</span>
        </span>
        {SUBS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={
              'border px-2 text-[9px] uppercase ' +
              (sub === key ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[9px] uppercase text-term-dim" title="Reddit's RSS feed carries no score or comment count">
          {rows.length} posts · 5m poll · hot
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((post) => (
          <PostRow key={post.url} post={post} isNew={newUrls.has(post.url)} />
        ))}
        {rows.length === 0 && <div className="p-4 font-mono text-[11px] uppercase text-term-dim">No posts from this subreddit right now.</div>}
      </div>
    </div>
  )
}
