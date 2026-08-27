import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '../lib/ipc'
import { isMod } from '../lib/platform'
import { useWorkspace } from '../state/workspace'
import ErrorBoundary from './ErrorBoundary'
import DesPanel from '../panels/DesPanel'
import QuotePanel from '../panels/QuotePanel'
import HelpPanel from '../panels/HelpPanel'
import SettingsPanel from '../panels/SettingsPanel'
import PlaceholderPanel from '../panels/PlaceholderPanel'
import WatchlistPanel from '../panels/WatchlistPanel'
import WeiPanel from '../panels/WeiPanel'
import MoversPanel from '../panels/MoversPanel'
import ChartPanel from '../panels/ChartPanel'
import NewsPanel from '../panels/NewsPanel'
import FaPanel from '../panels/FaPanel'
import ErnPanel from '../panels/ErnPanel'
import DvdPanel from '../panels/DvdPanel'
import CacsPanel from '../panels/CacsPanel'
import HpPanel from '../panels/HpPanel'
import EcalPanel from '../panels/EcalPanel'
import InsdPanel from '../panels/InsdPanel'
import WirePanel from '../panels/WirePanel'
import EqsPanel from '../panels/EqsPanel'
import PortPanel from '../panels/PortPanel'
import AlrtPanel from '../panels/AlrtPanel'
import MsgPanel from '../panels/MsgPanel'
import OptPanel from '../panels/OptPanel'
import EcoPanel from '../panels/EcoPanel'
import GcPanel from '../panels/GcPanel'
import HmapPanel from '../panels/HmapPanel'
import FxPanel from '../panels/FxPanel'
import CrypPanel from '../panels/CrypPanel'

/** Dev-only: verifies a render crash stays contained to one panel's boundary. */
function Boom(): JSX.Element {
  throw new Error('BOOM — intentional dev crash test')
}

export function PanelContent({ fn, ticker, index }: { fn: string; ticker: string | null; index: number }): JSX.Element {
  if (import.meta.env.DEV && fn === 'BOOM') return <Boom />
  switch (fn) {
    case 'DES':
      return ticker ? <DesPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'Q':
    case 'QM':
      return ticker ? <QuotePanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'GP':
    case 'GIP':
      return ticker ? (
        <ChartPanel ticker={ticker} variant={fn} panelIndex={index} />
      ) : (
        <PlaceholderPanel fn={fn} />
      )
    case 'N':
      return ticker ? <NewsPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'TOP':
      return <NewsPanel ticker={null} />
    case 'FA':
      return ticker ? <FaPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'ERN':
      return ticker ? <ErnPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'DVD':
      return ticker ? <DvdPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'CACS':
      return ticker ? <CacsPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'HP':
      return ticker ? <HpPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'ECAL':
      return <EcalPanel />
    case 'INSD':
      return <InsdPanel />
    case 'WIRE':
      return <WirePanel />
    case 'EQS':
      return <EqsPanel ticker={ticker} />
    case 'PORT':
      return <PortPanel />
    case 'ALRT':
      return <AlrtPanel />
    case 'ECO':
      return <EcoPanel />
    case 'GC':
      return <GcPanel />
    case 'HMAP':
      return <HmapPanel />
    case 'FX':
      return <FxPanel ticker={ticker} />
    case 'CRYP':
      return <CrypPanel />
    case 'MSG':
      return ticker ? <MsgPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'OPT':
      return ticker ? <OptPanel ticker={ticker} /> : <PlaceholderPanel fn={fn} />
    case 'W':
      return <WatchlistPanel />
    case 'WEI':
      return <WeiPanel />
    case 'MOST':
      return <MoversPanel />
    case 'HELP':
      return <HelpPanel />
    case 'SET':
      return <SettingsPanel />
    default:
      return <PlaceholderPanel fn={fn} />
  }
}

/** Snapshot the DOM rect of a panel and hand it to main for capture. */
function snapshotPanel(el: HTMLElement | null, fn: string, ticker: string | null): void {
  if (!el) return
  const r = el.getBoundingClientRect()
  const stamp = new Date()
  const name = `${ticker ?? fn}-${fn}-${stamp.toISOString().slice(0, 10)}-${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}`
  void invoke('panel:snapshot', { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, name }).catch(() => undefined)
}

