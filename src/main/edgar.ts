import type { Filing, FilingsResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { ProviderError } from './providers/util'

/**
 * SEC EDGAR requires a real contact in the User-Agent. Change this constant if
 * you distribute the app — it identifies the operator to the SEC, per their
 * fair-access policy (https://www.sec.gov/os/accessing-edgar-data).
 */
const EDGAR_USER_AGENT = 'OpenTerminal/1.0 (contact: you@example.com)'

const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json'
const MIN_REQUEST_GAP_MS = 350

interface TickerMap {
  [ticker: string]: { cik: string; title: string }
}

export class EdgarService {
  private tickerCache = new DiskCache<TickerMap>('edgar-tickers', 7 * 24 * 3600_000, 2)
  private filingsCache = new DiskCache<FilingsResult>('edgar-filings', 6 * 3600_000, 60)
  private lastRequestAt = 0

  private async fetchJson<T>(url: string): Promise<T> {
    // Tiny per-host throttle on top of the caching — stay far below EDGAR's ceiling.
    const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequestAt = Date.now()
    console.log(`[edgar] GET ${url} (UA: ${EDGAR_USER_AGENT})`)
    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': EDGAR_USER_AGENT, Accept: 'application/json' } })
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching SEC EDGAR: ' + String(err))
    }
    if (res.status === 429 || res.status === 403) {
      throw new ProviderError('RATE_LIMITED', 'SEC EDGAR throttled the request — try again shortly.')
    }
    if (res.status === 404) throw new ProviderError('UNSUPPORTED', 'Not found on SEC EDGAR.')
    if (!res.ok) throw new ProviderError('HTTP', 'SEC EDGAR HTTP ' + res.status)
    return (await res.json()) as T
  }

  private async tickerMap(): Promise<TickerMap> {
    const cached = this.tickerCache.get('map')
    if (cached && !cached.stale) return cached.value
    try {
      const raw = await this.fetchJson<Record<string, { cik_str: number; ticker: string; title: string }>>(TICKER_MAP_URL)
      const map: TickerMap = {}
      for (const entry of Object.values(raw)) {
        map[entry.ticker.toUpperCase()] = { cik: String(entry.cik_str), title: entry.title }
      }
      this.tickerCache.set('map', map)
      return map
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }

  async getFilings(symbol: string): Promise<FilingsResult> {
    const cached = this.filingsCache.get(symbol)
    if (cached && !cached.stale) return cached.value

    const map = await this.tickerMap()
    const entry = map[symbol.toUpperCase()]
    if (!entry) {
      // Not an error: many tickers (foreign listings, crypto, FX) simply have no EDGAR presence.
      const empty: FilingsResult = { symbol, cik: null, filings: [], fetchedAt: Date.now() }
      this.filingsCache.set(symbol, empty)
      return empty
    }

    try {
      const cik10 = entry.cik.padStart(10, '0')
      const d = await this.fetchJson<{
        filings?: {
          recent?: {
            accessionNumber?: string[]
            filingDate?: string[]
            reportDate?: string[]
            form?: string[]
            primaryDocument?: string[]
            primaryDocDescription?: string[]
          }
        }
      }>(`https://data.sec.gov/submissions/CIK${cik10}.json`)

      const r = d.filings?.recent
      const filings: Filing[] = []
      const n = r?.accessionNumber?.length ?? 0
      for (let i = 0; i < Math.min(n, 120); i++) {
        const accession = r?.accessionNumber?.[i] ?? ''
        const primaryDoc = r?.primaryDocument?.[i] ?? ''
        const accessionFlat = accession.replace(/-/g, '')
        filings.push({
          form: r?.form?.[i] ?? '—',
          filingDate: r?.filingDate?.[i] ?? '',
          reportDate: r?.reportDate?.[i] || null,
          description: r?.primaryDocDescription?.[i] || (r?.form?.[i] ?? ''),
          url: primaryDoc
            ? `https://www.sec.gov/Archives/edgar/data/${entry.cik}/${accessionFlat}/${primaryDoc}`
            : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik10}&type=&dateb=&owner=include&count=40`
        })
      }
      const result: FilingsResult = { symbol, cik: entry.cik, filings, fetchedAt: Date.now() }
      this.filingsCache.set(symbol, result)
      return result
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }
}
