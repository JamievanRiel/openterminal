import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { RateLimitInfo, StreamState, StreamTick } from '../../../shared/types'
import { invoke } from './ipc'

/**
 * Renderer-side live tick store. One IPC listener receives coalesced batches
 * from the main-process relay; batches are applied inside a single
 * requestAnimationFrame pass and fan out to per-symbol subscribers.
 */

export interface LiveTick {
  price: number
  dir: -1 | 0 | 1
  ts: number
  /** cumulative streamed volume observed this app session */
  sessionVolume: number
  delayed: boolean
  /** monotonic update counter — drives flash animations */
  seq: number
}

let tickSeq = 0

const prices = new Map<string, LiveTick>()
const symbolListeners = new Map<string, Set<() => void>>()
let pendingBatches: StreamTick[][] = []
let rafId: number | null = null
let lastCryptoTickAt = 0

function applyPending(): void {
  rafId = null
  const batches = pendingBatches
  pendingBatches = []
  const touched = new Set<string>()
  for (const batch of batches) {
    for (const tick of batch) {
      const prev = prices.get(tick.symbol)
      prices.set(tick.symbol, {
        price: tick.price,
        dir: tick.dir,
        ts: tick.ts,
        sessionVolume: (prev?.sessionVolume ?? 0) + tick.volume,
        delayed: tick.delayed ?? false,
        seq: ++tickSeq
      })
      touched.add(tick.symbol)
      if (tick.symbol.endsWith('-USD')) lastCryptoTickAt = Date.now()
    }
  }
  for (const symbol of touched) {
    symbolListeners.get(symbol)?.forEach((fn) => fn())
  }
}

window.terminal.on('stream:ticks', (payload) => {
  pendingBatches.push(payload as StreamTick[])
  // rAF doesn't run while the window is hidden — cap the backlog so a long
  // minimize (alerts keep the stream alive) can't grow memory unbounded.
  if (pendingBatches.length > 50) pendingBatches.splice(0, pendingBatches.length - 50)
  if (rafId === null) rafId = requestAnimationFrame(applyPending)
})

/** True when any crypto symbol ticked within the last 2 minutes (keeps the tape alive off-hours). */
export function cryptoTicking(): boolean {
  return Date.now() - lastCryptoTickAt < 120_000
}

/** Dev leak-harness introspection: current listener footprint of the live store. */
export function liveDebugCounts(): { symbolsWithListeners: number; totalListeners: number } {
  let total = 0
  for (const set of symbolListeners.values()) total += set.size
  return { symbolsWithListeners: symbolListeners.size, totalListeners: total }
}

let subscriberSeq = 0

/**
 * Subscribe this component to live ticks for `symbol` (null = no-op).
 * Each hook instance is its own subscriber id; the main process reference-counts
 * so N panels on one symbol still cost exactly one upstream subscription.
 */
export function useLiveTick(symbol: string | null): LiveTick | undefined {
  const idRef = useRef<string>()
  if (!idRef.current) idRef.current = `sub-${++subscriberSeq}`

  useEffect(() => {
    if (!symbol) return
    const subscriberId = idRef.current as string
    void invoke('stream:subscribe', { symbol, subscriberId }).catch(() => undefined)
    return () => {
      void invoke('stream:unsubscribe', { symbol, subscriberId }).catch(() => undefined)
    }
  }, [symbol])

  return useSyncExternalStore(
    (onChange) => {
      if (!symbol) return () => undefined
      let set = symbolListeners.get(symbol)
      if (!set) {
        set = new Set()
        symbolListeners.set(symbol, set)
      }
      set.add(onChange)
      return () => {
        set?.delete(onChange)
        // Prune empty sets so the listener map can't grow with symbol churn.
        if (set && set.size === 0) symbolListeners.delete(symbol)
      }
    },
    () => (symbol ? prices.get(symbol) : undefined)
  )
}

// --------------------------------------------------------------- stream state

let streamState: StreamState = 'off'
const stateListeners = new Set<() => void>()
window.terminal.on('stream:state', (payload) => {
  streamState = payload as StreamState
  stateListeners.forEach((fn) => fn())
})
void invoke<StreamState>('stream:state')
  .then((s) => {
    streamState = s
    stateListeners.forEach((fn) => fn())
  })
  .catch(() => undefined)

export function useStreamState(): StreamState {
  return useSyncExternalStore(
    (onChange) => {
      stateListeners.add(onChange)
      return () => stateListeners.delete(onChange)
    },
    () => streamState
  )
}

// ---------------------------------------------------------------- rate limits

let rateLimits: RateLimitInfo[] = []
const rateListeners = new Set<() => void>()
window.terminal.on('ratelimit:status', (payload) => {
  rateLimits = payload as RateLimitInfo[]
  rateListeners.forEach((fn) => fn())
})

export function useRateLimits(): RateLimitInfo[] {
  return useSyncExternalStore(
    (onChange) => {
      rateListeners.add(onChange)
      return () => rateListeners.delete(onChange)
    },
    () => rateLimits
  )
}
