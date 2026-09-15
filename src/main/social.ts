import type { SocialResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { classifyStatus, ProviderError } from './providers/util'
import { parseFeedEntries } from './atom'
import { normalizeSocial } from './socialCore'
import { aggregateSentiment } from './sentimentCore'

/** Subreddit list ported from Riel-main's social config. */
const SUBREDDITS = ['wallstreetbets', 'stocks', 'investing', 'CryptoCurrency']
const POST_LIMIT = 30
// Anonymous Reddit RSS allows roughly one request per 60s window per IP
// (x-ratelimit-remaining drops to 0 after a single call), so all four
// subreddits are fetched as ONE multireddit feed rather than four requests.
// Reddit merges its own hot ranking across them and tags each entry with its
// sub in <category term="…">.
const FEED_URL = `https://www.reddit.com/r/${SUBREDDITS.join('+')}/hot/.rss?limit=${POST_LIMIT}`
// Reddit 403/429s anything that looks like a default client; a descriptive UA
// is the price of keyless access. The JSON API is blocked outright, RSS is not.
const USER_AGENT = 'OpenTerminal/1.0 (personal-use; keyless RSS reader; +https://github.com/JamievanRiel/openterminal)'
const THROTTLE_BACKOFF_MS = 300_000

export class SocialService {
  private cache = new DiskCache<SocialResult>('social-reddit', 5 * 60_000, 2)

  async get(): Promise<SocialResult> {
    const cached = this.cache.get('reddit')
    if (cached && !cached.stale) return cached.value
    try {
      let res: Response
      try {
        res = await fetch(FEED_URL, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml, application/xml, text/xml' }
        })
      } catch (err) {
        throw new ProviderError('NETWORK', 'Network error reaching Reddit: ' + String(err))
      }
      const classified = classifyStatus('Reddit', res.status, res.status === 429 ? THROTTLE_BACKOFF_MS : undefined)
      if (classified) throw classified
      const posts = normalizeSocial(parseFeedEntries(await res.text()))
      const result: SocialResult = {
        posts,
        sentiment: aggregateSentiment(posts.map((p) => p.sentiment)),
        fetchedAt: Date.now()
      }
      this.cache.set('reddit', result)
      return result
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }
}
