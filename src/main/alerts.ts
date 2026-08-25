import { randomUUID } from 'crypto'
import { BrowserWindow, Notification } from 'electron'
import Store from 'electron-store'
import type { AlertLogEntry, AlertRule, AlertsState, StreamTick } from '../shared/types'
import type { ProviderRouter } from './providers/router'
import type { StreamManager } from './stream/StreamManager'

const ALERT_WC_ID = -1 // synthetic webContents id for the engine's relay subscriptions
const REPEAT_DEBOUNCE_MS = 5 * 60_000
const REST_SWEEP_MS = 60_000
const MAX_LOG = 200

interface AlertsFile {
  rules: AlertRule[]
  log: AlertLogEntry[]
  seenAt: number
}

/**
 * Alert evaluation lives in MAIN so rules fire while the window is minimized.
 * Primary feed: the WS relay (the engine subscribes enabled symbols itself,
 * reference-counted like any panel). Fallback: a 60s REST sweep when the
 * relay isn't live.
 */
export class AlertEngine {
  private store = new Store<AlertsFile>({ name: 'alerts' })
  private lastPrice = new Map<string, number>()
  private prevClose = new Map<string, number>()
  private subscribed = new Set<string>()
  private sweepTimer: NodeJS.Timeout

  constructor(
    private stream: StreamManager,
    private router: ProviderRouter,
    private broadcast: (channel: string, payload: unknown) => void,
    private focusWindow: () => void
  ) {
    stream.onTicks((batch) => this.onTicks(batch))
    this.sweepTimer = setInterval(() => void this.restSweep(), REST_SWEEP_MS)
    this.syncSubscriptions()
  }

  destroy(): void {
    clearInterval(this.sweepTimer)
  }

  // ------------------------------------------------------------------ state

  private rules(): AlertRule[] {
    return this.store.get('rules') ?? []
  }

  private log(): AlertLogEntry[] {
    return this.store.get('log') ?? []
  }

  state(): AlertsState {
    const seenAt = this.store.get('seenAt') ?? 0
    const log = this.log()
    return { rules: this.rules(), log, unseen: log.filter((e) => e.at > seenAt).length }
  }

  saveRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'lastFiredAt' | 'fired'> & { id?: string }): AlertsState {
    const rules = this.rules()
    if (rule.id) {
      const idx = rules.findIndex((r) => r.id === rule.id)
      if (idx >= 0) rules[idx] = { ...rules[idx], ...rule, id: rule.id }
    } else {
      rules.push({ ...rule, id: randomUUID(), createdAt: Date.now(), lastFiredAt: null, fired: false })
    }
    this.store.set('rules', rules)
    this.syncSubscriptions()
    return this.state()
  }

  deleteRule(id: string): AlertsState {
    this.store.set('rules', this.rules().filter((r) => r.id !== id))
    this.syncSubscriptions()
    return this.state()
  }

  markSeen(): AlertsState {
    this.store.set('seenAt', Date.now())
    return this.state()
  }

  clearLog(): AlertsState {
    this.store.set('log', [])
    this.store.set('seenAt', Date.now())
    return this.state()
  }

  /** Keep the engine's relay subscriptions equal to the set of enabled rule symbols. */
  private syncSubscriptions(): void {
    const wanted = new Set(
      this.rules()
        .filter((r) => r.enabled && (r.repeating || !r.fired))
        .map((r) => r.symbol)
    )
    for (const symbol of wanted) {
      if (!this.subscribed.has(symbol)) {
        this.stream.subscribe(ALERT_WC_ID, 'alert-engine', symbol)
        this.subscribed.add(symbol)
      }
    }
    for (const symbol of this.subscribed) {
      if (!wanted.has(symbol)) {
        this.stream.unsubscribe(ALERT_WC_ID, 'alert-engine', symbol)
        this.subscribed.delete(symbol)
      }
    }
  }

  // ------------------------------------------------------------- evaluation

  private onTicks(batch: StreamTick[]): void {
    for (const tick of batch) this.evaluate(tick.symbol, tick.price)
  }

  private async restSweep(): Promise<void> {
    if (this.stream.getState() === 'live') return
    const symbols = new Set(this.rules().filter((r) => r.enabled).map((r) => r.symbol))
    for (const symbol of symbols) {
      try {
        const q = await this.router.getQuote(symbol)
        this.prevClose.set(symbol, q.prevClose)
        this.evaluate(symbol, q.current)
      } catch {
        /* try again next sweep */
      }
    }
  }

  private evaluate(symbol: string, price: number): void {
    const prev = this.lastPrice.get(symbol)
    this.lastPrice.set(symbol, price)
    const rules = this.rules()
    let dirty = false
    for (const rule of rules) {
      if (!rule.enabled || rule.symbol !== symbol) continue
      if (!rule.repeating && rule.fired) continue

      let triggered = false
      let message = ''
      if (rule.condition === 'above') {
        // Fire on the cross, not while merely sitting above the level.
        triggered = price >= rule.value && (prev === undefined || prev < rule.value)
        message = `${symbol} ${price.toFixed(2)} ▲ crossed above ${rule.value.toFixed(2)}`
      } else if (rule.condition === 'below') {
        triggered = price <= rule.value && (prev === undefined || prev > rule.value)
        message = `${symbol} ${price.toFixed(2)} ▼ crossed below ${rule.value.toFixed(2)}`
      } else {
        const pc = this.prevClose.get(symbol)
        if (pc === undefined) {
          void this.primePrevClose(symbol)
          continue
        }
        if (pc !== 0) {
          const movePct = ((price - pc) / pc) * 100
          const prevMove = prev !== undefined ? ((prev - pc) / pc) * 100 : undefined
          triggered = Math.abs(movePct) >= rule.value && (prevMove === undefined || Math.abs(prevMove) < rule.value)
          message = `${symbol} moved ${movePct >= 0 ? '▲' : '▼'} ${movePct.toFixed(2)}% today (threshold ±${rule.value}%)`
        }
      }
      if (!triggered) continue
      if (rule.repeating && rule.lastFiredAt !== null && Date.now() - rule.lastFiredAt < REPEAT_DEBOUNCE_MS) continue

      rule.lastFiredAt = Date.now()
      if (!rule.repeating) rule.fired = true
      dirty = true
      this.fire(rule, message)
    }
    if (dirty) this.store.set('rules', rules)
  }

  private async primePrevClose(symbol: string): Promise<void> {
    try {
      const q = await this.router.getQuote(symbol)
      this.prevClose.set(symbol, q.prevClose)
    } catch {
      /* next tick retries */
    }
  }

  private fire(rule: AlertRule, message: string): void {
    console.log('[alert] FIRED:', message)
    const entry: AlertLogEntry = { id: randomUUID(), ruleId: rule.id, symbol: rule.symbol, message, at: Date.now() }
    const log = [entry, ...this.log()].slice(0, MAX_LOG)
    this.store.set('log', log)

    if (Notification.isSupported()) {
      const n = new Notification({ title: `⚠ ${message}`, body: 'OpenTerminal alert — click to open the log.' })
      n.on('click', () => {
        this.focusWindow()
        this.broadcast('alerts:open-log', rule.symbol)
      })
      n.show()
    }
    this.broadcast('alerts:fired', { entry, unseen: this.state().unseen, sound: rule.sound ?? 'default' })
    // One-shot rules that fired no longer need a live subscription.
    this.syncSubscriptions()
  }
}

export function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
