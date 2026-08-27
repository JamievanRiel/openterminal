import type { InsiderFiling } from '../shared/types'

/**
 * Minimal Atom-feed reader for SEC EDGAR's "latest filings" feed. Hand-rolled
 * on purpose: the feed shape is stable, the fields we need are four flat tags
 * per <entry>, and the dependency list stays lean. Not a general XML parser.
 */

export interface AtomEntry {
  title: string
  link: string
  updated: string
  summary: string
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'"
}

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m)
}

export function parseAtomEntries(xml: string): AtomEntry[] {
  const entries: AtomEntry[] = []
  for (const block of xml.match(/<entry\b[\s\S]*?<\/entry>/g) ?? []) {
    const tag = (name: string): string => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
      return m ? decodeEntities(m[1].trim()) : ''
    }
    const link = block.match(/<link\b[^>]*href="([^"]*)"/)
    entries.push({ title: tag('title'), link: link ? decodeEntities(link[1]) : '', updated: tag('updated'), summary: tag('summary') })
  }
  return entries
}

// EDGAR titles: "4 - DOE JOHN (0001234567) (Reporting)" → form, name, cik, role.
const TITLE_RE = /^\s*(\S+)\s*-\s*(.+?)\s*\((\d+)\)\s*\(([^)]+)\)\s*$/
// All-caps 1–5 letter parenthesised token in the issuer name, e.g. "(TSLA)".
const TICKER_RE = /\(([A-Z]{1,5})\)/

/**
 * Fold the feed's (Issuer)+(Reporting) entry pairs — grouped by filing link —
 * into one row per filing: company from the issuer entry, filer from the
 * reporting entry. Ported from Riel-main's insider provider.
 */
export function parseForm4(entries: AtomEntry[], now = Date.now()): InsiderFiling[] {
  const groups = new Map<string, AtomEntry[]>()
  for (const entry of entries) {
    if (!entry.link) continue
    const list = groups.get(entry.link)
    if (list) list.push(entry)
    else groups.set(entry.link, [entry])
  }

  const filings: InsiderFiling[] = []
  for (const [url, group] of groups) {
    let form = '4'
    let company: string | null = null
    let filer = ''
    let ticker: string | null = null
    let filedAt = 0
    for (const entry of group) {
      const m = TITLE_RE.exec(entry.title)
      if (m) {
        form = m[1]
        if (m[4].toLowerCase().includes('issuer')) {
          company = m[2]
          ticker = TICKER_RE.exec(m[2])?.[1] ?? TICKER_RE.exec(entry.summary)?.[1] ?? ticker
        } else {
          filer = m[2]
        }
      }
      const t = Date.parse(entry.updated)
      if (Number.isFinite(t)) filedAt = Math.max(filedAt, t)
    }
    if (!filer) filer = company ?? group[0].title
    filings.push({ ticker, company, filer, form, filedAt: filedAt || now, url })
  }

  filings.sort((a, b) => b.filedAt - a.filedAt)
  return filings
}
