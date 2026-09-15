# OpenTerminal v1.1.0

Seven keyless data modules, ported one by one from the `Riel-main` reference app — no new API keys, no new runtime dependencies.

## Highlights
- **Macro & filings** — economic calendar with impact/country filters (`ECAL`) and a live market-wide SEC Form 4 insider stream (`INSD`).
- **News & social** — a keyless RSS wire with finance-lexicon sentiment and a bull/bear meter (`WIRE`), the same lexicon now backfilling badges in `N`/`TOP`, and a Reddit hot-post stream across wallstreetbets/stocks/investing/CryptoCurrency (`SOCL`).
- **Options flow** — nearest-expiry put/call ratio and unusual-volume detection where traded volume outruns open interest (`FLOW`), ticker-driven and keyless.
- **World monitoring** — ISS position, geomagnetic Kp, moon phase and upcoming launches (`SPACE`), plus live US airspace with business jets highlighted (`FLT`), both drawn on a new dependency-free SVG world map built from public-domain Natural Earth data.

## Under the hood
- `npm run lint` exists again: eslint flat config, and the ten real issues the gate found are fixed.
- Coverage for logic that had none — the command parser, the chart range maths (with a guard pinning the v1.0.1 DST fix) and the `HMAP` treemap layout. 171 tests.
- Test and build output is warning-free, so a real warning stands out.

## Install
- **Windows**: `OpenTerminal-1.1.0-win-x64.exe` (per-user, no admin). SmartScreen: *More info → Run anyway* (unsigned build).
- **macOS**: build `npm run dist` on a Mac → dmg. First open: right-click → Open, or `xattr -d com.apple.quarantine`.
- **Linux**: build on Linux → AppImage/deb; `chmod +x` the AppImage.

Auto-update is disabled in unsigned builds by design.

## Notes
- Every module added here is keyless, but the free endpoints throttle per IP and the app degrades honestly rather than inventing rows: OpenSky is on a 10-minute poll sized to its anonymous credit budget, Reddit is fetched as a single multireddit request per 5 minutes, and Yahoo's options endpoint can refuse an IP outright — `FLOW` then shows a rate-limited state instead of stale-looking numbers.
- Market data may be delayed. Not investment advice. Personal/educational use.
