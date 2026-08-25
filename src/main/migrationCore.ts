import { copyFileSync, existsSync, unlinkSync } from 'fs'

/** Electron-free migration core so the runner is unit-testable. */

export const CURRENT_SCHEMA_VERSION = 1

export interface Migration {
  from: number
  description: string
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}

/** Ordered migration chain. v0 = any pre-1.0.1 store without a schemaVersion field. */
export const MIGRATIONS: Migration[] = [
  {
    from: 0,
    description: 'stamp pre-1.0.1 stores with schemaVersion (no data changes)',
    migrate: (data) => data
  }
]

/** Pure migration runner — applies every step from the data's version to current. */
export function migrateData(data: Record<string, unknown>): { data: Record<string, unknown>; migratedFrom: number | null } {
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0
  if (version >= CURRENT_SCHEMA_VERSION) return { data, migratedFrom: null }
  const startedAt = version
  let out = data
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version)
    if (!step) break // no path — stamp and continue rather than crash
    out = step.migrate(out)
    version++
  }
  out.schemaVersion = CURRENT_SCHEMA_VERSION
  return { data: out, migratedFrom: startedAt }
}

/** Move an unparseable store aside as <name>.corrupt-<timestamp>.json. Returns the backup path. */
export function backupCorruptFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = filePath.replace(/\.json$/, '') + `.corrupt-${stamp}.json`
    copyFileSync(filePath, backup)
    unlinkSync(filePath)
    return backup
  } catch {
    return null
  }
}
