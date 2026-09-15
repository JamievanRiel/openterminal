import type { AlertRule } from '../shared/types'

export const REPEAT_DEBOUNCE_MS = 5 * 60_000

export interface AlertEvaluation {
  fire: boolean
  message: string
}

/**
 * Pure alert-rule evaluation (unit-tested; the AlertEngine wraps this with
 * persistence and notifications). Semantics:
 *  - above/below fire on the CROSS, not while sitting past the level
 *    (prevPrice undefined = first observation → treat as a cross)
 *  - move fires when |%change today| crosses the threshold
 *  - one-shot rules never fire twice; repeating rules re-arm by crossing back
 *    (implied by cross semantics) and are debounced to once per 5 minutes
 */
export function evaluateAlertRule(
  rule: AlertRule,
  price: number,
  prevPrice: number | undefined,
  prevClose: number | undefined,
  now: number
): AlertEvaluation {
  const none: AlertEvaluation = { fire: false, message: '' }
  if (!rule.enabled) return none
  if (!rule.repeating && rule.fired) return none

  let triggered: boolean
  let message: string
  if (rule.condition === 'above') {
    triggered = price >= rule.value && (prevPrice === undefined || prevPrice < rule.value)
    message = `${rule.symbol} ${price.toFixed(2)} ▲ crossed above ${rule.value.toFixed(2)}`
  } else if (rule.condition === 'below') {
    triggered = price <= rule.value && (prevPrice === undefined || prevPrice > rule.value)
    message = `${rule.symbol} ${price.toFixed(2)} ▼ crossed below ${rule.value.toFixed(2)}`
  } else {
    if (prevClose === undefined || prevClose === 0) return none
    const movePct = ((price - prevClose) / prevClose) * 100
    const prevMove = prevPrice !== undefined ? ((prevPrice - prevClose) / prevClose) * 100 : undefined
    triggered = Math.abs(movePct) >= rule.value && (prevMove === undefined || Math.abs(prevMove) < rule.value)
    message = `${rule.symbol} moved ${movePct >= 0 ? '▲' : '▼'} ${movePct.toFixed(2)}% today (threshold ±${rule.value}%)`
  }
  if (!triggered) return none
  if (rule.repeating && rule.lastFiredAt !== null && now - rule.lastFiredAt < REPEAT_DEBOUNCE_MS) return none
  return { fire: true, message }
}
