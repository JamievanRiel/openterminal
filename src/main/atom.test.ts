import { describe, expect, it } from 'vitest'
import { parseAtomEntries, parseFeedEntries, parseForm4 } from './atom'

// Shape of EDGAR's "latest filings" (getcurrent) Atom feed: each Form 4 usually
// appears as an (Issuer) + (Reporting) entry pair sharing one filing link.
const FEED = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Latest Filings - Wed, 27 Aug 2026</title>
<entry>
<title>4 - Tesla, Inc. (TSLA) (0001318605) (Issuer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1318605/000131860526000123/0001318605-26-000123-index.htm"/>
<summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-08-27 &lt;b&gt;AccNo:&lt;/b&gt; 0001318605-26-000123 Size: 12 KB</summary>
<updated>2026-08-27T14:02:10-04:00</updated>
</entry>
<entry>
<title>4 - Musk Elon (0001494730) (Reporting)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1318605/000131860526000123/0001318605-26-000123-index.htm"/>
<summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-08-27 &lt;b&gt;AccNo:&lt;/b&gt; 0001318605-26-000123 Size: 12 KB</summary>
<updated>2026-08-27T14:02:10-04:00</updated>
</entry>
<entry>
<title>4/A - DOE JANE (0009999999) (Reporting)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/999/000099-index.htm"/>
<summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-08-27 &lt;b&gt;AccNo:&lt;/b&gt; 0000999999-26-000099 Size: 4 KB</summary>
<updated>2026-08-27T15:30:00-04:00</updated>
</entry>
</feed>`

describe('parseAtomEntries', () => {
  it('extracts title, link, updated and entity-decoded summary per entry', () => {
    const entries = parseAtomEntries(FEED)
    expect(entries).toHaveLength(3)
    expect(entries[0].title).toBe('4 - Tesla, Inc. (TSLA) (0001318605) (Issuer)')
    expect(entries[0].link).toContain('0001318605-26-000123-index.htm')
    expect(entries[0].updated).toBe('2026-08-27T14:02:10-04:00')
    expect(entries[0].summary).toContain('<b>Filed:</b> 2026-08-27')
  })

  it('extracts the category term when a feed carries one', () => {
    const xml = `<feed><entry><category term="wallstreetbets" label="r/wallstreetbets"/><title>Hot post</title><link href="https://reddit.com/a"/><updated>2026-09-15T10:00:00Z</updated></entry></feed>`
    expect(parseAtomEntries(xml)[0].category).toBe('wallstreetbets')
  })

  it('leaves the category undefined when the entry has none', () => {
    const xml = `<feed><entry><title>No category</title><link href="https://x/a"/><updated>2026-09-15T10:00:00Z</updated></entry></feed>`
    expect(parseAtomEntries(xml)[0].category).toBeUndefined()
  })

  it('returns [] for non-feed input', () => {
    expect(parseAtomEntries('')).toEqual([])
    expect(parseAtomEntries('<html>not a feed</html>')).toEqual([])
  })
})

// RSS 2.0 shape (CNBC/MarketWatch style, incl. CDATA wrapping).
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>CNBC Markets</title>
<item>
<title><![CDATA[Stocks rally after Fed decision]]></title>
<link>https://www.cnbc.com/2026/08/27/markets.html</link>
<description>Equities jumped &amp; bonds fell.</description>
<pubDate>Wed, 27 Aug 2026 14:05:00 GMT</pubDate>
</item>
<item>
<title>Oil slumps on demand fears</title>
<link>https://www.cnbc.com/2026/08/27/oil.html</link>
<description><![CDATA[Crude fell 3% in early trading.]]></description>
<pubDate>Wed, 27 Aug 2026 13:40:00 GMT</pubDate>
</item>
</channel></rss>`

describe('parseFeedEntries', () => {
  it('parses RSS 2.0 items into the AtomEntry shape', () => {
    const entries = parseFeedEntries(RSS)
    expect(entries).toHaveLength(2)
    expect(entries[0].title).toBe('Stocks rally after Fed decision')
    expect(entries[0].link).toBe('https://www.cnbc.com/2026/08/27/markets.html')
    expect(entries[0].updated).toBe('Wed, 27 Aug 2026 14:05:00 GMT')
    expect(entries[0].summary).toBe('Equities jumped & bonds fell.')
    expect(entries[1].summary).toBe('Crude fell 3% in early trading.')
  })

  it('delegates Atom feeds to the entry parser', () => {
    expect(parseFeedEntries(FEED)).toEqual(parseAtomEntries(FEED))
  })

  it('decodes numeric character references, hex and decimal (MarketWatch titles)', () => {
    const xml = `<rss><channel><item><title>Why a hike could be a &#x2018;rare win&#x2019; &#x2014; &#169; 2026</title><link>https://x/a</link></item></channel></rss>`
    expect(parseFeedEntries(xml)[0].title).toBe('Why a hike could be a \u2018rare win\u2019 \u2014 \u00a9 2026')
  })

  it('decodes in a single pass, so an escaped reference stays literal text', () => {
    const xml = `<rss><channel><item><title>&amp;#x2019; and &amp;amp;</title><link>https://x/a</link></item></channel></rss>`
    expect(parseFeedEntries(xml)[0].title).toBe('&#x2019; and &amp;')
  })

  it('leaves references to invalid code points untouched', () => {
    const xml = `<rss><channel><item><title>bad &#x110000; ref</title><link>https://x/a</link></item></channel></rss>`
    expect(parseFeedEntries(xml)[0].title).toBe('bad &#x110000; ref')
  })

  it('returns [] for non-feed input', () => {
    expect(parseFeedEntries('<html>nope</html>')).toEqual([])
  })
})

describe('parseForm4', () => {
  it('merges Issuer+Reporting pairs by link and sorts newest first', () => {
    const filings = parseForm4(parseAtomEntries(FEED))
    expect(filings).toHaveLength(2)
    // Newest first: the 15:30 amendment before the 14:02 filing.
    expect(filings[0].form).toBe('4/A')
    expect(filings[0].filer).toBe('DOE JANE')
    expect(filings[0].company).toBeNull()
    expect(filings[0].ticker).toBeNull()
    expect(filings[1].form).toBe('4')
    expect(filings[1].company).toBe('Tesla, Inc. (TSLA)')
    expect(filings[1].filer).toBe('Musk Elon')
    expect(filings[1].ticker).toBe('TSLA')
    expect(filings[1].filedAt).toBe(Date.parse('2026-08-27T14:02:10-04:00'))
    expect(filings[1].url).toContain('0001318605-26-000123-index.htm')
  })

  it('falls back to the raw title as filer when the title shape is unknown', () => {
    const filings = parseForm4(
      [{ title: 'something unparseable', link: 'https://sec.gov/x', updated: 'not-a-date', summary: '' }],
      1_756_300_000_000
    )
    expect(filings).toHaveLength(1)
    expect(filings[0].filer).toBe('something unparseable')
    expect(filings[0].filedAt).toBe(1_756_300_000_000)
  })

  it('drops entries without a link', () => {
    expect(parseForm4([{ title: '4 - X (1) (Reporting)', link: '', updated: '', summary: '' }])).toEqual([])
  })
})
