import { FUNCTIONS } from '../lib/functions'

export default function PlaceholderPanel({ fn }: { fn: string }): JSX.Element {
  const def = FUNCTIONS[fn]
  if (!def) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase text-term-dim">
        Empty panel — type a command
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 font-mono text-[11px] uppercase">
      <div className="text-[14px] font-bold text-term-amber">{def.code}</div>
      <div className="text-term-text">{def.name}</div>
      <div className="text-term-dim">Planned — build phase {def.phase}</div>
    </div>
  )
}
