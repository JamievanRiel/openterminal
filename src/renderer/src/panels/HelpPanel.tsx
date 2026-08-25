import { useState } from 'react'
import { FUNCTION_REGISTRY, GLOBAL_SHORTCUTS, type FnCategory } from '../../../shared/functionRegistry'
import { fuzzyMatch } from '../lib/functions'

const CATEGORIES: FnCategory[] = ['Market Data', 'Charts', 'Research', 'Analysis', 'Tools']

/** Put the code into the command line (CommandLine listens for this event). */
function insertCommand(text: string): void {
  window.dispatchEvent(new CustomEvent('ot:insert-command', { detail: text }))
}

export default function HelpPanel(): JSX.Element {
  const [query, setQuery] = useState('')

  const matches = (code: string, name: string, description: string): boolean => {
    const q = query.trim()
    if (!q) return true
    return fuzzyMatch(q, code) || fuzzyMatch(q, name) || description.toUpperCase().includes(q.toUpperCase())
  }

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex shrink-0 items-center gap-3 border-b border-term-border px-2 py-1.5">
        <span className="text-[11px] font-bold text-term-amber">HELP — FUNCTION REFERENCE</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH (fuzzy)…"
          spellCheck={false}
          autoFocus
          className="w-48 border border-term-border bg-term-bg px-2 py-0.5 text-[11px] uppercase text-term-amber placeholder-term-dim outline-none focus:border-term-amber"
        />
        <span className="ml-auto text-[8px] uppercase text-term-dim">click an entry → command line</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {CATEGORIES.map((cat) => {
          const entries = FUNCTION_REGISTRY.filter((f) => f.category === cat && matches(f.code, f.name, f.description))
          if (entries.length === 0) return null
          return (
            <div key={cat} className="mb-3">
              <div className="text-[10px] uppercase tracking-widest text-term-dim">{cat}</div>
              {entries.map((f) => (
                <button
                  key={f.code}
                  className="grid w-full grid-cols-[64px_180px_1fr_120px] items-baseline gap-2 border-b border-term-border px-1 py-1 text-left hover:bg-[#121212]"
                  onClick={() => insertCommand(f.example)}
                  title={`Insert "${f.example}" into the command line`}
                >
                  <span className="text-[12px] font-bold text-term-amber">{f.code}</span>
                  <span className="text-[11px] text-term-text">{f.name}</span>
                  <span className="truncate text-[10px] text-term-dim">{f.description}</span>
                  <span className="text-right text-[10px] text-term-amberDim">{f.example}</span>
                </button>
              ))}
            </div>
          )
        })}
        <div className="mb-2 mt-4 text-[10px] uppercase tracking-widest text-term-dim">Global shortcuts</div>
        {GLOBAL_SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="grid grid-cols-[140px_1fr] gap-2 border-b border-term-border px-1 py-1">
            <span className="text-[11px] text-term-amber">{keys}</span>
            <span className="text-[10px] text-term-dim">{what}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
