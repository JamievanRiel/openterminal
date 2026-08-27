import { describe, expect, it } from 'vitest'
import { normalizeCalendar } from './calendarCore'

const raw = (over: Record<string, unknown>): Record<string, unknown> => ({
  title: 'CPI m/m',
  country: 'USD',
  impact: 'High',
  actual: '',
  forecast: '0.3%',
  previous: '0.4%',
  date: '2026-08-25T08:30:00-04:00',
  ...over
})

describe('normalizeCalendar', () => {
  it('maps Forex Factory impact labels and colours to buckets', () => {
    const events = normalizeCalendar([
      raw({ impact: 'High' }),
      raw({ impact: 'red' }),
      raw({ impact: 'Orange' }),
      raw({ impact: 'Medium' }),
      raw({ impact: 'yellow' }),
      raw({ impact: 'Holiday' }),
      raw({ impact: '' })
    ])
    expect(events.map((e) => e.impact)).toEqual(['high', 'high', 'medium', 'medium', 'low', 'low', 'low'])
  })

  it('normalises calendar currencies to country codes and keeps unknowns', () => {
    const events = normalizeCalendar([
      raw({ country: 'USD' }),
      raw({ country: 'EUR' }),
      raw({ country: 'GBP' }),
      raw({ country: 'JPY' }),
      raw({ country: 'CAD' })
    ])
    expect(events.map((e) => e.country)).toEqual(['US', 'EU', 'GB', 'JP', 'CAD'])
  })

  it('parses offset ISO times, sorts ascending, unparseable times last', () => {
    const events = normalizeCalendar([
      raw({ title: 'later', date: '2026-08-26T10:00:00-04:00' }),
      raw({ title: 'no-time', date: '' }),
      raw({ title: 'earlier', date: '2026-08-25T08:30:00-04:00' })
    ])
    expect(events.map((e) => e.title)).toEqual(['earlier', 'later', 'no-time'])
    expect(events[0].time).toBe(Date.parse('2026-08-25T08:30:00-04:00'))
    expect(events[2].time).toBeNull()
  })

  it('tolerates junk input and drops titleless rows', () => {
    expect(normalizeCalendar(null)).toEqual([])
    expect(normalizeCalendar({ not: 'array' })).toEqual([])
    expect(normalizeCalendar([null, 42, { title: '' }, raw({})])).toHaveLength(1)
  })

  it('stringifies missing detail fields to empty strings', () => {
    const [e] = normalizeCalendar([{ title: 'NFP', country: 'USD', impact: 'red', date: '' }])
    expect(e.actual).toBe('')
    expect(e.forecast).toBe('')
    expect(e.previous).toBe('')
  })
})
