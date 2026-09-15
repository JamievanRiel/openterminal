import type { OptionFlowContract, OptionsFlowResult } from '../shared/types'

/** Riel's thresholds: volume must beat open interest *and* an absolute floor. */
export const UNUSUAL_OI_RATIO = 1.0
export const UNUSUAL_VOLUME_FLOOR = 100
export const TOP_CONTRACTS = 12

type Raw = Record<string, unknown>

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null

/** Yahoo hands out expiries as epoch seconds at UTC midnight. */
const toIsoDate = (epochSeconds: unknown): string => new Date(num(epochSeconds) * 1000).toISOString().slice(0, 10)

function toContract(row: unknown, type: 'call' | 'put', ratio: number): OptionFlowContract | null {
  if (!isRecord(row)) return null
  const volume = num(row.volume)
  const openInterest = num(row.openInterest)
  return {
    contract: String(row.contractSymbol ?? ''),
    type,
    strike: num(row.strike),
    last: num(row.lastPrice),
    volume,
    openInterest,
    impliedVol: num(row.impliedVolatility),
    unusual: volume > Math.max(openInterest * ratio, UNUSUAL_VOLUME_FLOOR)
  }
}

/**
 * Yahoo v7 option chain → nearest-expiry flow. Totals cover every contract in
 * that expiry; `contracts` is the busiest `topN` slice. Returns null when the
 * payload carries no usable chain — the caller surfaces an honest error.
 */
export function parseOptionsChain(raw: unknown, topN = TOP_CONTRACTS, ratio = UNUSUAL_OI_RATIO): Omit<OptionsFlowResult, 'fetchedAt'> | null {
  if (!isRecord(raw)) return null
  const chain = raw.optionChain
  if (!isRecord(chain)) return null
  const result = Array.isArray(chain.result) ? chain.result[0] : null
  if (!isRecord(result)) return null
  const group = Array.isArray(result.options) ? result.options[0] : null
  if (!isRecord(group)) return null

  const contracts: OptionFlowContract[] = []
  for (const [key, type] of [['calls', 'call'], ['puts', 'put']] as const) {
    for (const row of Array.isArray(group[key]) ? (group[key] as unknown[]) : []) {
      const parsed = toContract(row, type, ratio)
      if (parsed) contracts.push(parsed)
    }
  }

  let totalCallVolume = 0
  let totalPutVolume = 0
  for (const c of contracts) {
    if (c.type === 'call') totalCallVolume += c.volume
    else totalPutVolume += c.volume
  }

  const quote = isRecord(result.quote) ? result.quote : null
  const price = quote?.regularMarketPrice
  const sorted = [...contracts].sort((a, b) => b.volume - a.volume)

  return {
    symbol: String(result.underlyingSymbol ?? ''),
    expiry: toIsoDate(group.expirationDate),
    spot: Number.isFinite(Number(price)) && price !== null && price !== undefined ? Number(price) : null,
    putCallRatio: totalCallVolume > 0 ? totalPutVolume / totalCallVolume : null,
    totalCallVolume,
    totalPutVolume,
    contracts: sorted.slice(0, topN)
  }
}
