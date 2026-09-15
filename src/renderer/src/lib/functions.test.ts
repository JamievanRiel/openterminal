import { describe, expect, it } from 'vitest'
import { closestFunctions, fuzzyMatch, parseCommand } from './functions'

describe('parseCommand', () => {
  it('returns nothing to run for empty or blank input', () => {
    expect(parseCommand('')).toEqual({ ticker: null, fn: null, raw: '' })
    expect(parseCommand('   ')).toEqual({ ticker: null, fn: null, raw: '' })
  })

  it('treats a lone function code as that function with no ticker', () => {
    expect(parseCommand('FLOW')).toEqual({ ticker: null, fn: 'FLOW', raw: 'FLOW' })
    expect(parseCommand('HELP')).toEqual({ ticker: null, fn: 'HELP', raw: 'HELP' })
  })

  it('treats a lone unknown word as a ticker and opens its description', () => {
    expect(parseCommand('AAPL')).toEqual({ ticker: 'AAPL', fn: 'DES', raw: 'AAPL' })
  })

  it('accepts ticker-first, the Bloomberg-style order', () => {
    expect(parseCommand('AAPL FLOW')).toMatchObject({ ticker: 'AAPL', fn: 'FLOW' })
    expect(parseCommand('MSFT GP')).toMatchObject({ ticker: 'MSFT', fn: 'GP' })
  })

  it('accepts function-first with an argument', () => {
    expect(parseCommand('FLOW AAPL')).toMatchObject({ ticker: 'AAPL', fn: 'FLOW' })
    expect(parseCommand('FX EURUSD')).toMatchObject({ ticker: 'EURUSD', fn: 'FX' })
    expect(parseCommand('EQS BIGTECH')).toMatchObject({ ticker: 'BIGTECH', fn: 'EQS' })
  })

  it('prefers the second word when both words are function codes', () => {
    // `HP N` reads as "news for Helmerich & Payne", not "historical prices of N".
    expect(parseCommand('HP N')).toMatchObject({ ticker: 'HP', fn: 'N' })
  })

  it('upper-cases and collapses whitespace', () => {
    expect(parseCommand('  aapl   flow  ')).toEqual({ ticker: 'AAPL', fn: 'FLOW', raw: 'AAPL   FLOW' })
  })

  it('passes an unknown function through so the caller can suggest one', () => {
    expect(parseCommand('AAPL XYZ')).toMatchObject({ ticker: 'AAPL', fn: 'XYZ' })
  })

  it('reads only the first two words — anything after them is dropped', () => {
    // Documented limitation: `WS SAVE <name>` works only because CommandLine
    // intercepts WS before the parser ever sees it.
    expect(parseCommand('EQS BIG TECH')).toMatchObject({ ticker: 'BIG', fn: 'EQS' })
  })
})

describe('closestFunctions', () => {
  it('puts an exact match first', () => {
    expect(closestFunctions('FLOW')[0]).toBe('FLOW')
  })

  it('suggests the intended function for a one-character typo', () => {
    expect(closestFunctions('FLOWW')).toContain('FLOW')
    expect(closestFunctions('HELPP')).toContain('HELP')
    expect(closestFunctions('POR')).toContain('PORT')
  })

  it('returns the requested number of suggestions', () => {
    expect(closestFunctions('ZZZZ')).toHaveLength(3)
    expect(closestFunctions('ZZZZ', 5)).toHaveLength(5)
  })
})

describe('fuzzyMatch', () => {
  it('matches characters appearing in order', () => {
    expect(fuzzyMatch('OPT', 'OPTIONS')).toBe(true)
    expect(fuzzyMatch('ON', 'OPTIONS')).toBe(true)
  })

  it('rejects characters that appear out of order', () => {
    expect(fuzzyMatch('TPO', 'OPTIONS')).toBe(false)
  })

  it('rejects characters that are missing entirely', () => {
    expect(fuzzyMatch('OPTX', 'OPTIONS')).toBe(false)
  })

  it('ignores case on both sides', () => {
    expect(fuzzyMatch('opt', 'OPTIONS')).toBe(true)
    expect(fuzzyMatch('OPT', 'options')).toBe(true)
  })

  it('matches everything on an empty query', () => {
    expect(fuzzyMatch('', 'OPTIONS')).toBe(true)
  })
})
