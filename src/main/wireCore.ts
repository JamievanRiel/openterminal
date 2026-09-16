import type { WireItem } from '../shared/types'
import { decodeEntities, type AtomEntry } from './atom'
import { scoreSentiment } from './sentimentCore'

const SUMMARY_CAP = 600

/** Riel's tag-walk stripper — fine for feed snippets, not a sanitiser. */
function stripHtml(text: string): string {
  let out = ''
  let inTag = false
  for (const ch of text) {
    if (ch === '<') inTag = true
    else if (ch === '>') inTag = false
    else if (!inTag) out += ch
  }
  // Entities decode only after the tags are gone, so escaped markup stays text.
  return decodeEntities(out).replace(/\s+/g, ' ').trim()
}

export interface FeedResult {
  source: string
  category: string
  entries: AtomEntry[]
}

/** Flatten feed results into deduped, sentiment-scored items, newest first. */
export function normalizeWire(feeds: FeedResult[], now = Date.now()): WireItem[] {
  const byUrl = new Map<string, WireItem>()
  for (const feed of feeds) {
    for (const entry of feed.entries) {
      const title = entry.title.trim()
      if (!title || !entry.link || byUrl.has(entry.link)) continue
      const summary = stripHtml(entry.summary).slice(0, SUMMARY_CAP)
      const parsed = Date.parse(entry.updated)
      byUrl.set(entry.link, {
        title,
        summary,
        url: entry.link,
        source: feed.source,
        category: feed.category,
        sentiment: scoreSentiment(`${title} ${summary}`),
        published: Number.isFinite(parsed) ? parsed : now
      })
    }
  }
  return [...byUrl.values()].sort((a, b) => b.published - a.published)
}
