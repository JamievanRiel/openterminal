# Riel-main → OpenTerminal port — status & continuation guide

*Last updated: 2026-08-27. This is the handoff doc for continuing the port —
read it (plus the workflow section below) before starting the next module.*

## Context

`Riel-main/` in the repo root is a Python/PySide6 reference app ("Mini
Bloomberg Terminal") whose keyless data modules are being ported, one by one,
into OpenTerminal as native TypeScript. Decision history and the phase-1 spec:
`docs/superpowers/specs/2026-08-27-ecal-insd-design.md`. `Riel-main/` stays
**untracked** on purpose — reference only, never imported, never committed.

## Status

| Riel module | OpenTerminal command | Status |
|---|---|---|
| Economic calendar (Forex Factory JSON) | `ECAL` | ✅ merged |
| Insider / SEC Form 4 stream (EDGAR Atom) | `INSD` | ✅ merged |
| News / sentiment (RSS + lexicon) | `WIRE` (+ badge backfill in `N`/`TOP`) | ✅ merged |
| Space & Moon (ISS, launches, Kp, moon) | `SPACE` | ✅ merged |
| Flights / private jets (OpenSky) | `FLT` | ✅ merged |
| Options flow (Yahoo chain) | — | ⏳ next |
| Social (Reddit RSS) | — | ⏳ after that |
| Ships / AIS (aisstream) | — | ⛔ only with a key (see below) |
| Google Trends (pytrends) | — | ❌ dropped: no official API, fragile |
| Markets/crypto via yfinance/CoinGecko | — | not ported: OpenTerminal already covers these |

## What was built where

- **Pure cores** (testable, no Electron imports): `src/main/calendarCore.ts`,
  `atom.ts` (Atom + RSS 2.0 + CDATA parser — reuse this, no XML lib!),
  `sentimentCore.ts` (lexicon, aggregate, N/TOP backfill), `wireCore.ts`,
  `moonCore.ts` (mean-synodic, replaces ephem), `spaceCore.ts`,
  `flightsCore.ts`. Each has a sibling `.test.ts`.
- **Thin services** (fetch + `DiskCache` + stale-on-error): `calendar.ts`,
  `wire.ts`, `space.ts`, `flights.ts`; Form 4 lives on the existing
  `EdgarService` (`edgar.ts`) to reuse its contact-UA/throttle/403 plumbing.
- **Map**: `src/renderer/src/components/WorldMap.tsx` (equirectangular SVG,
  markers with glyph/rotation/tooltip, optional region crop) over the
  committed asset `src/renderer/src/assets/worldLand.ts` (regenerate with
  `node scripts/gen-worldmap.mjs`; Natural Earth, public domain).
- **Panels**: `EcalPanel`, `InsdPanel`, `WirePanel`, `SpacePanel`, `FltPanel`
  — routed in `components/PanelGrid.tsx`, `PopoutApp.tsx`, and added to the
  leak-harness list in `lib/devHarness.tsx`.

## The wiring checklist (identical for every module)

1. Types in `src/shared/types.ts`.
2. Pure core in `src/main/<x>Core.ts` — **TDD: failing test first**.
3. Thin service in `src/main/<x>.ts` (`DiskCache`, `classifyStatus`,
   `ProviderError`, stale-cache-on-error).
4. Channel in `src/shared/channels.ts` + handler in `src/main/ipc.ts`.
5. Entry in `src/shared/functionRegistry.ts` (drives HELP + autocomplete).
6. Panel in `src/renderer/src/panels/` + the three routing spots above.
7. README feature line + CHANGELOG "Unreleased" entry.

## House rules (agreed with Jamie, hold for all remaining modules)

- **No demo/fake data** — honest `ErrorState` + stale disk cache instead of
  Riel's demo fallbacks. Fake rows in a trading terminal are a hazard.
- **No new npm dependencies** (the SVG map exists precisely to avoid Leaflet).
- **TDD** on every core; UI verified via typecheck + the live harness.
- Style: no semicolons, single quotes; panels follow the NewsPanel/EcalPanel
  look (term-* tokens, chip filters, `news-new` flash for streams).
- Feature branch per module; at the end offer merge/PR/keep — Jamie has
  picked "merge to main locally" every time. Commit messages end with the
  Claude co-author line.

## Verification recipe that worked

- `npm run typecheck` **unpiped** (piping through `tail`/`grep` masks the exit
  code — this bit us once), `npm test`, `npm run build`.
- Live-data smoke: temporary `src/main/<x>.live.test.ts` that runs real
  endpoints through the real normalizers, **writes findings to a scratchpad
  file** (vitest swallows console.log), then gets deleted — never committed.
- In-app smoke: `OT_LEAKTEST=1 timeout 160 npm run dev` mounts every panel
  20× (offscreen, real IPC, doesn't touch Jamie's workspace). Boot time
  varies wildly — if the run gets cut off, either raise the timeout or
  temporarily shrink `PANELS` in `devHarness.tsx` to the panel under test
  (restore before committing). `[store] migrated <cache>.json` lines prove a
  service really ran. Watch for React duplicate-key warnings: both prior
  ones were provider data repeating (fix with dedupe in the provider, and
  re-verify with a targeted harness run — the first "fix" addressed the
  wrong source because it wasn't bracketed to a panel first).
- Visual check for map-like UI: render a sample to SVG and convert with
  `magick` (available on this machine), then view the PNG.

## Next module: options flow (Yahoo chain)

Port of `Riel-main/providers/options.py`. Suggested command: `FLOW`
(Research) — `OPT` is taken by the Polygon chain panel; keep them separate.

- Yahoo's chain endpoint needs the **cookie + crumb dance** since 2023:
  GET `https://fc.yahoo.com` (ignore body, keep cookies) → GET
  `https://query2.finance.yahoo.com/v1/test/getcrumb` with those cookies →
  call `https://query2.finance.yahoo.com/v7/finance/options/{SYMBOL}?crumb=…`.
  Needs a browser-ish User-Agent. Cache the crumb; refresh on 401/403 once.
  If Yahoo proves too hostile, fall back honestly (ErrorState), never fake it.
- Riel's logic to port: nearest expiry only; per contract
  `unusual = volume > max(openInterest * ratio, 100)` with ratio 1.0;
  P/C ratio = total put volume / total call volume; top 12 by volume; spot
  from the quote. Default symbols in Riel: SPY, QQQ, AAPL, NVDA, TSLA — but
  make the panel ticker-driven (`AAPL FLOW`), defaulting to SPY when
  tickerless.
- Panel: header with P/C ratio + call/put volume; table of top contracts
  (type, strike, last, volume, OI, IV, UNUSUAL badge amber).

## After that: social (Reddit RSS)

Port of `Riel-main/providers/social.py`, minus pytrends. Suggested command:
`SOCL` (Research).

- Feeds: `https://www.reddit.com/r/{sub}/hot/.rss` for wallstreetbets,
  stocks, investing, CryptoCurrency (limit 8 each). **Descriptive UA
  required** (Riel used `MiniBloombergTerminal/0.1 (personal-use; …)`) —
  Reddit 403s default clients; the JSON API is blocked, RSS works.
- Reuse `parseFeedEntries` from `atom.ts` and `scoreSentiment` from
  `sentimentCore.ts`. Skip titles containing: "daily discussion", "what are
  your moves", "daily general discussion".
- Panel: WirePanel-style stream with subreddit tag + sentiment badge.

## Ships (only on request)

aisstream.io needs a (free) API key over a websocket — per house rules no
demo data, so build it only when Jamie adds a key. Wire the key through
`KeyManager`/SET → Providers like the other providers, stream into a buffer
in main, render on `WorldMap` (colored dots per vessel type, Riel's palette
is in `Riel-main/widgets/map_widget.py`).

## Upstream quirks worth remembering

- **EDGAR** requires the operator contact e-mail from SET → Providers; 403 =
  throttle, mapped to RATE_LIMITED. INSD/CACS politely refuse without it.
- **OpenSky anonymous**: 400 credits/day, the US bbox costs 4/request →
  10-min poll, 5-min DiskCache. Faster needs an OpenSky account (future SET key).
- **The Space Devs**: ~15 req/hour anonymous → 30-min cache. `status.abbrev`
  can be "Success" for just-flown launches; panel shows them dimmed.
- **Forex Factory mirror** (`nfs.faireconomy.media`): weekly file, keyless,
  no UA fuss. Impact arrives as labels or colours — both mapped.
- **NOAA Kp** has shipped two JSON shapes; `parseKp` handles both.
