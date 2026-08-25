import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { KeyStatus, ProviderId } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { useRateLimits } from '../lib/live'

const LABELS: Record<ProviderId, string> = {
  finnhub: 'Finnhub (quotes, streaming, profiles, news)',
  twelvedata: 'Twelve Data (candles, indices, FX)',
  fmp: 'FMP (statements, screener, movers)',
  fred: 'FRED (macro, yield curve)',
  alpaca: 'Alpaca (quote fallback + bid/ask — paste as KEY_ID:SECRET)',
  marketaux: 'Marketaux (news fallback + sentiment — optional)',
  coingecko: 'CoinGecko (crypto — optional demo key raises limits)',
  polygon: 'Polygon.io (options chain — paid options plan required)'
}

interface AppSettings {
  trayMinimize: boolean
  launchAtStartup: boolean
  defaultWorkspace: string | null
  optEnabled: boolean
  edgarContact: string
}

function KeyRow({ status, encryptionAvailable }: { status: KeyStatus; encryptionAvailable: boolean }): JSX.Element {
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      if (!encryptionAvailable) {
        const accepted = window.confirm(
          'OS keychain encryption is unavailable on this system (on Linux this needs gnome-keyring or kwallet). ' +
            'The key would be stored in PLAINTEXT on disk. Store it anyway?'
        )
        if (!accepted) throw new Error('Cancelled — key not stored.')
      }
      await invoke('keys:set', { provider: status.provider, key: value, allowPlaintext: !encryptionAvailable })
      const test = await invoke<{ valid: boolean }>('keys:test', { provider: status.provider })
      return test.valid
    },
    onSuccess: (valid) => {
      setMessage(valid ? 'Saved and validated.' : 'Saved, but the test call failed — check the key.')
      setValue('')
      void queryClient.invalidateQueries({ queryKey: ['key-status'] })
    },
    onError: (err: Error) => setMessage(err.message)
  })

  const retest = useMutation({
    mutationFn: () => invoke<{ valid: boolean }>('keys:test', { provider: status.provider }),
    onSuccess: (r) => setMessage(r.valid ? 'Key OK.' : 'Test call failed — check the key.'),
    onError: (err: Error) => setMessage(err.message)
  })

  return (
    <div className="border border-term-border bg-term-bg p-2">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[12px] text-term-text">{LABELS[status.provider]}</div>
        <div className="font-mono text-[10px] uppercase">
          {status.configured ? (
            <span className="text-term-up">
              CONFIGURED{status.fromEnv ? ' (.ENV DEV)' : status.encrypted ? ' · ENCRYPTED' : ' · PLAINTEXT'}
            </span>
          ) : (
            <span className="text-term-down">MISSING</span>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={status.configured ? '••••••••  (replace key…)' : 'Paste API key…'}
          spellCheck={false}
          className="flex-1 border border-term-border bg-term-panel px-2 py-1 font-mono text-[11px] text-term-text placeholder-term-dim outline-none focus:border-term-amber"
        />
        <button
          disabled={value.trim().length < 4 || save.isPending}
          onClick={() => save.mutate()}
          className="border border-term-border px-3 py-1 font-mono text-[11px] uppercase text-term-amber hover:bg-[#1a1a1a] disabled:opacity-40"
        >
          {save.isPending ? 'Testing…' : 'Save'}
        </button>
        {status.configured && (
          <button
            disabled={retest.isPending}
            onClick={() => retest.mutate()}
            className="border border-term-border px-2 py-1 font-mono text-[10px] uppercase text-term-dim hover:text-term-amber disabled:opacity-40"
          >
            {retest.isPending ? '…' : 'Re-test'}
          </button>
        )}
      </div>
      {message && <div className="mt-1 font-mono text-[10px] text-term-dim">{message}</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange, note }: { label: string; checked: boolean; onChange: (v: boolean) => void; note?: string }): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-4 border-b border-term-border py-1.5 font-mono text-[11px]">
      <span className="text-term-text">
        {label}
        {note && <span className="ml-2 text-[9px] uppercase text-term-dim">{note}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export default function SettingsPanel(): JSX.Element {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'keys' | 'providers' | 'behavior' | 'appearance' | 'about'>('keys')
  const [message, setMessage] = useState('')
  const [diagTickers, setDiagTickers] = useState(true)
  const rateLimits = useRateLimits()

  const statuses = useQuery({ queryKey: ['key-status'], queryFn: () => invoke<KeyStatus[]>('keys:status') })
  const encryption = useQuery({ queryKey: ['encryption-available'], queryFn: () => invoke<boolean>('keys:encryption-available') })
  const settings = useQuery({ queryKey: ['app-settings'], queryFn: () => invoke<AppSettings>('settings:get') })
  const cacheStats = useQuery({
    queryKey: ['cache-stats'],
    queryFn: () => invoke<{ disk: Array<{ name: string; entries: number }> }>('settings:cache-stats'),
    refetchInterval: tab === 'providers' ? 10_000 : false
  })
  const workspaces = useQuery({
    queryKey: ['workspace-list'],
    queryFn: () => invoke<{ active: string; names: string[] }>('workspace:list')
  })
  const version = useQuery({ queryKey: ['app-version'], queryFn: () => invoke<string>('app:version'), staleTime: Infinity })

  const saveSettings = (next: AppSettings): void => {
    void invoke<AppSettings>('settings:set', next).then((s) => queryClient.setQueryData(['app-settings'], s))
  }

  const s = settings.data
  const soundOn = window.localStorage.getItem('alert-sound') !== 'off'
  const volume = Number(window.localStorage.getItem('alert-volume') ?? '0.3')
  const uiScale = window.localStorage.getItem('ui-scale') === 'M'
  const flashOff = window.localStorage.getItem('flash-off') === '1'
  const [, forceRender] = useState(0)
  const localSet = (key: string, value: string): void => {
    window.localStorage.setItem(key, value)
    forceRender((n) => n + 1)
    if (key === 'ui-scale') {
      ;(document.getElementById('root') as HTMLElement).style.zoom = value === 'M' ? '1.12' : '1'
    }
  }

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-1 border-b border-term-border px-2 py-1">
        <span className="mr-2 text-[11px] font-bold text-term-amber">SET — SETTINGS</span>
        {(['keys', 'providers', 'behavior', 'appearance', 'about'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'border px-2 py-0.5 text-[9px] uppercase ' +
              (tab === t ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {t === 'keys' ? 'API keys' : t}
          </button>
        ))}
      </div>
      {message && <div className="shrink-0 px-2 py-0.5 text-[9px] text-term-dim">{message}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'keys' && (
          <>
            <div className="text-[10px] uppercase text-term-dim">
              Keys are stored {encryption.data === false ? 'WITHOUT encryption (keychain unavailable)' : 'encrypted at rest (Electron safeStorage)'} and never leave the main process.
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {(statuses.data ?? []).map((status) => (
                <KeyRow key={status.provider} status={status} encryptionAvailable={encryption.data !== false} />
              ))}
            </div>
            <div className="mt-3 text-[10px] uppercase text-term-dim">
              Register free keys: finnhub.io · twelvedata.com · financialmodelingprep.com · fred.stlouisfed.org · alpaca.markets · marketaux.com · coingecko.com
            </div>
          </>
        )}

        {tab === 'providers' && (
          <>
            <div className="text-[10px] uppercase tracking-widest text-term-dim">Live rate-limit meters</div>
            <div className="mt-1 flex flex-col gap-1">
              {rateLimits.map((r) => (
                <div key={r.provider} className="flex items-center gap-2">
                  <span className="w-24 text-[11px] uppercase text-term-text">{r.provider}</span>
                  <div className="h-2 w-48 bg-[#1a1a1a]">
                    <div
                      className={r.remaining < r.capacity * 0.15 ? 'h-full bg-term-down' : 'h-full bg-term-up'}
                      style={{ width: `${(r.remaining / r.capacity) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-term-dim">
                    {r.remaining}/{r.capacity} tokens
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[10px] uppercase tracking-widest text-term-dim">Disk caches</div>
            <table className="mt-1 w-72 text-[11px]">
              <tbody>
                {(cacheStats.data?.disk ?? []).map((c) => (
                  <tr key={c.name} className="border-b border-term-border">
                    <td className="py-0.5 text-term-text">{c.name}</td>
                    <td className="text-right text-term-dim">{c.entries} entries</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s && (
              <div className="mt-4 max-w-md">
                <div className="text-[10px] uppercase tracking-widest text-term-dim">SEC EDGAR contact</div>
                <div className="mt-1 text-[10px] text-term-dim">
                  EDGAR&apos;s fair-access policy requires an operator e-mail in every request. CACS stays disabled until this is set.
                </div>
                <input
                  type="email"
                  defaultValue={s.edgarContact}
                  key={'edgar-' + s.edgarContact}
                  placeholder="you@example.com"
                  spellCheck={false}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v !== s.edgarContact) saveSettings({ ...s, edgarContact: v })
                  }}
                  className="mt-1 w-full border border-term-border bg-term-bg px-2 py-1 text-[11px] text-term-text placeholder-term-dim outline-none focus:border-term-amber"
                />
              </div>
            )}
            <button
              className="mt-3 border border-term-down px-3 py-1 text-[10px] uppercase text-term-down hover:bg-[#1a0808]"
              onClick={() => {
                if (window.confirm('Clear ALL memory and disk caches? Panels will refetch on next open, spending provider budget.')) {
                  void invoke<{ cleared: number }>('settings:clear-caches').then((r) => {
                    setMessage(`Cleared ${r.cleared} cached entries.`)
                    void queryClient.invalidateQueries({ queryKey: ['cache-stats'] })
                  })
                }
              }}
            >
              Clear caches
            </button>
          </>
        )}

        {tab === 'behavior' && s && (
          <div className="max-w-md">
            <Toggle
              label="Minimize to tray on close"
              checked={s.trayMinimize}
              onChange={(v) => saveSettings({ ...s, trayMinimize: v })}
              note="alerts keep firing"
            />
            <Toggle
              label="Launch at startup"
              checked={s.launchAtStartup}
              onChange={(v) => saveSettings({ ...s, launchAtStartup: v })}
              note="registers with the OS; starts in tray when tray is on"
            />
            <Toggle
              label="OPT options chain (Polygon)"
              checked={s.optEnabled}
              onChange={(v) => saveSettings({ ...s, optEnabled: v })}
              note="needs a valid Polygon key"
            />
            <Toggle label="Alert sound" checked={soundOn} onChange={(v) => localSet('alert-sound', v ? 'on' : 'off')} />
            <label className="flex items-center justify-between gap-4 border-b border-term-border py-1.5 text-[11px]">
              <span className="text-term-text">Alert volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                defaultValue={volume}
                onChange={(e) => localSet('alert-volume', e.target.value)}
              />
            </label>
            <label className="flex items-center justify-between gap-4 border-b border-term-border py-1.5 text-[11px]">
              <span className="text-term-text">Default workspace on launch</span>
              <select
                value={s.defaultWorkspace ?? ''}
                onChange={(e) => saveSettings({ ...s, defaultWorkspace: e.target.value || null })}
                className="border border-term-border bg-term-bg px-1 py-0.5 text-[10px] uppercase text-term-text outline-none"
              >
                <option value="">Last used</option>
                {(workspaces.data?.names ?? []).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-2 text-[9px] uppercase text-term-dim">Portfolio display currency is set per portfolio inside PORT.</div>
            <div className="mt-3 flex gap-2">
              <button
                className="border border-term-border px-3 py-1 text-[10px] uppercase text-term-dim hover:text-term-amber"
                onClick={() =>
                  void invoke<{ saved: boolean; path?: string }>('workspace:export').then((r) =>
                    setMessage(r.saved ? `Workspaces exported → ${r.path}` : 'Cancelled.')
                  )
                }
              >
                Export workspaces
              </button>
              <button
                className="border border-term-border px-3 py-1 text-[10px] uppercase text-term-dim hover:text-term-amber"
                onClick={() =>
                  void invoke<{ imported: boolean; count?: number; error?: string }>('workspace:import').then((r) => {
                    setMessage(r.imported ? `Imported ${r.count} workspace(s) — WS LIST to switch.` : r.error ?? 'Cancelled.')
                    void queryClient.invalidateQueries({ queryKey: ['workspace-list'] })
                  })
                }
              >
                Import workspaces
              </button>
            </div>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="max-w-md">
            <label className="flex items-center justify-between gap-4 border-b border-term-border py-1.5 text-[11px]">
              <span className="text-term-text">Font size</span>
              <span>
                {(['S', 'M'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => localSet('ui-scale', size)}
                    className={
                      'ml-1 border px-2 py-0.5 text-[10px] uppercase ' +
                      ((uiScale ? 'M' : 'S') === size ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim')
                    }
                  >
                    {size}
                  </button>
                ))}
              </span>
            </label>
            <Toggle label="Price flash animations" checked={!flashOff} onChange={(v) => localSet('flash-off', v ? '0' : '1')} />
          </div>
        )}

        {tab === 'about' && (
          <div className="max-w-lg text-[11px] leading-relaxed">
            <div className="text-[14px] font-bold text-term-amber">OpenTerminal v{version.data ?? '…'}</div>
            <p className="mt-2 text-term-text">Keyboard-first multi-panel market terminal. MIT licensed; built on Electron, React, TanStack Query, Zustand, Tailwind and lightweight-charts.</p>
            <div className="mt-3 text-[10px] uppercase tracking-widest text-term-dim">Data sources & attribution</div>
            <ul className="mt-1 list-inside list-disc text-term-text">
              <li>Market data by Finnhub, Twelve Data, Financial Modeling Prep, Alpaca, Marketaux</li>
              <li>Crypto data by CoinGecko (coingecko.com)</li>
              <li>Macro data: Federal Reserve Bank of St. Louis (FRED) — this product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis</li>
              <li>SEC filings: EDGAR (sec.gov)</li>
            </ul>
            <p className="mt-2 text-[10px] uppercase text-term-dim">Not investment advice. Data may be delayed. Respect each provider&apos;s terms of service.</p>
            <div className="mt-4 flex items-center gap-2">
              <button
                className="border border-term-border px-3 py-1 text-[10px] uppercase text-term-dim hover:text-term-amber"
                onClick={() => void invoke('logs:open')}
              >
                Open logs folder
              </button>
              <button
                className="border border-term-border px-3 py-1 text-[10px] uppercase text-term-dim hover:text-term-amber"
                onClick={() =>
                  void invoke<{ saved: boolean; path?: string }>('diagnostics:export', { includeTickers: diagTickers }).then((r) =>
                    setMessage(r.saved ? `Diagnostics → ${r.path}` : 'Cancelled.')
                  )
                }
              >
                Export diagnostics
              </button>
              <label className="flex items-center gap-1 text-[9px] uppercase text-term-dim">
                <input type="checkbox" checked={diagTickers} onChange={(e) => setDiagTickers(e.target.checked)} />
                include tickers
              </label>
            </div>
            <p className="mt-1 text-[9px] uppercase text-term-dim">Diagnostics contain provider status and log excerpts — never API keys.</p>
          </div>
        )}
      </div>
    </div>
  )
}
