# OpenTerminal — Bouwverslag (fase 1 t/m 6)

Wat er in zes fasen is gebouwd, hoe het is geverifieerd, en wat er onderweg is gevonden en opgelost. Eindresultaat: **v1.0.0**, getagd in git, met een werkende Windows-installer in `release/`.

**Kerncijfers**: 82 TypeScript/TSX-bestanden · ~13.000 regels code in `src/` · 25 panelen · ~90 gevalideerde IPC-kanalen · 10 unit tests · installer 78 MB (NSIS, per-user).

---

## Fase 1 — Fundament *(bestond al bij de start van deze sessie)*

- Electron + React + TypeScript via electron-vite, met een strikte scheiding: main-proces (Node, API-keys, alle netwerkverkeer), preload (contextBridge met whitelisted kanalen), renderer (sandbox, **nul** derde-partij-requests).
- Frameless terminal-UI: eigen titelbalk, ticker tape, commandoregel met autocomplete/historie, panel-grid, statusbalk.
- First-run wizard die de Finnhub-key valideert en versleuteld opslaat via OS `safeStorage` (met plaintext-disclaimer als er geen keychain is).
- Eerste functies: `DES`, `Q/QM`, `SET`, `HELP`.

## Fase 2 — Live marktdata

- **WebSocket-relay** in main ([StreamManager.ts](../src/main/stream/StreamManager.ts)): reference-counted subscripties per venster, ticks gebundeld per 150 ms, reconnect met exponentiële backoff + jitter, heartbeat (60 s stilte → reconnect), idle als de beurs dicht is en er geen crypto loopt.
- **ProviderRouter**: Finnhub → Alpaca-fallback voor US-aandelen, Twelve Data voor FX/crypto; token buckets per gratis tier, caches met stale-serving (`DELAYED`-badge).
- Gebouwd: live ticker tape, volledige `QM` (day/52w-range bars, laatste trade in ET), `W` watchlists (meerdere lijsten, drag-reorder, CSV), `WEI` (US ETF-proxies live + internationale indices delayed), `MOST` (FMP movers), marktkalender 2026 in [marketHours.ts](../src/shared/marketHours.ts), live statusbalk met rate-limit-meters.
- **Geverifieerd**: relay ging live tijdens beurstijd; logs bewijzen exact één upstream-subscriptie per symbool ondanks meerdere consumenten.

## Fase 3 — Charting (`GP` / `GIP`)

- Eén herbruikbare `TerminalChart` op lightweight-charts v4: candles/line/area, volume-histogram, ranges 1D→MAX, RSI/MACD-subpanes met tweerichtings-tijdsync, overlays (SMA 20/50/200, EMA 9/21, Bollinger, VWAP), compare-modus (%-verandering), live laatste-candle-updates vanaf de relay, earnings-markers, pre/post-schaduw op intraday.
- Indicator-wiskunde als pure functies met **10 vitest known-answer tests**.
- Candle-data: Twelve Data primair, Alpaca-fallback, priority queue (actief paneel eerst), disk-cache zodat daily-charts offline en direct renderen (`CACHED`-badge), rate-limit-state met countdown en auto-retry.
- **Geverifieerd**: 251 daily bars = exact één handelsjaar; AAPL-omzetcijfers klopten later tegen echte jaarrekeningen; één React-bug (setState tijdens render in de countdown) live gevonden en gefixt.

## Fase 4 — Research

