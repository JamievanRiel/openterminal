import type { ChartOptions, DeepPartial } from 'lightweight-charts'

/** Shared lightweight-charts options matching the terminal design tokens. */
export function paneOptions(showTimeAxis: boolean, intraday: boolean): DeepPartial<ChartOptions> {
  const et = (timeSec: number): string =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timeSec * 1000))
  const etDateShort = (timeSec: number): string =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(
      new Date(timeSec * 1000)
    )
  return {
    layout: {
      background: { color: '#000000' },
      textColor: '#7a7a7a',
      fontSize: 11,
      fontFamily: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace'
    },
    grid: {
      vertLines: { color: '#161616' },
      horzLines: { color: '#161616' }
    },
    crosshair: {
      mode: 0, // normal (free) — magnet feels wrong in a terminal
      vertLine: { color: '#3a3a3a', labelBackgroundColor: '#ff9800' },
      horzLine: { color: '#3a3a3a', labelBackgroundColor: '#ff9800' }
    },
    rightPriceScale: {
      borderColor: '#262626',
      minimumWidth: 68,
      scaleMargins: { top: 0.08, bottom: 0.08 }
    },
    timeScale: {
      borderColor: '#262626',
      visible: showTimeAxis,
      timeVisible: intraday,
      secondsVisible: false,
      // Render tick labels in ET so intraday sessions read 09:30–16:00.
      tickMarkFormatter: intraday ? (t: number): string => et(t) : undefined
    },
    localization: {
      timeFormatter: intraday
        ? (t: number): string => `${etDateShort(t)} ${et(t)} ET`
        : (t: number): string => new Date(t * 1000).toISOString().slice(0, 10)
    },
    handleScroll: { vertTouchDrag: false },
    autoSize: true
  }
}

export const COLORS = {
  up: '#00c853',
  down: '#ff1744',
  upDim: 'rgba(0, 200, 83, 0.45)',
  downDim: 'rgba(255, 23, 68, 0.45)',
  amber: '#ff9800',
  amberDim: '#b36a00',
  text: '#d4d4d4',
  dim: '#7a7a7a',
  compare: '#00b0ff'
}

export interface IndicatorDef {
  id: string
  label: string
  color: string
  pane: 'price' | 'rsi' | 'macd'
}

export const INDICATOR_DEFS: IndicatorDef[] = [
  { id: 'SMA20', label: 'SMA 20', color: '#64b5f6', pane: 'price' },
  { id: 'SMA50', label: 'SMA 50', color: '#ba68c8', pane: 'price' },
  { id: 'SMA200', label: 'SMA 200', color: '#f06292', pane: 'price' },
  { id: 'EMA9', label: 'EMA 9', color: '#4dd0e1', pane: 'price' },
  { id: 'EMA21', label: 'EMA 21', color: '#fff176', pane: 'price' },
  { id: 'BB', label: 'BOLL 20·2σ', color: '#90a4ae', pane: 'price' },
  { id: 'VWAP', label: 'VWAP', color: '#ff9800', pane: 'price' },
  { id: 'RSI', label: 'RSI 14', color: '#64b5f6', pane: 'rsi' },
  { id: 'MACD', label: 'MACD 12·26·9', color: '#64b5f6', pane: 'macd' }
]
