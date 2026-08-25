import { useEffect, useRef, useState } from 'react'
import { isMod } from '../lib/platform'
import type { SymbolHit } from '../../../shared/types'
import { invoke } from '../lib/ipc'
import { closestFunctions, FUNCTIONS, parseCommand } from '../lib/functions'
import { useWorkspace } from '../state/workspace'

export default function CommandLine(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [hint, setHint] = useState('Type a command — e.g. AAPL DES, TSLA Q, HELP. Focus with / or Ctrl+K.')
  const [hits, setHits] = useState<SymbolHit[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const applyCommand = useWorkspace((s) => s.applyCommand)
  const workspaceNames = useWorkspace((s) => s.workspaceNames)
  const workspaceName = useWorkspace((s) => s.workspaceName)
  const switchWorkspace = useWorkspace((s) => s.switchWorkspace)
  const saveWorkspaceAs = useWorkspace((s) => s.saveWorkspaceAs)
  const deleteWorkspace = useWorkspace((s) => s.deleteWorkspace)
  const [wsPicker, setWsPicker] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      if ((event.key === '/' && !typing) || (isMod(event) && event.key.toLowerCase() === 'k')) {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    // HELP inserts function codes into the command line via this event.
    const onInsert = (event: Event): void => {
      const text = (event as CustomEvent<string>).detail
      setValue(text)
      inputRef.current?.focus()
    }
    window.addEventListener('ot:insert-command', onInsert)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('ot:insert-command', onInsert)
    }
  }, [])

  useEffect(() => {
    const raw = value.trim()
    if (raw.length < 2 || raw.includes(' ')) {
      setHits([])
      return
    }
    const id = window.setTimeout(() => {
      invoke<SymbolHit[]>('search:symbols', { query: raw })
        .then((results) => setHits(results.slice(0, 6)))
        .catch(() => setHits([]))
    }, 350)
    return () => window.clearTimeout(id)
  }, [value])

  const execute = (raw: string, newPanel: boolean): void => {
    // WS is a workspace verb, not a panel: WS <name> | WS SAVE <name> | WS DELETE <name> | WS LIST
    const wsParts = raw.trim().toUpperCase().split(/\s+/)
    if (wsParts[0] === 'WS') {
      const done = (): void => {
        setValue('')
        setHits([])
      }
      if (wsParts.length === 1 || wsParts[1] === 'LIST') {
        setWsPicker(true)
        done()
        return
      }
      if (wsParts[1] === 'SAVE' && wsParts[2]) {
        void saveWorkspaceAs(wsParts[2]).then(() => setHint(`Workspace saved as ${wsParts[2]}.`))
        done()
        return
      }
      if (wsParts[1] === 'DELETE' && wsParts[2]) {
        if (window.confirm(`Delete workspace "${wsParts[2]}"?`)) {
          void deleteWorkspace(wsParts[2]).then(() => setHint(`Workspace ${wsParts[2]} deleted.`))
        }
        done()
        return
      }
      const target = wsParts[1]
      if (!workspaceNames.includes(target) && !window.confirm(`Workspace "${target}" doesn't exist — create it from the current layout?`)) {
        done()
        return
      }
      void switchWorkspace(target).then((outcome) =>
        setHint(outcome === 'created' ? `Workspace ${target} created.` : `Switched to workspace ${target}.`)
      )
      done()
      return
    }

    const cmd = parseCommand(raw)
    if (!cmd.fn) return
    const def = FUNCTIONS[cmd.fn]
    if (!def) {
      setHint(`Unknown function ${cmd.fn}. Did you mean: ${closestFunctions(cmd.fn).join(', ')}?`)
      return
    }
    if (def.needsTicker && !cmd.ticker) {
      setHint(`${def.code} needs a ticker — e.g. AAPL ${def.code}`)
      return
    }
    applyCommand(def.code, cmd.ticker, newPanel)
    setHistory((prev) => [raw, ...prev.filter((h) => h !== raw)].slice(0, 50))
    setHistoryIndex(-1)
    setValue('')
    setHits([])
    setHint(def.implemented ? `${def.code} — ${def.name}` : `${def.code} is planned for Phase ${def.phase}.`)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      execute(value, event.shiftKey)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      if (history[next]) {
        setHistoryIndex(next)
        setValue(history[next])
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = historyIndex - 1
      setHistoryIndex(next)
      setValue(next >= 0 ? history[next] : '')
    } else if (event.key === 'Escape') {
      setHits([])
      inputRef.current?.blur()
    }
  }

  return (
    <div className="relative shrink-0 border-b border-term-border bg-term-panel">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono text-[13px] font-bold text-term-amber">&gt;</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className="w-full bg-transparent font-mono text-[13px] uppercase tracking-wider text-term-amber placeholder-term-dim outline-none"
          placeholder="TICKER FUNCTION"
        />
        <span className="whitespace-nowrap font-mono text-[10px] uppercase text-term-dim">
          Enter: run · Shift+Enter: new panel
        </span>
      </div>
      <div className="border-t border-term-border px-3 py-0.5 font-mono text-[10px] uppercase tracking-wide text-term-dim">
        {hint}
      </div>
      {wsPicker && (
        <div className="absolute left-0 right-0 top-full z-50 border border-term-border bg-term-panel p-2">
          <div className="font-mono text-[10px] uppercase text-term-dim">Workspaces — click to switch</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {workspaceNames.map((name) => (
              <button
                key={name}
                className={
                  'border px-2 py-0.5 font-mono text-[10px] uppercase ' +
                  (name === workspaceName ? 'border-term-amber text-term-amber' : 'border-term-border text-term-text hover:border-term-amber')
                }
                onClick={() => {
                  setWsPicker(false)
                  if (name !== workspaceName) void switchWorkspace(name)
                }}
              >
                {name}
              </button>
            ))}
            <button className="border border-term-border px-2 py-0.5 font-mono text-[10px] uppercase text-term-dim hover:text-term-down" onClick={() => setWsPicker(false)}>
              close
            </button>
          </div>
        </div>
      )}
      {hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 border border-term-border bg-term-panel">
          {hits.map((hit) => (
            <button
              key={hit.symbol}
              className="flex w-full items-center justify-between px-3 py-1 text-left font-mono text-[11px] hover:bg-[#1a1a1a]"
              onClick={() => execute(hit.symbol + ' DES', false)}
            >
              <span className="text-term-amber">{hit.symbol}</span>
              <span className="mx-3 flex-1 truncate text-term-text">{hit.description}</span>
              <span className="text-term-dim">{hit.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
