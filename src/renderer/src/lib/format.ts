export function fmtCompact(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

export function fmtPrice(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

export function fmtPct(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

export function fmtSigned(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return sign + fmtPrice(value, decimals)
}

export function fmtTimeET(msTimestamp: number): string {
  if (!Number.isFinite(msTimestamp) || msTimestamp <= 0) return '—'
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(msTimestamp)) + ' ET'
  )
}

export interface FinFormatOptions {
  /** 'compact' → 1.24B · 'full' → 1,238,000,000 · 'percent' → 12.4% (input is a fraction) · 'ratio' → 24.8x-style plain number */
  style?: 'compact' | 'full' | 'percent' | 'ratio'
  decimals?: number
  /** wrap negatives in parentheses (financial-statement convention) */
  negParens?: boolean
}

/**
 * The one financial-number formatter shared by FA / ERN / DVD / HP.
 * Callers color negatives; this handles magnitude, decimals, and parentheses.
 */
export function formatFinancialNumber(value: number | null | undefined, opts: FinFormatOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const { style = 'compact', negParens = true } = opts
  const negative = value < 0
  const abs = Math.abs(value)
  let body: string
  switch (style) {
    case 'percent':
      body = (abs * 100).toFixed(opts.decimals ?? 1) + '%'
      break
    case 'ratio':
      body = abs.toFixed(opts.decimals ?? 2)
      break
    case 'full':
      body = new Intl.NumberFormat('en-US', { maximumFractionDigits: opts.decimals ?? 2 }).format(abs)
      break
    default:
      body =
        abs >= 1e4
          ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: opts.decimals ?? 2 }).format(abs)
          : abs.toFixed(opts.decimals ?? 2)
  }
  if (!negative) return body
  return negParens ? `(${body})` : '-' + body
}

/** "3m ago" under 24h, then the date. */
export function fmtRelativeTime(msTimestamp: number): string {
  const diff = Date.now() - msTimestamp
  if (diff < 60_000) return 'now'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + 'm ago'
  if (diff < 24 * 3600_000) return Math.floor(diff / 3600_000) + 'h ago'
  return new Date(msTimestamp).toISOString().slice(0, 10)
}

export function upDownClass(value: number): string {
  if (value > 0) return 'text-term-up'
  if (value < 0) return 'text-term-down'
  return 'text-term-text'
}
