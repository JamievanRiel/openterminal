import type { DividendData, Fundamentals, StatementRow, StatementTable } from '../shared/types'
import { DiskCache } from './diskcache'
import type { FmpProvider } from './providers/fmp'
import { ProviderError } from './providers/util'

type Raw = Record<string, unknown>

interface RowDef {
  label: string
  keys: string[]
  indent?: number
  emphasis?: boolean
  percent?: boolean
}

const INCOME_ROWS: RowDef[] = [
  { label: 'Revenue', keys: ['revenue'], emphasis: true },
  { label: 'Cost of revenue', keys: ['costOfRevenue'], indent: 1 },
  { label: 'Gross profit', keys: ['grossProfit'], emphasis: true },
  { label: 'R&D expenses', keys: ['researchAndDevelopmentExpenses'], indent: 1 },
  { label: 'SG&A expenses', keys: ['sellingGeneralAndAdministrativeExpenses'], indent: 1 },
  { label: 'Operating expenses', keys: ['operatingExpenses'], indent: 1 },
  { label: 'Operating income', keys: ['operatingIncome'], emphasis: true },
  { label: 'Pre-tax income', keys: ['incomeBeforeTax'], indent: 1 },
  { label: 'Income tax', keys: ['incomeTaxExpense'], indent: 1 },
  { label: 'Net income', keys: ['netIncome'], emphasis: true },
  { label: 'EBITDA', keys: ['ebitda'] },
  { label: 'EPS (diluted)', keys: ['epsdiluted', 'epsDiluted'] }
]

const BALANCE_ROWS: RowDef[] = [
  { label: 'Cash & equivalents', keys: ['cashAndCashEquivalents'], indent: 1 },
  { label: 'Short-term investments', keys: ['shortTermInvestments'], indent: 1 },
  { label: 'Receivables', keys: ['netReceivables'], indent: 1 },
  { label: 'Inventory', keys: ['inventory'], indent: 1 },
  { label: 'Total current assets', keys: ['totalCurrentAssets'], emphasis: true },
  { label: 'PP&E (net)', keys: ['propertyPlantEquipmentNet'], indent: 1 },
  { label: 'Goodwill', keys: ['goodwill'], indent: 1 },
  { label: 'Total assets', keys: ['totalAssets'], emphasis: true },
  { label: 'Accounts payable', keys: ['accountPayables'], indent: 1 },
  { label: 'Short-term debt', keys: ['shortTermDebt'], indent: 1 },
  { label: 'Total current liabilities', keys: ['totalCurrentLiabilities'], emphasis: true },
  { label: 'Long-term debt', keys: ['longTermDebt'], indent: 1 },
  { label: 'Total liabilities', keys: ['totalLiabilities'], emphasis: true },
  { label: 'Shareholders equity', keys: ['totalStockholdersEquity'], emphasis: true }
]

const CASHFLOW_ROWS: RowDef[] = [
  { label: 'Net income', keys: ['netIncome'], indent: 1 },
  { label: 'D&A', keys: ['depreciationAndAmortization'], indent: 1 },
  { label: 'Stock-based comp', keys: ['stockBasedCompensation'], indent: 1 },
  { label: 'Working-capital change', keys: ['changeInWorkingCapital'], indent: 1 },
  { label: 'Operating cash flow', keys: ['netCashProvidedByOperatingActivities', 'operatingCashFlow'], emphasis: true },
  { label: 'CapEx', keys: ['investmentsInPropertyPlantAndEquipment', 'capitalExpenditure'], indent: 1 },
  { label: 'Investing cash flow', keys: ['netCashUsedForInvestingActivites', 'netCashProvidedByInvestingActivities'], emphasis: true },
  { label: 'Dividends paid', keys: ['dividendsPaid', 'netDividendsPaid'], indent: 1 },
  { label: 'Buybacks', keys: ['commonStockRepurchased'], indent: 1 },
  { label: 'Financing cash flow', keys: ['netCashUsedProvidedByFinancingActivities', 'netCashProvidedByFinancingActivities'], emphasis: true },
  { label: 'Free cash flow', keys: ['freeCashFlow'], emphasis: true }
]