export default function PanelGrid(): JSX.Element {
  const { panels, activePanel, setActive, cycleActive, closePanel, popOutPanel } = useWorkspace()

  // Tickers that have MSG notes get a ● next to their name in DES/QM headers.
  const notes = useQuery({
    queryKey: ['notes-list'],
    queryFn: () => invoke<Array<{ symbol: string }>>('notes:list'),
    staleTime: 30_000,
    refetchInterval: 60_000
  })
  const notedSymbols = new Set((notes.data ?? []).map((n) => n.symbol))

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      if (event.key === 'Tab' && !typing) {
        event.preventDefault()
        cycleActive()
      }
      if (isMod(event) && event.key >= '1' && event.key <= '6' && !event.shiftKey) {
        const index = Number(event.key) - 1
        if (index < panels.length) {
          event.preventDefault()
          setActive(index)
        }
      }
      // Mod+Shift+P: pop out the active panel · Mod+Shift+S: snapshot it (Cmd on macOS).
      if (isMod(event) && event.shiftKey && event.key.toUpperCase() === 'P') {
        event.preventDefault()
        popOutPanel(useWorkspace.getState().activePanel)
      }
      if (isMod(event) && event.shiftKey && event.key.toUpperCase() === 'S') {
        event.preventDefault()
        const idx = useWorkspace.getState().activePanel
        const panel = useWorkspace.getState().panels[idx]
        if (panel) snapshotPanel(document.getElementById(`panel-${panel.id}`), panel.fn, panel.ticker)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panels.length, cycleActive, setActive, popOutPanel])

  const cols = panels.length <= 1 ? 1 : panels.length <= 4 ? 2 : 3

  return (
    <div
      className="grid min-h-0 flex-1 gap-1 bg-term-bg p-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          id={`panel-${panel.id}`}
          onMouseDown={() => setActive(index)}
          className={
            'flex min-h-0 flex-col border bg-term-panel ' +
            (index === activePanel ? 'border-term-amber' : 'border-term-border')
          }
        >
          <div className="flex h-6 shrink-0 items-center justify-between border-b border-term-border px-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider">
              <span className="text-term-amber">{panel.ticker ?? ''}</span>
              {panel.ticker && notedSymbols.has(panel.ticker) && ['DES', 'Q', 'QM'].includes(panel.fn) && (
                <span className="ml-0.5 text-term-amber" title="Has a note (MSG)">
                  ●
                </span>
              )}
              <span className="ml-1 text-term-text">{panel.fn === 'EMPTY' ? '—' : panel.fn}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] uppercase text-term-dim">P{index + 1}</span>
              {panel.fn !== 'EMPTY' && (
                <>
                  <button
                    className="px-1 font-mono text-[10px] text-term-dim hover:text-term-amber"
                    title="Snapshot panel (Ctrl+Shift+S)"
                    onClick={(event) => {
                      event.stopPropagation()
                      snapshotPanel(document.getElementById(`panel-${panel.id}`), panel.fn, panel.ticker)
                    }}
                  >
                    ⊡
                  </button>
                  <button
                    className="px-1 font-mono text-[10px] text-term-dim hover:text-term-amber"
                    title="Pop out to its own window (Ctrl+Shift+P)"
                    onClick={(event) => {
                      event.stopPropagation()
                      popOutPanel(index)
                    }}
                  >
                    ⧉
                  </button>
                </>
              )}
              {panels.length > 1 && (
                <button
                  className="px-1 font-mono text-[11px] text-term-dim hover:text-term-down"
                  onClick={(event) => {
                    event.stopPropagation()
                    closePanel(index)
                  }}
                  title="Close panel"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary>
              <PanelContent fn={panel.fn} ticker={panel.ticker} index={index} />
            </ErrorBoundary>
          </div>
        </div>
      ))}
    </div>
  )
}
