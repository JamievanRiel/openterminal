/**
 * Static S&P 500 sector composition for HMAP.
 * Built: 2026-08-25 from public S&P sector-weight and SPDR-holdings summaries.
 * Weights are approximate index weights (%); holdings are each sector's ~top 10
 * by weight. Update by hand when composition drifts — this file is the only
 * source, no API budget is ever spent on it.
 */

export interface SectorDef {
  etf: string
  name: string
  weight: number
  holdings: string[]
}

export const SP500_SECTORS: SectorDef[] = [
  {
    etf: 'XLK',
    name: 'Technology',
    weight: 32,
    holdings: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'CSCO', 'ACN']
  },
  {
    etf: 'XLF',
    name: 'Financials',
    weight: 13,
    holdings: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'AXP']
  },
  {
    etf: 'XLV',
    name: 'Health Care',
    weight: 11.5,
    holdings: ['LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'AMGN', 'DHR', 'PFE']
  },
  {
    etf: 'XLY',
    name: 'Consumer Discretionary',
    weight: 10.5,
    holdings: ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE', 'LOW', 'TJX', 'SBUX', 'ORLY']
  },
  {
    etf: 'XLC',
    name: 'Communication Services',
    weight: 9.5,
    holdings: ['GOOGL', 'META', 'NFLX', 'DIS', 'TMUS', 'VZ', 'T', 'CMCSA', 'CHTR', 'EA']
  },
  {
    etf: 'XLI',
    name: 'Industrials',
    weight: 8.5,
    holdings: ['GE', 'CAT', 'RTX', 'UNP', 'HON', 'BA', 'DE', 'LMT', 'UPS', 'ADP']
  },
  {
    etf: 'XLP',
    name: 'Consumer Staples',
    weight: 5.5,
    holdings: ['PG', 'COST', 'WMT', 'KO', 'PEP', 'PM', 'MDLZ', 'MO', 'CL', 'KMB']
  },
  {
    etf: 'XLE',
    name: 'Energy',
    weight: 3.5,
    holdings: ['XOM', 'CVX', 'COP', 'WMB', 'EOG', 'SLB', 'PSX', 'MPC', 'OKE', 'KMI']
  },
  {
    etf: 'XLU',
    name: 'Utilities',
    weight: 2.5,
    holdings: ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'D', 'PCG', 'EXC', 'XEL']
  },
  {
    etf: 'XLRE',
    name: 'Real Estate',
    weight: 2,
    holdings: ['PLD', 'AMT', 'EQIX', 'WELL', 'SPG', 'O', 'PSA', 'CCI', 'DLR', 'VICI']
  },
  {
    etf: 'XLB',
    name: 'Materials',
    weight: 2,
    holdings: ['LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'CTVA', 'DOW', 'DD', 'PPG']
  }
]
