import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { AlertCondition, AlertSound, AlertsState, SymbolHit } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { setUnseen } from '../lib/alerts'
import { fmtRelativeTime } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'
import { useWorkspace } from '../state/workspace'

const CONDITION_LABEL: Record<AlertCondition, string> = {
  above: 'price ≥',
  below: 'price ≤',
  move: '|%move| ≥'
}

export default function AlrtPanel(): JSX.Element {
  const queryClient = useQueryClient()
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const [tab, setTab] = useState<'rules' | 'log'>('rules')
  const [form, setForm] = useState({
    symbol: '',
    condition: 'above' as AlertCondition,
    value: '',
    repeating: false,
    sound: 'default' as AlertSound
  })
  const [hits, setHits] = useState<SymbolHit[]>([])

  const state = useQuery({
    queryKey: ['alerts'],
    queryFn: () => invoke<AlertsState>('alerts:state'),
    refetchInterval: 10_000
  })

  const apply = (next: AlertsState): void => {
    queryClient.setQueryData(['alerts'], next)
    setUnseen(next.unseen)
  }

  // Opening the panel marks the log as seen (clears the status-bar badge).
  useEffect(() => {
    void invoke<AlertsState>('alerts:mark-seen').then(apply).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.isLoading) return <LoadingState label="alerts" />
  if (state.isError) return <ErrorState error={state.error as Error} />
  const data = state.data as AlertsState

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-1 border-b border-term-border px-2 py-1">
        <span className="mr-2 text-[11px] font-bold text-term-amber">ALRT</span>
        {(['rules', 'log'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'border px-2 py-0.5 text-[9px] uppercase ' +
              (tab === t ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {t} {t === 'log' ? `(${data.log.length})` : `(${data.rules.length})`}
          </button>
        ))}
        {tab === 'log' && data.log.length > 0 && (
          <>
            <button
              className="ml-auto border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-amber"
              onClick={() =>
                void invoke('export:csv', {
                  name: 'alert-log.csv',
                  headers: ['time_iso', 'symbol', 'message'],
                  rows: data.log.map((e) => [new Date(e.at).toISOString(), e.symbol, e.message])
                }).catch(() => undefined)
              }
            >
              CSV
            </button>
            <button
              className="border border-term-border px-2 py-0.5 text-[9px] uppercase text-term-dim hover:text-term-down"
              onClick={() => void invoke<AlertsState>('alerts:clear-log').then(apply)}
            >
              Clear log
            </button>
          </>
        )}
      </div>

      {tab === 'rules' ? (
        <>
          <div className="relative flex shrink-0 flex-wrap items-center gap-2 border-b border-term-border bg-term-bg p-2 text-[10px]">
            <input
              value={form.symbol}
              onChange={(e) => {
                const raw = e.target.value.toUpperCase()
                setForm({ ...form, symbol: raw })
                if (raw.length >= 2) {
                  void invoke<SymbolHit[]>('search:symbols', { query: raw }).then((r) => setHits(r.slice(0, 5))).catch(() => setHits([]))
                } else setHits([])
              }}
              placeholder="SYMBOL"
              className="w-24 border border-term-border bg-term-panel px-1 py-0.5 uppercase text-term-amber outline-none"
            />
            {hits.length > 0 && (
              <div className="absolute left-2 top-full z-50 w-64 border border-term-border bg-term-panel">
                {hits.map((h) => (
                  <button key={h.symbol} className="flex w-full justify-between px-2 py-1 text-left hover:bg-[#1a1a1a]" onClick={() => { setForm({ ...form, symbol: h.symbol }); setHits([]) }}>
                    <span className="text-term-amber">{h.symbol}</span>
                    <span className="ml-2 truncate text-term-dim">{h.description}</span>
                  </button>
                ))}
              </div>
            )}
            <select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value as AlertCondition })}
              className="border border-term-border bg-term-panel px-1 py-0.5 text-term-text outline-none"
            >
              <option value="above">crosses above</option>
              <option value="below">crosses below</option>
              <option value="move">%move beyond ±</option>
            </select>
            <input
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder={form.condition === 'move' ? '%' : 'price'}
              className="w-24 border border-term-border bg-term-panel px-1 py-0.5 text-term-text outline-none"
            />
            <label className="flex items-center gap-1 text-[9px] uppercase text-term-dim">
              <input type="checkbox" checked={form.repeating} onChange={(e) => setForm({ ...form, repeating: e.target.checked })} />
              repeating
            </label>
            <select
              value={form.sound}
              onChange={(e) => setForm({ ...form, sound: e.target.value as AlertSound })}
              className="border border-term-border bg-term-panel px-1 py-0.5 text-term-text outline-none"
              title="Alert sound"
            >
              <option value="default">♪ default</option>
              <option value="urgent">♪ urgent</option>
              <option value="none">silent</option>
            </select>
            <button
              className="border border-term-amber px-3 py-0.5 uppercase text-term-amber hover:bg-[#181206]"
              onClick={() => {
                const value = Number(form.value)
                if (!form.symbol || !Number.isFinite(value) || value <= 0) return
                void invoke<AlertsState>('alerts:save-rule', {
                  symbol: form.symbol,
                  condition: form.condition,
                  value,
                  repeating: form.repeating,
                  enabled: true,
                  sound: form.sound
                }).then(apply)
                setForm({ ...form, symbol: '', value: '' })
              }}
            >
              Add rule
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {data.rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 border-b border-term-border px-2 py-1.5 text-[11px]">
                <button
                  className={'dot inline-block h-2.5 w-2.5 shrink-0 ' + (rule.enabled ? 'bg-term-up' : 'bg-[#3a3a3a]')}
                  title={rule.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                  onClick={() =>
                    void invoke<AlertsState>('alerts:save-rule', {
                      id: rule.id,
                      symbol: rule.symbol,
                      condition: rule.condition,
                      value: rule.value,
                      repeating: rule.repeating,
                      enabled: !rule.enabled,
                      sound: rule.sound ?? 'default'
                    }).then(apply)
                  }
                />
                <button className="font-bold text-term-amber" onClick={() => loadTicker(rule.symbol)}>
                  {rule.symbol}
                </button>
                <span className="text-term-text">
                  {CONDITION_LABEL[rule.condition]} {rule.value}
                  {rule.condition === 'move' ? '%' : ''}
                </span>
                <span className="text-[9px] uppercase text-term-dim">{rule.repeating ? 'repeating' : 'one-shot'}</span>
                <span className="text-[9px] uppercase text-term-dim">{rule.sound === 'none' ? 'silent' : `♪ ${rule.sound ?? 'default'}`}</span>
                {rule.fired && !rule.repeating && <span className="text-[9px] uppercase text-term-down">FIRED</span>}
                {rule.lastFiredAt && <span className="text-[9px] text-term-dim">last {fmtRelativeTime(rule.lastFiredAt)}</span>}
                <button
                  className="ml-auto text-term-dim hover:text-term-down"
                  onClick={() => void invoke<AlertsState>('alerts:delete-rule', { id: rule.id }).then(apply)}
                >
                  ×
                </button>
              </div>
            ))}
            {data.rules.length === 0 && <div className="p-4 text-[11px] uppercase text-term-dim">No rules — add one above. Alerts fire even while minimized.</div>}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {data.log.map((entry) => (
            <button
              key={entry.id}
              className="flex w-full items-baseline gap-3 border-b border-term-border px-2 py-1.5 text-left text-[11px] hover:bg-[#121212]"
              onClick={() => loadTicker(entry.symbol)}
            >
              <span className="shrink-0 text-[9px] text-term-dim">{new Date(entry.at).toLocaleString('en-GB', { hour12: false })}</span>
              <span className="text-term-text">{entry.message}</span>
            </button>
          ))}
          {data.log.length === 0 && <div className="p-4 text-[11px] uppercase text-term-dim">No alerts fired yet.</div>}
        </div>
      )}
    </div>
  )
}
