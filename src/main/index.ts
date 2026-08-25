import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { registerIpc, type IpcServices } from './ipc'

// Dev-only .env loading, guarded so packaged builds never touch dotenv.
if (!app.isPackaged) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config()
  } catch {
    /* dotenv is optional in dev */
  }
}

const store = new Store<Record<string, unknown>>({ name: 'openterminal' })
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

function ensureTray(): void {
  if (tray) return
  tray = new Tray(trayIcon())
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
}

/** Pause the WS relay when every window is hidden/minimized; resume when any is visible. */
function syncStreamLifecycle(): void {
  if (!services) return
  const anyVisible = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized()
  )
  anyVisible ? services.stream.resume() : services.stream.pause()
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

  // Launched at login with --hidden: start minimized to tray (if the tray
  // toggle is on); otherwise start normally.
  const settings = store.get('appSettings') as { trayMinimize?: boolean } | undefined
  const startHidden = process.argv.includes('--hidden') && Boolean(settings?.trayMinimize)
  mainWindow.once('ready-to-show', () => {
    if (startHidden) {
      ensureTray()
    } else {
      mainWindow?.show()
    }
  })

  // Dev-only: OT_SHOOT=<path> captures the window after 15s (README screenshots).
  if (!app.isPackaged && process.env.OT_SHOOT) {
    setTimeout(() => {
      void mainWindow?.webContents.capturePage().then((img) => {
        require('fs').writeFileSync(process.env.OT_SHOOT as string, img.toPNG())
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
      event.preventDefault()
      ensureTray()
      mainWindow.hide()
      syncStreamLifecycle()
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
    void mainWindow.loadURL(devUrl)
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
    services = registerIpc(store, () => mainWindow)
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// Main-process crash guard: log instead of dying on unexpected errors.
process.on('uncaughtException', (err) => {
  console.error('[main crash guard]', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main crash guard: rejection]', reason)
})
