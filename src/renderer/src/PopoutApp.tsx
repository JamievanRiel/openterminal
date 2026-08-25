import { useEffect, useState } from 'react'
import type { ChartSettings, PanelState } from '../../shared/types'
import { invoke } from './lib/ipc'
import ErrorBoundary from './components/ErrorBoundary'
import TerminalChart, { defaultChartSettings } from './components/chart/TerminalChart'
import DesPanel from './panels/DesPanel'
import QuotePanel from './panels/QuotePanel'
import NewsPanel from './panels/NewsPanel'
import FaPanel from './panels/FaPanel'
import ErnPanel from './panels/ErnPanel'
import DvdPanel from './panels/DvdPanel'
import CacsPanel from './panels/CacsPanel'
import HpPanel from './panels/HpPanel'
import MsgPanel from './panels/MsgPanel'
import WeiPanel from './panels/WeiPanel'
import MoversPanel from './panels/MoversPanel'
import EcoPanel from './panels/EcoPanel'
import GcPanel from './panels/GcPanel'
import HmapPanel from './panels/HmapPanel'
import FxPanel from './panels/FxPanel'
import CrypPanel from './panels/CrypPanel'
import WatchlistPanel from './panels/WatchlistPanel'

const TICKER_FNS = ['DES', 'Q', 'QM', 'GP', 'GIP', 'N', 'FA', 'ERN', 'DVD', 'CACS', 'HP', 'MSG']

function PopoutContent({ panel, onChart }: { panel: PanelState; onChart: (c: ChartSettings) => void }): JSX.Element {
  const t = panel.ticker
  switch (panel.fn) {
    case 'GP':
    case 'GIP':
      return t ? (
        <TerminalChart
          symbol={t}
          settings={panel.chart ?? defaultChartSettings(panel.fn)}
          onSettings={onChart}
          variant={panel.fn}
          isActivePanel
        />
      ) : (
        <Empty />
      )
    case 'DES':
      return t ? <DesPanel ticker={t} /> : <Empty />
    case 'Q':
    case 'QM':
      return t ? <QuotePanel ticker={t} /> : <Empty />
    case 'N':
      return t ? <NewsPanel ticker={t} /> : <Empty />
    case 'TOP':
      return <NewsPanel ticker={null} />
    case 'FA':
      return t ? <FaPanel ticker={t} /> : <Empty />
    case 'ERN':
      return t ? <ErnPanel ticker={t} /> : <Empty />
    case 'DVD':
      return t ? <DvdPanel ticker={t} /> : <Empty />
    case 'CACS':
      return t ? <CacsPanel ticker={t} /> : <Empty />
    case 'HP':
      return t ? <HpPanel ticker={t} /> : <Empty />
    case 'MSG':
      return t ? <MsgPanel ticker={t} /> : <Empty />
    case 'W':
      return <WatchlistPanel />
    case 'WEI':
      return <WeiPanel />
    case 'MOST':
      return <MoversPanel />
    case 'ECO':
      return <EcoPanel />
    case 'GC':
      return <GcPanel />
    case 'HMAP':
      return <HmapPanel />
    case 'FX':
      return <FxPanel ticker={t} />
    case 'CRYP':
      return <CrypPanel />
    default:
      return <Empty />
  }
}

function Empty(): JSX.Element {
  return <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase text-term-dim">Nothing to show.</div>
}

/**
 * A popped-out panel: same renderer bundle, same preload, one fixed function
 * instance that follows its link group. State lives main-side.
 */
export default function PopoutApp(): JSX.Element {
  const [panel, setPanel] = useState<PanelState | null>(null)

  useEffect(() => {
    void invoke<PanelState | null>('popout:init').then(setPanel).catch(() => undefined)
  }, [])

  // Link group: ticker changes anywhere propagate to this window.
  useEffect(() => {
    return window.terminal.on('link:ticker', (payload) => {
      const ticker = payload as string
      setPanel((prev) => {
        if (!prev || !TICKER_FNS.includes(prev.fn)) return prev
        const next = { ...prev, ticker }
        void invoke('popout:update', next).catch(() => undefined)
        return next
      })
    })
  }, [])

  const onChart = (chart: ChartSettings): void => {
    setPanel((prev) => {
      if (!prev) return prev
      const next = { ...prev, chart }
      void invoke('popout:update', next).catch(() => undefined)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col bg-term-bg text-term-text">
      <div className="drag-region flex h-7 shrink-0 items-center justify-between border-b border-term-border bg-term-panel px-2">
        <div className="font-mono text-[10px] font-bold uppercase tracking-wider">
          <span className="dot mr-1.5 inline-block h-2 w-2 bg-term-amber" title="Link group A" />
          <span className="text-term-amber">{panel?.ticker ?? ''}</span>
          <span className="ml-1 text-term-text">{panel?.fn ?? '…'}</span>
          <span className="ml-2 text-[9px] normal-case text-term-dim">pop-out</span>
        </div>
        <div className="no-drag flex items-center gap-1">
          <button
            className="px-1.5 font-mono text-[10px] uppercase text-term-dim hover:text-term-amber"
            title="Return panel to the main grid"
            onClick={() => window.terminal.send('win:close-self')}
          >
            ⇲ return
          </button>
          <button
            className="px-1.5 font-mono text-[11px] text-term-dim hover:text-term-down"
            title="Remove panel entirely"
            onClick={() => {
              void invoke('popout:remove').then(() => window.terminal.send('win:close-self'))
            }}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ErrorBoundary>{panel ? <PopoutContent panel={panel} onChart={onChart} /> : <Empty />}</ErrorBoundary>
      </div>
    </div>
  )
}
