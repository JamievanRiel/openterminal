import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { DividendData, Quote } from '../../../shared/types'
import { invoke, type IpcError } from '../lib/ipc'
import { useLiveTick } from '../lib/live'
import { formatFinancialNumber } from '../lib/format'
import { ErrorState, LoadingState } from '../components/PanelStates'

function inferFrequency(payments: DividendData['payments']): string {
  if (payments.length < 3) return '—'
  const recent = payments.slice(0, 6)
  const gaps: number[] = []
  for (let i = 0; i < recent.length - 1; i++) {
    gaps.push((Date.parse(recent[i].exDate) - Date.parse(recent[i + 1].exDate)) / 86_400_000)
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (avg < 45) return 'MONTHLY'
  if (avg < 135) return 'QUARTERLY'
  if (avg < 270) return 'SEMI-ANNUAL'
  return 'ANNUAL'
}

export default function DvdPanel({ ticker }: { ticker: string }): JSX.Element {
  const dvd = useQuery({
    queryKey: ['dividends', ticker],
    queryFn: () => invoke<DividendData>('dividends:get', { symbol: ticker }),
    staleTime: 24 * 3600_000,
    retry: 0
  })
  const quote = useQuery({
    queryKey: ['quote', ticker],
    queryFn: () => invoke<Quote>('quote:get', { symbol: ticker }),
    staleTime: 60_000,
    retry: 0
  })
  const live = useLiveTick(ticker)

  const derived = useMemo(() => {
    const payments = dvd.data?.payments ?? []
    const yearAgo = new Date(Date.now() - 366 * 86_400_000).toISOString().slice(0, 10)
    const ttm = payments.filter((p) => p.exDate >= yearAgo).reduce((sum, p) => sum + p.amount, 0)

    // Annual totals + YoY cuts, oldest → newest.
    const byYear = new Map<string, number>()
    for (const p of payments) {
      const y = p.exDate.slice(0, 4)
      byYear.set(y, (byYear.get(y) ?? 0) + p.amount)
    }
    const years = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const currentYear = String(new Date().getFullYear())
    const completeYears = years.filter(([y]) => y !== currentYear)

    let consecutive = 0
    for (let i = completeYears.length - 1; i >= 0; i--) {
      if (completeYears[i][1] > 0) consecutive++
      else break
    }
    const cutYears = new Set<string>()
    for (let i = 1; i < completeYears.length; i++) {
      if (completeYears[i][1] < completeYears[i - 1][1] * 0.999) cutYears.add(completeYears[i][0])
    }
    return { ttm, years, cutYears, consecutive }
  }, [dvd.data])

  if (dvd.isLoading) return <LoadingState label={`${ticker} dividends`} />
  if (dvd.isError) {
    const err = dvd.error as IpcError
    if (err.name === 'UNSUPPORTED') {
      // Endpoint blocked ≠ non-payer: don't claim "no dividends" when the plan lacks the data.
      return (
        <div className="p-4 font-mono text-[11px] uppercase text-term-dim">
          {ticker} — dividend history unavailable on the current FMP plan.
        </div>
      )
    }
    return <ErrorState error={err} />
  }

  const data = dvd.data as DividendData
  if (data.payments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 font-mono text-[11px] uppercase">
        <div className="text-[14px] font-bold text-term-amber">{ticker} — DVD</div>
        <div className="text-term-dim">No dividend history — this ticker doesn&apos;t pay one.</div>
      </div>
    )
  }

  const last = live?.price ?? quote.data?.current
  const trailingYield = last && last > 0 ? derived.ttm / last : null
  const maxAnnual = Math.max(...derived.years.map(([, v]) => v), 0.0001)

  return (
    <div className="h-full overflow-y-auto p-3 font-mono">
      <div className="text-[14px] font-bold text-term-amber">{ticker} — DIVIDENDS</div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['TTM / share', formatFinancialNumber(derived.ttm, { style: 'ratio' })],
          ['Trailing yield', trailingYield === null ? '—' : (trailingYield * 100).toFixed(2) + '%'],
          ['Frequency', inferFrequency(data.payments)],
          ['Consecutive years', String(derived.consecutive)]
        ].map(([label, value]) => (
          <div key={label} className="border border-term-border bg-term-bg p-2">
            <div className="text-[9px] uppercase text-term-dim">{label}</div>
            <div className="mt-0.5 text-[14px] font-bold text-term-text">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] uppercase tracking-widest text-term-dim">Annual dividend / share</div>
      <div className="mt-1 flex h-20 items-end gap-1">
        {derived.years.slice(-15).map(([year, total]) => (
          <div key={year} className="flex flex-1 flex-col items-center gap-0.5" title={`${year}: ${total.toFixed(2)}`}>
            <div
              className={'w-full ' + (derived.cutYears.has(year) ? 'bg-term-down' : 'bg-term-up')}
              style={{ height: `${Math.max(3, (total / maxAnnual) * 64)}px`, opacity: 0.75 }}
            />
            <span className="text-[8px] text-term-dim">{year.slice(2)}</span>
          </div>
        ))}
      </div>
      {derived.cutYears.size > 0 && (
        <div className="mt-1 text-[9px] uppercase text-term-down">Red bars = YoY dividend cut</div>
      )}

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="border-b border-term-border text-[9px] uppercase text-term-dim">
            <th className="py-1 pl-2 text-left">Ex-date</th>
            <th className="px-2 text-left">Payment date</th>
            <th className="px-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.payments.slice(0, 40).map((p) => (
            <tr key={p.exDate + p.amount} className="border-b border-term-border">
              <td className="py-1 pl-2 text-term-text">{p.exDate}</td>
              <td className="px-2 text-term-dim">{p.paymentDate ?? '—'}</td>
              <td className="px-2 text-right text-term-text">{p.amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.fromCache && <div className="mt-2 text-[9px] uppercase text-term-amber">CACHED</div>}
    </div>
  )
}
