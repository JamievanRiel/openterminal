import { useQuery } from '@tanstack/react-query'
import type { EarningsCalItem, EcoRelease, FredSeries } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { Sparkline } from '../components/LiveBits'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { useWorkspace } from '../state/workspace'

interface CardDef {
  id: string
  label: string
  days: number
  unit: string
  /** turn raw observations into the display series (e.g. CPI level → YoY %) */
  transform?: (values: number[]) => number[]
  goodWhenFalling?: boolean
}

const CARDS: CardDef[] = [
  {
    id: 'CPIAUCSL',
    label: 'CPI YoY',
    days: 6.2 * 365,
    unit: '%',
    // monthly index level → YoY % change
    transform: (v) => v.slice(12).map((x, i) => (v[i] !== 0 ? (x / v[i] - 1) * 100 : 0)),
    goodWhenFalling: true
  },
  { id: 'UNRATE', label: 'Unemployment', days: 5.2 * 365, unit: '%', goodWhenFalling: true },
  { id: 'DFF', label: 'Fed Funds', days: 5.2 * 365, unit: '%' },
  { id: 'A191RL1Q225SBEA', label: 'Real GDP QoQ', days: 5.5 * 365, unit: '%' },
  { id: 'T10Y2Y', label: '10Y−2Y Spread', days: 5.2 * 365, unit: '%' }
]

function StatCard({ def }: { def: CardDef }): JSX.Element {
  const q = useQuery({
    queryKey: ['macro', def.id],
    queryFn: () => invoke<FredSeries>('macro:series', { id: def.id, days: Math.round(def.days) }),
    staleTime: 12 * 3600_000,
    retry: 0
  })
  if (q.isError) {
    return (
      <div className="border border-term-border bg-term-bg p-2">
        <div className="text-[9px] uppercase text-term-dim">{def.label}</div>
        <div className="mt-1 text-[10px] text-term-dim">{(q.error as Error).name === 'NO_KEY' ? 'FRED key needed (SET)' : 'unavailable'}</div>
      </div>
    )
  }
  const raw = (q.data?.observations ?? []).map((o) => o.value).filter((v): v is number => v !== null)
  const series = def.transform ? def.transform(raw) : raw
  const latest = series[series.length - 1]
  const prev = series[series.length - 2]
  const delta = latest !== undefined && prev !== undefined ? latest - prev : undefined
  const deltaGood = delta !== undefined ? (def.goodWhenFalling ? delta <= 0 : delta >= 0) : true
  return (
    <div className="border border-term-border bg-term-bg p-2">
      <div className="text-[9px] uppercase text-term-dim">{def.label}</div>
      {q.isLoading ? (
        <div className="mt-1 text-[10px] uppercase text-term-dim">Loading…</div>
      ) : (
        <>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[18px] font-bold text-term-text">
              {latest !== undefined ? latest.toFixed(2) + def.unit : '—'}
            </span>
            {delta !== undefined && (
              <span className={'text-[10px] ' + (deltaGood ? 'text-term-up' : 'text-term-down')}>
                {(delta >= 0 ? '+' : '') + delta.toFixed(2)} vs prev
              </span>
            )}
          </div>
          <div className="mt-1">
            <Sparkline values={series.slice(-260)} width={170} height={30} />
          </div>
          {q.data?.fromCache && <div className="mt-0.5 text-[8px] uppercase text-term-amber">CACHED</div>}
        </>
      )}
    </div>
  )
}

function weekDays(): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    out.push(new Date(now.getTime() + i * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

export default function EcoPanel(): JSX.Element {
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const days = weekDays()

  const releases = useQuery({
    queryKey: ['macro-releases'],
    queryFn: () => invoke<EcoRelease[]>('macro:releases'),
    staleTime: 12 * 3600_000,
    retry: 0
  })
  const earnings = useQuery({
    queryKey: ['eco-earnings', days[0]],
    queryFn: () => invoke<EarningsCalItem[]>('eco:earnings-week', { from: days[0], to: days[6] }),
    staleTime: 12 * 3600_000,
    retry: 0
  })

  if (releases.isError && (releases.error as Error).name === 'NO_KEY') {
    return <ErrorState error={releases.error as Error} />
  }

  return (
    <div className="h-full overflow-y-auto p-3 font-mono">
      <div className="text-[14px] font-bold text-term-amber">ECO — MACRO DASHBOARD</div>

      <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-3 2xl:grid-cols-5">
        {CARDS.map((def) => (
          <StatCard key={def.id} def={def} />
        ))}
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-widest text-term-dim">This week — releases & earnings</div>
      {releases.isLoading || earnings.isLoading ? (
        <LoadingState label="calendar" />
      ) : (
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dayReleases = (releases.data ?? []).filter((r) => r.date === day)
            const dayEarnings = (earnings.data ?? []).filter((e) => e.date === day).slice(0, 8)
            const weekday = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short' })
            return (
              <div key={day} className="min-h-[110px] border border-term-border bg-term-bg p-1">
                <div className="text-[9px] uppercase text-term-dim">
                  {weekday} <span className="text-term-text">{day.slice(5)}</span>
                </div>
                {dayReleases.map((r) => (
                  <div key={r.name + r.date} className="mt-1 border-l-2 border-term-amber pl-1 text-[9px] leading-tight text-term-text" title={r.name}>
                    {r.name.length > 34 ? r.name.slice(0, 33) + '…' : r.name}
                  </div>
                ))}
                {dayEarnings.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {dayEarnings.map((e) => (
                      <button
                        key={e.symbol}
                        className="border border-term-border px-0.5 text-[8px] text-term-amber hover:border-term-amber"
                        title={`${e.symbol} earnings — open ERN`}
                        onClick={() => {
                          loadTicker(e.symbol)
                          useWorkspace.getState().applyCommand('ERN', e.symbol, false)
                        }}
                      >
                        {e.symbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-2 text-[8px] uppercase text-term-dim">
        Macro data: Federal Reserve Bank of St. Louis (FRED) · release dates via FRED releases API
      </div>
    </div>
  )
}
