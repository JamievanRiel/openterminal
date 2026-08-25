/** Platform helpers for renderer UI branching. */

export const IS_MAC = window.terminal.platform === 'darwin'

/** Cmd on macOS, Ctrl elsewhere — use for every keyboard shortcut check. */
export function isMod(event: KeyboardEvent | React.KeyboardEvent): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey
}
