import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { safeStore } from './migrations'
import type { Portfolio } from '../shared/types'

const SCHEMA_VERSION = 1

const positionSchema = z.object({
  symbol: z.string().trim().min(1).max(16).toUpperCase(),
  qty: z.number().finite(),
  avgCost: z.number().finite().min(0),
  currency: z.enum(['USD', 'EUR']),
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export const portfolioSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  displayCurrency: z.enum(['USD', 'EUR']),
  cash: z.number().finite().min(0),
  positions: z.array(positionSchema).max(200)
})

const exportFileSchema = z.object({
  app: z.literal('openterminal'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  portfolios: z.array(portfolioSchema).min(1).max(20)
})

interface PortfolioFile {
  version: number
  portfolios: Portfolio[]
}

export class PortfolioManager {
  private store = safeStore<PortfolioFile>('portfolios')

  list(): Portfolio[] {
    let portfolios = this.store.get('portfolios')
    if (!portfolios || portfolios.length === 0) {
      portfolios = [{ id: randomUUID(), name: 'Main', displayCurrency: 'USD', cash: 0, positions: [] }]
      this.store.set('version', SCHEMA_VERSION)
      this.store.set('portfolios', portfolios)
    }
    return portfolios
  }

  save(portfolio: Portfolio): Portfolio[] {
    const all = this.list().map((p) => (p.id === portfolio.id ? portfolio : p))
    this.store.set('portfolios', all)
    return all
  }

  create(name: string): Portfolio[] {
    const all = [...this.list(), { id: randomUUID(), name, displayCurrency: 'USD' as const, cash: 0, positions: [] }]
    this.store.set('portfolios', all)
    return all
  }

  delete(id: string): Portfolio[] {
    const all = this.list().filter((p) => p.id !== id)
    this.store.set('portfolios', all)
    return this.list()
  }

  async exportJson(win: BrowserWindow | null): Promise<{ saved: boolean; path?: string }> {
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Export portfolios as JSON',
      defaultPath: 'openterminal-portfolios.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    const payload = { app: 'openterminal', schemaVersion: SCHEMA_VERSION, portfolios: this.list() }
    writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return { saved: true, path: result.filePath }
  }

  async importJson(win: BrowserWindow | null): Promise<{ imported: boolean; count?: number; error?: string }> {
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Import portfolios from JSON',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { imported: false }
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(result.filePaths[0], 'utf8'))
    } catch {
      const error = 'Not valid JSON.'
      dialog.showErrorBox('Portfolio import failed', error)
      return { imported: false, error }
    }
    const check = exportFileSchema.safeParse(parsed)
    if (!check.success) {
      const error =
        'File does not match the OpenTerminal portfolio schema (v' +
        SCHEMA_VERSION +
        '). First problem: ' +
        (check.error.issues[0]?.message ?? 'unknown')
      dialog.showErrorBox('Portfolio import failed', error)
      return { imported: false, error }
    }
    // Imported portfolios get fresh ids so an import can never silently clobber by id.
    const imported = check.data.portfolios.map((p) => ({ ...p, id: randomUUID() }))
    this.store.set('portfolios', [...this.list(), ...imported])
    return { imported: true, count: imported.length }
  }
}
