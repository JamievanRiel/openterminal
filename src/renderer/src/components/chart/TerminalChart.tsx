import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts'
import type { Candle, CandleResponse, ChartSettings, EarningsEvent } from '../../../../shared/types'
import { INTERVAL_SECONDS, INTERVALS, isIntraday, RANGE_DEFAULT_INTERVAL, RANGES } from '../../../../shared/chart'
import { usSessionState } from '../../../../shared/marketHours'
import { invoke, type IpcError } from '../../lib/ipc'
import { useLiveTick } from '../../lib/live'
import { bollinger, ema, macd as macdCalc, rsi as rsiCalc, sma, vwap } from '../../lib/indicators/indicators'
import { fmtCompact, fmtPct, fmtPrice } from '../../lib/format'
import { ErrorState, LoadingState } from '../PanelStates'
import { COLORS, INDICATOR_DEFS, paneOptions } from './chartTheme'
import ChartToolbar from './ChartToolbar'

type PaneId = 'price' | 'rsi' | 'macd'

interface PaneMain {
  series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>
  values: Map<number, number>
}

interface IndicatorLegendEntry {
  id: string
  label: string
  color: string
  values: Array<number | null>
}

interface Engine {
  charts: Partial<Record<PaneId, IChartApi>>
  paneMain: Map<IChartApi, PaneMain>
  unsubs: Array<() => void>
  syncing: boolean
  allSeries: Map<IChartApi, ISeriesApi<never>[]>
  main?: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>
  volume?: ISeriesApi<'Histogram'>
  compare?: ISeriesApi<'Line'>
  overlaySeries: Map<string, Array<{ series: ISeriesApi<'Line'>; line: number }>>
  rsiSeries?: ISeriesApi<'Line'>
  macdSeries?: { line: ISeriesApi<'Line'>; signal: ISeriesApi<'Line'>; hist: ISeriesApi<'Histogram'> }
  priceLine?: IPriceLine
  candles: Candle[]
  compareCandles: Candle[]
  baseFirstClose: number
  compareFirstClose: number
  legend: IndicatorLegendEntry[]
  prevSessionVolume: number
  prevCompareSeq: number
  lastFitKey: string
}

const etFmtCache: Record<string, Intl.DateTimeFormat> = {}
function etParts(timeSec: number): { date: string; minutes: number } {
  const key = 'et'
  etFmtCache[key] ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
  const parts = etFmtCache[key].formatToParts(new Date(timeSec * 1000))
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute'))
  }
}

function computeIndicatorLegend(candles: Candle[], indicators: string[]): IndicatorLegendEntry[] {
  const closes = candles.map((c) => c.close)
  const out: IndicatorLegendEntry[] = []
  for (const id of indicators) {
    const def = INDICATOR_DEFS.find((d) => d.id === id)
    if (!def) continue
    switch (id) {
      case 'SMA20':
        out.push({ id, label: def.label, color: def.color, values: sma(closes, 20) })
        break
      case 'SMA50':
        out.push({ id, label: def.label, color: def.color, values: sma(closes, 50) })
        break
      case 'SMA200':
        out.push({ id, label: def.label, color: def.color, values: sma(closes, 200) })
        break
      case 'EMA9':
        out.push({ id, label: def.label, color: def.color, values: ema(closes, 9) })
        break
      case 'EMA21':
        out.push({ id, label: def.label, color: def.color, values: ema(closes, 21) })
        break
      case 'BB': {
        const bb = bollinger(closes, 20, 2)
        out.push({ id, label: def.label, color: def.color, values: bb.middle })
        break
      }
      case 'VWAP':
        out.push({ id, label: def.label, color: def.color, values: vwap(candles, (t) => etParts(t).date) })
        break
      case 'RSI':
        out.push({ id, label: def.label, color: def.color, values: rsiCalc(closes, 14) })
        break
      case 'MACD':
        out.push({ id, label: def.label, color: def.color, values: macdCalc(closes).macd })
        break
    }
  }
  return out
}

