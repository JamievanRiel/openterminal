import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { minutesUntilState, nextTransition, usSessionState } from '../../../shared/marketHours'
import type { AlertsState, UpdateStatus } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { useRateLimits, useStreamState } from '../lib/live'
import { setUnseen, useAlertUnseen } from '../lib/alerts'
import { useWorkspace } from '../state/workspace'

function fmtCountdown(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`
}

const STREAM_DOT: Record<string, string> = {
  live: 'bg-term-up',
  connecting: 'bg-term-amber',
  reconnecting: 'bg-term-amber',
  paused: 'bg-[#4a4a4a]',
  off: 'bg-[#4a4a4a]'
}

const RATE_LABEL: Record<string, string> = { finnhub: 'FH', twelvedata: 'TD', fmp: 'FMP' }

export default function StatusBar(): JSX.Element {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const streamState = useStreamState()
  const rateLimits = useRateLimits()
  const alertUnseen = useAlertUnseen()
  const applyCommand = useWorkspace((s) => s.applyCommand)
  const workspaceName = useWorkspace((s) => s.workspaceName)

  // Seed the badge with any unseen alerts that fired while the app was closed.
  useEffect(() => {
    void invoke<AlertsState>('alerts:state')
      .then((s) => setUnseen(s.unseen))
      .catch(() => undefined)
  }, [])

  // Auto-update chip: available → notes dialog → download → restart-to-install.
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  useEffect(() => {
    void invoke<UpdateStatus>('update:state').then(setUpdate).catch(() => undefined)
    return window.terminal.on('update:status', (payload) => setUpdate(payload as UpdateStatus))
  }, [])

  const { data: version } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => invoke<string>('app:version'),
    staleTime: Infinity
  })

  const local = now.toLocaleTimeString('en-GB', { hour12: false })
  const ny = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(now)

  const session = usSessionState(now)
  const transition = nextTransition(now)
  let marketLabel: string
  let marketClass: string
  switch (session) {
    case 'open':
      marketLabel = `US OPEN — CLOSES IN ${fmtCountdown(transition.inMinutes)}`
      marketClass = 'text-term-up'
      break
    case 'pre':
      marketLabel = `PRE-MKT — OPENS IN ${fmtCountdown(transition.inMinutes)}`
      marketClass = 'text-term-amber'
      break
    case 'post':
      marketLabel = 'POST-MKT'
      marketClass = 'text-term-amber'
      break
    default: {
      // Exact countdown to the next regular open (DST-safe), not the pre-market boundary.
      marketLabel = `US CLOSED — OPENS IN ${fmtCountdown(minutesUntilState('open', now))}`
      marketClass = 'text-term-down'
    }
  }

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-term-border bg-term-panel px-3 font-mono text-[11px] text-term-dim">
      <div className="flex items-center gap-5">
        <span>
          LOCAL <span className="text-term-text">{local}</span>
        </span>
        <span>
          NY <span className="text-term-text">{ny}</span>
        </span>
        <span className={marketClass}>{marketLabel}</span>
        {session === 'pre' && <span className="border border-term-amber px-1 text-[9px] text-term-amber">PRE</span>}
        {session === 'post' && <span className="border border-term-amber px-1 text-[9px] text-term-amber">POST</span>}
      </div>
      <div className="flex items-center gap-5">
        <span title="Active workspace (WS <name> to switch)">
          WS <span className="text-term-amber">{workspaceName}</span>
        </span>
        {rateLimits.map((r) => (
          <span key={r.provider} title={`${r.provider} rate-limit tokens remaining`}>
            {RATE_LABEL[r.provider] ?? r.provider}{' '}
            <span className={r.remaining < r.capacity * 0.15 ? 'text-term-down' : 'text-term-text'}>
              {r.remaining}/{r.capacity}
            </span>
          </span>
        ))}
        {!updateDismissed && update.state === 'available' && (
          <button
            className="border border-term-amber px-1.5 font-bold uppercase text-term-amber hover:bg-[#181206]"
            onClick={() => setNotesOpen(true)}
            title="An update is available"
          >
            UPDATE v{update.version}
          </button>
        )}
        {update.state === 'downloading' && (
          <span className="border border-term-amber px-1.5 uppercase text-term-amber">↓ {update.percent}%</span>
        )}
        {update.state === 'ready' && (
          <button
            className="border border-term-up px-1.5 font-bold uppercase text-term-up hover:bg-[#08170c]"
            onClick={() => void invoke('update:install')}
          >
            Restart to install v{update.version}
          </button>
        )}
        {notesOpen && update.state === 'available' && (
          <div className="fixed bottom-8 right-3 z-50 w-80 border border-term-amber bg-term-panel p-3 text-left">
            <div className="font-bold uppercase text-term-amber">Update v{update.version}</div>
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] text-term-text">{update.notes || 'No release notes.'}</pre>
            <div className="mt-2 flex gap-2">
              <button
                className="border border-term-amber px-2 py-0.5 uppercase text-term-amber hover:bg-[#181206]"
                onClick={() => {
                  setNotesOpen(false)
                  void invoke('update:download')
                }}
              >
                Download in background
              </button>
              <button
                className="border border-term-border px-2 py-0.5 uppercase text-term-dim hover:text-term-text"
                onClick={() => {
                  setNotesOpen(false)
                  setUpdateDismissed(true) // re-appears next launch only
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {alertUnseen > 0 && (
          <button
            className="border border-term-down px-1.5 font-bold uppercase text-term-down hover:bg-[#1a0808]"
            onClick={() => applyCommand('ALRT', null, false)}
            title="Unseen alerts — click to open the log"
          >
            ALRT {alertUnseen}
          </button>
        )}
        <span className="flex items-center gap-1.5 uppercase">
          <span className={'dot inline-block h-2 w-2 ' + (STREAM_DOT[streamState] ?? 'bg-[#4a4a4a]')} />
          {streamState}
        </span>
        <span>v{version ?? '…'}</span>
      </div>
    </div>
  )
}