- `N`/`TOP` nieuws (60 s poll, dedupe, oneindig terugscrollen per week, Marketaux-fallback; sentiment één keer per sessie geprobeerd en netjes uitgeschakeld — premium op deze key).
- `FA`: FMP-statements genormaliseerd tot hiërarchische tabellen (YoY-delta's, mini-bars), zes tabs, FY/Q-toggle, peers-tabel (max 5 gecachte metric-calls), en een "Overview only"-fallback op Finnhub-metrics als FMP wegvalt.
- `ERN` (surprise-chart + countdown), `DVD` (met eerlijke "niet beschikbaar op dit plan"-status — FMP blokkeert dividenden op deze key, live ontdekt via een 402 die eerst de v3-fallback oversloeg: gefixt), `CACS` (SEC EDGAR met nette User-Agent, throttle en disk-caches — AAPL CIK 320193 en ASML 937966 correct, 20-F/6-K-mix klopte), `HP` (hergebruikt de candle-cache: nul extra API-budget).
- **Geverifieerd**: warme FA-heropening = **nul** FMP-calls (logbewijs).

## Fase 5 — Analyse & tools

- **Batch A**: `EQS` screener (10-min cache, saved screens als `EQS <naam>`, client-side verfijning), `PORT` portefeuilles (live P&L, EUR⇄USD-conversie, sector-donut, vs-SPY-reconstructie, JSON-import/export met schema-versie), `ALRT` — AlertEngine in main die zelf op de relay subscribet zodat alerts **vanuit de tray** vuren, met 60 s REST-sweep als de WS plat ligt. Live getest: BTC-alert vuurde binnen seconden, one-shot bleef stil na herstart.
- **Batch B**: `ECO` (vijf FRED-statcards + release/earnings-weekoverzicht; Finnhub-kalender premium → FRED-fallback, live bevestigd), `GC` (rentecurve latest/1M/1Y, inversie-banner, FRED-gaten doorgeschoven), `HMAP` (eigen squarified treemap over 11 sector-ETF's, drilldown ≤10 calls), `FX` (round-robin binnen de Twelve Data-bucket, detail = volledige chart), `CRYP` (CoinGecko top-100, BTC/ETH live via de WS).
- **Batch C**: `MSG` notities (autosave, ●-indicator in headers), `SET` met vijf tabs (keys, rate-meters + cache-wissen, gedrag incl. tray, uiterlijk, about met attributie), `HELP` gegenereerd uit één [functionRegistry](../src/shared/functionRegistry.ts) (zelfde bron als autocomplete), en **workspaces** (`WS <naam>`, autosave met 2 s debounce, naam in de statusbalk).
- **Geverifieerd**: workspaces overleefden herstart inclusief chart-instellingen; FRED-cijfers klopten (10Y−2Y consistent).

## Fase 6 — Polish, pop-outs, packaging, release

- **Pop-outs**: paneel → eigen frameless venster (zelfde bundle, `?popout=1`), state main-side, link-groep werkt over vensters heen, geometrie in de workspace (met display-clamping), sluiten = terug naar het grid. **Logbewijs**: QM (main) + GP (pop-out) + tape + watchlist op AAPL = één upstream-subscriptie.
- **`OPT`** optieketen (Polygon, feature-flag in SET): expiratie-chips, calls|strike|puts gecentreerd op ATM, greeks-kolommen verborgen als het plan ze niet levert, klik kopieert het OCC-symbool.
- **Auto-update**: electron-updater (GitHub Releases), chip → release notes → achtergrond-download → restart; hard uit in dev/ongesigneerde builds (precies één logregel — in beide modi bevestigd).
- **Exports overal** via één `ExportService` (CSV met BOM voor Excel): W, HP, EQS, PORT, ALRT-log, FA-tab, CRYP + workspace-export/import. **Paneel-snapshots** (PNG/klembord, `Ctrl+Shift+S`) — de README-screenshots zijn ermee gemaakt.
- **Alert-geluiden**: twee zelf-gegenereerde WAV's (script, publiek domein), per-regel keuze, hoorbaar vanuit de tray. **Auto-launch** met echte OS-registratie. **Icoon** uit code gegenereerd (amber "OT"-monogram).
- **Hardening & packaging**: Electron 31.3→31.7.7, electron-builder 24→26 (daarmee de kritieke `tar`-advisory weg; rest is alleen build/dev-time en gedocumenteerd), CSP gecontroleerd, geen key-materiaal in welke bundle dan ook (getest tegen de échte versleutelde waardes), `.env` alleen in dev.
- **Smoke-tests op Windows 10**: packaged app draait met werkende keys · single-instance (tweede start → één venster) · fresh profile boot (echte profiel geback-upt en intact teruggezet) · installer stil geïnstalleerd (exe + snelkoppelingen) én stil verwijderd (alles weg).

---

## Onderweg gevonden en opgelost

| Probleem | Oplossing |
|---|---|
| RateLimitCountdown deed setState tijdens render (React-warning) | Retry naar een eigen effect verplaatst |
| FMP geeft **402** voor premium-endpoints; fallback keek alleen naar 403/404 | 402 behandelt nu ook de v3-fallback; DVD toont eerlijk "niet op dit plan" i.p.v. "geen dividend" |
| Screener werd dubbel gefetcht (StrictMode-double-mount) | In-flight coalescing per filterset |
| Tick-backlog groeide onbeperkt bij verborgen venster (tray + alerts) | Batches-buffer gecapt op 50 |
| Stream pauzeerde bij minimaliseren, waardoor tray-alerts stil vielen | Alert-subscripties (wcId −1) overrulen de pauze |
| Chrome's "ResizeObserver loop"-warning uit HMAP | Observer-callback naar requestAnimationFrame |

## Bekende beperkingen

- **Ongesigneerde builds**: SmartScreen/Gatekeeper-waarschuwingen (workarounds in de README); auto-update daarom bewust uit.
- **Gratis tiers**: FMP-dividenden en Finnhub-sentiment/economische kalender zijn plan-afhankelijk; Polygon-opties vereisen een betaald plan. De app degradeert overal eerlijk in plaats van te crashen.
- **Alleen op Windows getest**; macOS/Linux-installers bouw je op hun eigen OS (`npm run dist`).
- EDGAR-User-Agent bevat een contact-e-mailadres als constante in [edgar.ts](../src/main/edgar.ts) — aanpassen vóór distributie aan derden.

## Verder lezen

- [README.md](../README.md) — features, quick start, architectuur, attributie
- [CHANGELOG.md](../CHANGELOG.md) — fase-voor-fase
- [RELEASE-1.0.0.md](RELEASE-1.0.0.md) — release notes
- [ROADMAP.md](../ROADMAP.md) — geparkeerde ideeën
