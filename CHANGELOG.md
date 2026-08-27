# Changelog

## Unreleased

### Added
- `ECAL` — economic calendar: this week's macro events (CPI, NFP, FOMC, …) from the keyless Forex Factory JSON mirror, with impact (ALL/MED+/HIGH) and country (US/EU/GB/JP/ALL) filters, next-event highlight, 30 min disk cache with stale fallback.
- `INSD` — insider filings: live market-wide SEC Form 4 stream from the EDGAR "latest filings" Atom feed (reuses the EDGAR contact e-mail from SET → Providers), Issuer+Reporting pairs folded into one row, 2 min poll with new-row flash. First two modules ported from the `Riel-main` reference app per `docs/superpowers/specs/2026-08-27-ecal-insd-design.md`.
- `SPACE` — space dashboard: live ISS position (wheretheiss.at) plotted on a new dependency-free dark SVG world map (Natural Earth outline, committed via `scripts/gen-worldmap.mjs`), NOAA geomagnetic Kp with storm colouring, locally computed moon phase with full/new countdowns, and The Space Devs launch schedule (30 min cache). Parts fail independently — the panel renders whatever is up.
- `FLT` — flight board: live continental-US airspace via anonymous OpenSky on the same SVG map, business-jet callsigns (NetJets, Flexjet, VistaJet, …) highlighted amber and sorted first, ALL/JETS filter, honest 10-minute poll sized to the anonymous credit budget. Fourth and fifth modules ported from `Riel-main`.
- `WIRE` — keyless RSS news wire (Reuters via Google News, CNBC, Yahoo Finance, MarketWatch, CoinDesk) with a finance sentiment lexicon per headline, a bull/bear/average meter in the header, category filters (ALL/MARKETS/CRYPTO) and a 2 min poll; one broken feed never blanks the wire. The same lexicon now backfills missing sentiment badges in `N`/`TOP` (provider-supplied scores are never overwritten). Third module ported from `Riel-main`.

## v1.0.1 — 2026-08-25

Stabilization release — no new features.

### Fixed
- Market countdown could drift ±1h across US DST transitions (wall-clock arithmetic → epoch-exact boundaries; closed-state countdown now targets the actual open).
- Finnhub 403 (plan-gated) was misreported as "key rejected"; all nine provider adapters now share one HTTP-status classifier with documented per-provider quirks (Alpaca 403 = bad key, FRED 400 = bad key, EDGAR 403 = throttle).
- Concurrent identical candle requests could double-spend Twelve Data credits (in-flight coalescing added, matching the screener fix).
- Live-store listener map grew slowly with symbol churn (empty sets now pruned).
- Waking from laptop sleep left a dead WebSocket until the 60 s heartbeat; `powerMonitor` resume now recycles the socket immediately and refreshes visible quotes.
- FMP's 250/day quota reset on every app restart; the bucket now persists across launches.
- Hide-to-tray on Linux desktops without tray support could make the window unreachable (now falls back to a normal close).
- macOS: Windows-style title-bar buttons replaced by native inset traffic lights; every shortcut now accepts Cmd; app menu added. Linux AppImage autostart pointed at the transient mount instead of the AppImage.

### Added (operational, not features)
- Rotating file logging (`userData/logs`, 5×2 MB) with secret redaction; console routed through it.
- Crash capture: main-process errors show a dialog with an "Open logs folder" path; a crashed renderer auto-reloads once.
- Diagnostics export (SET → About): versions, provider status (never keys), bucket states, cache stats, workspace shape, last 200 log lines.
- Store schema versioning + migration runner; corrupt store files are backed up as `<name>.corrupt-<timestamp>.json` and recreated with a user notice.
- SEC EDGAR contact e-mail moved from a code constant to SET → Providers (empty = CACS politely disabled).
- Offline-resilient startup and an offline "save anyway" path in the first-run wizard.
- Test suite grown from 10 to 55 tests (DST matrix, bucket persistence, error classes, router fallback, alert logic, migrations); GitHub Actions CI with a 3-OS installer matrix on tags.

## v1.0.0 — 2026-08-25

First release. Built in six phases:

### Phase 1 — Foundation
- Electron + React + TypeScript (electron-vite), strict main/preload/renderer split: context isolation, sandbox, whitelisted zod-validated IPC, zero third-party requests from the renderer.
- Frameless terminal UI (design tokens, custom title bar, panel grid, command line with autocomplete/history, status bar), first-run API-key wizard with safeStorage encryption, `DES`, `Q/QM`, `SET`, `HELP`.

### Phase 2 — Live market data
- Finnhub WebSocket relay in main: reference-counted subscriptions, 150 ms coalesced tick batches, exponential backoff + jitter reconnect, heartbeat, market-hours idling.
- Provider router (Finnhub → Alpaca fallback; Twelve Data for FX/crypto), token buckets and TTL caches, live ticker tape, `W` watchlists (CSV export), `WEI` world indices, `MOST` movers, live status bar with rate-limit meters, `src/shared/marketHours.ts`.

### Phase 3 — Charting
- `GP`/`GIP` on lightweight-charts: candles/line/area, volume, ranges 1D–MAX, synced RSI/MACD sub-panes, SMA/EMA/Bollinger/VWAP overlays with vitest-tested math, compare mode (% change), live last-candle updates, earnings markers, per-panel persisted settings, priority-queued candle fetches with a disk cache (offline charts).

### Phase 4 — Research
- `N`/`TOP` news (60 s poll, dedupe, Marketaux fallback, session-gated sentiment), `FA` statements/ratios/growth with peers table and Finnhub-metrics fallback mode, `ERN` surprise history, `DVD` dividends, `CACS` SEC EDGAR filings (proper User-Agent, throttle, disk caches), `HP` price table reusing the candle cache.

### Phase 5 — Analysis & tools
- `EQS` screener with saved screens, `PORT` portfolios (live P&L, FX conversion, vs-SPY, JSON import/export), `ALRT` alerts evaluated in main (fire from the tray, REST sweep fallback), `ECO` FRED macro dashboard + release/earnings week, `GC` yield curve, `HMAP` sector treemap, `FX` and `CRYP` dashboards, `MSG` per-ticker notes, tabbed `SET`, registry-driven `HELP`, named workspaces (`WS <name>`).

### Phase 6 — Polish & release
- Pop-out panels (multi-monitor, shared streaming and link groups across windows, geometry saved per workspace with display clamping).
- `OPT` options chain (feature-flagged, Polygon).
- Auto-update plumbing (electron-updater + GitHub Releases; disabled in dev/unsigned builds).
- Universal `ExportService` (CSV with BOM / JSON) across W, HP, EQS, PORT, ALRT, FA, CRYP + workspace export/import.
- Panel snapshots (PNG / clipboard), bundled alert sounds with per-rule selection, auto-launch at login, generated icon set, electron-builder packaging (NSIS / dmg / AppImage+deb), hardening pass.
