import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs'
import path from 'path'
import { app } from 'electron'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES = 5
const RING_SIZE = 300

/**
 * Minimal structured logger for main: levels, timestamps, category tags,
 * rotating files in userData/logs (5 × 2 MB), and a ring buffer that feeds
 * the diagnostics export. Console.* is routed through it so every existing
 * `console.log('[stream] …')` call lands in the file too.
 *
 * Never logs key material: URL query secrets are redacted defensively.
 */
class Logger {
  private dir = path.join(app.getPath('userData'), 'logs')
  private file = path.join(this.dir, 'openterminal.log')
  private ring: string[] = []

  logsDir(): string {
    return this.dir
  }

  lastLines(count: number): string[] {
    return this.ring.slice(-count)
  }

  private redact(text: string): string {
    return text
      .replace(/([?&](?:token|apikey|api_key|apiKey|api_token)=)[^&\s"']+/gi, '$1«redacted»')
      .replace(/(APCA-API-(?:KEY-ID|SECRET-KEY)['":\s]+)[\w-]+/gi, '$1«redacted»')
  }

  private rotateIfNeeded(): void {
    try {
      if (!existsSync(this.file) || statSync(this.file).size < MAX_FILE_BYTES) return
      const oldest = `${this.file}.${MAX_FILES - 1}`
      if (existsSync(oldest)) unlinkSync(oldest)
      for (let i = MAX_FILES - 2; i >= 1; i--) {
        const from = `${this.file}.${i}`
        if (existsSync(from)) renameSync(from, `${this.file}.${i + 1}`)
      }
      renameSync(this.file, `${this.file}.1`)
    } catch {
      /* rotation must never crash logging */
    }
  }

  write(level: 'debug' | 'info' | 'warn' | 'error', parts: unknown[]): void {
    try {
      const text = parts
        .map((p) => (typeof p === 'string' ? p : p instanceof Error ? `${p.name}: ${p.message}` : JSON.stringify(p)))
        .join(' ')
      // Category tag convention: messages starting with "[stream]", "[fmp]" etc.
      const category = /^\[([\w-]+)\]/.exec(text)?.[1] ?? 'app'
      const body = text.replace(/^\[[\w-]+\]\s*/, '')
      const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${category}] ${this.redact(body)}`
      this.ring.push(line)
      if (this.ring.length > RING_SIZE) this.ring.splice(0, this.ring.length - RING_SIZE)
      mkdirSync(this.dir, { recursive: true })
      this.rotateIfNeeded()
      appendFileSync(this.file, line + '\n', 'utf8')
    } catch {
      /* the logger must never throw */
    }
  }

  /** Route console.log/warn/error through the file logger (terminal output preserved). */
  hookConsole(): void {
    const orig = { log: console.log, warn: console.warn, error: console.error }
    console.log = (...args: unknown[]) => {
      this.write('info', args)
      orig.log(...args)
    }
    console.warn = (...args: unknown[]) => {
      this.write('warn', args)
      orig.warn(...args)
    }
    console.error = (...args: unknown[]) => {
      this.write('error', args)
      orig.error(...args)
    }
  }
}

export const logger = new Logger()
