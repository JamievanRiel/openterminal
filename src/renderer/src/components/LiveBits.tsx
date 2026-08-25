/** Small presentational pieces shared by the live panels. */

/**
 * Value that flashes green/red when `flashSeq` changes. Pass a monotonically
 * advancing value (e.g. tick timestamp) — remounting the span retriggers the
 * 200ms CSS fade without any JS animation work.
 */
export function Flash({
  flashSeq,
  dir,
  children,
  className = ''
}: {
  flashSeq: number | undefined
  dir: -1 | 0 | 1
  children: React.ReactNode
  className?: string
}): JSX.Element {
  // SET → Appearance can disable the flash animation entirely.
  const disabled = window.localStorage.getItem('flash-off') === '1'
  const flashClass = disabled ? '' : dir > 0 ? 'flash-up' : dir < 0 ? 'flash-down' : ''
  return (
    <span key={disabled ? 'static' : flashSeq ?? 'static'} className={`${flashClass} ${className}`}>
      {children}
    </span>
  )
}

/** Horizontal low↔high bar with a marker at `value`. */
export function RangeBar({ low, high, value }: { low: number; high: number; value: number }): JSX.Element {
  const span = high - low
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - low) / span) * 100)) : 50
  return (
    <div className="relative h-1.5 w-full bg-[#1a1a1a]">
      <div className="absolute inset-y-0 left-0 bg-[#333]" style={{ width: `${pct}%` }} />
      <div className="absolute inset-y-[-2px] w-[2px] bg-term-amber" style={{ left: `calc(${pct}% - 1px)` }} />
    </div>
  )
}

/** Tiny SVG sparkline; green when last ≥ first, red otherwise. */
export function Sparkline({ values, width = 90, height = 24 }: { values: number[]; width?: number; height?: number }): JSX.Element | null {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={points} fill="none" stroke={up ? '#00c853' : '#ff1744'} strokeWidth="1" />
    </svg>
  )
}
