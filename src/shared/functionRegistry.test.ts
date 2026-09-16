import { describe, expect, it } from 'vitest'
import { FUNCTION_REGISTRY, KEYLESS_FUNCTIONS } from './functionRegistry'

describe('keyless functions', () => {
  it('marks exactly the functions that load data without any API key', () => {
    expect(KEYLESS_FUNCTIONS.map((f) => f.code).sort()).toEqual(
      ['CRYP', 'ECAL', 'FLOW', 'FLT', 'SOCL', 'SPACE', 'WIRE'].sort()
    )
  })

  it('only lists functions that run bare, so the first-run wizard can open them without a ticker', () => {
    for (const f of KEYLESS_FUNCTIONS) {
      expect(f.implemented, f.code).toBe(true)
      expect(f.needsTicker, f.code).toBe(false)
    }
  })

  it('carries the flag on every registry entry', () => {
    for (const f of FUNCTION_REGISTRY) expect(typeof f.keyless, f.code).toBe('boolean')
  })
})
