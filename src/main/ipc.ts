import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import path from 'path'
import type ElectronStore from 'electron-store'
import { z } from 'zod'
import type {
  EarningsFull,
  EarningsSurprise,
  IpcResult,
  NewsPage,
  PeerMetricsRow,
  RateLimitInfo,
  WorkspaceSnapshot
} from '../shared/types'
import { KeyManager } from './keys'
import { FinnhubProvider, finnhubBucketStatus } from './providers/finnhub'
import { TwelveDataProvider, twelvedataBucketStatus } from './providers/twelvedata'
import { attachFmpBucketPersistence, FmpProvider, fmpBucketStatus } from './providers/fmp'
import { AlpacaProvider } from './providers/alpaca'
import { ProviderRouter } from './providers/router'
import { ProviderError } from './providers/util'
import { MarketauxProvider } from './providers/marketaux'
import { StreamManager } from './stream/StreamManager'
import { WatchlistManager } from './watchlists'
import { CandleService } from './candles'
import { FundamentalsService } from './fundamentals'
import { EdgarService } from './edgar'
import { PortfolioManager, portfolioSchema } from './portfolios'
import { AlertEngine, focusMainWindow } from './alerts'
import { FredProvider } from './providers/fred'
import { CoinGeckoProvider } from './providers/coingecko'
import { clearAllTtlCaches } from './providers/util'
import { clearAllDiskCaches, diskCacheStats } from './diskcache'
import { PolygonProvider } from './providers/polygon'
import { PopoutManager } from './popouts'
import { ExportService } from './exportService'
import { UpdateManager } from './updater'

// Display symbols: AAPL, BRK.B, BTC-USD, EUR/USD
const displaySymbol = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .toUpperCase()
  .regex(/^[A-Z0-9.\-/:]+$/)
const symbolSchema = z.object({ symbol: displaySymbol })
const querySchema = z.object({ query: z.string().trim().min(1).max(40) })
const providerSchema = z.enum(['finnhub', 'twelvedata', 'fmp', 'fred', 'alpaca', 'marketaux', 'coingecko', 'polygon'])
const setKeySchema = z.object({
  provider: providerSchema,
  key: z.string().trim().min(4).max(200),
  allowPlaintext: z.boolean().default(false)
})
const chartSettingsSchema = z.object({
  seriesType: z.enum(['candles', 'line', 'area']),
  interval: z.enum(['1m', '5m', '15m', '1h', '1D', '1W', '1M']),
  range: z.enum(['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']),
  indicators: z.array(z.string().max(16)).max(12),
  compare: displaySymbol.nullable()
})
const panelStateSchema = z.object({
  id: z.number().int(),
  fn: z.string().max(8),
  ticker: z.string().max(16).nullable(),
  chart: chartSettingsSchema.optional()
})
const popoutBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(100).max(10_000),
  height: z.number().int().min(100).max(10_000)
})
const workspaceSchema = z.object({
  layout: z.number().int().min(1).max(6),
  activePanel: z.number().int().min(0).max(5),
  panels: z.array(panelStateSchema).max(6),
  popouts: z.array(z.object({ panel: panelStateSchema, bounds: popoutBoundsSchema.optional() })).max(8).optional()
})
const candlesSchema = z.object({
  symbol: displaySymbol,
  interval: z.enum(['1m', '5m', '15m', '1h', '1D', '1W', '1M']),
  range: z.enum(['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']),
  priority: z.boolean().default(false)
})
const newsSchema = z.object({
  symbol: displaySymbol.nullable(),
  page: z.number().int().min(0).max(8).default(0)
})
const statementsSchema = z.object({
  symbol: displaySymbol,
  period: z.enum(['annual', 'quarter'])
})
const screenerFiltersSchema = z.object({
  sector: z.string().max(40).nullable(),
  exchange: z.string().max(16).nullable(),
  marketCapMin: z.number().finite().nullable(),
  marketCapMax: z.number().finite().nullable(),
  priceMin: z.number().finite().nullable(),
  priceMax: z.number().finite().nullable(),
  volumeMin: z.number().finite().nullable(),
  dividendMin: z.number().finite().nullable(),
  limit: z.number().int().min(1).max(100)
})
const savedScreenSchema = z.object({
  name: z.string().trim().min(1).max(16).toUpperCase(),
  filters: screenerFiltersSchema
})
const alertRuleSchema = z.object({
  id: z.string().max(64).optional(),
  symbol: displaySymbol,
  condition: z.enum(['above', 'below', 'move']),
  value: z.number().finite().positive(),
  repeating: z.boolean(),
  enabled: z.boolean(),
  sound: z.enum(['default', 'urgent', 'none']).default('default')
})
const streamSubSchema = z.object({
  symbol: displaySymbol,
  subscriberId: z.string().trim().min(1).max(64)
})
const moversSchema = z.object({ tab: z.enum(['gainers', 'losers', 'actives']) })
const tdSymbolSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9.\-/: ]+$/)
})
const watchlistSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  symbols: z.array(displaySymbol).max(500)
})

