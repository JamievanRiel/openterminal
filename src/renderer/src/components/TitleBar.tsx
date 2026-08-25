export default function TitleBar(): JSX.Element {
  return (
    <div className="drag-region flex h-8 shrink-0 items-center justify-between border-b border-term-border bg-term-panel px-3">
      <div className="font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-term-amber">
        OpenTerminal
      </div>
      <div className="no-drag flex items-center">
        <button
          className="px-3 py-1 font-mono text-[12px] text-term-dim hover:bg-[#1a1a1a] hover:text-term-text"
          onClick={() => window.terminal.send('win:minimize')}
          title="Minimize"
        >
          –
        </button>
        <button
          className="px-3 py-1 font-mono text-[12px] text-term-dim hover:bg-[#1a1a1a] hover:text-term-text"
          onClick={() => window.terminal.send('win:toggle-maximize')}
          title="Maximize"
        >
          □
        </button>
        <button
          className="px-3 py-1 font-mono text-[12px] text-term-dim hover:bg-term-down hover:text-white"
          onClick={() => window.terminal.send('win:close')}
          title="Close"
        >
          ×
        </button>
      </div>
    </div>
  )
}
