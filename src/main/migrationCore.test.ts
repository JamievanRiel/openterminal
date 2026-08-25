import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { backupCorruptFile, CURRENT_SCHEMA_VERSION, migrateData } from './migrationCore'

describe('migrateData', () => {
  it('stamps an unversioned (v0) store and reports the origin version', () => {
    const { data, migratedFrom } = migrateData({ lists: [1, 2] })
    expect(migratedFrom).toBe(0)
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(data.lists).toEqual([1, 2]) // v0→v1 is a no-op stamp
  })

  it('leaves an already-current store untouched', () => {
    const input = { schemaVersion: CURRENT_SCHEMA_VERSION, foo: 'bar' }
    const { data, migratedFrom } = migrateData(input)
    expect(migratedFrom).toBeNull()
    expect(data).toBe(input)
  })

  it('a future version is not downgraded', () => {
    const input = { schemaVersion: CURRENT_SCHEMA_VERSION + 5, foo: 'bar' }
    expect(migrateData(input).data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 5)
  })
})

describe('backupCorruptFile', () => {
  it('moves the corrupt file aside with a timestamped name, preserving contents', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ot-migrations-'))
    const file = path.join(dir, 'watchlists.json')
    writeFileSync(file, '{not json', 'utf8')
    const backup = backupCorruptFile(file)
    expect(backup).not.toBeNull()
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(backup as string, 'utf8')).toBe('{not json')
    expect(path.basename(backup as string)).toMatch(/^watchlists\.corrupt-.+\.json$/)
    expect(readdirSync(dir)).toHaveLength(1)
  })

  it('returns null for a missing file', () => {
    expect(backupCorruptFile(path.join(tmpdir(), 'does-not-exist.json'))).toBeNull()
  })
})
