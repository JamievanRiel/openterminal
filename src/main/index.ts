import { app, BrowserWindow, dialog, Menu, nativeImage, powerMonitor, shell, Tray } from 'electron'
import { writeFileSync } from 'fs'
import path from 'path'
import { registerIpc, type IpcServices } from './ipc'
import { logger } from './logger'
import { reportCorruptStores, safeStore } from './migrations'

// Dev-only .env loading, guarded so packaged builds never touch dotenv.
if (!app.isPackaged) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dev dependency
    require('dotenv').config()
  } catch {
    /* dotenv is optional in dev */
  }
}

logger.hookConsole()

// Dev-only offline simulation: OT_OFFLINE=1 fails every main-process fetch so
// the cached/badged startup paths can be exercised without pulling the cable.
if (!app.isPackaged && process.env.OT_OFFLINE) {
  console.log('[dev] OT_OFFLINE — all outbound fetches will fail')
  globalThis.fetch = () => Promise.reject(new TypeError('fetch failed (OT_OFFLINE simulation)'))
}

const store = safeStore<Record<string, unknown>>('openterminal')
let mainWindow: BrowserWindow | null = null
let services: IpcServices | null = null

let tray: Tray | null = null
let quitting = false

/** 16×16 amber square as a data-URL — keeps the tray free of bundled assets. */
function trayIcon(): Electron.NativeImage {
  const canvasPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJklEQVR4AWMY0eD/fwZ8mGGYG/D//38GfHgUjBowasCoAaMGDDwAAP2iL9GTCnpvAAAAAElFTkSuQmCC'
  return nativeImage.createFromDataURL(canvasPng)
}

/** Returns false when the desktop has no tray support (some Linux DEs). */
function ensureTray(): boolean {
  if (tray) return true
  try {
    const icon = trayIcon()
    // macOS menu-bar convention: template image adapts to light/dark menu bars.
    if (process.platform === 'darwin') icon.setTemplateImage(true)
    tray = new Tray(icon)
    tray.setToolTip('OpenTerminal — alerts stay live')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open OpenTerminal', click: () => mainWindow?.show() },
        {
          label: 'Quit',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('double-click', () => mainWindow?.show())
    return true
  } catch (err) {
    console.error('[tray] tray unavailable on this desktop — hide-to-tray disabled:', err)
    tray = null
    return false
  }
}

/** Pause the WS relay when every window is hidden/minimized; resume when any is visible. */
function syncStreamLifecycle(): void {
  if (!services) return
  const anyVisible = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized()
  )
  if (anyVisible) services.stream.resume()
  else services.stream.pause()
}

function createWindow(): void {
  const saved = store.get('windowBounds') as Electron.Rectangle | undefined
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1280,
    minHeight: 800,
    // macOS keeps native traffic lights (inset) inside the custom title bar;
    // Windows/Linux run fully frameless with custom controls.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 10 } }
      : { frame: false }),
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Launched at login with --hidden: start minimized to tray (if the tray
  // toggle is on); otherwise start normally.
  const settings = store.get('appSettings') as { trayMinimize?: boolean } | undefined
  const startHidden = process.argv.includes('--hidden') && Boolean(settings?.trayMinimize)
  mainWindow.once('ready-to-show', () => {
    // Start hidden only if the tray actually materializes; otherwise show normally.
    if (!(startHidden && ensureTray())) mainWindow?.show()
    reportCorruptStores()
  })

  // Renderer crash: log + one automatic reload; a repeat gets a dialog.
  let rendererReloads = 0
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[crash] renderer gone:', details.reason, details.exitCode)
    if (details.reason === 'clean-exit') return
    if (rendererReloads < 1 && mainWindow && !mainWindow.isDestroyed()) {
      rendererReloads++
      mainWindow.webContents.reload()
    } else {
      reportCrash('renderer crashed twice', new Error(details.reason))
    }
  })

  // Dev-only: OT_SHOOT=<path> captures the window after 15s (README screenshots).
  if (!app.isPackaged && process.env.OT_SHOOT) {
    setTimeout(() => {
      void mainWindow?.webContents.capturePage().then((img) => {
        writeFileSync(process.env.OT_SHOOT as string, img.toPNG())
        console.log('[shoot] saved', process.env.OT_SHOOT)
      })
    }, 15_000)
  }

  // Dev-only: surface renderer errors in the terminal running `npm run dev`.
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 3) console.error(`[renderer error] ${message} (${sourceId}:${line})`)
    })
  }

  const saveBounds = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds())
    }
  }
  mainWindow.on('resized', saveBounds)
  mainWindow.on('moved', saveBounds)
  const wcId = mainWindow.webContents.id
  // SET → Behavior: closing hides to the tray instead of quitting (alerts keep firing).
  mainWindow.on('close', (event) => {
    const settings = store.get('appSettings') as { trayMinimize?: boolean } | undefined
    if (!quitting && settings?.trayMinimize && mainWindow) {
      // Only hide if a tray actually exists — otherwise the window would be unreachable.
      if (ensureTray()) {
        event.preventDefault()
        mainWindow.hide()
        syncStreamLifecycle()
      }
    }
  })
  mainWindow.on('minimize', syncStreamLifecycle)
  mainWindow.on('restore', syncStreamLifecycle)
  mainWindow.on('hide', syncStreamLifecycle)
  mainWindow.on('show', syncStreamLifecycle)
  mainWindow.on('closed', () => {
    services?.stream.dropSender(wcId)
    mainWindow = null
  })

  // All external links open in the default browser; never navigate the app window away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!devUrl || !url.startsWith(devUrl)) event.preventDefault()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const suffix = process.env.OT_LEAKTEST ? '?leaktest=1' : ''
    void mainWindow.loadURL(devUrl + suffix)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    // macOS convention: About/Quit under the app menu with standard accelerators
    // (Edit menu keeps Cmd+C/V working). Windows/Linux run menuless (frameless UI).
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { role: 'windowMenu' }
        ])
      )
    } else {
      Menu.setApplicationMenu(null)
    }

    services = registerIpc(store, () => mainWindow)
    createWindow()

    // Laptop sleep kills sockets and freezes timers; recover the moment we wake.
    powerMonitor.on('suspend', () => console.log('[power] system suspend'))
    powerMonitor.on('resume', () => {
      console.log('[power] system resume — recycling stream + refreshing renderers')
      services?.stream.onSystemResume()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('system:resumed', Date.now())
      }
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// Main-process crash guard: log + tell the user (throttled) instead of a silent exit.
let lastCrashDialogAt = 0
function reportCrash(kind: string, err: unknown): void {
  console.error(`[crash] ${kind}:`, err)
  if (!app.isReady() || Date.now() - lastCrashDialogAt < 60_000) return
  lastCrashDialogAt = Date.now()
  void dialog
    .showMessageBox({
      type: 'error',
      title: 'OpenTerminal — unexpected error',
      message: 'OpenTerminal hit an internal error. It will keep running, but please report this.',
      detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      buttons: ['Open logs folder', 'Dismiss'],
      defaultId: 1
    })
    .then((r) => {
      if (r.response === 0) void shell.openPath(logger.logsDir())
    })
}
process.on('uncaughtException', (err) => reportCrash('uncaughtException', err))
process.on('unhandledRejection', (reason) => reportCrash('unhandledRejection', reason))
