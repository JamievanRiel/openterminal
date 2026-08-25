import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { invoke } from '../lib/ipc'
import { fmtRelativeTime } from '../lib/format'
import { useWorkspace } from '../state/workspace'

interface NoteMeta {
  symbol: string
  updatedAt: number
  preview: string
}

interface Note {
  text: string
  createdAt: number
  updatedAt: number
}

export default function MsgPanel({ ticker }: { ticker: string }): JSX.Element {
  const queryClient = useQueryClient()
  const loadTicker = useWorkspace((s) => s.loadTicker)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const saveTimer = useRef<number>()
  const loadedFor = useRef<string | null>(null)

  const list = useQuery({
    queryKey: ['notes-list'],
    queryFn: () => invoke<NoteMeta[]>('notes:list'),
    staleTime: 10_000
  })
  const note = useQuery({
    queryKey: ['note', ticker],
    queryFn: () => invoke<Note | null>('notes:get', { symbol: ticker })
  })

  // Load the editor when the ticker (or its stored note) arrives; don't clobber typing.
  useEffect(() => {
    if (note.isSuccess && loadedFor.current !== ticker) {
      loadedFor.current = ticker
      setText(note.data?.text ?? '')
      setSavedAt(null)
    }
  }, [note.isSuccess, note.data, ticker])

  const scheduleSave = (next: string): void => {
    setText(next)
    window.clearTimeout(saveTimer.current)
    // Autosave 1s after typing stops.
    saveTimer.current = window.setTimeout(() => {
      void invoke<Note | null>('notes:save', { symbol: ticker, text: next }).then(() => {
        setSavedAt(Date.now())
        void queryClient.invalidateQueries({ queryKey: ['notes-list'] })
        void queryClient.invalidateQueries({ queryKey: ['note', ticker] })
      })
    }, 1000)
  }

  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  const entries = (list.data ?? []).filter((n) => n.symbol.includes(search.toUpperCase()))

  return (
    <div className="flex h-full font-mono">
      <div className="flex w-44 shrink-0 flex-col border-r border-term-border">
        <div className="shrink-0 border-b border-term-border p-1.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="FILTER…"
            spellCheck={false}
            className="w-full border border-term-border bg-term-bg px-1 py-0.5 text-[10px] uppercase text-term-text placeholder-term-dim outline-none focus:border-term-amber"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.map((n) => (
            <button
              key={n.symbol}
              className={
                'block w-full border-b border-term-border px-2 py-1.5 text-left hover:bg-[#121212] ' +
                (n.symbol === ticker ? 'bg-[#181206]' : '')
              }
              onClick={() => loadTicker(n.symbol)}
              title={n.preview}
            >
              <div className="flex justify-between text-[10px]">
                <span className="font-bold text-term-amber">{n.symbol}</span>
                <span className="text-term-dim">{fmtRelativeTime(n.updatedAt)}</span>
              </div>
              <div className="truncate text-[9px] text-term-dim">{n.preview || '—'}</div>
            </button>
          ))}
          {entries.length === 0 && <div className="p-2 text-[9px] uppercase text-term-dim">No notes yet.</div>}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-term-border px-2 py-1">
          <span className="text-[11px] font-bold text-term-amber">{ticker} — NOTES</span>
          <span className="ml-auto text-[8px] uppercase text-term-dim">
            {savedAt ? `saved ${fmtRelativeTime(savedAt)}` : 'autosaves 1s after typing stops'}
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => scheduleSave(e.target.value)}
          spellCheck={false}
          placeholder={`Notes for ${ticker}…`}
          className="min-h-0 flex-1 resize-none bg-term-bg p-2 font-mono text-[12px] leading-relaxed text-term-text placeholder-term-dim outline-none"
        />
      </div>
    </div>
  )
}