const RATIO_ROWS: RowDef[] = [
  { label: 'Gross margin', keys: ['grossProfitMargin'], percent: true },
  { label: 'Operating margin', keys: ['operatingProfitMargin'], percent: true },
  { label: 'Net margin', keys: ['netProfitMargin'], percent: true },
  { label: 'ROE', keys: ['returnOnEquity'], percent: true },
  { label: 'ROA', keys: ['returnOnAssets'], percent: true },
  { label: 'Current ratio', keys: ['currentRatio'] },
  { label: 'Quick ratio', keys: ['quickRatio'] },
  { label: 'Debt / equity', keys: ['debtEquityRatio', 'debtToEquityRatio'] },
  { label: 'P/E', keys: ['priceEarningsRatio', 'priceToEarningsRatio'] },
  { label: 'P/S', keys: ['priceToSalesRatio'] },
  { label: 'P/B', keys: ['priceToBookRatio', 'priceBookValueRatio'] },
  { label: 'EV/EBITDA', keys: ['enterpriseValueMultiple'] },
  { label: 'Dividend yield', keys: ['dividendYield'], percent: true },
  { label: 'Payout ratio', keys: ['payoutRatio'], percent: true }
]

const GROWTH_ROWS: RowDef[] = [
  { label: 'Revenue growth', keys: ['revenueGrowth'], percent: true },
  { label: 'Gross profit growth', keys: ['grossProfitGrowth'], percent: true },
  { label: 'Operating income growth', keys: ['operatingIncomeGrowth'], percent: true },
  { label: 'Net income growth', keys: ['netIncomeGrowth'], percent: true },
  { label: 'EPS growth', keys: ['epsgrowth', 'epsGrowth', 'growthEPS'], percent: true },
  { label: 'FCF growth', keys: ['freeCashFlowGrowth', 'growthFreeCashFlow'], percent: true }
]

