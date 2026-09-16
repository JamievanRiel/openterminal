import { describe, expect, it } from 'vitest'
import { normalizeWire } from './wireCore'
import type { AtomEntry } from './atom'

const NOW = Date.parse('2026-08-27T16:00:00Z')

const entry = (over: Partial<AtomEntry>): AtomEntry => ({
  title: 'Stocks rally on strong growth',
  link: 'https://example.com/a',
  updated: 'Wed, 27 Aug 2026 14:05:00 GMT',
  summary: '<b>Equities</b> jumped in early trading.',
  ...over
})

describe('normalizeWire', () => {
  it('maps entries to wire items with stripped summary and lexicon sentiment', () => {
    const [item] = normalizeWire([{ source: 'CNBC Markets', category: 'markets', entries: [entry({})] }], NOW)
    expect(item.title).toBe('Stocks rally on strong growth')
    expect(item.url).toBe('https://example.com/a')
    expect(item.source).toBe('CNBC Markets')
    expect(item.category).toBe('markets')
    expect(item.summary).toBe('Equities jumped in early trading.')
    expect(item.sentiment).toBe(1) // rally, strong, growth — all positive
    expect(item.published).toBe(Date.parse('Wed, 27 Aug 2026 14:05:00 GMT'))
  })

  it('dedupes by url across feeds, first feed wins', () => {
    const items = normalizeWire(
      [
        { source: 'A', category: 'markets', entries: [entry({})] },
        { source: 'B', category: 'crypto', entries: [entry({ title: 'Duplicate story' })] }
      ],
      NOW
    )
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('A')
  })

  it('sorts newest first and falls back to now for unparseable dates', () => {
    const items = normalizeWire(
      [
        {
          source: 'A',
          category: 'markets',
          entries: [
            entry({ link: 'https://example.com/old', updated: 'Wed, 27 Aug 2026 10:00:00 GMT' }),
            entry({ link: 'https://example.com/undated', updated: 'not-a-date' }),
            entry({ link: 'https://example.com/new', updated: 'Wed, 27 Aug 2026 15:00:00 GMT' })
          ]
        }
      ],
      NOW
    )
    expect(items.map((i) => i.url)).toEqual([
      'https://example.com/undated', // NOW is newest
      'https://example.com/new',
      'https://example.com/old'
    ])
    expect(items[0].published).toBe(NOW)
  })

  it('decodes the HTML entities left in a summary once its tags are stripped (Google News)', () => {
    const summary = '<a href="https://news.google.com/x">Oil slips as Saudi offers more crude</a>&nbsp;&nbsp;<font color="#6f6f6f">Reuters</font>'
    const [item] = normalizeWire([{ source: 'Reuters US', category: 'markets', entries: [entry({ summary })] }], NOW)
    expect(item.summary).toBe('Oil slips as Saudi offers more crude Reuters')
  })

  it('decodes escaped text after stripping, so an escaped tag survives as text', () => {
    const summary = 'S&amp;P 500 &#x2014; a &lt;b&gt; in the copy'
    const [item] = normalizeWire([{ source: 'A', category: 'markets', entries: [entry({ summary })] }], NOW)
    expect(item.summary).toBe('S&P 500 — a <b> in the copy')
  })

  it('caps the summary at 600 characters', () => {
    const [item] = normalizeWire([{ source: 'A', category: 'markets', entries: [entry({ summary: 'x'.repeat(900) })] }], NOW)
    expect(item.summary).toHaveLength(600)
  })

  it('drops titleless and linkless entries', () => {
    const items = normalizeWire(
      [{ source: 'A', category: 'markets', entries: [entry({ title: '' }), entry({ link: '' }), entry({ link: 'https://example.com/ok' })] }],
      NOW
    )
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/ok')
  })

  it('scores sentiment null when the lexicon has no hits', () => {
    const [item] = normalizeWire(
      [{ source: 'A', category: 'markets', entries: [entry({ title: 'Committee meets Tuesday', summary: 'Agenda published.' })] }],
      NOW
    )
    expect(item.sentiment).toBeNull()
  })
})
