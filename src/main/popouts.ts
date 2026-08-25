import { app, BrowserWindow, screen } from 'electron'
import path from 'path'
import Store from 'electron-store'
import type { PanelState, PopoutBounds, PopoutState } from '../shared/types'
import type { StreamManager } from './stream/StreamManager'

interface PopoutEntry {
  win: BrowserWindow
  panel: PanelState
  /** true when the panel was explicitly removed — closing must NOT return it to the grid */
  removed: boolean
}

/** Clamp saved bounds onto currently attached displays; fall back to primary. */
function clampBounds(bounds: PopoutBounds | undefined): PopoutBounds {
  const fallback = (): PopoutBounds => {
    const wa = screen.getPrimaryDisplay().workArea
    return { x: wa.x + 60, y: wa.y + 60, width: 800, height: 600 }
  }
  if (!bounds) return fallback()
  const onSomeDisplay = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    // The title bar (top-left corner region) must be reachable.
    return bounds.x >= a.x - 40 && bounds.x < a.x + a.width - 40 && bounds.y >= a.y - 10 && bounds.y < a.y + a.height - 40
  })
  if (!onSomeDisplay) return fallback()
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(420, Math.min(bounds.width, 2400)),
    height: Math.max(320, Math.min(bounds.height, 1600))
  }
}

/**
 * Pop-out panel windows. Each loads the SAME renderer bundle with ?popout=1,
 * the same preload, and reads its panel state over IPC — no duplicated stores.
 * The relay's per-webContents reference counting makes streaming span windows.
 */
export class PopoutManager {
  private entries = new Map<number, PopoutEntry>()
  private boundsStore = new Store<Record<string, PopoutBounds>>({ name: 'popout-bounds' })

  constructor(
    private stream: StreamManager,
    private broadcastToMain: (channel: string, payload: unknown) => void
  ) {}

  open(panel: PanelState, savedBounds?: PopoutBounds): void {
    const remembered = savedBounds ?? (this.boundsStore.get(String(panel.id)) as PopoutBounds | undefined)
    const bounds = clampBounds(remembered)
    const win = new BrowserWindow({
      ...bounds,
      minWidth: 420,
      minHeight: 320,
      frame: false,
      backgroundColor: '#000000',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    const wcId = win.webContents.id
    this.entries.set(wcId, { win, panel, removed: false })

    win.once('ready-to-show', () => win.show())
    if (!app.isPackaged) {
      win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
        if (level >= 3) console.error(`[popout renderer error] ${message} (${sourceId}:${line})`)
      })
    }
    const saveBounds = (): void => {
      if (!win.isDestroyed()) this.boundsStore.set(String(panel.id), win.getBounds())
    }
    win.on('resized', saveBounds)
    win.on('moved', saveBounds)
    win.on('closed', () => {
      const entry = this.entries.get(wcId)
      this.entries.delete(wcId)
      this.stream.dropSender(wcId)
      // Closing the window returns the panel to the main grid — unless it was removed outright.
      if (entry && !entry.removed) this.broadcastToMain('popout:returned', entry.panel)
    })

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) {
      void win.loadURL(devUrl + '?popout=1')
    } else {
      void win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { popout: '1' } })
    }
  }

  getPanel(wcId: number): PanelState | null {
    return this.entries.get(wcId)?.panel ?? null
  }

  update(wcId: number, panel: PanelState): void {
    const entry = this.entries.get(wcId)
    if (entry) entry.panel = panel
  }

  markRemoved(wcId: number): void {
    const entry = this.entries.get(wcId)
    if (entry) entry.removed = true
  }

  /** Popout geometry + panel state, for workspace snapshots. */
  snapshot(): PopoutState[] {
    return [...this.entries.values()]
      .filter((e) => !e.win.isDestroyed())
      .map((e) => ({ panel: e.panel, bounds: e.win.getBounds() }))
  }

  /** Close every popout without returning panels (workspace switch). */
  closeAll(): void {
    for (const entry of this.entries.values()) {
      entry.removed = true
      if (!entry.win.isDestroyed()) entry.win.close()
    }
    this.entries.clear()
  }

  restore(popouts: PopoutState[]): void {
    for (const p of popouts) this.open(p.panel, p.bounds)
  }

  count(): number {
    return this.entries.size
  }
}
