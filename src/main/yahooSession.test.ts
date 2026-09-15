import { describe, expect, it } from 'vitest'
import { YahooSession } from './yahooSession'
import type { ProviderError } from './providers/util'

const COOKIE = 'A3=abc123; Path=/; Domain=.yahoo.com'

interface Call {
  url: string
  headers: Record<string, string>
}

/** Queue of canned responses; records what the session asked for. */
function stubFetch(responses: Array<Response | Error>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const queue = [...responses]
  const fetchImpl = (url: string, init?: { headers?: Record<string, string> }): Promise<Response> => {
    calls.push({ url, headers: init?.headers ?? {} })
    const next = queue.shift()
    if (next === undefined) throw new Error(`unexpected fetch: ${url}`)
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return { fetch: fetchImpl as unknown as typeof fetch, calls }
}

const cookieRes = (): Response => new Response('not found', { status: 404, headers: [['set-cookie', COOKIE]] })
const crumbRes = (crumb = 'xY9tok'): Response => new Response(crumb, { status: 200 })
const jsonRes = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })

const catchError = async (p: Promise<unknown>): Promise<ProviderError> => {
  try {
    await p
    throw new Error('expected a rejection')
  } catch (err) {
    return err as ProviderError
  }
}

describe('YahooSession', () => {
  it('runs the cookie handshake and sends both crumb and cookies on the data request', async () => {
    const { fetch, calls } = stubFetch([cookieRes(), crumbRes(), jsonRes({ ok: 1 })])
    const session = new YahooSession(fetch)

    await expect(session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL')).resolves.toEqual({ ok: 1 })

    expect(calls[0].url).toBe('https://fc.yahoo.com')
    expect(calls[1].url).toContain('/v1/test/getcrumb')
    expect(calls[1].headers.Cookie).toBe('A3=abc123')
    expect(calls[2].url).toBe('https://query2.finance.yahoo.com/v7/finance/options/AAPL?crumb=xY9tok')
    expect(calls[2].headers.Cookie).toBe('A3=abc123')
    expect(calls[2].headers['User-Agent']).toMatch(/Mozilla/)
  })

  it('reuses the crumb on a second request instead of repeating the handshake', async () => {
    const { fetch, calls } = stubFetch([cookieRes(), crumbRes(), jsonRes({ n: 1 }), jsonRes({ n: 2 })])
    const session = new YahooSession(fetch)

    await session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL')
    await expect(session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/MSFT')).resolves.toEqual({ n: 2 })

    expect(calls).toHaveLength(4)
    expect(calls[3].url).toContain('MSFT')
  })

  it('refreshes the crumb once when a stale crumb is rejected, then retries the request', async () => {
    const { fetch, calls } = stubFetch([
      cookieRes(),
      crumbRes('stale'),
      new Response('Invalid Crumb', { status: 403 }),
      cookieRes(),
      crumbRes('fresh'),
      jsonRes({ recovered: true })
    ])
    const session = new YahooSession(fetch)

    await expect(session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL')).resolves.toEqual({ recovered: true })

    expect(calls[2].url).toContain('crumb=stale')
    expect(calls[5].url).toContain('crumb=fresh')
  })

  it('gives up after one refresh instead of looping on a persistent rejection', async () => {
    const { fetch, calls } = stubFetch([
      cookieRes(),
      crumbRes('a'),
      new Response('Invalid Crumb', { status: 403 }),
      cookieRes(),
      crumbRes('b'),
      new Response('Invalid Crumb', { status: 403 })
    ])
    const session = new YahooSession(fetch)

    const err = await catchError(session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL'))
    expect(err.code).toBe('UNSUPPORTED')
    expect(calls).toHaveLength(6)
  })

  it('reports a throttled handshake as RATE_LIMITED with a retry hint', async () => {
    const { fetch } = stubFetch([cookieRes(), new Response('Too Many Requests', { status: 429 })])
    const session = new YahooSession(fetch)

    const err = await catchError(session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL'))
    expect(err.code).toBe('RATE_LIMITED')
    expect(err.retryAfterMs).toBeGreaterThan(0)
    expect(err.message).toContain('Yahoo')
  })

  it('maps a transport failure to NETWORK', async () => {
    const { fetch } = stubFetch([new TypeError('fetch failed')])
    const session = new YahooSession(fetch)

    expect((await catchError(session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL'))).code).toBe('NETWORK')
  })

  it('appends the crumb to a URL that already carries a query string', async () => {
    const { fetch, calls } = stubFetch([cookieRes(), crumbRes('c1'), jsonRes({})])
    const session = new YahooSession(fetch)

    await session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL?date=123')
    expect(calls[2].url).toBe('https://query2.finance.yahoo.com/v7/finance/options/AAPL?date=123&crumb=c1')
  })

  it('rejects an empty crumb rather than signing requests with nothing', async () => {
    const { fetch } = stubFetch([cookieRes(), crumbRes('   ')])
    const session = new YahooSession(fetch)

    expect((await catchError(session.fetchJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL'))).code).toBe('HTTP')
  })
})
