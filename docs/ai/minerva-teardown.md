# Minerva (itechify/minerva) teardown (machine-oriented)

report_id: minerva-static-2026-11-01
author: Claude (project thread "Investigate itechify/minerva repo"), 2026-11-01
requested_by: Danny
audience: Glorg and later threads (structured; not formatted for humans)
method: static read of the public GitHub repo only. Shallow clone at 88f55b8 (2026-11-01 10:14 PST), then commit metadata only (`--filter=tree:0`). Clone lived in the thread's scratch dir, never in this repo. No binary, installer, build or script from it was run.
related_repo_notes: docs/ai/external-sites.md (Minerva line), docs/ai/mesolens-glorg-report.md (same method)
naming_rule: two sites it partners with are on our never-use list (Danny 10-30, 10-31). They are named below as plain text only, never linked, never cited as a source.

## 0. verdict
verdict_copying_our_code: NO EVIDENCE. 1 exact match of 35,772 distinct long lines (>=45 chars) from its code/docs against 31,618 from ours; the one match is the stock `CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}` workflow line.
verdict_copying_our_data_or_canaries: NOT FOUND. No `scumlord`, `turbosauce`, `Info-Slop`, `CANARY`, canary row names, `maplestory.quest`, `mesolens`, `maplestory.watch` anywhere outside `samples/`. Its data comes from osmsdataexplorer.com at runtime; it never fetches our site.
verdict_memory_or_injection: NOT FOUND. Capture is GDI `BitBlt` from the desktop DC (src-tauri/src/capture.rs). No OpenProcess/ReadProcessMemory/SetWindowsHookEx/SendInput/keybd_event/mouse_event/PostMessage to the game. ADR 0001 bans memory, files, injection, hooks, input, `PrintWindow`, cross-process parenting; hotkeys via `RegisterHotKey`.
verdict_input_automation: NOT FOUND. The Deal Finder reads only listings on screen; the player scrolls (ADR 0014).
verdict_bot_data: YES, INDIRECT. Its Item Card and Deal Finder show prices from maplestory.market (Sen's bot site), via a key the site's admins approved for Minerva (ADR 0030, merged ~10-27, PR #187). That site's own docs, quoted in Minerva's research file, say it "scans every Free Market room about once an hour". Minerva is a consumer and promoter of that data (credit line + `?ref=76rbdbd7` link code), not a scanner itself.
verdict_licence: MIT (code + docs), copyright Jeffrey Davis. Excluded: name/owl art, `samples/` (NEXON frames), OSMS map-name fixture, NEXON Maplestory font, ocrs model (CC BY-SA 4.0).
confidence: high for the repo as published. No visibility into the Worker's secrets, D1 contents, or release binaries (not checked against source).

## 1. identity
repo: github.com/itechify/minerva (public). Author: Jeffrey Davis (GitHub itechify), sole committer, 648 commits.
history: first commit 2026-10-07; burst 10-07..10-14 (~560 commits), then 1-18/day. Tags up to v0.9.0.
site: owlofminerva.app (Cloudflare Worker `minerva-site` + D1 `minerva-leaderboards`, cron `17 5 * * *`). Discord server for players; Discord OAuth for optional accounts.
built_with: "Created in T3 Code" (README). AGENTS.md + `.impeccable/` critique files: agent-driven development, like ours.
stack: Rust (minerva-core: all logic, no OS/IO) + Tauri v2 shell (src-tauri: capture, windows, network) + vanilla TypeScript UI. OCR = ocrs with a bundled ONNX text-recognition model. reqwest native-tls. Site = Vite pages + Worker (TS, vitest in workerd). 32 ADRs in docs/adr.
platform: Windows (macOS/Linux kept possible, not shipped).

## 2. features
- Map ID: OCRs the Minimap Title (street + map name), fuzzy-matches the OSMS map list, shows ambiguity as Candidates. Panel: Map Preview with every portal, Hidden Portals set apart, spawn points, Hidden Street/Quest Portal tags, Map Summary (solo / 6+ party), mobs by level with Mob Card (OSMS animation).
- Grind Tracker: EXP from the EXP bar (ADR 0005, 0017), character from the Status Bar (0016), pace vs Personal Best, Time to Level. Pickup Log read by its stacks' shift (0026).
- Personal Bests window and Map Leaderboards (site, 0015): per map, per 10-level band, solo/party, ranked by EXP/h. Uploads with a per-install secret Leaderboard Key (SHA-256 stored), name claims, 30 writes/10 min, cap at 5x map's solo EXP/h ceiling, player reports, auto-flag at >2x the band's #1 when map has >=8 other entries (0032), Blocks + admin log (0031). New #1s posted to Discord (0022).
- Item Card (hotkey): item under the pointer's tooltip -> NPC shop price (OSMS), market Going rate / Cheapest now (maplestory.market via Worker), player's own named Market Lines. Item Lookup opens the meowdb page via meowdb search (0007).
- Deal Finder (0014): captures the client area every 400 ms while on, finds the Player Shop list by its band colour (202,213,223, 253 px), OCRs "<qty> for <mesos> mesos", badges deals vs a chosen Deal Line + Deal Margin. Names cut-short listings from the tooltip or a scroll's picture.
- Market Imports (0013): other tools drop JSON into a `market-imports` folder; Minerva is the only writer of its prices file.
- Character portraits from ClassicRank (0029), Partner read key in the Worker (`CLASSICRANK_KEY`), daily refresh cron.
- Search over mobs, maps, items, NPCs. Owl Bubble notices. Bug Report zip (inputs + crops) that replays through the core (0009); stays local.
- Updater (0019): tauri-plugin-updater, signed, GitHub `latest.json`, never silent; portable/dev builds notify only.

## 3. data sources
- osmsdataexplorer.com `data/current/` (maps, mobs, items, quests, pictures), fetched at runtime, never bundled (0008). Same upstream family as our OSMS export.
- meowdb.com: links + one search request per Item Lookup at 2 s pace. Earlier ADRs 0003/0004 crawled every meowdb map page; superseded by 0008. Their own PRODUCT.md calls the search "a grey area under MeowDB's terms".
- maplestory.market (bot-scanned FM data): `/api/prices` + `/api/items` pulled whole by the Worker at most hourly, kept in D1, served to the app 20 IDs at a time (`GET /api/market?ids=`), 2,000 items/10 min per IP.
- ClassicRank: portraits + profile links via Partner key (ADR 0029, ~10-27). Note: ClassicRank is parked/offline since 10-31 per our notes; their code keeps last answers.
- Rejected by them (docs/research/item-card-sources.md, 10-11): BasilMarket, MesoWatch (forbids automated collection), meowdb FM, classicfreemarket.com, kerning.gg, EvilEyeFM, mapleclassicfm.com. Drops: no source qualified; mapleclassic.wiki Cargo API "the one to watch".
- maplestory.io: only old caches cleanup / cursor notice (ADR 0006 superseded).

## 4. network and telemetry (app)
hosts_in_app_code: osmsdataexplorer.com, meowdb.com (search), owlofminerva.app (leaderboard PUT/GET/DELETE, `/api/market`), github.com (update feed). No analytics/telemetry SDK (grep: analytics, telemetry, sentry, posthog, plausible, umami, gtag -> only FAQ text and lockfile noise).
what_leaves_the_pc: update check (version only); leaderboard uploads if opted in (character name, job, level, map, EXP/h, setAt, party flag + key); market asks (item IDs, toggle "Prices from maplestory.market", on by default); meowdb search terms. Bug Reports only if the player attaches them to an issue.
site_side: Worker calls maplestory.market and ClassicRank with server-held keys, Discord webhooks/OAuth. Visitors' browsers load portraits from classicrank.com.

## 5. did it take our stuff?
No. No shared lines, names, data or links; it never mentions us. Overlap is convergent: both read OSMS-family data, both do CV-only EXP tracking + leaderboards + FM prices. It started 10-07, after our site existed, but its design history (ADRs, research dated 10-11) is self-contained.

## 6. ideas for us (idea list; verify every number before building)
- Leaderboard anti-cheat: auto-flag at >2x band #1 with >=8 other entries, report not reject, players not told (ADR 0032). Fits our KPQ/shared-runs boards.
- Server-side cap from a computed per-map EXP/h ceiling table committed to the repo.
- Bug Report = replayable input log + crops; "every misread becomes a sample" is their rule too.
- Signed, never-silent updater with notify-only portable builds.
- Player Shop detection by exact band colour + width, brightness-tolerant; "covered" lines read as "?" instead of misread.
- Market Imports folder (atomic rename, single writer) as a plug-in point for user tools.
- Skip: anything from maplestory.market or ClassicRank (our never-use list).

## 7. could not determine
- Whether release binaries match source (not downloaded, per rule).
- Worker secrets, D1 contents, live leaderboard numbers (not queried).
- Whether maplestory.market's FM scanning is CV-only; Minerva's docs say only "scans".

## 8. evidence index (paths in itechify/minerva @ 88f55b8)
README.md, PRODUCT.md, AGENTS.md, LICENSE, docs/adr/0001, 0008, 0014, 0015, 0019, 0029, 0030, 0031, 0032, docs/research/item-card-sources.md, src-tauri/src/capture.rs, src-tauri/Cargo.toml, site/wrangler.jsonc, site/worker/market.ts, site/worker/portraits.ts.
