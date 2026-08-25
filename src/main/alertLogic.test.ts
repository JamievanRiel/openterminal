import { describe, expect, it } from 'vitest'
import type { AlertRule } from '../shared/types'
import { evaluateAlertRule, REPEAT_DEBOUNCE_MS } from './alertLogic'

const rule = (over: Partial<AlertRule>): AlertRule => ({
  id: 'r1',
  symbol: 'AAPL',
  condition: 'above',
  value: 190,
  repeating: false,
  enabled: true,
  createdAt: 0,
  lastFiredAt: null,
  fired: false,
  ...over
})

const NOW = 1_000_000_000

describe('evaluateAlertRule', () => {
  it('above fires on the cross, not while sitting above', () => {
    expect(evaluateAlertRule(rule({}), 190.5, 189.9, undefined, NOW).fire).toBe(true)
    expect(evaluateAlertRule(rule({}), 191, 190.5, undefined, NOW).fire).toBe(false) // already above
    expect(evaluateAlertRule(rule({}), 189, 188, undefined, NOW).fire).toBe(false)
  })

  it('first observation past the level counts as a cross', () => {
    expect(evaluateAlertRule(rule({}), 195, undefined, undefined, NOW).fire).toBe(true)
  })

  it('below mirrors above', () => {
    const r = rule({ condition: 'below', value: 180 })
    expect(evaluateAlertRule(r, 179.5, 180.2, undefined, NOW).fire).toBe(true)
    expect(evaluateAlertRule(r, 179, 179.5, undefined, NOW).fire).toBe(false)
  })

  it('move fires when |%change| crosses the threshold', () => {
    const r = rule({ condition: 'move', value: 3 })
    // prevClose 100: 102.9 → 103.1 crosses +3%
    expect(evaluateAlertRule(r, 103.1, 102.9, 100, NOW).fire).toBe(true)
    expect(evaluateAlertRule(r, 103.5, 103.2, 100, NOW).fire).toBe(false) // already beyond
    expect(evaluateAlertRule(r, 96.9, 97.5, 100, NOW).fire).toBe(true) // −3.1% crossing
    expect(evaluateAlertRule(r, 103.1, 102.9, undefined, NOW).fire).toBe(false) // no prevClose yet
  })

  it('one-shot rules never fire twice', () => {
    expect(evaluateAlertRule(rule({ fired: true }), 195, 189, undefined, NOW).fire).toBe(false)
  })

  it('repeating rules re-arm via crossing back, but respect the 5-min debounce', () => {
    const r = rule({ repeating: true, lastFiredAt: NOW - REPEAT_DEBOUNCE_MS + 1000 })
    expect(evaluateAlertRule(r, 190.5, 189.9, undefined, NOW).fire).toBe(false) // inside debounce
    const later = rule({ repeating: true, lastFiredAt: NOW - REPEAT_DEBOUNCE_MS - 1 })
    expect(evaluateAlertRule(later, 190.5, 189.9, undefined, NOW).fire).toBe(true) // debounce elapsed + crossed again
  })

  it('disabled rules never fire', () => {
    expect(evaluateAlertRule(rule({ enabled: false }), 195, 189, undefined, NOW).fire).toBe(false)
  })
})
