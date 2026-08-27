import type { Filing, FilingsResult, InsiderResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { classifyStatus, ProviderError } from './providers/util'
import { parseAtomEntries, parseForm4 } from './atom'

const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json'
const FORM4_FEED_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=40&output=atom'
const MIN_REQUEST_GAP_MS = 350

interface TickerMap {
  [ticker: string]: { cik: string; title: string }
}

export class EdgarService {
  private tickerCache = new DiskCache<TickerMap>('edgar-tickers', 7 * 24 * 3600_000, 2)
  private filingsCache = new DiskCache<FilingsResult>('edgar-filings', 6 * 3600_000, 60)
  private form4Cache = new DiskCache<InsiderResult>('edgar-form4', 2 * 60_000, 2)
  private lastRequestAt = 0

  /**
   * SEC's fair-access policy requires a real operator contact in the
   * User-Agent. The address comes from SET → Providers (no hardcoded default);
   * without one, EDGAR calls politely refuse.
   */
  constructor(private getContact: () => string) {}

  private userAgent(): string {
    const contact = this.getContact().trim()
    if (!contact) {
      throw new ProviderError(
        'NO_KEY',
        'SEC EDGAR requires an operator contact e-mail (their fair-access policy). Add yours in SET → Providers.'
      )
    }
    return `OpenTerminal/1.0 (contact: ${contact})`
  }

  private async doFetch(url: string, accept: string): Promise<Response> {
    const userAgent = this.userAgent()
    // Tiny per-host throttle on top of the caching — stay far below EDGAR's ceiling.
    const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequestAt = Date.now()
    console.log(`[edgar] GET ${url} (UA: ${userAgent})`)
    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: accept } })
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching SEC EDGAR: ' + String(err))
    }
    // Quirk: EDGAR uses 403 for fair-access throttling (no API keys exist) — pre-map before classifying.
    if (res.status === 403) throw new ProviderError('RATE_LIMITED', 'SEC EDGAR throttled the request — try again shortly.')
    const classified = classifyStatus('SEC EDGAR', res.status)
    if (classified) throw classified
    return res
  }

  private async fetchJson<T>(url: string): Promise<T> {
    return (await (await this.doFetch(url, 'application/json')).json()) as T
  }

  private async fetchText(url: string): Promise<string> {
    return await (await this.doFetch(url, 'application/atom+xml')).text()
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

  /** Latest Form 4 (insider transaction) filings, market-wide, newest first. */
  async getLatestForm4(): Promise<InsiderResult> {
    const cached = this.form4Cache.get('latest')
    if (cached && !cached.stale) return cached.value
    try {
      const xml = await this.fetchText(FORM4_FEED_URL)
      const result: InsiderResult = { filings: parseForm4(parseAtomEntries(xml)), fetchedAt: Date.now() }
      this.form4Cache.set('latest', result)
      return result
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }
}
