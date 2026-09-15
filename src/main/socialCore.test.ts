import { describe, expect, it } from 'vitest'
import { normalizeSocial, SKIP_TITLE_SUBSTRINGS } from './socialCore'
import type { AtomEntry } from './atom'

// `null` means the entry carries no <category> at all — an explicit
// `undefined` would silently fall back to this helper's default.
const entry = (
  title: string,
  link: string,
  category: string | null = 'stocks',
  updated = '2026-09-15T10:00:00Z'
): AtomEntry => ({ title, link, updated, summary: '', ...(category === null ? {} : { category }) })

describe('normalizeSocial', () => {
  it('takes each post’s subreddit from its own category tag', () => {
    // One multireddit request returns posts from every sub mixed together.
    const posts = normalizeSocial([
      entry('NVDA surges on a blowout beat', 'https://reddit.com/a', 'wallstreetbets'),
      entry('Recession fears deepen as losses mount', 'https://reddit.com/b', 'stocks')
    ])
    expect(posts).toHaveLength(2)
    const wsb = posts.find((p) => p.url === 'https://reddit.com/a')!
    expect(wsb.subreddit).toBe('wallstreetbets')
    expect(wsb.title).toBe('NVDA surges on a blowout beat')
    expect(wsb.sentiment).toBeGreaterThan(0)
    expect(posts.find((p) => p.url === 'https://reddit.com/b')!.sentiment).toBeLessThan(0)
  })

  it('falls back to a plain reddit tag when an entry carries no category', () => {
    expect(normalizeSocial([entry('Untagged', 'https://reddit.com/a', null)])[0].subreddit).toBe('reddit')
  })

  it('skips the recurring megathreads that drown out real posts', () => {
    const titles = [
      'Daily Discussion Thread for September 15',
      'What Are Your Moves Tomorrow, September 15',
      'Daily General Discussion and Advice Thread',
      'NVDA earnings preview'
    ]
    const posts = normalizeSocial(titles.map((t, i) => entry(t, `https://reddit.com/${i}`)))
    expect(posts.map((p) => p.title)).toEqual(['NVDA earnings preview'])
  })

  it('matches those megathread titles whatever their casing', () => {
    for (const needle of SKIP_TITLE_SUBSTRINGS) {
      expect(normalizeSocial([entry(needle.toUpperCase(), 'https://reddit.com/x')])).toHaveLength(0)
    }
  })

  it('drops entries with no title or no link', () => {
    const posts = normalizeSocial([
      entry('', 'https://reddit.com/a'),
      entry('Real post', ''),
      entry('Keeper', 'https://reddit.com/c')
    ])
    expect(posts.map((p) => p.title)).toEqual(['Keeper'])
  })

  it('keeps one copy of a post that appears twice in the feed', () => {
    const posts = normalizeSocial([
      entry('Same post', 'https://reddit.com/dup', 'stocks'),
      entry('Same post', 'https://reddit.com/dup', 'investing')
    ])
    expect(posts).toHaveLength(1)
    expect(posts[0].subreddit).toBe('stocks')
  })

  it('sorts newest first across all subreddits', () => {
    const posts = normalizeSocial([
      entry('older', 'https://reddit.com/1', 'stocks', '2026-09-15T08:00:00Z'),
      entry('newest', 'https://reddit.com/2', 'investing', '2026-09-15T12:00:00Z'),
      entry('middle', 'https://reddit.com/3', 'wallstreetbets', '2026-09-15T10:00:00Z')
    ])
    expect(posts.map((p) => p.title)).toEqual(['newest', 'middle', 'older'])
  })

  it('falls back to the fetch time when a timestamp is unreadable', () => {
    const now = 1_760_000_000_000
    expect(normalizeSocial([entry('No date', 'https://reddit.com/a', 'stocks', 'not a date')], now)[0].published).toBe(now)
  })
})
