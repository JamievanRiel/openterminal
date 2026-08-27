import type { CalendarResult } from '../shared/types'
import { DiskCache } from './diskcache'
import { classifyStatus, ProviderError } from './providers/util'
import { normalizeCalendar } from './calendarCore'

/** Free, no-key Forex Factory weekly macro calendar mirror. */
const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

export class CalendarService {
  private cache = new DiskCache<CalendarResult>('econ-calendar', 30 * 60_000, 2)

  async getWeek(): Promise<CalendarResult> {
    const cached = this.cache.get('week')
    if (cached && !cached.stale) return cached.value
    try {
      let res: Response
      try {
        res = await fetch(CALENDAR_URL, { headers: { Accept: 'application/json' } })
      } catch (err) {
        throw new ProviderError('NETWORK', 'Network error reaching the economic calendar: ' + String(err))
      }
      const classified = classifyStatus('Economic calendar', res.status)
      if (classified) throw classified
      const events = normalizeCalendar(await res.json())
      const result: CalendarResult = { events, fetchedAt: Date.now() }
      this.cache.set('week', result)
      return result
    } catch (err) {
      if (cached) return cached.value
      throw err
    }
  }
}
