# OpenTerminal

**A keyboard-first, multi-panel market terminal for the desktop, in the spirit of the
Bloomberg Terminal, built entirely on free market data.**

[![CI](https://github.com/JamievanRiel/openterminal/actions/workflows/ci.yml/badge.svg)](https://github.com/JamievanRiel/openterminal/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/JamievanRiel/openterminal)](https://github.com/JamievanRiel/openterminal/releases/latest)
![Windows | macOS | Linux](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

OpenTerminal is a native desktop app (Electron, React, TypeScript) with **35 terminal
functions**: live quotes, charts with indicators, fundamentals, a screener, portfolios,
alerts, macro data, options flow, news and social sentiment. You type a ticker and a
function, `AAPL GP`, and the result opens in a panel. Panels stream live, can be popped
out to other monitors and are saved in named workspaces.

It runs on free-tier APIs, and seven modules need no API key at all, so it works on a
fresh install.

![OpenTerminal: live quote monitor and watchlist](docs/screenshots/terminal.png)
![Charting with indicators next to fundamentals and a peer comparison](docs/screenshots/charting.png)

> [!NOTE]
> **Free data has limits.** Market data may be delayed or incomplete, and free tiers
> are rate-limited. The app shows that honestly (`DELAYED`, `CACHED` and rate-limit
> states) instead of hiding it. OpenTerminal is for personal and educational use;
> nothing in it is investment advice.

## Contents

- [Install](#install)
- [First steps](#first-steps)
- [Features](#features)
- [API keys](#api-keys)
- [How it is built](#how-it-is-built)
- [Security model](#security-model)
- [Tests and CI](#tests-and-ci)
- [Building from source](#building-from-source)
- [Troubleshooting](#troubleshooting)
- [Data attribution](#data-attribution)
- [Origin, security reports and license](#origin-security-reports-and-license)

## Install

Download the installer for your system from the
**[latest release](https://github.com/JamievanRiel/openterminal/releases/latest)**. No
Node, no build step.

| System | File | First launch |
|---|---|---|
| Windows 10/11 | `OpenTerminal-<version>-win-x64.exe` | Installs for your user only, no admin needed. SmartScreen warns because the build is unsigned: **More info → Run anyway**. |
| macOS (Apple Silicon) | `OpenTerminal-<version>-mac-arm64.dmg` | Drag the app into Applications. macOS blocks the first open of an unsigned app: go to **System Settings → Privacy & Security → Open Anyway** (on macOS 14 and older: right-click the app → **Open**). If it says the app "is damaged", run `xattr -cr /Applications/OpenTerminal.app` once. |
| Linux (x64) | `OpenTerminal-<version>-linux-x86_64.AppImage` or `OpenTerminal-<version>-linux-amd64.deb` | AppImage: `chmod +x` the file, then run it. Debian/Ubuntu: `sudo apt install ./OpenTerminal-<version>-linux-amd64.deb`. |

Intel Macs and other systems: see [Building from source](#building-from-source).

## First steps

1. **Start the app.** It asks for a Finnhub API key. You can paste one or skip; it won't
   ask again after you skip.
2. **Try it without any key.** These work straight away. In `HELP` they carry a green
   **NO KEY** tag, and the welcome screen opens them with one click:

   | Type | You get |
   |---|---|
   | `WIRE` | Market news wire with a bull/bear sentiment meter |
   | `ECAL` | This week's economic calendar (CPI, jobs report, Fed…) |
   | `SOCL` | Hot posts from the big investing subreddits |
   | `CRYP` | Top-100 crypto dashboard |
   | `FLOW` | Options flow: `AAPL FLOW`, or `FLOW` alone for SPY |
   | `SPACE` · `FLT` | ISS and launches · live US air traffic |

3. **Add a free Finnhub key for live stocks.** Register at [finnhub.io](https://finnhub.io),
   copy the key from your dashboard, type `SET` and paste it in the **Keys** tab. Now try
   `AAPL QM` (live quote), `AAPL DES` (company profile) and `TOP` (market news). Charts
   (`GP`) also need a free Twelve Data key, see [API keys](#api-keys).
4. **Get around.** A command is *ticker + function*: `MSFT FA`, `TSLA GP`. Press `/` or
   `Ctrl+K` to type, `Shift+Enter` to open in a new panel, `Tab` or `Ctrl+1..6` to move
   between panels, `Ctrl+Shift+P` to pop a panel out to its own window. `HELP` lists
   every function; click one to try it.

## Features

| Area | Functions |
|---|---|
| **Live market data** | Streaming ticker tape, quote monitor (`QM`), watchlists (`W`), world indices (`WEI`), movers (`MOST`) |
| **Charting** (`GP`/`GIP`) | Candles, line and area from 1D to MAX, volume, SMA/EMA/Bollinger/VWAP overlays, synced RSI and MACD panes, compare mode, live last candle, earnings markers |
| **Research** | Company and market news (`N`/`TOP`), financial statements, ratios and peers (`FA`), earnings surprises (`ERN`), dividends (`DVD`), SEC filings (`CACS`), price history (`HP`), economic calendar (`ECAL`), live SEC Form 4 insider stream (`INSD`), RSS news wire with sentiment (`WIRE`), Reddit stream with sentiment (`SOCL`) |
| **Analysis and tools** | Screener with saved screens (`EQS`), portfolios with live P&L vs SPY (`PORT`), alerts that fire from the tray (`ALRT`), FRED macro dashboard (`ECO`), yield curve (`GC`), sector heatmap (`HMAP`), FX and crypto dashboards (`FX`/`CRYP`), options chain (`OPT`), options flow with unusual-volume detection (`FLOW`), per-ticker notes (`MSG`) |
| **World monitoring** | ISS position on a built-in world map, geomagnetic Kp, moon phase and launches (`SPACE`); live US airspace with business jets highlighted (`FLT`) |
| **Workstation** | Pop-out panels for multiple monitors, named workspaces (`WS <name>`), CSV/JSON export everywhere, PNG panel snapshots, alert sounds, launch at login, tray mode |

## API keys

All free tiers, all optional, added any time in `SET` → Keys. Start with Finnhub (live
quotes and news); add Twelve Data for charts, FMP for fundamentals and the screener,
FRED for macro. Keys are validated with a test call when you add them.

| Provider | Used for | Register |
|---|---|---|
| Finnhub (recommended) | streaming, quotes, profiles, news, earnings | finnhub.io |
| Twelve Data | candles, international indices, FX | twelvedata.com |
| FMP | statements, screener, movers | financialmodelingprep.com |
| FRED | macro dashboard, yield curve | fred.stlouisfed.org |
| Alpaca (optional) | quote fallback, bid/ask, extended-hours bars; paste as `KEY_ID:SECRET` | alpaca.markets |
| Marketaux (optional) | news fallback with sentiment | marketaux.com |
| CoinGecko (optional) | crypto (works keyless; a demo key raises limits) | coingecko.com |
| Polygon (optional) | `OPT` options chain (paid options plan) | polygon.io |

SEC data (`INSD`, `CACS`) needs no key, but EDGAR asks for a contact e-mail: set yours
in `SET` → Providers.

## How it is built

```
┌─────────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node)                                         │
│  keys.ts          API keys encrypted with OS safeStorage    │
│  providers/       Finnhub · TwelveData · FMP · FRED ·       │
│                   Alpaca · Marketaux · CoinGecko · Polygon  │
│                   → ProviderRouter, token buckets,          │
│                     TTL + disk caches                       │
│  stream/          WS relay: refcounted subs per window,     │
│                   150 ms coalesced batches, backoff+jitter  │
│  alerts.ts        AlertEngine (fires from the tray)         │
│  candles.ts       priority queue + disk cache               │
│  popouts.ts       pop-out windows (geometry in workspaces)  │
│  exportService.ts CSV (BOM) / JSON via native dialogs       │
│  ipc.ts           91 whitelisted, zod-validated channels    │
└──────────┬──────────────────────────────┬───────────────────┘
      contextBridge                  contextBridge
┌──────────┴───────────┐   ┌──────────────┴──────────────────┐
│ MAIN WINDOW          │   │ POP-OUTS (?popout=1)            │
│ tape · command line  │   │ same bundle + preload, one      │
│ panel grid · status  │   │ fixed panel, follows link group │
└──────────────────────┘   └─────────────────────────────────┘
```

The design decisions behind it:

1. **All network traffic lives in the main process.** The renderer makes zero
   third-party requests and never sees an API key. It can only call whitelisted IPC
   channels, and every request that carries data is validated with zod before its
   handler runs.
2. **One upstream subscription per symbol.** A symbol watched in five panels across two
   windows costs one Finnhub subscription. The relay reference-counts subscribers per
   window, batches ticks into one message every 150 ms, reconnects with exponential
   backoff and jitter, and recycles the socket when a laptop wakes from sleep.
3. **Rate limits are part of the design, not an afterthought.** Each free tier has its
   own token bucket; FMP's daily quota survives restarts. Identical requests that are
   already in flight are shared instead of paying twice, and chart requests go through a
   priority queue so the panel you are looking at loads first.
4. **Degrade, don't go blank.** The router falls back to a second provider where one
   exists, disk caches serve stale data with a `DELAYED` or `CACHED` badge when a
   source is down, and modules with several sources render whatever part is up. When a
   provider throttles, the panel says so instead of showing stale-looking numbers.
5. **Pure cores, thin services.** Parsing and calculations (indicators, market hours
   across DST, the Atom/RSS parser, sentiment scoring, options-flow analysis, store
   migrations) live in plain modules without Electron imports, so they are unit-tested
   directly. The services around them only fetch, cache and hand over.
6. **One registry, no drift.** The command parser, autocomplete and `HELP` all read
   the same function registry, so documentation and behavior can't disagree.

## Security model

- **Renderer isolation:** `contextIsolation` and `sandbox` on every window, no Node
  access, a strict Content Security Policy, and only whitelisted, schema-validated IPC.
- **No navigation away from the app:** the main window refuses to navigate, and `https`
  links open in your default browser instead.
- **API keys:** encrypted with the OS keychain through Electron `safeStorage`. On Linux
  without gnome-keyring or KWallet you are warned, and keys are only stored in plain text
  after you explicitly accept that.
- **Logs and diagnostics:** API keys in URLs are redacted before anything is written;
  the diagnostics export never includes keys.
- **Unsigned builds:** releases are not code-signed, so auto-update is **disabled** by
  design (see `src/main/updater.ts`). Meaningful auto-update needs Windows Authenticode
  and macOS notarization.

Known limitation: the app ships Electron 31, which is past its support window, and
`npm audit` reports advisories for it and for build-time tooling (`electron-vite`/`vite`
dev server, `extract-zip` in the Electron download step). The production dependencies
have no known advisories. The Electron advisories are mitigated, not fixed, by the
sandbox, the CSP and the absence of remote content; upgrading Electron is the proper fix.

## Tests and CI

```bash
npm run typecheck   # strict TypeScript across main, preload and renderer
npm run lint        # eslint (flat config, typescript-eslint, react-hooks)
npm test            # 180 tests in 22 files, about one second
```

The suite covers, among other things:

- **Markets:** indicator math with known answers, market hours and countdowns across US
  DST transitions, chart range maths, the treemap layout behind `HMAP`.
- **Providers:** HTTP status classification per provider, router fallback, token-bucket
  persistence, the Yahoo cookie-and-crumb session.
- **Data modules:** the Atom/RSS parser, the economic calendar, sentiment scoring,
  options flow, flights, space and moon phase, the Reddit stream.
- **App logic:** the command parser and fuzzy matching, alert evaluation, store
  migrations, the function registry.

GitHub Actions runs typecheck, lint and tests on every push. Pushing a `v*` tag also
builds the Windows, macOS and Linux installers on their own operating systems and
publishes them as a GitHub Release, but only when all three builds succeed.

## Building from source

Needs Node 22+ and git.

```bash
git clone https://github.com/JamievanRiel/openterminal.git
cd openterminal
npm install
npm run dev        # opens the app with hot reload
```

For development you can copy `.env.example` to `.env`. Packaged builds never read it
(guarded by `!app.isPackaged`).

```bash
npm run build       # production bundles
npm run dist        # installer for the CURRENT OS (NSIS / dmg / AppImage + deb)
```

Build installers on their own OS (or in the CI matrix); electron-builder
cross-compilation is unreliable. Icons and alert sounds are generated from code:
`node scripts/generate-icon.js` and `node scripts/generate-sounds.js` (sine-wave beeps
synthesized by the script, so no third-party samples).

## Troubleshooting

- Logs rotate in `userData/logs` (5 × 2 MB, secrets redacted): SET → About → **Open
  logs folder**.
- SET → About → **Export diagnostics** produces a JSON file to attach to a bug report:
  versions, provider status, rate-limit and cache stats and the last 200 log lines. It
  never contains API keys; tickers are optional.
- Corrupt settings files are backed up as `<name>.corrupt-<timestamp>.json` and
  recreated automatically.
- Per-OS checks for the platform-specific code are in
  [`docs/PLATFORM-TESTING.md`](docs/PLATFORM-TESTING.md).

## Data attribution

Market data by **Finnhub**, **Twelve Data**, **Financial Modeling Prep**, **Alpaca**,
**Marketaux** and **Polygon** under their respective terms. Crypto data by **CoinGecko**
(coingecko.com). Macro data from **FRED®**, Federal Reserve Bank of St. Louis; this
product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank
of St. Louis. SEC filings from **EDGAR** (sec.gov); EDGAR requests carry a contact
User-Agent, so set *your* e-mail in SET → Providers (`CACS` stays disabled until you do).
World map outline from Natural Earth (public domain).

## Origin, security reports and license

OpenTerminal was built in six phases, from the Electron foundation to the first
release; [CHANGELOG.md](CHANGELOG.md) has the full history. Seven of its keyless
data modules (`ECAL`, `INSD`, `WIRE`, `SPACE`, `FLT`, `FLOW`, `SOCL`) were ported from
**Riel**, an earlier Python/PySide6 terminal prototype, and rewritten as native
TypeScript with tests. Parked ideas are in [ROADMAP.md](ROADMAP.md).

Found a weakness? Please report it privately, as described in [SECURITY.md](SECURITY.md).

Released under the [MIT License](LICENSE).
