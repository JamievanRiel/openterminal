import { writeFileSync } from 'fs'
import { BrowserWindow, dialog } from 'electron'

export type ExportCell = string | number | null

/**
 * THE export path for every CSV/JSON the app produces: native save dialog,
 * ISO dates and raw unformatted numbers supplied by callers, UTF-8 with BOM
 * so Excel opens it correctly.
 */
export class ExportService {
  private async pickPath(win: BrowserWindow | null, defaultName: string, ext: 'csv' | 'json'): Promise<string | null> {
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: `Export ${ext.toUpperCase()}`,
      defaultPath: defaultName.replace(/[^\w.-]+/g, '_'),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    return result.canceled || !result.filePath ? null : result.filePath
  }

  async exportCsv(
    win: BrowserWindow | null,
    defaultName: string,
    headers: string[],
    rows: ExportCell[][]
  ): Promise<{ saved: boolean; path?: string }> {
    const filePath = await this.pickPath(win, defaultName, 'csv')
    if (!filePath) return { saved: false }
    const esc = (cell: ExportCell): string => {
      if (cell === null || cell === undefined) return ''
      const s = String(cell)
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))]
    writeFileSync(filePath, '\ufeff' + lines.join('\r\n') + '\r\n', 'utf8')
    return { saved: true, path: filePath }
  }

  async exportJson(win: BrowserWindow | null, defaultName: string, data: unknown): Promise<{ saved: boolean; path?: string }> {
    const filePath = await this.pickPath(win, defaultName, 'json')
    if (!filePath) return { saved: false }
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
    return { saved: true, path: filePath }
  }
}
