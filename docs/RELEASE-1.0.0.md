# OpenTerminal v1.0.0

The first release: a keyboard-first, multi-panel market terminal built on free-tier data APIs.

## Highlights
- **Live everywhere** — Finnhub WebSocket relay with reference-counted subscriptions shared across the main window and pop-outs; live tape, flashing quote monitor, watchlists, world indices, movers.
- **Professional charting** — `GP`/`GIP` with indicator suite (SMA/EMA/Bollinger/VWAP + synced RSI/MACD panes), compare mode, live candles, offline-capable disk-cached history.
- **Full research stack** — news, statements & ratios with peers, earnings surprises, dividends, SEC EDGAR filings, historical prices.
- **A real workstation** — screener with saved screens, live-P&L portfolios (vs SPY), tray-capable alerts with sounds, FRED macro dashboard, yield curve, sector heatmap, FX/crypto dashboards, per-ticker notes, named workspaces, pop-out panels, universal CSV/JSON exports, panel snapshots.
- **Options chain** (`OPT`) behind a feature flag for Polygon subscribers.

## Install
- **Windows**: `OpenTerminal-1.0.0-win-x64.exe` (per-user, no admin). SmartScreen: *More info → Run anyway* (unsigned build).
- **macOS**: build `npm run dist` on a Mac → dmg. First open: right-click → Open, or `xattr -d com.apple.quarantine`.
- **Linux**: build on Linux → AppImage/deb; `chmod +x` the AppImage.

Auto-update is disabled in unsigned builds by design.

## Notes
- Free-tier data caveats: FMP dividends and Finnhub sentiment/economic-calendar are plan-dependent — the app degrades honestly instead of erroring.
- Market data may be delayed. Not investment advice. Personal/educational use.
