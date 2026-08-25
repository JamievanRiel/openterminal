import { app } from 'electron'
import type { UpdateStatus } from '../shared/types'

/**
 * Auto-update plumbing (electron-updater, GitHub Releases provider).
 *
 * Hard-disabled in dev and — by default — in unsigned builds: meaningful
 * auto-update requires code signing (Windows Authenticode / macOS
 * notarization). Flip ALLOW_UNSIGNED_UPDATES only for internal testing.
 * Never downloads or restarts without explicit user action.
 */
const ALLOW_UNSIGNED_UPDATES = false
const CHECK_DELAY_MS = 30_000
const CHECK_INTERVAL_MS = 4 * 3600_000

export class UpdateManager {
  private status: UpdateStatus = { state: 'idle' }
  private enabled = false

  constructor(private broadcast: (channel: string, payload: unknown) => void) {
    if (!app.isPackaged || !ALLOW_UNSIGNED_UPDATES) {
      this.status = { state: 'disabled' }
      console.log(
        `[updater] disabled (${!app.isPackaged ? 'development run' : 'unsigned build — set ALLOW_UNSIGNED_UPDATES for internal testing'})`
      )
      return
    }
    this.enabled = true
    void this.wire()
  }

  private async wire(): Promise<void> {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('update-available', (info) => {
      this.setStatus({ state: 'available', version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '' })
    })
    autoUpdater.on('download-progress', (p) => {
      if (this.status.state === 'downloading' || this.status.state === 'available') {
        this.setStatus({ state: 'downloading', version: 'version' in this.status ? this.status.version : '', percent: Math.round(p.percent) })
      }
    })
    autoUpdater.on('update-downloaded', (info) => this.setStatus({ state: 'ready', version: info.version }))
    autoUpdater.on('error', (err) => {
      console.error('[updater]', err.message)
      this.setStatus({ state: 'idle' })
    })
    const check = (): void => {
      this.setStatus({ state: 'checking' })
      void autoUpdater.checkForUpdates().catch(() => this.setStatus({ state: 'idle' }))
    }
    setTimeout(check, CHECK_DELAY_MS)
    setInterval(check, CHECK_INTERVAL_MS)
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status
    this.broadcast('update:status', status)
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  async download(): Promise<void> {
    if (!this.enabled) return
    const { autoUpdater } = await import('electron-updater')
    if (this.status.state === 'available') {
      this.setStatus({ state: 'downloading', version: this.status.version, percent: 0 })
      void autoUpdater.downloadUpdate()
    }
  }

  async install(): Promise<void> {
    if (!this.enabled) return
    const { autoUpdater } = await import('electron-updater')
    if (this.status.state === 'ready') autoUpdater.quitAndInstall()
  }

  /** Dev-only: walk the UI through the full update flow with a fake feed. */
  simulate(step: 'available' | 'download' | 'ready' | 'reset'): UpdateStatus {
    if (app.isPackaged) return this.status
    switch (step) {
      case 'available':
        this.setStatus({ state: 'available', version: '1.1.0-sim', notes: 'Simulated release:\n• pop-out polish\n• bug fixes' })
        break
      case 'download': {
        let pct = 0
        const id = setInterval(() => {
          pct += 20
          if (pct >= 100) {
            clearInterval(id)
            this.setStatus({ state: 'ready', version: '1.1.0-sim' })
          } else {
            this.setStatus({ state: 'downloading', version: '1.1.0-sim', percent: pct })
          }
        }, 400)
        break
      }
      case 'ready':
        this.setStatus({ state: 'ready', version: '1.1.0-sim' })
        break
      default:
        this.setStatus({ state: 'disabled' })
    }
    return this.status
  }
}