/** Twelve Data symbols for the delayed international index cards (WEI). */
const INTL_INDEX_SYMBOLS = new Set(['AEX', 'DAX', 'FTSE', 'CAC', 'N225', 'HSI', 'XJO', 'SPY', 'QQQ', 'DIA', 'IWM'])

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function fail(err: unknown): IpcResult<never> {
  if (err instanceof ProviderError) {
    return { ok: false, code: err.code, message: err.message, retryAfterMs: err.retryAfterMs }
  }
  if (err instanceof z.ZodError) return { ok: false, code: 'BAD_PAYLOAD', message: 'Invalid request payload.' }
  return { ok: false, code: 'INTERNAL', message: err instanceof Error ? err.message : 'Unknown error' }
}

function handle<T>(channel: string, fn: (payload: unknown, senderId: number) => Promise<T> | T): void {
  ipcMain.handle(channel, async (event, payload: unknown) => {
    try {
      return ok(await fn(payload, event.sender.id))
    } catch (err) {
      return fail(err)
    }
  })
}

export interface IpcServices {
  stream: StreamManager
}

export function registerIpc(
  store: ElectronStore<Record<string, unknown>>,
  getWindow: () => BrowserWindow | null
): IpcServices {
  const keys = new KeyManager(store)
  const finnhub = new FinnhubProvider(() => keys.getKey('finnhub'))
  const twelvedata = new TwelveDataProvider(() => keys.getKey('twelvedata'))
  const fmp = new FmpProvider(() => keys.getKey('fmp'))
  const alpaca = new AlpacaProvider(() => keys.getKey('alpaca'))
  const marketaux = new MarketauxProvider(() => keys.getKey('marketaux'))
  attachFmpBucketPersistence({
    load: () => (store.get('fmpBucket') as { tokens: number; lastRefill: number } | undefined) ?? null,
    save: (state) => store.set('fmpBucket', state)
  })
  const router = new ProviderRouter(finnhub, alpaca, twelvedata)
  const watchlists = new WatchlistManager()
  const candles = new CandleService(twelvedata, alpaca)
  const fundamentals = new FundamentalsService(fmp)
  const edgar = new EdgarService(
    () => ((store.get('appSettings') as { edgarContact?: string } | undefined)?.edgarContact ?? '')
  )
  const portfolios = new PortfolioManager()
  const fred = new FredProvider(() => keys.getKey('fred'))
  const coingecko = new CoinGeckoProvider(() => keys.getKey('coingecko'))

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
  const stream = new StreamManager(() => keys.getKey('finnhub'), twelvedata, broadcast)
  const alerts = new AlertEngine(stream, router, broadcast, focusMainWindow)
  const polygon = new PolygonProvider(() => keys.getKey('polygon'))
  const exportSvc = new ExportService()
  const updater = new UpdateManager(broadcast)
  const broadcastToMain = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
  const popouts = new PopoutManager(stream, broadcastToMain)
  const sendToOthers = (senderId: number, channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents.id !== senderId) win.webContents.send(channel, payload)
    }
  }

  // --- window controls ---
  ipcMain.on('win:minimize', () => getWindow()?.minimize())
  ipcMain.on('win:toggle-maximize', () => {
    const win = getWindow()
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('win:close', () => getWindow()?.close())
  // Pop-out windows close themselves (win:close targets the main window).
  ipcMain.on('win:close-self', (event) => BrowserWindow.fromWebContents(event.sender)?.close())

  // --- keys ---
  handle('keys:status', () => keys.status())
  handle('keys:encryption-available', () => keys.encryptionAvailable())
  handle('keys:set', (payload) => {
    const p = setKeySchema.parse(payload)
    const result = keys.setKey(p.provider, p.key, p.allowPlaintext)
    if (!result.ok) throw new Error(result.error)
    if (p.provider === 'finnhub') stream.onKeyChanged()
    return result
  })
  handle('keys:test', async (payload) => {
    const p = z.object({ provider: providerSchema }).parse(payload)
    switch (p.provider) {
      case 'finnhub':
        return { valid: await finnhub.testKey() }
      case 'twelvedata':
        return { valid: await twelvedata.testKey() }
      case 'fmp':
        return { valid: await fmp.testKey() }
      case 'alpaca':
        return { valid: await alpaca.testKey() }
      case 'fred':
        return { valid: await fred.testKey() }
      case 'coingecko':
        return { valid: await coingecko.testKey() }
      case 'polygon':
        return { valid: await polygon.testKey() }
      default:
        return { valid: keys.getKey(p.provider) !== null }
    }
  })

  // --- market data (REST) ---
  handle('search:symbols', (payload) => finnhub.searchSymbols(querySchema.parse(payload).query))
  handle('quote:get', (payload) => router.getQuote(symbolSchema.parse(payload).symbol))
  handle('profile:get', (payload) => finnhub.getProfile(symbolSchema.parse(payload).symbol))
  handle('peers:get', (payload) => finnhub.getPeers(symbolSchema.parse(payload).symbol))
  handle('metric:get', (payload) => finnhub.getMetric(symbolSchema.parse(payload).symbol))
  handle('candles:get', (payload) => {
    const p = candlesSchema.parse(payload)
    return candles.getCandles(p.symbol, p.interval, p.range, p.priority)
  })
  handle('earnings:get', (payload) => finnhub.getEarnings(symbolSchema.parse(payload).symbol))

  // --- research: news ---
  handle('news:get', async (payload): Promise<NewsPage> => {
    const p = newsSchema.parse(payload)
    try {
      const items = await finnhub.getNews(p.symbol, p.page)
      return { items, provider: 'finnhub', fetchedAt: Date.now() }
    } catch (err) {
      if (p.symbol !== null && p.page === 0 && marketaux.configured()) {
        console.log('[news] finnhub failed, falling back to marketaux for', p.symbol)
        const items = await marketaux.getCompanyNews(p.symbol)
        return { items, provider: 'marketaux', fetchedAt: Date.now() }
      }
      throw err
    }
  })
  handle('news:sentiment', async (payload): Promise<number | null> => {
    const p = symbolSchema.parse(payload)
    try {
      return await finnhub.getNewsSentiment(p.symbol)
    } catch {
      return null // sentiment is decoration — never propagate errors
    }
  })

  // --- research: fundamentals ---
  handle('metric:full', (payload) => finnhub.getMetricFull(symbolSchema.parse(payload).symbol))
  handle('fundamentals:statements', (payload) => {
    const p = statementsSchema.parse(payload)
    return fundamentals.getStatements(p.symbol, p.period)
  })
  handle('fundamentals:peers', async (payload): Promise<PeerMetricsRow[]> => {
    const p = symbolSchema.parse(payload)
    const peers = (await finnhub.getPeers(p.symbol)).slice(0, 4)
    const symbols = [p.symbol, ...peers]
    // Hard cap: ≤5 metric calls per FA open, every one 24h-cached.
    const rows = await Promise.all(
      symbols.map(async (sym): Promise<PeerMetricsRow> => {
        try {
          const m = await finnhub.getMetricFull(sym)
          const g = (keys: string[]): number | null => {
            for (const k of keys) {
              const v = m[k]
              if (typeof v === 'number' && Number.isFinite(v)) return v
            }
            return null
          }
          return {
            symbol: sym,
            pe: g(['peTTM', 'peBasicExclExtraTTM', 'peAnnual']),
            evEbitda: g(['evEbitdaTTM', 'enterpriseValueOverEBITDATTM', 'enterpriseValueOverEBITDAAnnual']),
            grossMargin: g(['grossMarginTTM', 'grossMarginAnnual']),
            operatingMargin: g(['operatingMarginTTM', 'operatingMarginAnnual']),
            netMargin: g(['netProfitMarginTTM', 'netProfitMarginAnnual']),
            revenueGrowth: g(['revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy', 'revenueGrowth3Y'])
          }
        } catch {
          return { symbol: sym, pe: null, evEbitda: null, grossMargin: null, operatingMargin: null, netMargin: null, revenueGrowth: null }
        }
      })
    )
    return rows
  })

  // --- research: earnings / dividends / filings ---
  handle('earnings:full', async (payload): Promise<EarningsFull> => {
    const p = symbolSchema.parse(payload)
    const today = new Date().toISOString().slice(0, 10)
    const [calRes, surRes] = await Promise.allSettled([
      finnhub.getEarnings(p.symbol),
      finnhub.getEarningsSurprises(p.symbol)
    ])
    let surprises: EarningsSurprise[] = surRes.status === 'fulfilled' ? surRes.value : []
    let nextDate: string | null = null
    let nextEps: number | null = null
    let nextRevenue: number | null = null
    if (calRes.status === 'fulfilled') {
      const upcoming = calRes.value.filter((e) => e.date >= today)
      if (upcoming.length > 0) {
        nextDate = upcoming[0].date
        nextEps = upcoming[0].epsEstimate
      }
    }
    // FMP enrichment (longer series + revenue) only when the daily budget is comfortable.
    if (keys.getKey('fmp') && fmp.bucketRemaining() > 50) {
      try {
        const raw = await fmp.getEarningsRaw(p.symbol)
        const g = (r: Record<string, unknown>, ks: string[]): number | null => {
          for (const k of ks) {
            const v = r[k]
            if (typeof v === 'number' && Number.isFinite(v)) return v
          }
          return null
        }
        const past: EarningsSurprise[] = []
        for (const r of raw) {
          const date = typeof r.date === 'string' ? r.date : ''
          if (!date) continue
          const actual = g(r, ['epsActual', 'eps'])
          const estimate = g(r, ['epsEstimated'])
          if (date >= today) {
            if (!nextDate || date < nextDate) {
              nextDate = date
              nextEps = estimate ?? nextEps
              nextRevenue = g(r, ['revenueEstimated'])
            }
            continue
          }
          if (actual === null) continue
          past.push({
            period: date,
            actual,
            estimate,
            surprisePct: estimate !== null && estimate !== 0 ? ((actual - estimate) / Math.abs(estimate)) * 100 : null,
            revenueActual: g(r, ['revenueActual', 'revenue']),
            revenueEstimate: g(r, ['revenueEstimated'])
          })
        }
        if (past.length > surprises.length) surprises = past.sort((a, b) => a.period.localeCompare(b.period))
      } catch {
        /* enrichment is optional */
      }
    }
    if (surprises.length === 0 && surRes.status === 'rejected') throw surRes.reason
    return { nextDate, nextEpsEstimate: nextEps, nextRevenueEstimate: nextRevenue, surprises: surprises.slice(-12), fetchedAt: Date.now() }
  })
  handle('dividends:get', (payload) => fundamentals.getDividends(symbolSchema.parse(payload).symbol))
  handle('filings:get', (payload) => edgar.getFilings(symbolSchema.parse(payload).symbol))

  // --- screener ---
  handle('screener:run', (payload) => fmp.runScreener(screenerFiltersSchema.parse(payload)))
  handle('screener:screens', () => (store.get('savedScreens') as unknown[] | undefined) ?? [])
  handle('screener:save-screen', (payload) => {
    const p = savedScreenSchema.parse(payload)
    const screens = ((store.get('savedScreens') as Array<{ name: string }> | undefined) ?? []).filter((s) => s.name !== p.name)
    screens.push(p)
    store.set('savedScreens', screens)
    return screens
  })
  handle('screener:delete-screen', (payload) => {
    const p = z.object({ name: z.string().max(16) }).parse(payload)
    const screens = ((store.get('savedScreens') as Array<{ name: string }> | undefined) ?? []).filter((s) => s.name !== p.name)
    store.set('savedScreens', screens)
    return screens
  })

  // --- portfolios ---
  handle('portfolio:list', () => portfolios.list())
  handle('portfolio:save', (payload) => portfolios.save(portfolioSchema.parse(payload)))
  handle('portfolio:create', (payload) => portfolios.create(z.object({ name: z.string().trim().min(1).max(40) }).parse(payload).name))
  handle('portfolio:delete', (payload) => portfolios.delete(z.object({ id: z.string().max(64) }).parse(payload).id))
  handle('portfolio:export', () => portfolios.exportJson(getWindow()))
  handle('portfolio:import', () => portfolios.importJson(getWindow()))

  // --- alerts ---
  handle('alerts:state', () => alerts.state())
  handle('alerts:save-rule', (payload) => alerts.saveRule(alertRuleSchema.parse(payload)))
  handle('alerts:delete-rule', (payload) => alerts.deleteRule(z.object({ id: z.string().max(64) }).parse(payload).id))
  handle('alerts:mark-seen', () => alerts.markSeen())
  handle('alerts:clear-log', () => alerts.clearLog())

  // --- macro (FRED) ---
  handle('macro:series', (payload) => {
    const p = z.object({ id: z.string().regex(/^[A-Z0-9]{1,30}$/), days: z.number().int().min(30).max(4000) }).parse(payload)
    return fred.getSeries(p.id, p.days)
  })
  handle('macro:releases', async () => {
    // Finnhub economic calendar first (probe once); FRED release dates as the free fallback.
    const finnhubCal = await finnhub.tryEconomicCalendar().catch(() => null)
    if (finnhubCal && finnhubCal.length > 0) {
      return finnhubCal.map((e) => ({ date: e.time.slice(0, 10), name: e.event }))
    }
    return fred.getUpcomingReleases()
  })
  handle('eco:earnings-week', (payload) => {
    const p = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(payload)
    return finnhub.getEarningsWeek(p.from, p.to)
  })
  handle('yields:get', async () => {
    const IDS = ['DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS3', 'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30']
    const series = await Promise.all(IDS.map((id) => fred.getSeries(id, 420)))
    return Object.fromEntries(series.map((s) => [s.id, s]))
  })

  // --- FX pair grid: staggered round-robin inside the Twelve Data bucket ---
  const FX_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY']
  const fxCacheState = new Map<string, { quote: unknown; asOf: number }>()
  handle('fx:pairs', async () => {
    // Refresh the 2 stalest pairs per call (renderer polls every 30s → full cycle ≤ 2.5 min, ≤ 4 TD credits/min).
    const byAge = [...FX_PAIRS].sort((a, b) => (fxCacheState.get(a)?.asOf ?? 0) - (fxCacheState.get(b)?.asOf ?? 0))
    for (const pair of byAge.slice(0, 2)) {
      try {
        const q = await twelvedata.getQuote(pair)
        fxCacheState.set(pair, { quote: q, asOf: Date.now() })
      } catch {
        /* bucket empty or no key — serve what we have */
      }
    }
    return FX_PAIRS.map((pair) => {
      const entry = fxCacheState.get(pair)
      return { pair, quote: entry?.quote ?? null, asOf: entry?.asOf ?? 0 }
    })
  })

  // --- crypto (CoinGecko) ---
  handle('crypto:markets', () => coingecko.getMarkets())
  handle('crypto:detail', (payload) => {
    const p = z
      .object({ id: z.string().regex(/^[a-z0-9-]{1,60}$/), days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(365)]) })
      .parse(payload)
    return coingecko.getDetail(p.id, p.days)
  })

  // --- universal exports (single service for every CSV/JSON in the app) ---
  const exportCsvSchema = z.object({
    name: z.string().trim().min(1).max(80),
    headers: z.array(z.string().max(60)).min(1).max(40),
    rows: z.array(z.array(z.union([z.string().max(500), z.number(), z.null()])).max(40)).max(20_000)
  })
  handle('export:csv', (payload) => {
    const p = exportCsvSchema.parse(payload)
    return exportSvc.exportCsv(getWindow(), p.name, p.headers, p.rows)
  })
  handle('export:json', (payload) => {
    const p = z.object({ name: z.string().trim().min(1).max(80), data: z.unknown() }).parse(payload)
    return exportSvc.exportJson(getWindow(), p.name, p.data)
  })

  // --- pop-outs & link groups ---
  handle('panel:popout', (payload) => {
    popouts.open(panelStateSchema.parse(payload))
    return true
  })
  handle('popout:init', (_payload, senderId) => popouts.getPanel(senderId))
  handle('popout:update', (payload, senderId) => {
    popouts.update(senderId, panelStateSchema.parse(payload))
    return true
  })
  handle('popout:remove', (_payload, senderId) => {
    popouts.markRemoved(senderId)
    return true
  })
  handle('link:set-ticker', (payload, senderId) => {
    const p = z.object({ ticker: displaySymbol }).parse(payload)
    sendToOthers(senderId, 'link:ticker', p.ticker)
    return true
  })

  // --- panel snapshot (pixel-correct PNG of one panel) ---
  handle('panel:snapshot', async (payload, senderId) => {
    const p = z
      .object({
        rect: z.object({
          x: z.number().min(0),
          y: z.number().min(0),
          width: z.number().min(10),
          height: z.number().min(10)
        }),
        name: z.string().trim().min(1).max(80)
      })
      .parse(payload)
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.id === senderId)
    if (!win) return { done: false }
    // capturePage takes DIP coordinates and captures at the display's backing
    // scale, so the PNG is pixel-correct on HiDPI without manual scaling.
    const rect = {
      x: Math.round(p.rect.x),
      y: Math.round(p.rect.y),
      width: Math.round(p.rect.width),
      height: Math.round(p.rect.height)
    }
    const image = await win.webContents.capturePage(rect)
    const choice = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Panel snapshot',
      message: `Snapshot captured (${image.getSize().width}×${image.getSize().height}px).`,
      buttons: ['Save PNG…', 'Copy to clipboard', 'Cancel'],
      defaultId: 0,
      cancelId: 2
    })
    if (choice.response === 1) {
      clipboard.writeImage(image)
      return { done: true, copied: true }
    }
    if (choice.response === 0) {
      const save = await dialog.showSaveDialog(win, {
        title: 'Save panel snapshot',
        defaultPath: p.name.replace(/[^\w.-]+/g, '-') + '.png',
        filters: [{ name: 'PNG', extensions: ['png'] }]
      })
      if (!save.canceled && save.filePath) {
        writeFileSync(save.filePath, image.toPNG())
        return { done: true, path: save.filePath }
      }
    }
    return { done: false }
  })

  // --- options chain (Polygon, feature-flagged) ---
  handle('options:expirations', (payload) => polygon.getExpirations(symbolSchema.parse(payload).symbol))
  handle('options:chain', (payload) => {
    const p = z.object({ symbol: displaySymbol, expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(payload)
    return polygon.getChain(p.symbol, p.expiration)
  })

  // --- auto-update ---
  handle('update:state', () => updater.getStatus())
  handle('update:download', () => updater.download().then(() => true))
  handle('update:install', () => updater.install().then(() => true))
  handle('update:simulate', (payload) => {
    const p = z.object({ step: z.enum(['available', 'download', 'ready', 'reset']) }).parse(payload)
    return updater.simulate(p.step)
  })

  // --- streaming ---
  handle('stream:subscribe', (payload, senderId) => {
    const p = streamSubSchema.parse(payload)
    stream.subscribe(senderId, p.subscriberId, p.symbol)
    return true
  })
  handle('stream:unsubscribe', (payload, senderId) => {
    const p = streamSubSchema.parse(payload)
    stream.unsubscribe(senderId, p.subscriberId, p.symbol)
    return true
  })
  handle('stream:state', () => stream.getState())

  // --- rate limits ---
  const rateLimits = (): RateLimitInfo[] => [
    { provider: 'finnhub', ...finnhubBucketStatus() },
    { provider: 'twelvedata', ...twelvedataBucketStatus() },
    { provider: 'fmp', ...fmpBucketStatus() }
  ]
  handle('ratelimit:status', () => rateLimits())
  setInterval(() => broadcast('ratelimit:status', rateLimits()), 2_000)

  // --- WEI ---
  handle('wei:international', (payload) => {
    const p = tdSymbolSchema.parse(payload)
    if (!INTL_INDEX_SYMBOLS.has(p.symbol.toUpperCase())) {
      throw new ProviderError('UNSUPPORTED', 'Unknown index symbol: ' + p.symbol)
    }
    return twelvedata.getIndexQuote(p.symbol.toUpperCase())
  })
  handle('wei:sparkline', (payload) => {
    const p = tdSymbolSchema.parse(payload)
    if (!INTL_INDEX_SYMBOLS.has(p.symbol.toUpperCase())) {
      throw new ProviderError('UNSUPPORTED', 'Unknown index symbol: ' + p.symbol)
    }
    return twelvedata.getSparkline(p.symbol.toUpperCase())
  })

  // --- movers ---
  handle('movers:get', (payload) => fmp.getMovers(moversSchema.parse(payload).tab))

  // --- watchlists ---
  handle('watchlist:list', () => watchlists.list())
  handle('watchlist:save', (payload) => watchlists.save(watchlistSchema.parse(payload)))
  handle('watchlist:create', (payload) => watchlists.create(z.object({ name: z.string().trim().min(1).max(40) }).parse(payload).name))
  handle('watchlist:delete', (payload) => watchlists.delete(z.object({ id: z.string().min(1).max(64) }).parse(payload).id))

  // --- notes (MSG) ---
  interface NoteRecord {
    text: string
    createdAt: number
    updatedAt: number
  }
  const allNotes = (): Record<string, NoteRecord> => (store.get('notes') as Record<string, NoteRecord> | undefined) ?? {}
  handle('notes:list', () =>
    Object.entries(allNotes())
      .map(([symbol, n]) => ({ symbol, updatedAt: n.updatedAt, preview: n.text.slice(0, 60) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  )
  handle('notes:get', (payload) => {
    const p = symbolSchema.parse(payload)
    return allNotes()[p.symbol] ?? null
  })
  handle('notes:save', (payload) => {
    const p = z.object({ symbol: displaySymbol, text: z.string().max(100_000) }).parse(payload)
    const notes = allNotes()
    if (p.text.trim() === '') {
      delete notes[p.symbol]
    } else {
      const existing = notes[p.symbol]
      notes[p.symbol] = { text: p.text, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() }
    }
    store.set('notes', notes)
    return notes[p.symbol] ?? null
  })
  handle('notes:delete', (payload) => {
    const p = symbolSchema.parse(payload)
    const notes = allNotes()
    delete notes[p.symbol]
    store.set('notes', notes)
    return true
  })

  // --- app settings ---
  const settingsSchema = z.object({
    trayMinimize: z.boolean().default(false),
    launchAtStartup: z.boolean().default(false),
    defaultWorkspace: z.string().max(24).nullable().default(null),
    optEnabled: z.boolean().default(false),
    /** operator contact for the SEC EDGAR User-Agent — empty = EDGAR disabled */
    edgarContact: z.string().trim().max(120).default('')
  })
  const linuxAutostartPath = (): string => path.join(homedir(), '.config', 'autostart', 'openterminal.desktop')
  const realAutoLaunchState = (): boolean => {
    if (process.platform === 'linux') return existsSync(linuxAutostartPath())
    return app.getLoginItemSettings().openAtLogin
  }
  const applyAutoLaunch = (enabled: boolean): void => {
    if (!app.isPackaged) {
      console.log('[settings] auto-launch not applied in dev (would register the electron binary)')
      return
    }
    if (process.platform === 'linux') {
      const file = linuxAutostartPath()
      if (enabled) {
        // AppImage: process.execPath points inside the transient mount — the
        // stable path is the APPIMAGE env var. deb installs use execPath directly.
        const exec = process.env.APPIMAGE ?? process.execPath
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(
          file,
          `[Desktop Entry]\nType=Application\nName=OpenTerminal\nExec="${exec}" --hidden\nX-GNOME-Autostart-enabled=true\n`,
          'utf8'
        )
      } else if (existsSync(file)) {
        unlinkSync(file)
      }
    } else {
      app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
    }
  }
  handle('settings:get', () => {
    const s = settingsSchema.parse((store.get('appSettings') as object | undefined) ?? {})
    // The toggle must reflect the real OS registration, not just the stored preference.
    return { ...s, launchAtStartup: app.isPackaged ? realAutoLaunchState() : s.launchAtStartup }
  })
  handle('settings:set', (payload) => {
    const p = settingsSchema.parse(payload)
    const prev = settingsSchema.parse((store.get('appSettings') as object | undefined) ?? {})
    store.set('appSettings', p)
    if (p.launchAtStartup !== prev.launchAtStartup) applyAutoLaunch(p.launchAtStartup)
    return p
  })
  handle('logs:open', async () => {
    const { shell } = await import('electron')
    const { logger } = await import('./logger')
    await shell.openPath(logger.logsDir())
    return true
  })
  handle('diagnostics:export', async (payload) => {
    const p = z.object({ includeTickers: z.boolean().default(true) }).parse(payload)
    const { logger } = await import('./logger')
    const { map, active } = migrateWorkspaces()
    const workspaceShape = Object.fromEntries(
      Object.entries(map).map(([name, ws]) => [
        name,
        ws.panels.map((panel) => (p.includeTickers ? `${panel.fn}:${panel.ticker ?? '-'}` : panel.fn))
      ])
    )
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      app: { name: 'OpenTerminal', version: app.getVersion() },
      system: { platform: process.platform, arch: process.arch, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
      // Provider status only — NEVER key material.
      providers: keys.status().map((s) => ({ provider: s.provider, configured: s.configured, encrypted: s.encrypted, fromEnv: s.fromEnv })),
      rateLimits: rateLimits(),
      caches: { disk: [...diskCacheStats(), { name: 'candles-cache', entries: candles.diskCount() }] },
      activeWorkspace: active,
      workspaces: workspaceShape,
      lastLogLines: logger.lastLines(200)
    }
    return exportSvc.exportJson(getWindow(), 'openterminal-diagnostics.json', diagnostics)
  })
  handle('settings:cache-stats', () => ({
    disk: [...diskCacheStats(), { name: 'candles-cache', entries: candles.diskCount() }],
    note: 'memory TTL caches cleared alongside disk on Clear caches'
  }))
  handle('settings:clear-caches', () => {
    const cleared = clearAllTtlCaches() + clearAllDiskCaches() + candles.clearCaches()
    console.log(`[settings] cleared ${cleared} cached entries (memory + disk)`)
    return { cleared }
  })

  // --- named workspaces (autosaved current + WS switch/save/delete/list) ---
  type WorkspaceMap = Record<string, WorkspaceSnapshot>
  const migrateWorkspaces = (): { map: WorkspaceMap; active: string } => {
    let map = store.get('workspaces') as WorkspaceMap | undefined
    let active = (store.get('activeWorkspace') as string | undefined) ?? 'MAIN'
    if (!map) {
      const legacy = store.get('workspace') as WorkspaceSnapshot | undefined
      map = legacy ? { MAIN: legacy } : {}
      active = 'MAIN'
      store.set('workspaces', map)
      store.set('activeWorkspace', active)
    }
    return { map, active }
  }
  const wsNameSchema = z.string().trim().min(1).max(24).toUpperCase()
  let appliedDefaultWorkspace = false
  let restoredPopouts = false
  handle('workspace:load', () => {
    const { map, active } = migrateWorkspaces()
    let name = active
    // Honor the default-workspace setting once per app run.
    if (!appliedDefaultWorkspace) {
      appliedDefaultWorkspace = true
      const settings = settingsSchema.parse((store.get('appSettings') as object | undefined) ?? {})
      if (settings.defaultWorkspace && map[settings.defaultWorkspace]) {
        name = settings.defaultWorkspace
        store.set('activeWorkspace', name)
      }
    }
    // Restore saved pop-outs once per app run (not on renderer reloads).
    if (!restoredPopouts) {
      restoredPopouts = true
      const saved = map[name]?.popouts ?? []
      if (saved.length > 0) popouts.restore(saved)
    }
    return { active: name, names: Object.keys(map), snapshot: map[name] ?? null }
  })
  handle('workspace:save', (payload) => {
    const snapshot = workspaceSchema.parse(payload)
    const { map, active } = migrateWorkspaces()
    // Pop-out geometry lives main-side; fold it into the stored snapshot.
    snapshot.popouts = popouts.snapshot()
    map[active] = snapshot
    store.set('workspaces', map)
    return true
  })
  handle('workspace:switch', (payload) => {
    const p = z.object({ name: wsNameSchema }).parse(payload)
    const { map } = migrateWorkspaces()
    store.set('activeWorkspace', p.name)
    popouts.closeAll()
    if (!map[p.name]) {
      // New workspace: it gets created when the renderer autosaves into it.
      return { active: p.name, names: [...Object.keys(map), p.name], snapshot: null, created: true }
    }
    popouts.restore(map[p.name].popouts ?? [])
    return { active: p.name, names: Object.keys(map), snapshot: map[p.name], created: false }
  })
  handle('workspace:export', () => {
    const { map, active } = migrateWorkspaces()
    return exportSvc.exportJson(getWindow(), 'openterminal-workspaces.json', {
      app: 'openterminal',
      kind: 'workspaces',
      schemaVersion: 1,
      active,
      workspaces: map
    })
  })
  handle('workspace:import', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Import workspaces from JSON',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { imported: false }
    const fileSchema = z.object({
      app: z.literal('openterminal'),
      kind: z.literal('workspaces'),
      schemaVersion: z.literal(1),
      workspaces: z.record(wsNameSchema, workspaceSchema)
    })
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(result.filePaths[0], 'utf8'))
    } catch {
      dialog.showErrorBox('Workspace import failed', 'Not valid JSON.')
      return { imported: false, error: 'Not valid JSON.' }
    }
    const check = fileSchema.safeParse(parsed)
    if (!check.success) {
      const error = 'File does not match the OpenTerminal workspace schema (v1). First problem: ' + (check.error.issues[0]?.message ?? 'unknown')
      dialog.showErrorBox('Workspace import failed', error)
      return { imported: false, error }
    }
    const { map } = migrateWorkspaces()
    // Imported names that collide get an -IMP suffix rather than overwriting.
    let count = 0
    for (const [name, snapshot] of Object.entries(check.data.workspaces)) {
      const target = map[name] ? `${name.slice(0, 19)}-IMP` : name
      map[target] = snapshot
      count++
    }
    store.set('workspaces', map)
    return { imported: true, count }
  })
  handle('workspace:delete', (payload) => {
    const p = z.object({ name: wsNameSchema }).parse(payload)
    const { map, active } = migrateWorkspaces()
    delete map[p.name]
    store.set('workspaces', map)
    let nextActive = active
    if (active === p.name) {
      nextActive = Object.keys(map)[0] ?? 'MAIN'
      store.set('activeWorkspace', nextActive)
    }
    return { active: nextActive, names: Object.keys(map) }
  })
  handle('workspace:list', () => {
    const { map, active } = migrateWorkspaces()
    return { active, names: Object.keys(map) }
  })

  handle('app:version', () => app.getVersion())

  return { stream }
}
