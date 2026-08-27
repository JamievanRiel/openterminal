import { describe, expect, it } from 'vitest'
import { parseAtomEntries, parseForm4 } from './atom'

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

  it('returns [] for non-feed input', () => {
    expect(parseAtomEntries('')).toEqual([])
    expect(parseAtomEntries('<html>not a feed</html>')).toEqual([])
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