function num(row: Raw, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

function periodLabel(row: Raw, period: 'annual' | 'quarter'): string {
  const date = typeof row.date === 'string' ? row.date : ''
  const year = typeof row.calendarYear === 'string' || typeof row.calendarYear === 'number' ? String(row.calendarYear) : date.slice(0, 4)
  if (period === 'annual') return year || '—'
  const q = typeof row.period === 'string' && row.period.startsWith('Q') ? row.period : ''
  return q ? `${q} ${year}` : date.slice(0, 7)
}

/** rows arrive newest-first from FMP; produce oldest→newest tables. */
function buildTable(raw: Raw[], defs: RowDef[], period: 'annual' | 'quarter'): StatementTable {
  const ordered = [...raw].reverse()
  const periods = ordered.map((r) => periodLabel(r, period))
  const rows: StatementRow[] = defs
    .map((def) => ({
      key: def.keys[0],
      label: def.label,
      values: ordered.map((r) => num(r, def.keys)),
      indent: def.indent ?? 0,
      emphasis: def.emphasis ?? false,
      percent: def.percent
    }))
    .filter((r) => r.values.some((v) => v !== null))
  return { periods, rows }
}

export class FundamentalsService {
  private cache = new DiskCache<Fundamentals>('fundamentals-cache', 24 * 3600_000, 40)
  private dividendCache = new DiskCache<DividendData>('dividends-cache', 24 * 3600_000, 60)

  constructor(private fmp: FmpProvider) {}

  /** 5 FMP calls per (symbol, period) on a cold cache; zero within 24h. */
  async getStatements(symbol: string, period: 'annual' | 'quarter'): Promise<Fundamentals> {
    const key = `${symbol}:${period}`
    const cached = this.cache.get(key)
    if (cached && !cached.stale) return { ...cached.value, fromCache: true }

    const limit = period === 'annual' ? 5 : 8
    try {
      console.log(`[fmp] fetching statements for ${symbol} (${period})`)
      const [income, balance, cashflow, ratios, growth] = await Promise.all([
        this.fmp.getStatement('income-statement', symbol, period, limit),
        this.fmp.getStatement('balance-sheet-statement', symbol, period, limit),
        this.fmp.getStatement('cash-flow-statement', symbol, period, limit),
        this.fmp.getStatement('ratios', symbol, period, limit),
        this.fmp.getStatement('financial-growth', symbol, period, limit)
      ])
      if (income.length === 0) throw new ProviderError('UNSUPPORTED', 'FMP has no statements for ' + symbol)

      const latestRatios = ratios[0] ?? {}
      const pToFcf = num(latestRatios, ['priceToFreeCashFlowsRatio', 'priceToFreeCashFlowRatio'])
      const overview: Fundamentals['overview'] = [
        { label: 'P/E', value: num(latestRatios, ['priceEarningsRatio', 'priceToEarningsRatio']), ratio: true },
        { label: 'P/S', value: num(latestRatios, ['priceToSalesRatio']), ratio: true },
        { label: 'P/B', value: num(latestRatios, ['priceToBookRatio', 'priceBookValueRatio']), ratio: true },
        { label: 'EV/EBITDA', value: num(latestRatios, ['enterpriseValueMultiple']), ratio: true },
        { label: 'Gross margin', value: num(latestRatios, ['grossProfitMargin']), percent: true },
        { label: 'Operating margin', value: num(latestRatios, ['operatingProfitMargin']), percent: true },
        { label: 'Net margin', value: num(latestRatios, ['netProfitMargin']), percent: true },
        { label: 'ROE', value: num(latestRatios, ['returnOnEquity']), percent: true },
        { label: 'ROA', value: num(latestRatios, ['returnOnAssets']), percent: true },
        { label: 'Debt / equity', value: num(latestRatios, ['debtEquityRatio', 'debtToEquityRatio']), ratio: true },
        { label: 'Current ratio', value: num(latestRatios, ['currentRatio']), ratio: true },
        { label: 'FCF yield', value: pToFcf && pToFcf !== 0 ? 1 / pToFcf : null, percent: true }
      ]

      const result: Fundamentals = {
        symbol,
        period,
        overview,
        income: buildTable(income, INCOME_ROWS, period),
        balance: buildTable(balance, BALANCE_ROWS, period),
        cashflow: buildTable(cashflow, CASHFLOW_ROWS, period),
        ratios: buildTable(ratios, RATIO_ROWS, period),
        growth: buildTable(growth, GROWTH_ROWS, period),
        fetchedAt: Date.now(),
        fromCache: false
      }
      this.cache.set(key, result)
      return result
    } catch (err) {
      // Any-age disk copy beats a dead panel.
      if (cached) return { ...cached.value, fromCache: true }
      throw err
    }
  }

  async getDividends(symbol: string): Promise<DividendData> {
    const cached = this.dividendCache.get(symbol)
    if (cached && !cached.stale) return { ...cached.value, fromCache: true }
    try {
      const raw = await this.fmp.getDividendsRaw(symbol)
      const payments = raw
        .map((r) => ({
          exDate: typeof r.date === 'string' ? r.date : '',
          paymentDate: typeof r.paymentDate === 'string' && r.paymentDate ? r.paymentDate : null,
          amount: num(r, ['adjDividend', 'dividend']) ?? 0
        }))
        .filter((p) => p.exDate && p.amount > 0)
        .sort((a, b) => b.exDate.localeCompare(a.exDate))
      const result: DividendData = { symbol, payments, fetchedAt: Date.now(), fromCache: false }
      this.dividendCache.set(symbol, result)
      return result
    } catch (err) {
      console.error(`[fmp] dividends fetch failed for ${symbol}:`, err instanceof Error ? `${err.name}: ${err.message}` : err)
      if (cached) return { ...cached.value, fromCache: true }
      throw err
    }
  }
}
