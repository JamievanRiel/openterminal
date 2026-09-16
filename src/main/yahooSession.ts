import { classifyStatus, ProviderError } from './providers/util'

const COOKIE_URL = 'https://fc.yahoo.com'
const CRUMB_URL = 'https://query2.finance.yahoo.com/v1/test/getcrumb'
// Yahoo serves the keyless endpoints only to browser-ish clients.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
// Yahoo sends no Retry-After with its 429s; back off for a sensible fixed span.
const THROTTLE_BACKOFF_MS = 600_000

/**
 * The cookie + crumb handshake Yahoo has required since 2023: collect a session
 * cookie from fc.yahoo.com, trade it for a crumb, then sign every data request
 * with both. The crumb is kept until Yahoo rejects it, then refreshed once.
 */
export class YahooSession {
  private jar = ''
  private crumb = ''

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** GET a Yahoo JSON endpoint, handling the handshake and one stale-crumb retry. */
  async fetchJson(url: string): Promise<unknown> {
    if (!this.crumb) await this.handshake()
    let res = await this.get(this.sign(url))
    if (res.status === 401 || res.status === 403) {
      await this.handshake()
      res = await this.get(this.sign(url))
    }
    const classified = classifyStatus('Yahoo', res.status, THROTTLE_BACKOFF_MS)
    if (classified) throw classified
    const body = await res.text()
    try {
      return JSON.parse(body) as unknown
    } catch {
      throw new ProviderError('HTTP', 'Yahoo returned a non-JSON body.')
    }
  }

  private sign(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(this.crumb)}`
  }

  private async get(url: string, accept = 'application/json'): Promise<Response> {
    const headers: Record<string, string> = { 'User-Agent': UA, Accept: accept }
    if (this.jar) headers.Cookie = this.jar
    try {
      return await this.fetchImpl(url, { headers })
    } catch (err) {
      throw new ProviderError('NETWORK', 'Network error reaching Yahoo: ' + String(err))
    }
  }

  private async handshake(): Promise<void> {
    this.crumb = ''
    // fc.yahoo.com answers 404 by design — only its Set-Cookie header matters.
    const cookieRes = await this.get(COOKIE_URL, '*/*')
    const jar = cookieRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ')
    if (jar) this.jar = jar
    // getcrumb answers text/plain and refuses Accept: application/json with a 406.
    const crumbRes = await this.get(CRUMB_URL, '*/*')
    const classified = classifyStatus('Yahoo', crumbRes.status, THROTTLE_BACKOFF_MS)
    if (classified) throw classified
    const crumb = (await crumbRes.text()).trim()
    if (!crumb) throw new ProviderError('HTTP', 'Yahoo handed out an empty crumb.')
    this.crumb = crumb
  }
}
