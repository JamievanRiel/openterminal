import WebSocket from 'ws'
import type { StreamState, StreamTick } from '../../shared/types'
import { classify, fromStreamSymbol, toStreamSymbol } from '../../shared/symbols'
import { nextTransition, usSessionState } from '../../shared/marketHours'
import type { TwelveDataProvider } from '../providers/twelvedata'

// OT_WS_URL: dev knob to point the relay at an unreachable/local endpoint (offline sim, testing).
const WS_URL = process.env.OT_WS_URL ?? 'wss://ws.finnhub.io'
const FLUSH_MS = 150 // batch window, spec range 100–250ms
const HEARTBEAT_CHECK_MS = 15_000
const SILENCE_LIMIT_MS = 60_000
const MAX_BACKOFF_MS = 30_000
const FX_POLL_MS = 60_000

interface PendingTick {
  price: number
  volume: number
  dir: -1 | 0 | 1
  ts: number
  delayed?: boolean
}

/**
 * Finnhub WebSocket relay. Lives ONLY in the main process; renderers get
 * coalesced batches over 'stream:ticks'. Reference-counts subscriptions per
 * (webContents, subscriberId) so N panels watching AAPL cost one upstream sub,
 * and so future pop-out windows (Phase 6) can share the registry.
 */
export class StreamManager {
  private ws: WebSocket | null = null
  private state: StreamState = 'off'
  private paused = false
  private intentionalClose = false
  private wasLive = false
  private backoffMs = 1_000
  private lastMsgAt = 0
  private lastFxTradeAt = new Map<string, number>()

  /** stream symbol → subscriber keys ("wcId:subscriberId") */
  private refs = new Map<string, Set<string>>()
  private pending = new Map<string, PendingTick>()
  private lastPrice = new Map<string, number>()

  private reconnectTimer: NodeJS.Timeout | null = null
  private evalTimer: NodeJS.Timeout | null = null
  private readonly flushTimer: NodeJS.Timeout
  private readonly heartbeatTimer: NodeJS.Timeout
  private readonly fxTimer: NodeJS.Timeout

