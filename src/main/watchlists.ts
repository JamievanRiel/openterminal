import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import { BrowserWindow, dialog } from 'electron'
import type { Watchlist } from '../shared/types'
import { safeStore } from './migrations'

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'ASML', 'TSLA', 'AMZN']

interface WatchlistFile {
  lists: Watchlist[]
}

export class WatchlistManager {
  // Dedicated file (watchlists.json) so workspace/key data stays separate.
  private store = safeStore<WatchlistFile>('watchlists')

  list(): Watchlist[] {
    let lists = this.store.get('lists')
    if (!lists || lists.length === 0) {
      lists = [{ id: randomUUID(), name: 'Main', symbols: [...DEFAULT_SYMBOLS] }]
      this.store.set('lists', lists)
    }
    return lists
  }

  save(list: Watchlist): Watchlist[] {
    const lists = this.list().map((l) => (l.id === list.id ? list : l))
    this.store.set('lists', lists)
    return lists
  }

  create(name: string): Watchlist[] {
    const lists = [...this.list(), { id: randomUUID(), name, symbols: [] }]
    this.store.set('lists', lists)
    return lists
  }

  delete(id: string): Watchlist[] {
    const lists = this.list().filter((l) => l.id !== id)
    this.store.set('lists', lists.length > 0 ? lists : [])
    return this.list()
  }

  /** Native save dialog + file write happen in main; renderer only supplies row values. */
  async exportCsv(
    win: BrowserWindow | null,
    listName: string,
    rows: Array<{ symbol: string; last: number | null; change: number | null; percentChange: number | null; volume: number | null }>
  ): Promise<{ saved: boolean; path?: string }> {
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Export watchlist as CSV',
      defaultPath: `${listName.replace(/[^\w-]+/g, '_')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    const esc = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
    const lines = ['symbol,last,change,percent_change,volume']
    for (const r of rows) {
      lines.push([r.symbol, esc(r.last), esc(r.change), esc(r.percentChange), esc(r.volume)].join(','))
    }
    writeFileSync(result.filePath, lines.join('\r\n') + '\r\n', 'utf8')
    return { saved: true, path: result.filePath }
  }
}
