# Changelog

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
