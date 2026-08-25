# QA Checklist — consolidated acceptance criteria (Phases 2–6)

Status as of v1.0.1 stabilization on Windows 10. Legend: `[x]` verified here · `[ ]` not yet run · `[deferred: reason]`.

## Live data (Phase 2)

- [x] `AAPL QM` shows a full quote; during US hours the last price ticks and flashes without refresh — *verify: watch QM during RTH; log `state → live`.*
- [x] Tape scrolls via CSS transform; BTC ticks when equities are closed — *verify: watch tape after 20:00 ET.*
- [deferred: needs eyes on Task Manager] Marquee pauses when minimized and CPU drops near 0%.
- [x] Watchlist add/remove/reorder persists across restart; CSV export writes a valid file — *verify: restart + open CSV in Excel.*
- [x] `WEI` US proxies live, international delayed with badges; open/closed dots correct — *verify: compare dots to exchange local time.*
- [x] `MOST` renders three tabs with cache indicator.
- [deferred: needs Wi-Fi toggle] Kill network → status bar shows reconnecting → auto-recovery. (Reconnect path exercised by suspend/resume test instead.)
- [x] 4 consumers of one symbol = ONE Finnhub subscription — *verify: `0→1 subscribe` appears once in logs (re-proven with pop-out, this pass).*
- [x] No keys → every panel shows the no-key state deep-linking to SET.
- [x] Renderer makes zero third-party requests; no key material in bundles — *verify: grep bundles against real encrypted key values (re-run this pass: clean).*

## Charting (Phase 3)

- [x] `AAPL GP` 1Y daily renders <2s warm; axis dates match real sessions — *verify: spot-check a close against a public source (AAPL FY revenues matched official filings).*
- [deferred: needs RTH] Last candle updates live; static + closed styling after hours (closed-state verified).
- [x] Indicators toggle without flicker; sub-panes stay time-synced; 10 indicator unit tests pass.
- [x] `GIP` 1-min bars with VWAP; pre/post shading when data covers it (Alpaca-fed).
- [x] Compare mode % change; exit restores candles and releases the compare symbol.
- [x] Interval/range/indicator/compare survive restart per panel.
- [x] 4 chart panels don't blow the TD bucket: queue + countdown state + auto-retry — *observed live (RATE_LIMITED → countdown → recovery).*
- [x] International symbol charts via TD with DELAYED badge where applicable.
- [x] Network down → previously-viewed daily chart renders from disk with CACHED badge — *verify: disk-cache fallback path; offline boot test this pass.*
- [x] Strict TS; channels whitelisted + zod-validated.

## Research (Phase 4)

- [x] `N` dedupes and updates ~60s; clicks open the system browser; `TOP` shares the component.
- [x] Premium-blocked sentiment → no badges, exactly one console line — *re-verified: one line per session.*
- [x] `FA` six tabs, FY/Q toggle, YoY + mini-bars; numbers matched official AAPL figures.
- [x] Peers table ≤5 cached metric calls; warm FA open = zero FMP calls — *log-proven.*
- [x] FMP exhausted → Finnhub-metrics Overview fallback with note.
- [x] `ERN` next date + countdown; beat/miss coloring matches numbers.
- [deferred: FMP plan blocks dividends] `AAPL DVD` trailing yield ÷ live price; honest "not on this plan" state verified instead.
- [x] `CACS` real 10-K/10-Q/8-K with correct dates; ASML shows 20-F/6-K; User-Agent in every request — *log-proven.*
- [x] `HP` after `GP` = zero network calls; CSV valid.
- [x] Rate-limited and no-key states on all six functions.

## Analysis & tools (Phase 5)

- [x] `EQS` plausible results; 10-min cache hit on re-run — *log-proven*; saved screens run as `EQS <name>`.
- [x] `PORT` persists; EUR position converts to USD display; export→wipe→import restores; vs-SPY renders from cache. (Live P&L flash: needs RTH eyes.)
- [x] `ALRT` fires within seconds as a native notification; one-shot never fires twice — *log-proven incl. across restart.*
- [deferred: needs WS-down window] REST sweep evaluation (code path present; sweep skips while `live`).
- [x] `ECO` FRED cards correct (UNRATE 4.1 etc. matched FRED data); calendar fallback populates; earnings chips → ERN.
- [x] `GC` three curves; banner matches data; holiday gaps carried forward — *unit-tested.*
- [x] `HMAP` 11 live tiles; drill-down ≤10 quote calls.
- [x] `FX` full cycle ≤5 min inside the 8/min bucket (2 pairs / 30s round-robin); `FX EURUSD` detail chart works.
- [x] `CRYP` sorts/scrolls; BTC/ETH live between polls; detail = line/area only.
- [x] `MSG` autosaves, survives restart, ● indicator in DES/QM headers.
- [x] `SET` accurate meters; clear-caches empties disk+memory (subsequent FA refetches); `HELP` = same registry as autocomplete.
- [x] Two workspaces round-trip across restart incl. chart settings.

## Polish & release (Phase 6)

- [x] Pop-out GP + main QM: ticks in both, link-group switch propagates, ONE shared upstream sub — *log-proven.*
- [x] Closing pop-out returns the panel; workspace restores pop-out geometry; clamps to primary when the display is gone (code-path; single display here).
- [x] `OPT` without key/flag = explanation state. [deferred: no Polygon key] chain rendering with live data.
- [x] Update chip flow via dev simulator; disabled in dev AND unsigned packaged build with exactly one line each — *log-proven both modes.*
- [x] All seven export targets produce Excel-openable CSV via the shared service; workspace export/import round-trips.
- [deferred: needs HiDPI display] Snapshot pixel-correctness on HiDPI; standard-DPI capture verified (README screenshots).
- [deferred: needs ears] Alert sound audible from tray; per-rule "none" logic unit-tested this pass.
- [deferred: packaged + reboot] Auto-launch OS registration round-trip (real-state readback implemented).
- [x] `npm run dist` installer works; installed copy passes smoke; second instance focuses the first.
- [x] Packaged: no `.env`, CSP enforced, zero third-party renderer requests, no keys in bundles, audit clean of criticals.
- [x] Warm startup ≈2–3s observed; idle discipline by design (timers stop off-hours).
- [x] README/CHANGELOG/LICENSE/attribution/disclaimer complete; strict TS.

## v1.0.1 additions (this pass)

- [x] Leak harness: 26 panel types × 20 cycles — heap stable (14–23 MB oscillation, no monotonic growth), live listeners exactly at baseline (32) throughout.
- [x] Render crash in one panel (BOOM) is contained; tape + other panels + stream stay alive.
- [x] `marketHours` DST matrix: 13 tests incl. spring-forward (44h not 45h), fall-back, half-day, holiday, weekend; countdown never ≤0.
- [x] powerMonitor suspend/resume wired: socket recycled, renderer caches invalidated.
- [x] One shared provider error classifier; per-provider quirks documented inline (Alpaca 403, FRED 400, EDGAR 403).
