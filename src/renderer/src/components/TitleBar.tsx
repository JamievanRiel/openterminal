import { IS_MAC } from '../lib/platform'

/**
 * Frameless title bar. On macOS the native traffic lights are shown by the
 * window's `titleBarStyle: 'hiddenInset'`, so we render no custom controls and
 * pad the brand text past the lights. Windows/Linux get custom min/max/close.
 */
export default function TitleBar(): JSX.Element {
  return (
    <div className="drag-region flex h-8 shrink-0 items-center justify-between border-b border-term-border bg-term-panel px-3">
      <div
        className="font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-term-amber"
        style={IS_MAC ? { paddingLeft: 64 } : undefined}
      >
        OpenTerminal
      </div>
      {!IS_MAC && (
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
      )}
    </div>
  )
}
