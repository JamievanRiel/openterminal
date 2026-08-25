import { app, safeStorage } from 'electron'
import type ElectronStore from 'electron-store'
import type { KeyStatus, ProviderId } from '../shared/types'

const PROVIDERS: ProviderId[] = ['finnhub', 'twelvedata', 'fmp', 'fred', 'alpaca', 'marketaux', 'coingecko', 'polygon']

const ENV_MAP: Record<ProviderId, string> = {
  finnhub: 'FINNHUB_API_KEY',
  twelvedata: 'TWELVE_DATA_API_KEY',
  fmp: 'FMP_API_KEY',
  fred: 'FRED_API_KEY',
  // Alpaca needs key id + secret; stored/entered as one "KEY_ID:SECRET" string.
  alpaca: 'ALPACA_API_KEY',
  marketaux: 'MARKETAUX_API_KEY',
  coingecko: 'COINGECKO_API_KEY',
  polygon: 'POLYGON_API_KEY'
}

interface StoredKey {
  data: string
  encrypted: boolean
}

export class KeyManager {
  constructor(private store: ElectronStore<Record<string, unknown>>) {}

  encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private stored(): Record<string, StoredKey> {
    return (this.store.get('apiKeys') as Record<string, StoredKey> | undefined) ?? {}
  }

  getKey(provider: ProviderId): string | null {
    const entry = this.stored()[provider]
    if (entry) {
      if (entry.encrypted) {
        try {
          return safeStorage.decryptString(Buffer.from(entry.data, 'base64'))
        } catch {
          return null
        }
      }
      return entry.data
    }
    // Dev-only fallback to .env — never in packaged builds.
    if (!app.isPackaged) {
      const env = process.env[ENV_MAP[provider]]
      if (env && env.length > 0) return env
    }
    return null
  }

  setKey(
    provider: ProviderId,
    key: string,
    allowPlaintext: boolean
  ): { ok: boolean; encrypted: boolean; error?: string } {
    const all = this.stored()
    if (this.encryptionAvailable()) {
      all[provider] = { data: safeStorage.encryptString(key).toString('base64'), encrypted: true }
    } else if (allowPlaintext) {
      all[provider] = { data: key, encrypted: false }
    } else {
      return { ok: false, encrypted: false, error: 'ENCRYPTION_UNAVAILABLE' }
    }
    this.store.set('apiKeys', all)
    return { ok: true, encrypted: all[provider].encrypted }
  }

  status(): KeyStatus[] {
    const all = this.stored()
    return PROVIDERS.map((provider) => {
      const entry = all[provider]
      const fromEnv = !entry && !app.isPackaged && Boolean(process.env[ENV_MAP[provider]])
      return {
        provider,
        configured: Boolean(entry) || fromEnv,
        encrypted: entry?.encrypted ?? false,
        fromEnv
      }
    })
  }
}
