import type { IpcResult } from '../../../shared/types'

export interface IpcError extends Error {
  retryAfterMs?: number
}

/** Typed IPC invoke that unwraps the Result envelope; throws a coded Error on failure. */
export async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await window.terminal.invoke(channel, payload)) as IpcResult<T>
  if (result.ok) return result.data
  const err: IpcError = new Error(result.message)
  err.name = result.code
  if (result.retryAfterMs !== undefined) err.retryAfterMs = result.retryAfterMs
  throw err
}
