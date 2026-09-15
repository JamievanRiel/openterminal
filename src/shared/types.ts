export type ProviderId = 'finnhub' | 'twelvedata' | 'fmp' | 'fred' | 'alpaca' | 'marketaux' | 'coingecko' | 'polygon'

export interface SymbolHit {
  symbol: string
  description: string
  type: string
}

export interface Quote {
  symbol: string
  current: number
  change: number
  percentChange: number
  high: number
  low: number
  open: number
  prevClose: number
  timestamp: number
  stale: boolean
  volume?: number
  bid?: number
  ask?: number
  bidSize?: number
  askSize?: number
  source?: 'finnhub' | 'alpaca' | 'twelvedata'
}

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'paused' | 'off'

/** One coalesced tick delivered in a stream:ticks batch. Symbols are display symbols. */
export interface StreamTick {
  symbol: string
  price: number
  /** Cumulative traded volume observed since this batch window opened. */
  volume: number
  dir: -1 | 0 | 1
  ts: number
  delayed?: boolean
}

export interface RateLimitInfo {
  provider: 'finnhub' | 'twelvedata' | 'fmp'
  remaining: number
  capacity: number
}

export interface Watchlist {
  id: string
  name: string
  symbols: string[]
}

export interface Mover {
  symbol: string
  name: string
  last: number
  change: number
  percentChange: number
  volume: number | null
}

export interface MoversResult {
  items: Mover[]
  asOf: number
  fromCache: boolean
}

export interface IntlIndexQuote {
  symbol: string
  last: number
  change: number
  percentChange: number
  timestamp: number
  stale: boolean
}

export interface Metric52w {
  high52: number
  low52: number
}

// ------------------------------------------------------------------ charting

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '1D' | '1W' | '1M'
export type ChartRange = '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX'

