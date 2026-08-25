import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS } from '../shared/channels'

const invokeAllowed = new Set<string>(INVOKE_CHANNELS)
const sendAllowed = new Set<string>(SEND_CHANNELS)
const eventAllowed = new Set<string>(EVENT_CHANNELS)

const api = {
  /** 'darwin' | 'win32' | 'linux' — for platform-branched UI (title bar, shortcuts). */
  platform: process.platform,
  invoke: (channel: string, payload?: unknown): Promise<unknown> => {
    if (!invokeAllowed.has(channel)) {
      return Promise.resolve({ ok: false, code: 'FORBIDDEN', message: 'Channel not allowed: ' + channel })
    }
    return ipcRenderer.invoke(channel, payload)
  },
  send: (channel: string): void => {
    if (sendAllowed.has(channel)) ipcRenderer.send(channel)
  },
  /** Subscribe to a whitelisted main→renderer push channel. Returns an unsubscribe fn. */
  on: (channel: string, listener: (payload: unknown) => void): (() => void) => {
    if (!eventAllowed.has(channel)) return () => undefined
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('terminal', api)
