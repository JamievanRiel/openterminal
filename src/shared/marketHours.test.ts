import { describe, expect, it } from 'vitest'
import { isExchangeOpen, minutesUntilState, nextTransition, usSessionState } from './marketHours'

/**
 * Every function under test resolves NY time via Intl with an explicit
 * timeZone, so results are independent of the system timezone by
 * construction — CI runs this same file on Windows/macOS (local TZ) and
 * Ubuntu (UTC) to prove it. Instants below are constructed in UTC.
 */
const utc = (y: number, m: number, d: number, h: number, min = 0): Date => new Date(Date.UTC(y, m - 1, d, h, min))

describe('usSessionState', () => {
  it('regular EST trading day (before spring-forward)', () => {
    expect(usSessionState(utc(2026, 3, 6, 15, 0))).toBe('open') // 10:00 EST Fri
    expect(usSessionState(utc(2026, 3, 6, 21, 5))).toBe('post') // 16:05 EST
    expect(usSessionState(utc(2026, 3, 6, 13, 0))).toBe('pre') // 08:00 EST
  })

  it('first EDT trading day after spring-forward (Mar 9, offset −4)', () => {
    expect(usSessionState(utc(2026, 3, 9, 13, 0))).toBe('pre') // 09:00 EDT
    expect(usSessionState(utc(2026, 3, 9, 13, 30))).toBe('open') // 09:30 EDT exactly
    expect(usSessionState(utc(2026, 3, 9, 20, 0))).toBe('post') // 16:00 EDT exactly
  })

  it('DST-transition Sunday itself is closed', () => {
    expect(usSessionState(utc(2026, 3, 8, 12, 0))).toBe('closed') // 08:00 EDT Sunday
  })

  it('first EST trading day after fall-back (Nov 2, offset −5)', () => {
    expect(usSessionState(utc(2026, 11, 2, 14, 29))).toBe('pre') // 09:29 EST
    expect(usSessionState(utc(2026, 11, 2, 14, 30))).toBe('open') // 09:30 EST
  })

  it('holiday: Jul 3 2026 (observed Independence Day) is closed', () => {
    expect(usSessionState(utc(2026, 7, 3, 15, 0))).toBe('closed') // 11:00 EDT
    expect(usSessionState(utc(2026, 7, 2, 15, 0))).toBe('open') // day before is open
  })

  it('half-day: Nov 27 2026 closes 13:00 ET', () => {
    expect(usSessionState(utc(2026, 11, 27, 17, 30))).toBe('open') // 12:30 EST
    expect(usSessionState(utc(2026, 11, 27, 18, 30))).toBe('post') // 13:30 EST
  })

  it('weekend boundary', () => {
    expect(usSessionState(utc(2026, 8, 22, 15, 0))).toBe('closed') // Saturday
    expect(usSessionState(utc(2026, 8, 21, 15, 0))).toBe('open') // Friday 11:00 EDT
  })
})

describe('nextTransition / minutesUntilState across DST', () => {
  it('spring-forward: real elapsed minutes, not wall-clock minutes', () => {
    // Sat Mar 7 12:00 UTC (07:00 EST) → next boundary Mon Mar 9 04:00 EDT = 08:00 UTC.
    // Wall clock says 45h; the real gap is 44h because the clocks jump forward.
    const t = nextTransition(utc(2026, 3, 7, 12, 0))
    expect(t.next).toBe('pre')
    expect(t.inMinutes).toBe(44 * 60)
    // Time-to-open exactly: Mon 09:30 EDT = 13:30 UTC → 49.5h.
    expect(minutesUntilState('open', utc(2026, 3, 7, 12, 0))).toBe(49.5 * 60)
  })

  it('fall-back: the extra hour is counted', () => {
    // Sat Oct 31 12:00 UTC (08:00 EDT) → open Mon Nov 2 09:30 EST = 14:30 UTC → 50.5h.
    expect(minutesUntilState('open', utc(2026, 10, 31, 12, 0))).toBe(50.5 * 60)
  })

  it('half-day close boundary lands at 13:00 ET', () => {
    // Fri Nov 27 17:00 UTC = 12:00 EST → post starts in 60 minutes.
    const t = nextTransition(utc(2026, 11, 27, 17, 0))
    expect(t.next).toBe('post')
    expect(t.inMinutes).toBe(60)
  })

  it('never returns a non-positive countdown', () => {
    for (const instant of [
      utc(2026, 3, 9, 13, 30), // exactly at open
      utc(2026, 11, 27, 18, 0), // exactly at half-day close
      utc(2026, 3, 8, 6, 59) // one minute before the DST jump
    ]) {
      expect(nextTransition(instant).inMinutes).toBeGreaterThan(0)
      expect(minutesUntilState('open', instant)).toBeGreaterThan(0)
    }
  })
})

describe('isExchangeOpen', () => {
  it('NYSE respects US holidays; weekend closes everything', () => {
    expect(isExchangeOpen('NYSE', utc(2026, 7, 3, 15, 0))).toBe(false) // holiday
    expect(isExchangeOpen('NYSE', utc(2026, 7, 2, 15, 0))).toBe(true)
    expect(isExchangeOpen('LSE', utc(2026, 8, 22, 10, 0))).toBe(false) // Saturday
  })
  it('Tokyo lunch break is closed', () => {
    // 11:45 JST = 02:45 UTC — between the morning and afternoon sessions.
    expect(isExchangeOpen('TSE', utc(2026, 8, 21, 2, 45))).toBe(false)
    expect(isExchangeOpen('TSE', utc(2026, 8, 21, 1, 0))).toBe(true) // 10:00 JST
  })
})
