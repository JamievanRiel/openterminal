import { describe, expect, it } from 'vitest'
import { formatFinancialNumber } from './format'

describe('formatFinancialNumber', () => {
  it('compact magnitudes', () => {
    expect(formatFinancialNumber(1_238_000_000)).toBe('1.24B')
    expect(formatFinancialNumber(391_000_000_000)).toBe('391B')
    expect(formatFinancialNumber(12_500)).toBe('12.5K')
  })

  it('negatives wrap in parentheses (statement convention) unless disabled', () => {
    expect(formatFinancialNumber(-1_500_000)).toBe('(1.5M)')
    expect(formatFinancialNumber(-2.5, { negParens: false })).toBe('-2.50')
  })

  it('percent style treats input as a fraction', () => {
    expect(formatFinancialNumber(0.456, { style: 'percent' })).toBe('45.6%')
    expect(formatFinancialNumber(-0.031, { style: 'percent' })).toBe('(3.1%)')
  })

  it('tiny crypto prices keep precision in full style', () => {
    expect(formatFinancialNumber(0.00001234, { style: 'full', decimals: 8 })).toBe('0.00001234')
  })

  it('null/undefined/NaN render as an em dash', () => {
    expect(formatFinancialNumber(null)).toBe('—')
    expect(formatFinancialNumber(undefined)).toBe('—')
    expect(formatFinancialNumber(Number.NaN)).toBe('—')
  })

  it('CSV-safe: plain output contains no separators that break unquoted cells', () => {
    // ratio/percent styles are what exports feed through — no thousands commas.
    expect(formatFinancialNumber(1234.5, { style: 'ratio' })).toBe('1234.50')
  })
})
