/**
 * THE single source of truth for terminal functions. The command-line parser,
 * autocomplete, and HELP all read this registry — content can never drift.
 */

export type FnCategory = 'Market Data' | 'Charts' | 'Research' | 'Analysis' | 'Tools'

export interface FnEntry {
  code: string
  name: string
  description: string
  category: FnCategory
  needsTicker: boolean
  implemented: boolean
  phase: number
  example: string
}

const e = (
  code: string,
  name: string,
  description: string,
  category: FnCategory,
  needsTicker: boolean,
  implemented: boolean,
  phase: number,
  example: string
): FnEntry => ({ code, name, description, category, needsTicker, implemented, phase, example })

export const FUNCTION_REGISTRY: FnEntry[] = [
  // Market Data
  e('QM', 'Quote monitor', 'Live quote with ranges, volume and last trade', 'Market Data', true, true, 1, 'AAPL QM'),
  e('Q', 'Quote monitor', 'Alias of QM', 'Market Data', true, true, 1, 'TSLA Q'),
  e('DES', 'Security description', 'Company profile, peers and key facts', 'Market Data', true, true, 1, 'AAPL DES'),
  e('W', 'Watchlist manager', 'Named lists, live rows, CSV export', 'Market Data', false, true, 2, 'W'),
  e('WEI', 'World equity indices', 'US proxies live + international indices delayed', 'Market Data', false, true, 2, 'WEI'),
  e('MOST', 'Movers', 'Top gainers, losers and most active', 'Market Data', false, true, 2, 'MOST'),
  // Charts
  e('GP', 'Price chart', 'Full charting: ranges, indicators, compare', 'Charts', true, true, 3, 'AAPL GP'),
  e('GIP', 'Intraday chart', "Today's 1-min bars with VWAP and sessions", 'Charts', true, true, 3, 'NVDA GIP'),
  // Research
  e('N', 'Company news', 'Live headlines for the loaded ticker', 'Research', true, true, 4, 'AAPL N'),
  e('TOP', 'Market news', 'Market-wide headlines', 'Research', false, true, 4, 'TOP'),
  e('FA', 'Financial analysis', 'Statements, ratios, growth, peers', 'Research', true, true, 4, 'MSFT FA'),
  e('ERN', 'Earnings', 'Next date, estimates and surprise history', 'Research', true, true, 4, 'AAPL ERN'),
  e('DVD', 'Dividends', 'Payment history, yield and cut flags', 'Research', true, true, 4, 'KO DVD'),
  e('CACS', 'SEC filings', 'EDGAR filings with form-type filters', 'Research', true, true, 4, 'AAPL CACS'),
  e('HP', 'Historical prices', 'OHLCV table with CSV export', 'Research', true, true, 4, 'AAPL HP'),
  e('ECAL', 'Economic calendar', "This week's macro events with impact and country filters", 'Research', false, true, 4, 'ECAL'),
  e('INSD', 'Insider filings', 'Live SEC Form 4 stream (EDGAR latest filings)', 'Research', false, true, 4, 'INSD'),
  e('WIRE', 'News wire', 'Keyless RSS wire with lexicon sentiment and bull/bear meter', 'Research', false, true, 4, 'WIRE'),
  // Analysis
  e('EQS', 'Equity screener', 'FMP screen + client-side refinement; EQS <name> runs a saved screen', 'Analysis', false, true, 5, 'EQS BIGTECH'),
  e('PORT', 'Portfolio & P&L', 'Positions, live P&L, allocation, vs SPY', 'Analysis', false, true, 5, 'PORT'),
  e('ALRT', 'Alert manager', 'Price/move alerts that fire while minimized', 'Analysis', false, true, 5, 'ALRT'),
  e('ECO', 'Macro dashboard', 'FRED stat cards + release/earnings week', 'Analysis', false, true, 5, 'ECO'),
  e('GC', 'Yield curve', 'US Treasury curve: latest vs 1M vs 1Y ago', 'Analysis', false, true, 5, 'GC'),
  e('HMAP', 'Sector heatmap', 'Live sector treemap with drill-down', 'Analysis', false, true, 5, 'HMAP'),
  e('FX', 'Currency dashboard', 'Major pairs grid; FX EURUSD opens the chart', 'Analysis', false, true, 5, 'FX EURUSD'),
  e('CRYP', 'Crypto dashboard', 'CoinGecko top 100 with live BTC/ETH', 'Analysis', false, true, 5, 'CRYP'),
  e('OPT', 'Options chain', 'Calls/puts by expiration (needs Polygon key + flag)', 'Analysis', true, true, 6, 'AAPL OPT'),
  // Tools
  e('MSG', 'Notes', 'Per-ticker scratchpad, autosaved', 'Tools', true, true, 5, 'AAPL MSG'),
  e('SET', 'Settings', 'API keys, providers, behavior, appearance', 'Tools', false, true, 1, 'SET'),
  e('HELP', 'Function reference', 'This reference', 'Tools', false, true, 1, 'HELP'),
  e('WS', 'Workspaces', 'WS <name> switch · WS SAVE/DELETE <name> · WS LIST', 'Tools', false, true, 5, 'WS TRADING')
]

export const GLOBAL_SHORTCUTS: Array<[string, string]> = [
  ['/ or Ctrl+K', 'Focus the command line'],
  ['Enter', 'Run command in the active panel'],
  ['Shift+Enter', 'Run command in a new panel'],
  ['Tab', 'Cycle active panel'],
  ['Ctrl+1…6', 'Jump to panel 1…6'],
  ['↑ / ↓', 'Command history'],
  ['Esc', 'Close suggestions / blur input']
]