export interface Candle {
  /** UTC epoch seconds */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface CandleResponse {
  symbol: string
  interval: CandleInterval
  candles: Candle[]
  source: 'twelvedata' | 'alpaca'
  delayed: boolean
  fetchedAt: number
  /** true when served from the persisted disk cache instead of a live fetch */
  fromDiskCache: boolean
}

export interface EarningsEvent {
  /** yyyy-mm-dd (report date) */
  date: string
  epsActual: number | null
  epsEstimate: number | null
}

export type ChartSeriesType = 'candles' | 'line' | 'area'

// ------------------------------------------------------------------ research

export interface NewsItem {
  id: string
  source: string
  headline: string
  summary: string
  url: string
  tickers: string[]
  /** unix ms */
  datetime: number
  /** provider-supplied sentiment score (−1..1) — null/undefined when unavailable */
  sentiment?: number | null
}

export interface NewsPage {
  items: NewsItem[]
  provider: 'finnhub' | 'marketaux'
  fetchedAt: number
}

export interface StatementRow {
  key: string
  label: string
  /** aligned with StatementTable.periods (oldest → newest) */
  values: Array<number | null>
  indent: number
  emphasis: boolean
  /** render as percentage instead of currency */
  percent?: boolean
}

export interface StatementTable {
  /** period labels oldest → newest (render newest on the right) */
  periods: string[]
  rows: StatementRow[]
}

export interface Fundamentals {
  symbol: string
  period: 'annual' | 'quarter'
  overview: Array<{ label: string; value: number | null; percent?: boolean; ratio?: boolean }>
  income: StatementTable
  balance: StatementTable
  cashflow: StatementTable
  ratios: StatementTable
  growth: StatementTable
  fetchedAt: number
  fromCache: boolean
}

export interface PeerMetricsRow {
  symbol: string
  pe: number | null
  evEbitda: number | null
  grossMargin: number | null
  operatingMargin: number | null
  netMargin: number | null
  revenueGrowth: number | null
}

export interface EarningsSurprise {
  period: string
  actual: number | null
  estimate: number | null
  surprisePct: number | null
  revenueActual: number | null
  revenueEstimate: number | null
}

export interface EarningsFull {
  nextDate: string | null
  nextEpsEstimate: number | null
  nextRevenueEstimate: number | null
  surprises: EarningsSurprise[]
  fetchedAt: number
}

export interface DividendPayment {
  exDate: string
  paymentDate: string | null
  amount: number
}

export interface DividendData {
  symbol: string
  payments: DividendPayment[]
  fetchedAt: number
  fromCache: boolean
}

export interface Filing {
  form: string
  filingDate: string
  reportDate: string | null
  description: string
  url: string
}

export interface FilingsResult {
  symbol: string
  cik: string | null
  filings: Filing[]
  fetchedAt: number
}

export interface EconomicEvent {
  title: string
  country: string // 'US', 'EU', 'GB', 'JP', or raw currency code ('CAD', …)
  impact: 'high' | 'medium' | 'low'
  actual: string // '' when not yet released
  forecast: string
  previous: string
  time: number | null // epoch ms; null when unparseable
}

export interface CalendarResult {
  events: EconomicEvent[]
  fetchedAt: number
}

export interface InsiderFiling {
  ticker: string | null // '(TSLA)'-style match in the issuer title, when present
  company: string | null // from the '(Issuer)' Atom entry of the filing pair
  filer: string // from the '(Reporting)' entry
  form: string // '4' or '4/A'
  filedAt: number // epoch ms
  url: string
}

export interface InsiderResult {
  filings: InsiderFiling[]
  fetchedAt: number
}

export interface WireItem {
  title: string
  summary: string // HTML-stripped, capped
  url: string
  source: string
  category: string // 'markets' | 'crypto'
  sentiment: number | null // lexicon score −1..1; null when no lexicon hit
  published: number // epoch ms
}

export interface WireResult {
  items: WireItem[]
  sentiment: { bullish: number; bearish: number; score: number }
  fetchedAt: number
}

export interface MoonInfo {
  phase: string // one of the 8 phase names
  illumination: number // 0..1
  nextFull: number // epoch ms
  nextNew: number // epoch ms
}

export interface IssPosition {
  lat: number
  lon: number
  altitudeKm: number
  velocityKmh: number
  visibility: string // 'daylight' | 'eclipsed'
}

export interface SpaceLaunch {
  name: string
  provider: string
  pad: string
  net: number | null // launch time, epoch ms
  status: string // e.g. 'Go', 'TBD'
}

/** Parts are independent: a failed fetch nulls its slot, moon always computes. */
export interface SpaceResult {
  iss: IssPosition | null
  kp: number | null
  moon: MoonInfo
  launches: SpaceLaunch[]
  fetchedAt: number
}

export interface Flight {
  icao24: string
  callsign: string
  country: string
  lat: number
  lon: number
  altitudeM: number | null
  velocityMs: number | null
  heading: number
  onGround: boolean
  jet: boolean // business-jet callsign heuristic
}

export interface FlightsResult {
  flights: Flight[] // capped in main; jets first, then fastest
  total: number // uncapped count in the bbox
  fetchedAt: number
}

export interface OptionFlowContract {
  contract: string // OCC contract symbol
  type: 'call' | 'put'
  strike: number
  last: number
  volume: number
  openInterest: number
  impliedVol: number // fraction, e.g. 0.34 = 34%
  unusual: boolean // volume cleared both the OI ratio and the absolute floor
}

/** Nearest-expiry flow snapshot: totals span the full chain, contracts are the top slice. */
export interface OptionsFlowResult {
  symbol: string
  expiry: string // YYYY-MM-DD (UTC)
  spot: number | null
  putCallRatio: number | null // null when no call volume traded
  totalCallVolume: number
  totalPutVolume: number
  contracts: OptionFlowContract[]
  fetchedAt: number
}

/** Full Finnhub basic-financials metric record (FA fallback mode). */
export type MetricRecord = Record<string, number | string | null>

// ------------------------------------------------------------ analysis/tools

export interface ScreenerFilters {
  sector: string | null
  exchange: string | null
  marketCapMin: number | null
  marketCapMax: number | null
  priceMin: number | null
  priceMax: number | null
  volumeMin: number | null
  dividendMin: number | null
  limit: number
}

export interface ScreenerRow {
  symbol: string
  name: string
  sector: string
  marketCap: number | null
  price: number | null
  dividendYield: number | null
  volume: number | null
  exchange: string
}

export interface ScreenerResult {
  rows: ScreenerRow[]
  fetchedAt: number
  fromCache: boolean
}

export interface SavedScreen {
  name: string
  filters: ScreenerFilters
}

export type PortfolioCurrency = 'USD' | 'EUR'

export interface Position {
  symbol: string
  qty: number
  avgCost: number
  currency: PortfolioCurrency
  /** yyyy-mm-dd */
  openedAt: string
}

export interface Portfolio {
  id: string
  name: string
  displayCurrency: PortfolioCurrency
  cash: number
  positions: Position[]
}

export type AlertCondition = 'above' | 'below' | 'move'

export type AlertSound = 'default' | 'urgent' | 'none'

export interface AlertRule {
  id: string
  symbol: string
  /** above/below: price level · move: abs %change today threshold */
  condition: AlertCondition
  value: number
  repeating: boolean
  enabled: boolean
  /** per-rule sound (Phase 6) — absent in pre-1.0 stores, treated as 'default' */
  sound?: AlertSound
  createdAt: number
  lastFiredAt: number | null
  /** one-shot rules flip this permanently */
  fired: boolean
}

export interface AlertLogEntry {
  id: string
  ruleId: string
  symbol: string
  message: string
  at: number
}

export interface AlertsState {
  rules: AlertRule[]
  log: AlertLogEntry[]
  unseen: number
}

// ------------------------------------------------------------------- macro

export interface FredObservation {
  /** yyyy-mm-dd */
  date: string
  /** null where FRED reports "." (holidays/gaps) */
  value: number | null
}

export interface FredSeries {
  id: string
  observations: FredObservation[]
  fetchedAt: number
  fromCache: boolean
}

export interface EcoRelease {
  /** yyyy-mm-dd */
  date: string
  name: string
}

export interface EarningsCalItem {
  symbol: string
  date: string
  epsEstimate: number | null
}

// ------------------------------------------------------------------ crypto

export interface CryptoMarketRow {
  id: string
  rank: number
  name: string
  symbol: string
  price: number
  change24hPct: number | null
  change7dPct: number | null
  marketCap: number | null
  volume24h: number | null
  sparkline7d: number[]
}

export interface CryptoMarkets {
  rows: CryptoMarketRow[]
  fetchedAt: number
  fromCache: boolean
}

export interface CryptoDetail {
  id: string
  name: string
  symbol: string
  rank: number | null
  ath: number | null
  athChangePct: number | null
  circulatingSupply: number | null
  totalSupply: number | null
  marketCap: number | null
  /** [unix ms, price] pairs for the requested range */
  prices: Array<[number, number]>
  fetchedAt: number
}

// ---------------------------------------------------------------------- fx

export interface FxPairQuote {
  pair: string
  quote: Quote | null
  /** last successful fetch (0 = never) */
  asOf: number
}

export interface ChartSettings {
  seriesType: ChartSeriesType
  interval: CandleInterval
  range: ChartRange
  indicators: string[]
  compare: string | null
}

export interface CompanyProfile {
  symbol: string
  name: string
  exchange: string
  industry: string
  marketCap: number
  sharesOutstanding: number
  logo: string
  weburl: string
  country: string
  currency: string
  ipo: string
}

export interface KeyStatus {
  provider: ProviderId
  configured: boolean
  encrypted: boolean
  fromEnv: boolean
}

export interface PanelState {
  id: number
  fn: string
  ticker: string | null
  /** per-panel chart configuration (GP/GIP), persisted with the workspace */
  chart?: ChartSettings
}

export interface PopoutBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PopoutState {
  panel: PanelState
  bounds?: PopoutBounds
}

export interface WorkspaceSnapshot {
  layout: number
  panels: PanelState[]
  activePanel: number
  /** panels living in their own frameless windows (multi-monitor) */
  popouts?: PopoutState[]
}

export type UpdateStatus =
  | { state: 'disabled' | 'idle' | 'checking' }
  | { state: 'available'; version: string; notes: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }

export interface OptionsExpiration {
  date: string
  contractCount: number
}

export interface OptionSide {
  bid: number | null
  ask: number | null
  last: number | null
  volume: number | null
  openInterest: number | null
  iv: number | null
  delta: number | null
  occSymbol: string
}

export interface OptionChainRow {
  strike: number
  call: OptionSide | null
  put: OptionSide | null
}

export interface OptionChain {
  symbol: string
  expiration: string
  rows: OptionChainRow[]
  delayed: boolean
  hasGreeks: boolean
  fetchedAt: number
}

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; code: string; message: string; retryAfterMs?: number }
export type IpcResult<T> = IpcOk<T> | IpcErr