function lineData(values: Array<number | null>, candles: Candle[]): Array<{ time: UTCTimestamp; value: number }> {
  const out: Array<{ time: UTCTimestamp; value: number }> = []
  for (let i = 0; i < candles.length; i++) {
    const v = values[i]
    if (v !== null && Number.isFinite(v)) out.push({ time: candles[i].time as UTCTimestamp, value: v })
  }
  return out
}

export interface TerminalChartProps {
  symbol: string
  settings: ChartSettings
  onSettings: (next: ChartSettings) => void
  variant: 'GP' | 'GIP'
  isActivePanel: boolean
}

export default function TerminalChart({ symbol, settings, onSettings, variant, isActivePanel }: TerminalChartProps): JSX.Element {
  const priceRef = useRef<HTMLDivElement>(null)
  const rsiRef = useRef<HTMLDivElement>(null)
  const macdRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine>()
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  const { interval, range } = settings
  const intraday = isIntraday(interval)
  const compareOn = settings.compare !== null
  const showRsi = settings.indicators.includes('RSI')
  const showMacd = settings.indicators.includes('MACD')

  const candlesQuery = useQuery({
    queryKey: ['candles', symbol, interval, range, retryTick],
    queryFn: () =>
      invoke<CandleResponse>('candles:get', { symbol, interval, range, priority: isActivePanel }),
    staleTime: intraday ? 55_000 : 3600_000,
    retry: false
  })
  const compareQuery = useQuery({
    queryKey: ['candles', settings.compare, interval, range, retryTick],
    queryFn: () =>
      invoke<CandleResponse>('candles:get', { symbol: settings.compare, interval, range, priority: isActivePanel }),
    staleTime: intraday ? 55_000 : 3600_000,
    retry: false,
    enabled: compareOn
  })
  const earningsQuery = useQuery({
    queryKey: ['earnings', symbol],
    queryFn: () => invoke<EarningsEvent[]>('earnings:get', { symbol }),
    staleTime: 24 * 3600_000,
    retry: false,
    enabled: !intraday
  })

  const live = useLiveTick(symbol)
  const compareLive = useLiveTick(settings.compare)

  const getEngine = useCallback((): Engine => {
    engineRef.current ??= {
      charts: {},
      paneMain: new Map(),
      unsubs: [],
      syncing: false,
      allSeries: new Map(),
      overlaySeries: new Map(),
      candles: [],
      compareCandles: [],
      baseFirstClose: 0,
      compareFirstClose: 0,
      legend: [],
      prevSessionVolume: 0,
      prevCompareSeq: 0,
      lastFitKey: ''
    }
    return engineRef.current
  }, [])

  // ------------------------------------------------------- pane management

  const ensurePane = useCallback(
    (engine: Engine, id: PaneId, el: HTMLDivElement | null, showTimeAxis: boolean): IChartApi | null => {
      if (!el) {
        const existing = engine.charts[id]
        if (existing) {
          engine.paneMain.delete(existing)
          engine.allSeries.delete(existing)
          existing.remove()
          delete engine.charts[id]
        }
        return null
      }
      let chart = engine.charts[id]
      if (!chart) {
        chart = createChart(el, paneOptions(showTimeAxis, intraday))
        engine.charts[id] = chart
        attachSync(engine, chart)
      } else {
        chart.applyOptions(paneOptions(showTimeAxis, intraday))
      }
      return chart
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intraday]
  )

  const attachSync = (engine: Engine, chart: IChartApi): void => {
    const onRange = (r: LogicalRange | null): void => {
      if (engine.syncing || !r) return
      engine.syncing = true
      for (const other of Object.values(engine.charts)) {
        if (other !== chart) other.timeScale().setVisibleLogicalRange(r)
      }
      engine.syncing = false
    }
    const onCrosshair = (param: { time?: Time }): void => {
      if (engine.syncing) return
      engine.syncing = true
      const t = typeof param.time === 'number' ? param.time : null
      for (const other of Object.values(engine.charts)) {
        if (other === chart) continue
        const main = engine.paneMain.get(other)
        if (t !== null && main) {
          const v = main.values.get(t)
          if (v !== undefined) other.setCrosshairPosition(v, t as Time, main.series)
          else other.clearCrosshairPosition()
        } else {
          other.clearCrosshairPosition()
        }
      }
      engine.syncing = false
      setHoverTime(t)
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    chart.subscribeCrosshairMove(onCrosshair)
  }

  // ---------------------------------------------------------- series build

  const data = candlesQuery.data
  const compareData = compareOn ? compareQuery.data : undefined
  const indicatorKey = settings.indicators.join(',')

  useEffect(() => {
    if (!data || data.candles.length === 0) return
    if (compareOn && !compareData) return
    const engine = getEngine()

    const bottomPane: PaneId = showMacd ? 'macd' : showRsi ? 'rsi' : 'price'
    const price = ensurePane(engine, 'price', priceRef.current, bottomPane === 'price')
    const rsiChart = ensurePane(engine, 'rsi', showRsi ? rsiRef.current : null, bottomPane === 'rsi')
    const macdChart = ensurePane(engine, 'macd', showMacd ? macdRef.current : null, bottomPane === 'macd')
    if (!price) return

    // Tear down every series and rebuild — charts persist, so no visible flicker.
    for (const [chart, series] of engine.allSeries) {
      for (const s of series) {
        try {
          chart.removeSeries(s as ISeriesApi<'Line'>)
        } catch {
          /* chart may already be gone */
        }
      }
    }
    engine.allSeries = new Map()
    engine.paneMain = new Map()
    engine.overlaySeries = new Map()
    engine.main = undefined
    engine.volume = undefined
    engine.compare = undefined
    engine.rsiSeries = undefined
    engine.macdSeries = undefined
    engine.priceLine = undefined

    const track = <T,>(chart: IChartApi, s: T): T => {
      const list = engine.allSeries.get(chart) ?? []
      list.push(s as ISeriesApi<never>)
      engine.allSeries.set(chart, list)
      return s
    }

    const candles = [...data.candles]
    engine.candles = candles
    engine.compareCandles = compareData ? [...compareData.candles] : []
    engine.baseFirstClose = candles[0]?.close ?? 0
    engine.compareFirstClose = engine.compareCandles[0]?.close ?? 0
    engine.prevSessionVolume = 0
    engine.prevCompareSeq = 0
    engine.legend = computeIndicatorLegend(candles, settings.indicators)

    // Pre/post shading + session dividers (intraday): histogram behind everything.
    if (intraday) {
      const shade = track(price, price.addHistogramSeries({ priceScaleId: 'shade', priceLineVisible: false, lastValueVisible: false }))
      price.priceScale('shade').applyOptions({ visible: false, scaleMargins: { top: 0, bottom: 0 } })
      let prevDay = ''
      shade.setData(
        candles.map((c) => {
          const p = etParts(c.time)
          const firstOfSession = p.date !== prevDay
          prevDay = p.date
          const extended = p.minutes < 570 || p.minutes >= 960
          return {
            time: c.time as UTCTimestamp,
            value: firstOfSession || extended ? 1 : 0,
            color: firstOfSession ? 'rgba(122,122,122,0.22)' : 'rgba(255,152,0,0.05)'
          }
        })
      )
    }

    const values = new Map(candles.map((c) => [c.time, c.close]))

    if (compareOn) {
      // Percent-change-from-range-start for both series; base becomes a line.
      const basePct = candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: engine.baseFirstClose ? (c.close / engine.baseFirstClose - 1) * 100 : 0
      }))
      const baseLine = track(
        price,
        price.addLineSeries({ color: COLORS.amber, lineWidth: 2, priceFormat: { type: 'custom', formatter: (v: number) => v.toFixed(2) + '%' } })
      )
      baseLine.setData(basePct)
      engine.main = baseLine
      engine.paneMain.set(price, { series: baseLine, values: new Map(basePct.map((p) => [p.time as number, p.value])) })

      const cmpPct = engine.compareCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: engine.compareFirstClose ? (c.close / engine.compareFirstClose - 1) * 100 : 0
      }))
      const cmpLine = track(price, price.addLineSeries({ color: COLORS.compare, lineWidth: 2 }))
      cmpLine.setData(cmpPct)
      engine.compare = cmpLine
    } else {
      let main: Engine['main']
      if (settings.seriesType === 'candles') {
        const s = track(
          price,
          price.addCandlestickSeries({
            upColor: COLORS.up,
            downColor: COLORS.down,
            borderUpColor: COLORS.up,
            borderDownColor: COLORS.down,
            wickUpColor: COLORS.up,
            wickDownColor: COLORS.down
          })
        )
        s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })))
        main = s
      } else if (settings.seriesType === 'line') {
        const s = track(price, price.addLineSeries({ color: COLORS.amber, lineWidth: 2 }))
        s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })))
        main = s
      } else {
        const s = track(
          price,
          price.addAreaSeries({
            lineColor: COLORS.amber,
            topColor: 'rgba(255,152,0,0.25)',
            bottomColor: 'rgba(255,152,0,0.02)',
            lineWidth: 2
          })
        )
        s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })))
        main = s
      }
      engine.main = main
      engine.paneMain.set(price, { series: main, values })

      // Volume histogram on its own scale, ~20% height, colored by candle direction.
      const vol = track(price, price.addHistogramSeries({ priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false }))
      price.priceScale('vol').applyOptions({ visible: false, scaleMargins: { top: 0.8, bottom: 0 } })
      vol.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? COLORS.upDim : COLORS.downDim
        }))
      )
      engine.volume = vol
      price.priceScale('right').applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } })

      // Overlays (hidden in compare mode by construction of this branch).
      const closes = candles.map((c) => c.close)
      const addOverlay = (id: string, series: Array<{ vals: Array<number | null>; width?: number; style?: number }>, color: string): void => {
        const entries = series.map(({ vals, width, style }) => {
          const s = track(
            price,
            price.addLineSeries({
              color,
              lineWidth: (width ?? 1) as 1 | 2 | 3 | 4,
              lineStyle: style ?? 0,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false
            })
          )
          s.setData(lineData(vals, candles))
          return { series: s, line: 0 }
        })
        engine.overlaySeries.set(id, entries)
      }
      for (const id of settings.indicators) {
        const def = INDICATOR_DEFS.find((d) => d.id === id)
        if (!def || def.pane !== 'price') continue
        if (id === 'BB') {
          const bb = bollinger(closes, 20, 2)
          addOverlay(id, [{ vals: bb.upper }, { vals: bb.middle, style: 2 }, { vals: bb.lower }], def.color)
        } else if (id === 'VWAP') {
          if (intraday) addOverlay(id, [{ vals: vwap(candles, (t) => etParts(t).date), width: 2, style: 2 }], def.color)
        } else {
          const period = Number(id.replace(/\D/g, ''))
          const vals = id.startsWith('SMA') ? sma(closes, period) : ema(closes, period)
          addOverlay(id, [{ vals, width: 1 }], def.color)
        }
      }

      // Earnings markers (daily+ only) — best-effort, never blocks the chart.
      if (!intraday && earningsQuery.data && main) {
        const times = new Map(candles.map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), c.time]))
        const markers: Array<SeriesMarker<Time>> = []
        for (const e of earningsQuery.data) {
          const t = times.get(e.date)
          if (t !== undefined) {
            markers.push({ time: t as UTCTimestamp, position: 'belowBar', color: COLORS.amberDim, shape: 'arrowUp', text: 'E' })
          }
        }
        main.setMarkers(markers)
      }

      // Amber last-price line, kept current by the tick effect below.
      const lastClose = candles[candles.length - 1]?.close
      if (lastClose !== undefined) {
        engine.priceLine = main.createPriceLine({
          price: lastClose,
          color: COLORS.amber,
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: ''
        })
      }
    }

    // Sub-panes.
    if (rsiChart) {
      const closes = candles.map((c) => c.close)
      const s = track(rsiChart, rsiChart.addLineSeries({ color: '#64b5f6', lineWidth: 1, priceLineVisible: false }))
      const vals = rsiCalc(closes, 14)
      const rsiPoints = lineData(vals, candles)
      s.setData(rsiPoints)
      s.createPriceLine({ price: 70, color: '#3a3a3a', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
      s.createPriceLine({ price: 30, color: '#3a3a3a', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })
      rsiChart.priceScale('right').applyOptions({ autoScale: false })
      s.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) })
      engine.rsiSeries = s
      engine.paneMain.set(rsiChart, { series: s, values: new Map(rsiPoints.map((p) => [p.time as number, p.value])) })
    }
    if (macdChart) {
      const closes = candles.map((c) => c.close)
      const m = macdCalc(closes)
      const hist = track(macdChart, macdChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }))
      hist.setData(
        candles
          .map((c, i) => ({ time: c.time as UTCTimestamp, value: m.histogram[i], color: (m.histogram[i] ?? 0) >= 0 ? COLORS.upDim : COLORS.downDim }))
          .filter((p): p is { time: UTCTimestamp; value: number; color: string } => p.value !== null)
      )
      const line = track(macdChart, macdChart.addLineSeries({ color: '#64b5f6', lineWidth: 1, priceLineVisible: false }))
      const linePoints = lineData(m.macd, candles)
      line.setData(linePoints)
      const signal = track(macdChart, macdChart.addLineSeries({ color: COLORS.amber, lineWidth: 1, priceLineVisible: false }))
      signal.setData(lineData(m.signal, candles))
      engine.macdSeries = { line, signal, hist }
      engine.paneMain.set(macdChart, { series: line, values: new Map(linePoints.map((p) => [p.time as number, p.value])) })
    }

    const fitKey = `${symbol}:${interval}:${range}:${compareOn}:${showRsi}:${showMacd}`
    if (engine.lastFitKey !== fitKey) {
      engine.lastFitKey = fitKey
      for (const chart of Object.values(engine.charts)) chart.timeScale().fitContent()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, compareData, settings.seriesType, indicatorKey, compareOn, interval, range, symbol, earningsQuery.data, showRsi, showMacd])

  // Destroy charts on unmount.
  useEffect(() => {
    return () => {
      const engine = engineRef.current
      if (!engine) return
      for (const chart of Object.values(engine.charts)) chart.remove()
      engineRef.current = undefined
    }
  }, [])

  // ------------------------------------------------------------ live ticks

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !live || !engine.main || engine.candles.length === 0) return
    const candles = engine.candles
    const last = candles[candles.length - 1]
    const tSec = Math.floor(live.ts / 1000)
    const sec = INTERVAL_SECONDS[interval]
    const volDelta = Math.max(0, live.sessionVolume - engine.prevSessionVolume)
    engine.prevSessionVolume = live.sessionVolume

    let bar: Candle
    const rollIntraday = intraday && tSec >= last.time + sec
    const rollDaily = !intraday && interval === '1D' && etParts(tSec).date !== etParts(last.time).date
    if (rollIntraday || rollDaily) {
      const newTime = rollIntraday ? last.time + sec * Math.floor((tSec - last.time) / sec) : tSec - (tSec % 86_400)
      bar = { time: newTime, open: live.price, high: live.price, low: live.price, close: live.price, volume: volDelta }
      candles.push(bar)
    } else {
      last.close = live.price
      last.high = Math.max(last.high, live.price)
      last.low = Math.min(last.low, live.price)
      last.volume += volDelta
      bar = last
    }

    if (compareOn) {
      const pct = engine.baseFirstClose ? (bar.close / engine.baseFirstClose - 1) * 100 : 0
      ;(engine.main as ISeriesApi<'Line'>).update({ time: bar.time as UTCTimestamp, value: pct })
    } else if (settings.seriesType === 'candles') {
      ;(engine.main as ISeriesApi<'Candlestick'>).update({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      })
    } else {
      ;(engine.main as ISeriesApi<'Line'>).update({ time: bar.time as UTCTimestamp, value: bar.close })
    }
    engine.volume?.update({
      time: bar.time as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? COLORS.upDim : COLORS.downDim
    })
    engine.priceLine?.applyOptions({ price: bar.close })

    // Tail-only indicator recompute over a bounded window.
    const tail = candles.slice(-300)
    const tailCloses = tail.map((c) => c.close)
    const patch = (series: ISeriesApi<'Line'> | undefined, vals: Array<number | null>): void => {
      const v = vals[vals.length - 1]
      if (series && v !== null && Number.isFinite(v)) series.update({ time: bar.time as UTCTimestamp, value: v })
    }
    for (const [id, entries] of engine.overlaySeries) {
      if (id === 'BB') {
        const bb = bollinger(tailCloses, 20, 2)
        patch(entries[0]?.series, bb.upper)
        patch(entries[1]?.series, bb.middle)
        patch(entries[2]?.series, bb.lower)
      } else if (id === 'VWAP') {
        patch(entries[0]?.series, vwap(tail, (t) => etParts(t).date))
      } else {
        const period = Number(id.replace(/\D/g, ''))
        patch(entries[0]?.series, id.startsWith('SMA') ? sma(tailCloses, period) : ema(tailCloses, period))
      }
    }
    if (engine.rsiSeries) patch(engine.rsiSeries, rsiCalc(tailCloses, 14))
    if (engine.macdSeries) {
      const m = macdCalc(tailCloses)
      patch(engine.macdSeries.line, m.macd)
      patch(engine.macdSeries.signal, m.signal)
      const h = m.histogram[m.histogram.length - 1]
      if (h !== null) {
        engine.macdSeries.hist.update({ time: bar.time as UTCTimestamp, value: h, color: h >= 0 ? COLORS.upDim : COLORS.downDim })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  // Compare series live update.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !compareLive || !engine.compare || engine.compareCandles.length === 0) return
    if (compareLive.seq === engine.prevCompareSeq) return
    engine.prevCompareSeq = compareLive.seq
    const last = engine.compareCandles[engine.compareCandles.length - 1]
    last.close = compareLive.price
    const pct = engine.compareFirstClose ? (last.close / engine.compareFirstClose - 1) * 100 : 0
    engine.compare.update({ time: last.time as UTCTimestamp, value: pct })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareLive])

  // ---------------------------------------------------------------- legend

  const legend = useMemo(() => {
    const engine = engineRef.current
    const candles = engine?.candles ?? data?.candles ?? []
    if (candles.length === 0) return null
    let idx = candles.length - 1
    if (hoverTime !== null) {
      const found = candles.findIndex((c) => c.time === hoverTime)
      if (found >= 0) idx = found
    }
    const c = candles[idx]
    const prevClose = idx > 0 ? candles[idx - 1].close : c.open
    const cls = c.close >= prevClose ? 'text-term-up' : 'text-term-down'
    const inds = (engine?.legend ?? []).map((e) => ({
      label: e.label,
      color: e.color,
      value: e.values[Math.min(idx, e.values.length - 1)]
    }))
    return { c, cls, inds, idx }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverTime, data, indicatorKey, live?.seq])

  // ------------------------------------------------------------- states

  if (candlesQuery.isLoading || (compareOn && compareQuery.isLoading)) {
    return (
      <div className="flex h-full flex-col">
        <ChartToolbar symbol={symbol} settings={settings} onSettings={onSettings} variant={variant} data={undefined} />
        <LoadingState label={`${symbol} ${interval} candles`} />
      </div>
    )
  }
  const err = (candlesQuery.error ?? (compareOn ? compareQuery.error : null)) as IpcError | null
  if (err && !data) {
    if (err.name === 'RATE_LIMITED') {
      return (
        <div className="flex h-full flex-col">
          <ChartToolbar symbol={symbol} settings={settings} onSettings={onSettings} variant={variant} data={undefined} />
          <RateLimitCountdown error={err} onRetry={() => setRetryTick((n) => n + 1)} />
        </div>
      )
    }
    return (
      <div className="flex h-full flex-col">
        <ChartToolbar symbol={symbol} settings={settings} onSettings={onSettings} variant={variant} data={undefined} />
        <ErrorState error={err} />
      </div>
    )
  }

  const session = usSessionState()
  const marketClosed = session === 'closed' && !symbol.endsWith('-USD')

  return (
    <div className="flex h-full flex-col">
      <ChartToolbar symbol={symbol} settings={settings} onSettings={onSettings} variant={variant} data={data} />
      <div className="relative min-h-0 flex-1">
        <div ref={priceRef} className="h-full w-full" />
        {legend && (
          <div className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap items-baseline gap-x-3 font-mono text-[10px]">
            <span className="font-bold text-term-amber">
              {symbol}
              {compareOn && <span className="ml-1" style={{ color: COLORS.compare }}>vs {settings.compare}</span>}
            </span>
            {!compareOn && (
              <>
                <span className={legend.cls}>
                  O {fmtPrice(legend.c.open)} H {fmtPrice(legend.c.high)} L {fmtPrice(legend.c.low)} C {fmtPrice(legend.c.close)}
                </span>
                <span className="text-term-dim">VOL {fmtCompact(legend.c.volume)}</span>
              </>
            )}
            {compareOn && engineRef.current && (
              <span className="text-term-text">
                {fmtPct(engineRef.current.baseFirstClose ? (legend.c.close / engineRef.current.baseFirstClose - 1) * 100 : 0)}
              </span>
            )}
            {legend.inds.map((i) => (
              <span key={i.label} style={{ color: i.color }}>
                {i.label} {i.value !== null && Number.isFinite(i.value) ? fmtPrice(i.value as number) : '—'}
              </span>
            ))}
            {marketClosed && <span className="text-term-dim">MKT CLOSED</span>}
            {data?.fromDiskCache && <span className="border border-term-border px-1 text-term-amber">CACHED</span>}
            {data?.delayed && <span className="text-term-dim">DELAYED</span>}
          </div>
        )}
      </div>
      {showRsi && (
        <div className="relative h-[90px] shrink-0 border-t border-term-border">
          <div ref={rsiRef} className="h-full w-full" />
          <span className="pointer-events-none absolute left-2 top-0.5 z-10 font-mono text-[9px] uppercase text-term-dim">RSI 14</span>
        </div>
      )}
      {showMacd && (
        <div className="relative h-[90px] shrink-0 border-t border-term-border">
          <div ref={macdRef} className="h-full w-full" />
          <span className="pointer-events-none absolute left-2 top-0.5 z-10 font-mono text-[9px] uppercase text-term-dim">MACD 12·26·9</span>
        </div>
      )}
    </div>
  )
}

function RateLimitCountdown({ error, onRetry }: { error: IpcError; onRetry: () => void }): JSX.Element {
  const [left, setLeft] = useState(Math.max(1, Math.ceil((error.retryAfterMs ?? 15_000) / 1000)))
  useEffect(() => {
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (left === 0) onRetry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])
  return (
    <div className="p-4 font-mono text-[11px]">
      <div className="uppercase text-term-amber">Rate limited</div>
      <div className="mt-1 text-term-dim">{error.message}</div>
      <div className="mt-2 uppercase text-term-text">Retrying in {left}s…</div>
    </div>
  )
}

export function defaultChartSettings(variant: 'GP' | 'GIP'): ChartSettings {
  return variant === 'GIP'
    ? { seriesType: 'candles', interval: '1m', range: '1D', indicators: ['VWAP'], compare: null }
    : { seriesType: 'candles', interval: RANGE_DEFAULT_INTERVAL['1Y'], range: '1Y', indicators: [], compare: null }
}

export { INTERVALS, RANGES }
