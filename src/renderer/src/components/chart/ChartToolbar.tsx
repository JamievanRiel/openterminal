import { useRef, useState } from 'react'
import type { CandleResponse, ChartSettings, ChartSeriesType, SymbolHit } from '../../../../shared/types'
import { INTERVALS, RANGE_DEFAULT_INTERVAL, RANGES } from '../../../../shared/chart'
import { invoke } from '../../lib/ipc'
import { INDICATOR_DEFS } from './chartTheme'

interface Props {
  symbol: string
  settings: ChartSettings
  onSettings: (next: ChartSettings) => void
  variant: 'GP' | 'GIP'
  data: CandleResponse | undefined
}

const SERIES_TYPES: Array<[ChartSeriesType, string]> = [
  ['candles', 'CANDLE'],
  ['line', 'LINE'],
  ['area', 'AREA']
]

export default function ChartToolbar({ symbol, settings, onSettings, variant, data }: Props): JSX.Element {
  const [indicatorsOpen, setIndicatorsOpen] = useState(false)
  const [compareInput, setCompareInput] = useState('')
  const [compareHits, setCompareHits] = useState<SymbolHit[]>([])
  const searchTimer = useRef<number>()

  const searchCompare = (raw: string): void => {
    setCompareInput(raw.toUpperCase())
    window.clearTimeout(searchTimer.current)
    const q = raw.trim()
    if (q.length < 2) {
      setCompareHits([])
      return
    }
    searchTimer.current = window.setTimeout(() => {
      invoke<SymbolHit[]>('search:symbols', { query: q })
        .then((r) => setCompareHits(r.filter((h) => h.symbol !== symbol).slice(0, 5)))
        .catch(() => setCompareHits([]))
    }, 300)
  }

  const btn = (active: boolean): string =>
    'border px-1.5 py-0.5 font-mono text-[9px] uppercase ' +
    (active ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')

  return (
    <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-1 border-b border-term-border bg-term-panel px-2 py-1">
      <span className="mr-1 font-mono text-[11px] font-bold text-term-amber">
        {symbol} {variant}
      </span>
      {RANGES.map((r) => (
        <button
          key={r}
          className={btn(settings.range === r)}
          onClick={() => onSettings({ ...settings, range: r, interval: RANGE_DEFAULT_INTERVAL[r] })}
        >
          {r}
        </button>
      ))}
      <select
        value={settings.interval}
        onChange={(e) => onSettings({ ...settings, interval: e.target.value as ChartSettings['interval'] })}
        className="ml-1 border border-term-border bg-term-bg px-1 py-0.5 font-mono text-[9px] text-term-text outline-none"
        title="Bar interval"
      >
        {INTERVALS.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <span className="mx-1 text-term-border">|</span>
      {SERIES_TYPES.map(([type, label]) => (
        <button
          key={type}
          className={btn(settings.seriesType === type)}
          disabled={settings.compare !== null}
          onClick={() => onSettings({ ...settings, seriesType: type })}
        >
          {label}
        </button>
      ))}
      <span className="mx-1 text-term-border">|</span>
      <div className="relative">
        <button className={btn(settings.indicators.length > 0)} onClick={() => setIndicatorsOpen((o) => !o)}>
          IND {settings.indicators.length > 0 ? `(${settings.indicators.length})` : ''}
        </button>
        {indicatorsOpen && (
          <div className="absolute left-0 top-full z-50 w-44 border border-term-border bg-term-panel py-1">
            {INDICATOR_DEFS.map((def) => {
              const active = settings.indicators.includes(def.id)
              return (
                <button
                  key={def.id}
                  className="flex w-full items-center justify-between px-2 py-0.5 font-mono text-[10px] hover:bg-[#1a1a1a]"
                  onClick={() =>
                    onSettings({
                      ...settings,
                      indicators: active
                        ? settings.indicators.filter((i) => i !== def.id)
                        : [...settings.indicators, def.id]
                    })
                  }
                >
                  <span style={{ color: def.color }}>{def.label}</span>
                  <span className={active ? 'text-term-up' : 'text-term-dim'}>{active ? 'ON' : 'off'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <span className="mx-1 text-term-border">|</span>
      {settings.compare === null ? (
        <div className="relative">
          <input
            value={compareInput}
            onChange={(e) => searchCompare(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && compareInput.trim()) {
                onSettings({ ...settings, compare: compareInput.trim() })
                setCompareInput('')
                setCompareHits([])
              }
              if (e.key === 'Escape') setCompareHits([])
            }}
            placeholder="VS…"
            spellCheck={false}
            className="w-16 border border-term-border bg-term-bg px-1 py-0.5 font-mono text-[9px] uppercase text-term-amber placeholder-term-dim outline-none focus:border-term-amber"
            title="Compare symbol (% change overlay)"
          />
          {compareHits.length > 0 && (
            <div className="absolute left-0 top-full z-50 w-56 border border-term-border bg-term-panel">
              {compareHits.map((hit) => (
                <button
                  key={hit.symbol}
                  className="flex w-full justify-between px-2 py-0.5 font-mono text-[10px] hover:bg-[#1a1a1a]"
                  onClick={() => {
                    onSettings({ ...settings, compare: hit.symbol })
                    setCompareInput('')
                    setCompareHits([])
                  }}
                >
                  <span className="text-term-amber">{hit.symbol}</span>
                  <span className="ml-2 truncate text-term-dim">{hit.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className={btn(true)} onClick={() => onSettings({ ...settings, compare: null })} title="Exit compare mode">
          VS {settings.compare} ×
        </button>
      )}
      {data && (
        <span className="ml-auto font-mono text-[9px] uppercase text-term-dim" title={`fetched ${new Date(data.fetchedAt).toLocaleTimeString()}`}>
          {data.source === 'alpaca' ? 'IEX' : 'TD'} · {data.candles.length} bars
        </span>
      )}
    </div>
  )
}
