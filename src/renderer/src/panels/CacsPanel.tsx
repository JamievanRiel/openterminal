import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { FilingsResult } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { ErrorState, LoadingState } from '../components/PanelStates'

type Filter = 'all' | 'annual' | 'quarterly' | 'current' | 'ownership'
const FILTERS: Array<[Filter, string, (form: string) => boolean]> = [
  ['all', 'ALL', () => true],
  ['annual', 'ANNUAL', (f) => ['10-K', '10-K/A', '20-F', '20-F/A', '40-F'].includes(f)],
  ['quarterly', 'QUARTERLY', (f) => ['10-Q', '10-Q/A', '6-K'].includes(f)],
  ['current', 'CURRENT', (f) => f.startsWith('8-K') || f === 'DEF 14A' || f === 'DEFA14A'],
  ['ownership', 'OWNERSHIP', (f) => ['3', '4', '5', 'SC 13D', 'SC 13G', '13F-HR'].some((x) => f === x || f.startsWith(x + '/'))]
]

export default function CacsPanel({ ticker }: { ticker: string }): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')

  const filings = useQuery({
    queryKey: ['filings', ticker],
    queryFn: () => invoke<FilingsResult>('filings:get', { symbol: ticker }),
    staleTime: 6 * 3600_000,
    retry: 0
  })

  if (filings.isLoading) return <LoadingState label={`${ticker} SEC filings`} />
  if (filings.isError) return <ErrorState error={filings.error as Error} />

  const data = filings.data as FilingsResult
  if (data.cik === null || data.filings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 font-mono text-[11px] uppercase">
        <div className="text-[14px] font-bold text-term-amber">{ticker} — CACS</div>
        <div className="text-term-dim">No SEC filings found for this ticker.</div>
      </div>
    )
  }

  const match = FILTERS.find(([key]) => key === filter)?.[2] ?? ((): boolean => true)
  const rows = data.filings.filter((f) => match(f.form))

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-term-border px-2 py-1">
        <span className="mr-2 text-[11px] font-bold text-term-amber">{ticker} — SEC FILINGS</span>
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={
              'border px-2 py-0.5 text-[9px] uppercase ' +
              (filter === key ? 'border-term-amber text-term-amber' : 'border-term-border text-term-dim hover:text-term-text')
            }
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[9px] uppercase text-term-dim">CIK {data.cik} · EDGAR</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 border-b border-term-border bg-term-panel text-[9px] uppercase text-term-dim">
              <th className="py-1 pl-2 text-left">Form</th>
              <th className="px-2 text-left">Filed</th>
              <th className="px-2 text-left">Period</th>
              <th className="px-2 text-left">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr
                key={f.url + i}
                className="cursor-pointer border-b border-term-border hover:bg-[#121212]"
                onClick={() => window.open(f.url)}
                title="Open on sec.gov"
              >
                <td className="py-1 pl-2 font-bold text-term-amber">{f.form}</td>
                <td className="px-2 text-term-text">{f.filingDate}</td>
                <td className="px-2 text-term-dim">{f.reportDate ?? '—'}</td>
                <td className="max-w-[280px] truncate px-2 text-term-dim">{f.description}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center uppercase text-term-dim">
                  No {filter} filings in the recent set.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
