/**
 * Symbol-format mapping between the display symbols used everywhere in the app
 * ('AAPL', 'BTC-USD', 'EUR/USD') and the formats each provider expects.
 * Keep ALL cross-provider symbol translation in this one module.
 */

export type SymbolClass = 'equity' | 'crypto' | 'fx'

/** display symbol → Finnhub WebSocket subscription symbol */
const CRYPTO_STREAM: Record<string, string> = {
  'BTC-USD': 'BINANCE:BTCUSDT',
  'ETH-USD': 'BINANCE:ETHUSDT',
  'SOL-USD': 'BINANCE:SOLUSDT',
  'DOGE-USD': 'BINANCE:DOGEUSDT'
}

/** display symbol → Finnhub WebSocket forex symbol (free tier usually rejects these; REST fallback applies) */
const FX_STREAM: Record<string, string> = {
  'EUR/USD': 'OANDA:EUR_USD',
  'GBP/USD': 'OANDA:GBP_USD',
  'USD/JPY': 'OANDA:USD_JPY'
}

/** display symbol → Twelve Data REST symbol */
const TWELVEDATA_MAP: Record<string, string> = {
  'BTC-USD': 'BTC/USD',
  'ETH-USD': 'ETH/USD',
  'SOL-USD': 'SOL/USD',
  'DOGE-USD': 'DOGE/USD',
  'EUR/USD': 'EUR/USD',
  'GBP/USD': 'GBP/USD',
  'USD/JPY': 'USD/JPY'
}

const STREAM_TO_DISPLAY: Record<string, string> = {}
for (const [display, stream] of Object.entries({ ...CRYPTO_STREAM, ...FX_STREAM })) {
  STREAM_TO_DISPLAY[stream] = display
}

export function classify(display: string): SymbolClass {
  if (display.includes('/')) return 'fx'
  if (display in CRYPTO_STREAM || display.startsWith('BINANCE:')) return 'crypto'
  return 'equity'
}

/** Finnhub WS subscription symbol for a display symbol. */
export function toStreamSymbol(display: string): string {
  return CRYPTO_STREAM[display] ?? FX_STREAM[display] ?? display
}

/** Reverse of toStreamSymbol — display symbol for a symbol arriving on the WS. */
export function fromStreamSymbol(stream: string): string {
  return STREAM_TO_DISPLAY[stream] ?? stream
}

/** Twelve Data REST symbol for a display symbol (identity for plain equities). */
export function toTwelveDataSymbol(display: string): string {
  return TWELVEDATA_MAP[display] ?? display
}

/** True when the display symbol is quoted via Twelve Data REST instead of Finnhub /quote. */
export function isTwelveDataQuoted(display: string): boolean {
  return classify(display) !== 'equity'
}
