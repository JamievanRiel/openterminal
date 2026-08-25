/**
 * Market-hours logic shared by main (stream lifecycle) and renderer (status bar, WEI dots).
 * Pure functions over Date + Intl; no Node/DOM APIs.
 */

export type UsSessionState = 'closed' | 'pre' | 'open' | 'post'

/** 2026 US equity market full-closure days (NYSE/Nasdaq). Maintained in code per phase spec. */
const US_HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed — Jul 4 falls on Saturday)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25' // Christmas
])

/** 2026 half days — equities close 13:00 ET. */
const US_HALF_DAYS_2026 = new Set([
  '2026-11-27', // day after Thanksgiving
  '2026-12-24' // Christmas Eve
])

interface ZonedParts {
  ymd: string
  weekday: number // 0 = Sunday … 6 = Saturday
  minutes: number // minutes since local midnight
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const partsFmtCache = new Map<string, Intl.DateTimeFormat>()

function zonedParts(now: Date, tz: string): ZonedParts {
  let fmt = partsFmtCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    partsFmtCache.set(tz, fmt)
  }
  const parts = fmt.formatToParts(now)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  const hour = Number(get('hour')) % 24
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutes: hour * 60 + Number(get('minute'))
  }
}

const PRE_START = 4 * 60 // 04:00
const OPEN = 9 * 60 + 30 // 09:30
const CLOSE = 16 * 60 // 16:00
const HALF_CLOSE = 13 * 60 // 13:00
const POST_END = 20 * 60 // 20:00

function isUsTradingDay(p: ZonedParts): boolean {
  return p.weekday >= 1 && p.weekday <= 5 && !US_HOLIDAYS_2026.has(p.ymd)
}

function usCloseMinute(p: ZonedParts): number {
  return US_HALF_DAYS_2026.has(p.ymd) ? HALF_CLOSE : CLOSE
}

/** Current US equity session state (pre-market, regular, after-hours, closed). */
export function usSessionState(now: Date = new Date()): UsSessionState {
  const p = zonedParts(now, 'America/New_York')
  if (!isUsTradingDay(p)) return 'closed'
  const close = usCloseMinute(p)
  if (p.minutes >= OPEN && p.minutes < close) return 'open'
  if (p.minutes >= PRE_START && p.minutes < OPEN) return 'pre'
  if (p.minutes >= close && p.minutes < POST_END) return 'post'
  return 'closed'
}

export function isOpen(now: Date = new Date()): boolean {
  return usSessionState(now) === 'open'
}

export interface SessionTransition {
  /** state entered at the transition */
  next: UsSessionState
  /** minutes from `now` until the transition (NY-local arithmetic; ±1h at DST changes) */
  inMinutes: number
}

/** Next US session-state transition after `now`. */
export function nextTransition(now: Date = new Date()): SessionTransition {
  const p = zonedParts(now, 'America/New_York')
  for (let day = 0; day < 14; day++) {
    // Probe each following NY day via UTC day offsets; zonedParts re-normalizes to NY.
    const probe = day === 0 ? p : zonedParts(new Date(now.getTime() + day * 86_400_000), 'America/New_York')
    if (!isUsTradingDay(probe)) continue
    const close = usCloseMinute(probe)
    const boundaries: Array<[number, UsSessionState]> = [
      [PRE_START, 'pre'],
      [OPEN, 'open'],
      [close, 'post'],
      [POST_END, 'closed']
    ]
    for (const [minute, next] of boundaries) {
      const delta = day === 0 ? minute - p.minutes : 1440 - p.minutes + (day - 1) * 1440 + minute
      if (delta > 0) return { next, inMinutes: delta }
    }
  }
  return { next: 'pre', inMinutes: 24 * 60 }
}

// ---------------------------------------------------------------------------
// World exchanges (WEI open/closed dots). Sessions in local minutes.
// Local-holiday calendars are not tracked for non-US exchanges (weekends + hours only).
// ---------------------------------------------------------------------------

export interface ExchangeDef {
  id: string
  name: string
  tz: string
  sessions: Array<[number, number]>
}

export const EXCHANGES: Record<string, ExchangeDef> = {
  NYSE: { id: 'NYSE', name: 'New York', tz: 'America/New_York', sessions: [[OPEN, CLOSE]] },
  AMS: { id: 'AMS', name: 'Amsterdam', tz: 'Europe/Amsterdam', sessions: [[540, 1050]] },
  LSE: { id: 'LSE', name: 'London', tz: 'Europe/London', sessions: [[480, 990]] },
  FRA: { id: 'FRA', name: 'Frankfurt', tz: 'Europe/Berlin', sessions: [[540, 1050]] },
  PAR: { id: 'PAR', name: 'Paris', tz: 'Europe/Paris', sessions: [[540, 1050]] },
  TSE: {
    id: 'TSE',
    name: 'Tokyo',
    tz: 'Asia/Tokyo',
    sessions: [
      [540, 690],
      [750, 930]
    ]
  },
  HKEX: {
    id: 'HKEX',
    name: 'Hong Kong',
    tz: 'Asia/Hong_Kong',
    sessions: [
      [570, 720],
      [780, 960]
    ]
  },
  ASX: { id: 'ASX', name: 'Sydney', tz: 'Australia/Sydney', sessions: [[600, 960]] }
}

export function isExchangeOpen(exchangeId: string, now: Date = new Date()): boolean {
  const def = EXCHANGES[exchangeId]
  if (!def) return false
  const p = zonedParts(now, def.tz)
  if (p.weekday === 0 || p.weekday === 6) return false
  if (def.id === 'NYSE' && US_HOLIDAYS_2026.has(p.ymd)) return false
  const close = def.id === 'NYSE' ? usCloseMinute(p) : undefined
  return def.sessions.some(([start, end]) => p.minutes >= start && p.minutes < (close ?? end))
}
