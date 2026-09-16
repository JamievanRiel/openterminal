import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { KEYLESS_FUNCTIONS } from '../../../shared/functionRegistry'
import { invoke } from '../lib/ipc'

interface Props {
  /** A Finnhub key was saved. */
  onDone: () => void
  /** Continue without a key, optionally straight into one of the keyless functions. */
  onSkip: (fn: string | null) => void
}

export default function FirstRunWizard({ onDone, onSkip }: Props): JSX.Element {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  const encryption = useQuery({
    queryKey: ['encryption-available'],
    queryFn: () => invoke<boolean>('keys:encryption-available')
  })

  const save = useMutation({
    mutationFn: async () => {
      const plaintext = encryption.data === false
      if (plaintext) {
        const accepted = window.confirm(
          'OS keychain encryption is unavailable (on Linux this needs gnome-keyring or kwallet). ' +
            'Your key would be stored in PLAINTEXT on disk. Continue?'
        )
        if (!accepted) throw new Error('Cancelled — key not stored.')
      }
      await invoke('keys:set', { provider: 'finnhub', key, allowPlaintext: plaintext })
      try {
        const test = await invoke<{ valid: boolean }>('keys:test', { provider: 'finnhub' })
        if (!test.valid) throw new Error('Finnhub rejected this key. Double-check it and try again.')
      } catch (err) {
        // Offline first run: the key is already stored — offer to continue unverified.
        if ((err as Error).name === 'NETWORK') {
          const keepAnyway = window.confirm(
            "Can't reach Finnhub to verify the key right now (no network?). Save it anyway and verify later in SET?"
          )
          if (!keepAnyway) throw new Error('Key saved but unverified — retry when you are online.', { cause: err })
          return
        }
        throw err
      }
    },
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message)
  })

  return (
    <div className="flex flex-1 items-center justify-center bg-term-bg">
      <div className="w-[480px] border border-term-border bg-term-panel p-6">
        <div className="font-mono text-[16px] font-bold uppercase tracking-widest text-term-amber">
          Welcome to OpenTerminal
        </div>
        <div className="mt-2 font-mono text-[11px] leading-relaxed text-term-text">
          To load market data, add your free Finnhub API key. Register at finnhub.io, copy the key, and
          paste it below. It is validated with a test call and stored{' '}
          {encryption.data === false ? 'on disk (keychain unavailable)' : 'encrypted with your OS keychain'}.
          Keys for Twelve Data, FMP and FRED can be added later in SET.
        </div>
        <input
          type="password"
          value={key}
          onChange={(event) => {
            setKey(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && key.trim().length >= 4) save.mutate()
          }}
          placeholder="FINNHUB API KEY"
          spellCheck={false}
          autoFocus
          className="mt-4 w-full border border-term-border bg-term-bg px-3 py-2 font-mono text-[12px] text-term-amber placeholder-term-dim outline-none focus:border-term-amber"
        />
        {error && <div className="mt-2 font-mono text-[10px] uppercase text-term-down">{error}</div>}
        <div className="mt-4 flex items-center justify-between">
          <button
            className="font-mono text-[10px] uppercase text-term-dim hover:text-term-text"
            onClick={() => onSkip(null)}
          >
            Skip for now
          </button>
          <button
            disabled={key.trim().length < 4 || save.isPending}
            onClick={() => save.mutate()}
            className="border border-term-amber px-4 py-1.5 font-mono text-[11px] uppercase text-term-amber hover:bg-term-amber hover:text-black disabled:opacity-40"
          >
            {save.isPending ? 'Validating…' : 'Validate & save'}
          </button>
        </div>
        <div className="mt-5 border-t border-term-border pt-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-term-dim">
            No key yet? These work without one:
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {KEYLESS_FUNCTIONS.map((f) => (
              <button
                key={f.code}
                onClick={() => onSkip(f.code)}
                title={`${f.name} — ${f.description}`}
                className="border border-term-border px-2 py-0.5 font-mono text-[11px] text-term-amber hover:border-term-amber"
              >
                {f.code}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
