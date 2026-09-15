import type { SocialPost } from '../shared/types'
import type { AtomEntry } from './atom'
import { scoreSentiment } from './sentimentCore'

/**
 * Recurring megathreads. They are pinned in every one of these subreddits and
 * would otherwise take the top slots on every fetch without saying anything.
 */
export const SKIP_TITLE_SUBSTRINGS = ['daily discussion', 'what are your moves', 'daily general discussion']

/** Entries arrive mixed from one multireddit feed, each tagged with its own sub. */
const FALLBACK_SUB = 'reddit'

/** Reddit multireddit RSS → deduped, sentiment-scored posts, newest first. */
export function normalizeSocial(entries: AtomEntry[], now = Date.now()): SocialPost[] {
  const byUrl = new Map<string, SocialPost>()
  for (const entry of entries) {
    const title = entry.title.trim()
    if (!title || !entry.link || byUrl.has(entry.link)) continue
    const lower = title.toLowerCase()
    if (SKIP_TITLE_SUBSTRINGS.some((skip) => lower.includes(skip))) continue
    const parsed = Date.parse(entry.updated)
    byUrl.set(entry.link, {
      title,
      subreddit: entry.category?.trim() || FALLBACK_SUB,
      url: entry.link,
      sentiment: scoreSentiment(title),
      published: Number.isFinite(parsed) ? parsed : now
    })
  }
  return [...byUrl.values()].sort((a, b) => b.published - a.published)
}
