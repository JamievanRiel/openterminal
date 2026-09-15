# Riel-main → OpenTerminal port — status & continuation guide

*Last updated: 2026-09-15. This is the handoff doc for continuing the port —
read it (plus the workflow section below) before starting the next module.*

## Context

`Riel-main/` in the repo root is a Python/PySide6 reference app ("Mini
Bloomberg Terminal") whose keyless data modules are being ported, one by one,
into OpenTerminal as native TypeScript. Decision history and the phase-1 spec:
`docs/superpowers/specs/2026-08-27-ecal-insd-design.md`. `Riel-main/` is
vendored in the repo (commit 5622ad2) as a read-only port reference — never
imported by the app, never built.

## Status

| Riel module | OpenTerminal command | Status |
|---|---|---|
| Economic calendar (Forex Factory JSON) | `ECAL` | ✅ merged |
| Insider / SEC Form 4 stream (EDGAR Atom) | `INSD` | ✅ merged |
| News / sentiment (RSS + lexicon) | `WIRE` (+ badge backfill in `N`/`TOP`) | ✅ merged |
| Space & Moon (ISS, launches, Kp, moon) | `SPACE` | ✅ merged |
| Flights / private jets (OpenSky) | `FLT` | ✅ merged |
| Options flow (Yahoo chain) | `FLOW` | ✅ merged (Yahoo 429s this IP — see quirks) |
| Social (Reddit RSS) | `SOCL` | ✅ merged |
| Ships / AIS (aisstream) | — | ⛔ only with a key (see below) |
| Google Trends (pytrends) | — | ❌ dropped: no official API, fragile |
| Markets/crypto via yfinance/CoinGecko | — | not ported: OpenTerminal already covers these |

## What was built where

- **Pure cores** (testable, no Electron imports): `src/main/calendarCore.ts`,
  `atom.ts` (Atom + RSS 2.0 + CDATA parser — reuse this, no XML lib!),
  `sentimentCore.ts` (lexicon, aggregate, N/TOP backfill), `wireCore.ts`,
  `moonCore.ts` (mean-synodic, replaces ephem), `spaceCore.ts`,
  `flightsCore.ts`, `optionsFlowCore.ts`, `socialCore.ts`. Each has a sibling
  `.test.ts`.
  `yahooSession.ts` sits alongside them: not pure (it fetches), but it takes
  its `fetch` as a constructor argument, so it is unit-tested all the same.
- **Thin services** (fetch + `DiskCache` + stale-on-error): `calendar.ts`,
  `wire.ts`, `space.ts`, `flights.ts`, `optionsFlow.ts`, `social.ts`; Form 4 lives on the existing
  `EdgarService` (`edgar.ts`) to reuse its contact-UA/throttle/403 plumbing.
- **Map**: `src/renderer/src/components/WorldMap.tsx` (equirectangular SVG,
  markers with glyph/rotation/tooltip, optional region crop) over the
  committed asset `src/renderer/src/assets/worldLand.ts` (regenerate with
  `node scripts/gen-worldmap.mjs`; Natural Earth, public domain).
- **Panels**: `EcalPanel`, `InsdPanel`, `WirePanel`, `SpacePanel`, `FltPanel`,
  `FlowPanel`, `SoclPanel` — routed in `components/PanelGrid.tsx`, `PopoutApp.tsx`, and added to the
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

## Done: options flow (`FLOW`)

Built exactly as specced below-the-line in the old plan: nearest expiry, top 12
by volume, `unusual = volume > max(openInterest * 1.0, 100)`, P/C ratio from
total put vs call volume, ticker-driven with SPY as the tickerless default.

- The crumb dance lives in `yahooSession.ts`, not in the service: it takes a
  `fetch` in its constructor, so the handshake, the crumb reuse, the
  one-shot refresh on 401/403 and the 429/network mapping are all unit-tested
  without a network. Reuse it for any future Yahoo endpoint.
- **Jamie chose Yahoo knowingly** over a working CBOE alternative
  (`https://cdn.cboe.com/api/global/delayed_quotes/options/<SYM>.json` —
  keyless, no handshake, adds greeks, verified 200 from this machine). If the
  Yahoo block ever becomes permanent, that is the drop-in replacement: the
  panel and types stay, only a new core parser is needed (OCC symbol carries
  expiry/type/strike; pick the first expiry >= today so 0DTE stays visible).
- The happy path could not be verified live from here (see quirks). The
  fixture field names are cross-checked against Riel's `_rows_to_contracts`,
  which reads the same v7 JSON through yfinance — **re-verify the happy path
  on a network Yahoo does not block before trusting the numbers.**

## Done: social (`SOCL`)

Ported from `Riel-main/providers/social.py` minus pytrends, with one design
change forced by measurement — **do not undo it**:

- Riel fetches `/r/{sub}/hot/.rss` once per subreddit. Anonymous Reddit allows
  roughly **one request per 60-second window per IP**: the response headers say
  so plainly (`x-ratelimit-remaining` drops to `0.0` after a single call, with
  `x-ratelimit-reset` counting down from ~60). Four separate requests means
  three 429s, which is exactly what the first live smoke showed.
- So all four subs are fetched as ONE **multireddit** feed:
  `https://www.reddit.com/r/wallstreetbets+stocks+investing+CryptoCurrency/hot/.rss?limit=30`.
  Reddit merges its own hot ranking across them and tags every entry with
  `<category term="…">`, which is where each post's subreddit now comes from.
  `parseAtomEntries` gained an optional `category` field for this; `INSD` and
  `WIRE` ignore it.
- The descriptive User-Agent is still mandatory — a request without one 429s
  immediately, verified both ways.
- Live-verified end to end: 30 entries → 28 posts (2 megathreads filtered),
  all four subs present, dates and URLs sound, newest-first ordering correct.
- Reddit RSS carries **no score and no comment count**, so the panel shows
  neither rather than inventing them. Riel's `SocialPost.score`/`.comments`
  were always 0 outside its demo data.

## Next module: ships / AIS (only on request)

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
- **Reddit anonymous RSS**: ~1 request per 60s window per IP, and the
  headers say so (`x-ratelimit-remaining`, `x-ratelimit-reset`). Hence the
  multireddit feed and the 5-min cache. A default User-Agent 429s outright;
  the JSON API is blocked entirely, RSS is not.
- **Yahoo blanket-429s this machine's IP** (2026-09-15): every endpoint —
  `fc.yahoo.com` crumb dance, `/v7/finance/options`, even the normally-open
  `/v8/finance/chart` — returns `Too Many Requests`, while Space Devs and
  NOAA answer 200 from the same host. So it is an IP block, not our code or
  a missing header. `FLOW` therefore shows RATE_LIMITED here; the cookie
  step itself still works (fc.yahoo.com 404s with a valid `A3` cookie, which
  is by design). Before assuming a regression, retest from another network —
  the quickest probe is a plain `fetch` of the v8 chart endpoint; if that 429s
  too, it is the IP, not the handshake.
