/// <reference types="vite/client" />

declare module '*.wav' {
  const url: string
  export default url
}

interface TerminalApi {
  platform: string
  invoke: (channel: string, payload?: unknown) => Promise<unknown>
  send: (channel: string) => void
  on: (channel: string, listener: (payload: unknown) => void) => () => void
}

interface Window {
  terminal: TerminalApi
}
