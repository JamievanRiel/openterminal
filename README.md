# OpenTerminal

A keyboard-first, multi-panel, Bloomberg-style market terminal as a native desktop app — Electron + React + TypeScript, built entirely on free-tier market data APIs.

![OpenTerminal — live quote monitor and watchlist](docs/screenshots/terminal.png)
![Charting with indicators and fundamentals](docs/screenshots/charting.png)

## Install

Download the installer for your system from the **[latest release](https://github.com/JamievanRiel/openterminal/releases/latest)** — no Node, no build step.

| System | File | First launch |
|---|---|---|
| Windows 10/11 | `OpenTerminal-<version>-win-x64.exe` | Installs for your user only, no admin needed. SmartScreen warns because the build is unsigned: **More info → Run anyway**. |
| macOS (Apple Silicon) | `OpenTerminal-<version>-mac-arm64.dmg` | Drag the app into Applications. macOS blocks the first open of an unsigned app: go to **System Settings → Privacy & Security → Open Anyway** (on macOS 14 and older: right-click the app → **Open**). If it says the app "is damaged", run `xattr -cr /Applications/OpenTerminal.app` once. |
| Linux (x64) | `OpenTerminal-<version>-linux-x86_64.AppImage` or `OpenTerminal-<version>-linux-amd64.deb` | AppImage: `chmod +x` the file, then run it. Debian/Ubuntu: `sudo apt install ./OpenTerminal-<version>-linux-amd64.deb`. |

Intel Macs and other systems: see [Building from source](#building-from-source).

## First steps

1. **Start the app.** It asks for a Finnhub API key — you can paste one or skip; it won't ask again after you skip.
2. **Try it without any key.** These work straight away (in `HELP` they carry a green **NO KEY** tag, and the welcome screen opens them with one click):

   | Type | You get |
   |---|---|
   | `WIRE` | Market news wire with a bull/bear sentiment meter |
   | `ECAL` | This week's economic calendar (CPI, jobs report, Fed…) |
   | `SOCL` | Hot posts from the big investing subreddits |
   | `CRYP` | Top-100 crypto dashboard |
   | `FLOW` | Options flow — `AAPL FLOW`, or `FLOW` alone for SPY |
   | `SPACE` · `FLT` | ISS and launches · live US air traffic |

3. **Add a free Finnhub key for live stocks.** Register at [finnhub.io](https://finnhub.io), copy the key from your dashboard, type `SET` and paste it in the **Keys** tab. Now try `AAPL QM` (live quote), `AAPL DES` (company profile) and `TOP` (market news). Charts (`GP`) additionally need a free Twelve Data key — see [API keys](#api-keys).
4. **Get around.** A command is *ticker + function*: `MSFT FA`, `TSLA GP`. Press `/` or `Ctrl+K` to type, `Shift+Enter` to open in a new panel, `Tab` or `Ctrl+1..6` to move between panels, `Ctrl+Shift+P` to pop a panel out to its own window. `HELP` lists every function; click one to try it.

## Features

- **Live market data** — Finnhub WebSocket relay (reference-counted, timer-coalesced batches, auto-reconnect with backoff), live ticker tape, quote monitor (`QM`), watchlists (`W`), world indices (`WEI`), movers (`MOST`)
- **Charting** (`GP`/`GIP`) — candles/line/area, 1D→MAX ranges, volume, SMA/EMA/Bollinger/VWAP overlays, synced RSI & MACD sub-panes, compare mode, live last-candle updates, earnings markers, per-panel persisted settings
- **Research** — company/market news with 60 s polling (`N`/`TOP`), full financial statements + ratios + peers (`FA`), earnings surprises (`ERN`), dividends (`DVD`), SEC EDGAR filings (`CACS`), historical price table (`HP`), economic calendar with impact/country filters (`ECAL`, keyless), live SEC Form 4 insider stream (`INSD`), keyless RSS news wire with lexicon sentiment and bull/bear meter (`WIRE`), Reddit hot-post stream with the same sentiment lexicon (`SOCL`, keyless)
- **Analysis & tools** — screener with saved screens (`EQS`), portfolios with live P&L and vs-SPY (`PORT`), alerts that fire natively while minimized to tray (`ALRT`), FRED macro dashboard (`ECO`), yield curve (`GC`), sector heatmap (`HMAP`), FX & crypto dashboards (`FX`/`CRYP`), per-ticker notes (`MSG`), options chain (`OPT`, feature-flagged, Polygon), nearest-expiry options flow with unusual-volume detection (`FLOW`, keyless)
- **World monitoring** — space dashboard with live ISS position on a built-in dark SVG world map, geomagnetic Kp, moon phase and upcoming launches (`SPACE`, keyless), live US airspace with business jets highlighted via OpenSky (`FLT`, keyless)
- **Workstation** — pop-out panels for multi-monitor (streaming and link groups span windows), named workspaces (`WS <name>`), universal CSV/JSON exports, panel PNG snapshots, per-rule alert sounds, auto-launch, tray mode

## API keys

All free tiers, all optional, added any time in `SET` → Keys. Start with Finnhub (live quotes and news); add Twelve Data for charts, FMP for fundamentals and the screener, FRED for macro. Keys are validated with a test call and stored encrypted via the OS keychain (`safeStorage`) — on Linux without gnome-keyring/kwallet you are warned and must explicitly accept plaintext.

| Provider | Used for | Register |
|---|---|---|
| Finnhub (recommended) | streaming, quotes, profiles, news, earnings | finnhub.io |
| Twelve Data | candles, international indices, FX | twelvedata.com |
| FMP | statements, screener, movers | financialmodelingprep.com |
| FRED | macro dashboard, yield curve | fred.stlouisfed.org |
| Alpaca (optional) | quote fallback, bid/ask, extended-hours bars — paste as `KEY_ID:SECRET` | alpaca.markets |
| Marketaux (optional) | news fallback with sentiment | marketaux.com |
| CoinGecko (optional) | crypto (works keyless; demo key raises limits) | coingecko.com |
| Polygon (optional) | `OPT` options chain (paid options plan) | polygon.io |

SEC data (`INSD`, `CACS`) needs no key, but EDGAR asks for a contact e-mail: set yours in `SET` → Providers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ MAIN (Node)                                                 │
│  keys.ts          safeStorage-encrypted API keys            │
│  providers/       Finnhub · TwelveData · FMP · FRED ·       │
│                   Alpaca · Marketaux · CoinGecko · Polygon  │
│                   → ProviderRouter, token buckets,          │
│                     TTL + disk caches                       │
│  stream/          WS relay: refcounted subs per window,     │
│                   150ms coalesced batches, backoff+jitter   │
│  alerts.ts        AlertEngine (fires from tray)             │
│  candles.ts       priority queue + disk cache               │
│  popouts.ts       pop-out windows (geometry in workspaces)  │
│  exportService.ts CSV(BOM)/JSON via native dialogs          │
│  updater.ts       electron-updater (disabled unsigned)      │
│  ipc.ts           zod-validated handlers, whitelisted       │
└──────────┬──────────────────────────────┬───────────────────┘
      contextBridge                  contextBridge
┌──────────┴───────────┐   ┌──────────────┴──────────────────┐
│ MAIN WINDOW          │   │ POP-OUTS (?popout=1)            │
│ tape · command line  │   │ same bundle + preload, one      │
│ panel grid · status  │   │ fixed panel, follows link group │
└──────────────────────┘   └─────────────────────────────────┘
```

The renderer makes **zero** third-party network requests; API keys never leave the main process. A symbol watched in five panels across two windows costs one upstream subscription.

## Building from source

Needs Node 20+ and git.

```bash
git clone https://github.com/JamievanRiel/openterminal.git
cd openterminal
npm install
npm run dev        # opens the app with hot reload
```

For development you can copy `.env.example` to `.env` — guarded by `!app.isPackaged`, packaged builds never read it.

```bash
npm run typecheck   # strict TS across main/preload/renderer
npm test            # indicator math (vitest)
npm run build       # production bundles
npm run dist        # installer for the CURRENT OS (NSIS / dmg / AppImage+deb)
```

Cross-OS builds should be done on their own OS (or CI matrix) — electron-builder cross-compilation is unreliable. Icons are generated from code: `node scripts/generate-icon.js`; alert sounds likewise: `node scripts/generate-sounds.js` (pure sine-wave beeps synthesized by the script — public domain, no third-party samples).

### Unsigned-build caveats

Releases are built without code signing, so every OS warns on first launch — the per-OS steps are in [Install](#install).

Auto-update is **disabled** in unsigned builds (and in dev) by design — meaningful auto-update requires Windows Authenticode / macOS notarization. Distributions without signing must ship with the updater disabled (the default; see `src/main/updater.ts`).

### Troubleshooting & diagnostics (v1.0.1)

- Logs rotate in `userData/logs` (5 × 2 MB, secrets redacted) — SET → About → "Open logs folder".
- SET → About → "Export diagnostics" produces the JSON to attach to a bug report (versions, provider status, bucket/cache stats, last 200 log lines — never API keys; tickers optional).
- Corrupt settings files are backed up as `<name>.corrupt-<timestamp>.json` and recreated automatically.
- CI (GitHub Actions) runs typecheck + the test suite on every push; on `v*` tags it builds unsigned Windows/macOS/Linux installers and publishes them as a GitHub Release (notes from `docs/RELEASE-<version>.md`).

### Security notes

- Renderer: `contextIsolation` + `sandbox`, whitelisted IPC only, CSP in `index.html`, no Node access.
- `npm audit`: zero criticals. Accepted (build/dev-time only, not shipped in the app): Electron ≤40 advisory chain (fixing requires a major-version jump; mitigated by sandbox/CSP/no remote content), `esbuild` dev-server advisory (vite 5 toolchain, dev only), `extract-zip` in electron download tooling (build machine only).

## Data attribution & disclaimer

Market data by **Finnhub**, **Twelve Data**, **Financial Modeling Prep**, **Alpaca**, **Marketaux** and **Polygon** under their respective terms. Crypto data by **CoinGecko** (coingecko.com). Macro data from **FRED®**, Federal Reserve Bank of St. Louis — this product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis. SEC filings from **EDGAR** (sec.gov); EDGAR requests carry an operator-contact User-Agent — set YOUR e-mail in SET → Providers (CACS stays politely disabled until you do).

**Disclaimer**: market data may be delayed or incomplete. OpenTerminal is for personal and educational use; nothing in it is investment advice.

## License

MIT — see [LICENSE](LICENSE). See [CHANGELOG.md](CHANGELOG.md) for the phase-by-phase history and [ROADMAP.md](ROADMAP.md) for parked ideas.
