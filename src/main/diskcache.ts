import Store from 'electron-store'

interface Entry<T> {
  value: T
  savedAt: number
}

const diskRegistry: Array<DiskCache<unknown>> = []

/** Wipe every persisted research cache (SET → clear caches). */
export function clearAllDiskCaches(): number {
  let cleared = 0
  for (const cache of diskRegistry) cleared += cache.clear()
  return cleared
}

export function diskCacheStats(): Array<{ name: string; entries: number }> {
  return diskRegistry.map((c) => ({ name: c.name, entries: c.count() }))
}

/**
 * Persisted TTL cache (userData JSON via electron-store) shared by the
 * research providers. Expired entries stay readable as `stale` so panels can
 * degrade to cached data when a bucket is empty or the network is down.
 */
export class DiskCache<T> {
  private store: Store<{ entries: Record<string, Entry<T>> }>

  constructor(
    public readonly name: string,
    private ttlMs: number,
    private maxEntries = 60
  ) {
    this.store = new Store({ name })
    diskRegistry.push(this as DiskCache<unknown>)
  }

  count(): number {
    return Object.keys(this.entries()).length
  }

  clear(): number {
    const n = this.count()
    this.store.set('entries', {})
    return n
  }

  private entries(): Record<string, Entry<T>> {
    return this.store.get('entries') ?? {}
  }

  get(key: string): { value: T; stale: boolean; savedAt: number } | null {
    const e = this.entries()[key]
    if (!e) return null
    return { value: e.value, stale: Date.now() - e.savedAt > this.ttlMs, savedAt: e.savedAt }
  }

  set(key: string, value: T): void {
    const entries = this.entries()
    entries[key] = { value, savedAt: Date.now() }
    const keys = Object.keys(entries)
    if (keys.length > this.maxEntries) {
      keys
        .sort((a, b) => entries[a].savedAt - entries[b].savedAt)
        .slice(0, keys.length - this.maxEntries)
        .forEach((k) => delete entries[k])
    }
    this.store.set('entries', entries)
  }
}
