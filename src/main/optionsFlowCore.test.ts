import { describe, expect, it } from 'vitest'
import { parseOptionsChain } from './optionsFlowCore'

// Yahoo v7 /finance/options shape, trimmed to the fields we read.
const contract = (
  symbol: string,
  strike: number,
  volume: number | undefined,
  openInterest: number | undefined,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  contractSymbol: symbol,
  strike,
  lastPrice: 1.25,
  volume,
  openInterest,
  impliedVolatility: 0.34,
  ...extra
})

const payload = (calls: unknown[], puts: unknown[], quote: Record<string, unknown> | null = { regularMarketPrice: 191.5 }): unknown => ({
  optionChain: {
    result: [
      {
        underlyingSymbol: 'AAPL',
        quote,
        options: [{ expirationDate: 1760054400, calls, puts }] // 2025-10-10T00:00:00Z
      }
    ],
    error: null
  }
})

describe('parseOptionsChain', () => {
  it('parses the nearest expiry, coercing missing volume and open interest to zero', () => {
    const flow = parseOptionsChain(payload([contract('AAPL251010C00190000', 190, undefined, undefined)], []))
    expect(flow).not.toBeNull()
    expect(flow!.symbol).toBe('AAPL')
    expect(flow!.expiry).toBe('2025-10-10')
    expect(flow!.spot).toBe(191.5)
    expect(flow!.contracts).toHaveLength(1)
    expect(flow!.contracts[0]).toMatchObject({
      contract: 'AAPL251010C00190000',
      type: 'call',
      strike: 190,
      last: 1.25,
      volume: 0,
      openInterest: 0,
      impliedVol: 0.34
    })
  })

  it('flags a contract unusual only when volume clears both the OI ratio and the 100 floor', () => {
    const flow = parseOptionsChain(
      payload(
        [
          contract('BIG', 190, 5000, 1000), // 5000 > max(1000, 100) → unusual
          contract('THIN', 195, 80, 0), // clears OI but not the 100 floor
          contract('DEEP', 200, 900, 4000) // plenty of volume, but OI is deeper
        ],
        []
      )
    )
    const byName = Object.fromEntries(flow!.contracts.map((c) => [c.contract, c.unusual]))
    expect(byName).toEqual({ BIG: true, THIN: false, DEEP: false })
  })

  it('totals volume across the whole chain and caps the contract list at topN by volume', () => {
    const calls = [contract('C1', 190, 300, 10), contract('C2', 191, 200, 10), contract('C3', 192, 100, 10)]
    const puts = [contract('P1', 180, 250, 10)]
    const flow = parseOptionsChain(payload(calls, puts), 2)
    expect(flow!.totalCallVolume).toBe(600)
    expect(flow!.totalPutVolume).toBe(250)
    expect(flow!.putCallRatio).toBeCloseTo(250 / 600)
    expect(flow!.contracts.map((c) => c.contract)).toEqual(['C1', 'P1'])
  })

  it('marks puts with their side and nulls the ratio when no calls traded', () => {
    const flow = parseOptionsChain(payload([contract('C1', 190, 0, 10)], [contract('P1', 180, 40, 10)]))
    expect(flow!.contracts.find((c) => c.contract === 'P1')!.type).toBe('put')
    expect(flow!.putCallRatio).toBeNull()
  })

  it('returns null spot when the quote carries no price', () => {
    expect(parseOptionsChain(payload([contract('C1', 190, 1, 1)], [], null))!.spot).toBeNull()
  })

  it('returns null for an empty, errored or malformed payload', () => {
    expect(parseOptionsChain({ optionChain: { result: [], error: null } })).toBeNull()
    expect(parseOptionsChain({ optionChain: { result: [{ underlyingSymbol: 'AAPL', options: [] }] } })).toBeNull()
    expect(parseOptionsChain('not json at all')).toBeNull()
    expect(parseOptionsChain(null)).toBeNull()
  })
})