  constructor(
    private getKey: () => string | null,
    private twelvedata: TwelveDataProvider,
    private broadcast: (channel: string, payload: unknown) => void
  ) {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS)
    this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), HEARTBEAT_CHECK_MS)
    this.fxTimer = setInterval(() => void this.pollFx(), FX_POLL_MS)
  }

  // ------------------------------------------------------------------ public

  getState(): StreamState {
    return this.state
  }

  subscribe(wcId: number, subscriberId: string, displaySymbol: string): void {
    // An alert-engine subscription (wcId -1) overrides a hidden-window pause.
    if (wcId === -1 && this.paused) this.paused = false
    const streamSym = toStreamSymbol(displaySymbol)
    const key = `${wcId}:${subscriberId}`
    let set = this.refs.get(streamSym)
    if (!set) {
      set = new Set()
      this.refs.set(streamSym, set)
    }
    const wasEmpty = set.size === 0
    set.add(key)
    if (wasEmpty) {
      console.log(`[stream] 0→1 subscribe ${streamSym}`)
      this.sendJson({ type: 'subscribe', symbol: streamSym })
      if (classify(displaySymbol) === 'fx') void this.pollFx(displaySymbol)
    }
    this.evaluate()
  }

  unsubscribe(wcId: number, subscriberId: string, displaySymbol: string): void {
    const streamSym = toStreamSymbol(displaySymbol)
    const key = `${wcId}:${subscriberId}`
    const set = this.refs.get(streamSym)
    if (!set || !set.delete(key)) return
    if (set.size === 0) {
      this.refs.delete(streamSym)
      console.log(`[stream] 1→0 unsubscribe ${streamSym}`)
      this.sendJson({ type: 'unsubscribe', symbol: streamSym })
      this.evaluate()
    }
  }

  /** Drop every subscription owned by a destroyed window. */
  dropSender(wcId: number): void {
    const prefix = `${wcId}:`
    for (const [streamSym, set] of this.refs) {
      for (const key of set) if (key.startsWith(prefix)) set.delete(key)
      if (set.size === 0) {
        this.refs.delete(streamSym)
        this.sendJson({ type: 'unsubscribe', symbol: streamSym })
      }
    }
    this.evaluate()
  }

  /**
   * All windows hidden/minimized: keep the registry, drop the socket —
   * UNLESS the alert engine (synthetic wcId -1) holds subscriptions: alerts
   * must keep firing from the tray, so the socket stays up for them.
   */
  pause(): void {
    if (this.paused) return
    const alertsActive = [...this.refs.values()].some((set) => [...set].some((k) => k.startsWith('-1:')))
    if (alertsActive) return
    this.paused = true
    this.disconnect()
    this.setState('paused')
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.evaluate()
  }

  onKeyChanged(): void {
    this.disconnect()
    this.backoffMs = 1_000
    this.evaluate()
  }

  /**
   * System woke from sleep: the socket is almost certainly dead but may not
   * have emitted 'close' yet. Recycle it immediately instead of waiting for
   * the 60s heartbeat, and restart the backoff ladder.
   */
  onSystemResume(): void {
    console.log('[stream] system resumed — forcing connection health check')
    this.backoffMs = 1_000
    if (this.ws) {
      try {
        this.ws.terminate() // close handler schedules the reconnect
      } catch {
        this.ws = null
        this.evaluate()
      }
    } else {
      this.evaluate()
    }
  }

  // ------------------------------------------------------------ connection

  /** Decide whether we should be connected right now, and converge on it. */
  private evaluate(): void {
    if (this.evalTimer) {
      clearTimeout(this.evalTimer)
      this.evalTimer = null
    }
    if (this.paused) return
    const key = this.getKey()
    if (!key || this.refs.size === 0) {
      this.disconnect()
      this.setState('off')
      return
    }
    if (this.needsLive()) {
      if (!this.ws && !this.reconnectTimer) this.connect()
      return
    }
    // US market closed and nothing 24/7 subscribed → fully idle; re-check at the next session transition.
    this.disconnect()
    this.setState('off')
    const wake = Math.min(nextTransition().inMinutes * 60_000 + 5_000, 15 * 60_000)
    this.evalTimer = setTimeout(() => this.evaluate(), wake)
  }

  private needsLive(): boolean {
    const anyCrypto = [...this.refs.keys()].some((s) => classify(fromStreamSymbol(s)) === 'crypto')
    return anyCrypto || usSessionState() !== 'closed'
  }

  private connect(): void {
    const key = this.getKey()
    if (!key) return
    this.setState(this.wasLive ? 'reconnecting' : 'connecting')
    this.intentionalClose = false
    const ws = new WebSocket(`${WS_URL}?token=${key}`)
    this.ws = ws

    ws.on('open', () => {
      if (this.ws !== ws) return
      this.backoffMs = 1_000
      this.wasLive = true
      this.lastMsgAt = Date.now()
      this.setState('live')
      // Automatic resubscription of every active symbol after (re)connect.
      for (const streamSym of this.refs.keys()) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: streamSym }))
      }
    })

    ws.on('message', (raw) => {
      if (this.ws !== ws) return
      this.lastMsgAt = Date.now()
      let msg: { type?: string; data?: Array<{ s: string; p: number; v: number; t: number }> }
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg.type === 'trade' && Array.isArray(msg.data)) {
        for (const trade of msg.data) this.accumulate(trade.s, trade.p, trade.v ?? 0, trade.t)
      }
    })

    ws.on('error', (err) => {
      if (this.ws === ws) console.error('[stream] socket error:', err.message)
    })

    ws.on('close', () => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.intentionalClose) return
      this.scheduleReconnect()
    })
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.intentionalClose = true
      try {
        this.ws.close()
      } catch {
        /* already dead */
      }
      this.ws = null
    }
  }

  private scheduleReconnect(): void {
    if (this.paused || this.reconnectTimer) return
    this.setState('reconnecting')
    // Exponential backoff 1s→30s with jitter so a fleet of clients doesn't thundering-herd Finnhub.
    const delay = this.backoffMs + Math.floor(Math.random() * 500)
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.evaluate()
    }, delay)
  }

  private checkHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    // >60s of silence while we expect data = dead connection (Finnhub pings every few seconds).
    if (this.needsLive() && Date.now() - this.lastMsgAt > SILENCE_LIMIT_MS) {
      console.warn('[stream] heartbeat: >60s silence, recycling connection')
      try {
        this.ws.terminate()
      } catch {
        /* ignore */
      }
    }
  }

  private sendJson(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  // ----------------------------------------------------------------- ticks

  private accumulate(streamSym: string, price: number, volume: number, ts: number, delayed = false): void {
    const display = fromStreamSymbol(streamSym)
    if (classify(display) === 'fx' && !delayed) this.lastFxTradeAt.set(display, Date.now())
    const prev = this.lastPrice.get(display)
    const dir: -1 | 0 | 1 = prev === undefined || price === prev ? 0 : price > prev ? 1 : -1
    this.lastPrice.set(display, price)
    const entry = this.pending.get(display)
    if (entry) {
      entry.price = price
      entry.volume += volume
      entry.ts = ts
      entry.delayed = delayed
      if (dir !== 0) entry.dir = dir
    } else {
      this.pending.set(display, { price, volume, dir, ts, delayed })
    }
  }

  /** Main-process tick consumers (AlertEngine). Called with each flushed batch. */
  private tickListeners = new Set<(batch: StreamTick[]) => void>()
  onTicks(listener: (batch: StreamTick[]) => void): () => void {
    this.tickListeners.add(listener)
    return () => this.tickListeners.delete(listener)
  }

  /** Timer-coalesced flush: one batched payload per window per FLUSH_MS. */
  private flush(): void {
    if (this.pending.size === 0) return
    const batch: StreamTick[] = []
    for (const [symbol, t] of this.pending) {
      batch.push({ symbol, price: t.price, volume: t.volume, dir: t.dir, ts: t.ts, delayed: t.delayed })
    }
    this.pending.clear()
    this.broadcast('stream:ticks', batch)
    for (const listener of this.tickListeners) listener(batch)
  }

  /**
   * Free-tier Finnhub rejects forex streaming; poll Twelve Data for subscribed
   * FX pairs and inject the result as a DELAYED tick. Skipped when real WS
   * forex trades arrived recently (paid keys).
   */
  private async pollFx(only?: string): Promise<void> {
    if (this.paused) return
    const fxSymbols = [...this.refs.keys()].map(fromStreamSymbol).filter((s) => classify(s) === 'fx')
    for (const display of fxSymbols) {
      if (only && display !== only) continue
      const lastWs = this.lastFxTradeAt.get(display) ?? 0
      if (Date.now() - lastWs < 90_000) continue
      try {
        const q = await this.twelvedata.getQuote(display)
        if (Number.isFinite(q.current)) {
          this.accumulate(toStreamSymbol(display), q.current, 0, q.timestamp || Date.now(), true)
        }
      } catch {
        /* no TD key or bucket empty — the tape shows the REST snapshot instead */
      }
    }
  }

  private setState(state: StreamState): void {
    if (this.state === state) return
    this.state = state
    console.log('[stream] state →', state)
    this.broadcast('stream:state', state)
  }

  destroy(): void {
    clearInterval(this.flushTimer)
    clearInterval(this.heartbeatTimer)
    clearInterval(this.fxTimer)
    if (this.evalTimer) clearTimeout(this.evalTimer)
    this.disconnect()
  }
}
