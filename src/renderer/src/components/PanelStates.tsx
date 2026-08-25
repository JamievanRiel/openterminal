import { useWorkspace } from '../state/workspace'

/**
 * Standard non-data panel states. Every Phase 2 panel renders these for its
 * loading / error / rate-limited / no-key cases so the terminal feels uniform.
 */

export function LoadingState({ label }: { label: string }): JSX.Element {
  return <div className="p-4 font-mono text-[11px] uppercase text-term-dim">Loading {label}…</div>
}

export function ErrorState({ error, cachedAt }: { error: Error; cachedAt?: number }): JSX.Element {
  const applyCommand = useWorkspace((s) => s.applyCommand)
  if (error.name === 'NO_KEY') {
    return (
      <div className="p-4 font-mono text-[11px]">
        <div className="uppercase text-term-amber">API key required</div>
        <div className="mt-1 text-term-dim">{error.message}</div>
        <button
          className="mt-2 border border-term-border px-3 py-1 uppercase text-term-amber hover:bg-[#1a1a1a]"
          onClick={() => applyCommand('SET', null, false)}
        >
          Open SET →
        </button>
      </div>
    )
  }
  if (error.name === 'RATE_LIMITED') {
    return (
      <div className="p-4 font-mono text-[11px]">
        <div className="uppercase text-term-amber">Rate limited</div>
        <div className="mt-1 text-term-dim">{error.message}</div>
        {cachedAt !== undefined && (
          <div className="mt-1 uppercase text-term-dim">
            Showing cache from {new Date(cachedAt).toLocaleTimeString('en-GB', { hour12: false })}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="p-4 font-mono text-[11px]">
      <div className="uppercase text-term-down">Data unavailable</div>
      <div className="mt-1 text-term-dim">{error.message}</div>
    </div>
  )
}
