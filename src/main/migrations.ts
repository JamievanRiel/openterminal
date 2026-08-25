import path from 'path'
import { app, dialog } from 'electron'
import Store from 'electron-store'
import { backupCorruptFile, CURRENT_SCHEMA_VERSION, migrateData } from './migrationCore'

const corrupted: Array<{ name: string; backup: string | null }> = []

/**
 * Store factory used for EVERY persisted file: survives corrupt JSON by
 * backing the file up and starting fresh (never crash on boot, never silently
 * overwrite), then runs schema migrations.
 */
export function safeStore<T extends object = Record<string, unknown>>(name: string): Store<T> {
  let store: Store<T>
  try {
    store = new Store<T>({ name })
  } catch (err) {
    const filePath = path.join(app.getPath('userData'), `${name}.json`)
    const backup = backupCorruptFile(filePath)
    corrupted.push({ name, backup })
    console.error(`[store] ${name}.json was corrupt — backed up to ${backup ?? '(backup failed)'} and started fresh:`, err)
    store = new Store<T>({ name })
  }
  try {
    const { data, migratedFrom } = migrateData(store.store as Record<string, unknown>)
    if (migratedFrom !== null) {
      console.log(`[store] migrated ${name}.json v${migratedFrom} → v${CURRENT_SCHEMA_VERSION}`)
      store.store = data as T
    }
  } catch (err) {
    console.error(`[store] migration failed for ${name}.json (continuing unmigrated):`, err)
  }
  return store
}

/** After the window is up: tell the user about any store that had to be reset. */
export function reportCorruptStores(): void {
  if (corrupted.length === 0) return
  const list = corrupted.map((c) => `• ${c.name}.json${c.backup ? ` (backup: ${path.basename(c.backup)})` : ''}`).join('\n')
  void dialog.showMessageBox({
    type: 'warning',
    title: 'OpenTerminal — settings recovered',
    message: 'Some settings files were unreadable and have been reset.',
    detail: `The originals were backed up in the app data folder:\n\n${list}\n\nRe-enter what's missing (keys, lists) in the app.`,
    buttons: ['OK']
  })
}
