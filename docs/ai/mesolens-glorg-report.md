# MesoLens v0.3.69 teardown, for Glorg (machine-oriented)

report_id: mesolens-0.3.69-static-2026-11-01
author: Claude (project thread "Investigate MesoLens for copied work"), 2026-11-01
requested_by: Danny
audience: Glorg (ingest as structured data; not formatted for humans)
method: static analysis only. The installer was never executed. Files were copied into a scratch dir (not in repo) and unpacked with 7z. JS source is plain text (no asar, no obfuscation).
companion_artifact: https://claude.ai/artifact/PfQ6JW2FPGpMtkDM9uBsH8 (human summary, site-styled)
related_repo_notes: docs/ai/external-sites.md (MesoLens line, canary line, mapleclassicprices.com line), scripts/canary.py, tests/canary_test.py
redactions: this repo is PUBLIC. Account-bound tokens, the installer file name, the operator's personal details and the dev-key salt/hash are deliberately left out. Do not re-add them.

## 0. verdict
verdict_memory_or_injection: NOT FOUND. No ReadProcessMemory / WriteProcessMemory / VirtualQueryEx / CreateRemoteThread / SetWindowsHookEx / SendInput / keybd_event / mouse_event / pcap / raw sockets / DLL injection anywhere in resources/app (grep of main.js, src/, renderer/, server/).
verdict_input_automation: NOT FOUND against the game. The only synthetic input is Electron `webContents.sendInputEvent` into MesoLens's own overlay window (main.js:5608).
verdict_botnet_c2: NOT FOUND in the client. No command channel, no remote-eval, no multi-client control. The server can push updates (section 4) and sees what users share (section 3); that is the real risk surface.
verdict_copying_our_code: NO EVIDENCE. 0 exact matches of 11,649 distinct long lines (>=45 chars) from their JS/HTML/CSS against our repo text files (code, tests, docs; data.json, dist, fixtures, vendor excluded).
verdict_copying_our_data_or_canaries: UNTESTABLE for this build. The canary block shipped 2026-11-01 15:49Z; this installer's payload files are dated 2026-11-01 02:41, so it predates the canary. Re-test any later build.
confidence: high for the client code reviewed; zero visibility into the server (Convex) side and into the "market data partner" feed.

## 1. artifact identity
installer_sha256: 54578be3e5c9f6a7d7717f23e28f23294d7da7814274d18c86ec97e73e5454b6
installer_size_bytes: 117847712
installer_type: NSIS (Nullsoft Install System v3.09-4), 64-bit
installer_location: /mnt/project-files/ (Danny dropped it there; the file name carries an account-bound one-time code, so the name is not repeated here)
filename_token: the 24-char suffix in the download's file name is a per-download one-time sign-in code tied to the downloading account (src/core/installcode.js regex `MesoLens-Setup-\d+\.\d+\.\d+-([a-z2-7]{24})\.exe`; redeemed via POST /v1/installcode/redeem). The installer writes `installed-from.txt` with the file name and Zone.Identifier HostUrl. The file therefore identifies the account that downloaded it. Never run it, share it, or post the token.
authenticode_signer: an individual (sole proprietor) in Montreal, Quebec; the same person named in mesolens.app/terms. Name omitted here, see the terms page.
authenticode_cert_validity: 2026-10-30 04:07:53Z to 2026-11-02 04:07:53Z (3-day certificate chaining to "Microsoft ID Verified CS AOC CA 03": a Microsoft-issued short-lived signing-service cert, re-signed per build)
bundled_MesoLens_exe: 246,327,808 bytes, no embedded Authenticode (the installer carries the signature). NOT diffed against stock Electron (see gaps).
app_package_json: name=mesolens, version=0.3.69, license=UNLICENSED, private=true, author "MesoLens team", deps koffi 3.3.2 + tesseract.js 7.0.0 (+ node:sqlite builtin, node-fetch), `mesolens.hubUrl` = https://dazzling-rhinoceros-791.convex.site
app_layout (under resources/app):
- main.js 472,187 B (Electron main process)
- src/core/*.js (pricing, deals, grind, farming, route, crafting, marketbook, sweep, spots, smega, ...)
- src/vision/*.js (screen readers) + digits.json, quickslot-digits.json (trained digit models)
- src/data/*.js (market.js hub client, account.js, sync.js OSMS, niadata.js, mmsync.js, osmsv1.js, store.js), src/data/npc-shops.json (bundled)
- src/winrect.js (the only native FFI user), src/ocr.js + ocr-worker.js, src/readers.js
- renderer/*.js|html (UI windows: panel, badges, card, grind, report, search, mapinfo, toast, flash, peek, picker, streamtag, corner, capture)
- server/hub.js + hubcore.js + rankings.js (a self-hostable copy of the shared-market server shipped inside the client)
- vendor/tessdata/eng.traineddata.gz (Tesseract best_int), i18n en/fr/ko
credit_file: THIRD-PARTY-NOTICES.md. States the item tooltip reader (`src/vision/tooltip.js`) is a JS port of Minerva (github.com/itechify/minerva, MIT) `item_tooltip.rs`; the Player Shop band colours/sizes (`src/vision/shop.js`) and minimap title approach (`src/vision/minimap.js`) come from Minerva (`player_shop.rs`, `minimap_title.rs`).
build_stack: Electron app + Tesseract.js OCR + koffi FFI for window geometry; Convex serverless backend; Clerk (web sign-in); Stripe (billing); Cloudflare (site + download.mesolens.app, downloads gated 401 without a session); Resend (email).

## 2. how it reads the game (proven from source)
capture_method: Electron desktopCapturer (main.js:1462, 1499, 1500, 1884, 9675) plus getUserMedia with chromeMediaSource 'desktop' (renderer/capture.js:22). Screen/window video capture, same class as OBS or Discord Go Live. Mac captures the whole screen.
ocr_method: tesseract.js 7 with the bundled English model; digit/count fields use custom logistic-regression templates (src/vision/digits.json "about": "Item count digits ... logistic regression ... Trained on labelled screenshots").
native_calls (src/winrect.js, via koffi, lines 13-60): user32 GetWindowRect, IsWindow, IsIconic, GetForegroundWindow, GetAncestor, GetWindowTextW, GetWindowLongPtrW (WS_EX_TOPMOST), GetSystemMetrics, GetWindowThreadProcessId, GetAsyncKeyState (left or swapped mouse button only, for MesoLens's own corner button); dwmapi DwmGetWindowAttribute; kernel32 OpenProcess access 0x1000 (PROCESS_QUERY_LIMITED_INFORMATION) + CloseHandle + GetCurrentProcess; advapi32 OpenProcessToken(TOKEN_QUERY) + GetTokenInformation(TokenElevation) to learn whether the game runs elevated; shell32 ShellExecuteW 'runas' to relaunch MesoLens itself as admin. A PowerShell fallback does the window-rect query.
memory_access: none. Access 0x1000 is not a memory-read right.
child_process_use: winrect.js:136 (PowerShell locator), main.js:8117 (spawn installer `/S /RUN` for self-update). Other `exec(` hits are RegExp.exec.
keyboard_hooks: none. globalShortcut is imported for MesoLens's own hotkeys.

### 2.1 shop scanning
files: src/vision/shop.js, tooltip.js, icons.js, slot-icons.js; src/core/marketbook.js, deals.js, pricing.js, shopcover.js, spots.js, sweep.js
how: finds the open Player Shop item list by colour bands (BAND_RGB 202,213,223; width 253 px at default UI scale; SELECTED_RGB 251,167,46), OCRs name and "<qty> for <mesos> mesos" per row, matches item icon + tooltip stats to a DB key. Location (channel, Free Market room) comes from the minimap title (src/vision/minimap.js; misread guards for FM rooms near main.js:3300) and the Change Channel window (src/vision/channel.js: channel = position of the blue button in the grid, no text read).
snapshot_shape (main.js:7197): { t, ch, room, owner, title, rows, full } where owner = seller IGN and title = shop title as seen on screen; rows = item key, qty, price each, stats when read, sold-out marker.
local_store: market/book.json, market/deals.json, market/looks-YYYY-MM.jsonl, market/outbox.jsonl (src/data/market.js header comment).
badges: overlay windows (renderer/badges.js/html) draw Great deal / Fair / Above market / Overpriced beside each row; hover cards via renderer/card.js and peek.js.
sweep: src/core/sweep.js is bookkeeping ("You do the walking and the opening; this only keeps count"). The Free Market sweep is a Dev-mode feature (src/core/devmode.js).

### 2.2 boss tracking
files: src/vision/pickup.js, src/data/market.js (postBossKill), main.js
how: field boss kills detected from the on-screen pickup/EXP message (`how: 'exp'`) or the player pressing "Killed now" (`how: 'manual'`); channel from the channel reader.
upload: POST {hub}/v1/boss/kill body {boss, ch, at, how}, Bearer account token required (market.js:106-120).
download: GET {hub}/v1/spots returns `bosses: [{boss, ch, at, n}]` (n = players who saw it) for shared timers. Privacy text says kept one day.

### 2.3 loot / pickup scanning
files: src/vision/pickup.js, expbar.js, hpmp.js, stats.js, buffs.js, quickslots.js, inventory.js; src/core/grind.js, potcount.js, inventory.js, wallet.js
how: reads the bottom-right pickup messages ("You have gained mesos (+31)", EXP, items) from the screen, follows each line across checks so it counts once, parses {mesos}|{exp, bonus}|{item, qty}. Inventory/equipment/quickslot windows are read the same way (digit models).
sharing: grind data stays local unless the user opts into rankings (POST /v1/rank, /v1/rank/forget: name, job, level, per-grind figures) and /v1/maprate lookups. The client does not upload raw pickup lines.

### 2.4 other readers
chat.js: megaphone lines (gold/pink/cyan) read from the chat box by colour, with player name and channel badge. smega.js stores posts locally (userData/smegas.json) and raises alerts. No hub upload of megaphone posts found in the client. UNVERIFIED server side.
others: minimap.js, quest.js, crafting.js, titlememo.js, screen.js, equipment.js, icon-finder.js (+ workers for parallel icon matching).

## 3. data flows and hosts (proven from source)
hub_host: dazzling-rhinoceros-791.convex.site (package.json mesolens.hubUrl; market.js BUILTIN_HUB; MESOLENS_E2E_HUB override only with an env var)
client_auth: Bearer account token (settings.accountToken) + `x-mesolens-version` header; optional `x-hub-key`.
endpoints_seen_in_client (/v1/...): snapshots, stats, spots, shops, myshop, boss/kill, feed, niadata, sweep, maprate, rank, rank/me, rank/forget, item, report, app, app/download, applink/poll, installcode/redeem, account/{signup,verify,login,logout,me,forgot,reset,resend,delete}, portal, checkout, creator; admin/*: check, overview, accounts, account, tier, lookup, reports, report, creators, creator, app, download, outside.
upload_snapshots: src/data/market.js flush() ~316-330. POST /v1/snapshots, gzip body {install, app:'MesoLens', snaps:[...]}, batches of 100, only if settings.hubShare is on. Contains seller IGN, shop title, channel, room, item rows, prices (matches their privacy page).
upload_myshop: POST /v1/myshop when the user opts into "Show my shop": character name, shop title, room, channel, a few items (shown to other signed-in users).
upload_boss: see 2.2. upload_rank: opt-in only.
upload_hello: checkUpdate() main.js:8123-8140. Every 6 h, GET /v1/app with anonymous install id + version, only when hubShare is on.
upload_problem_report: POST /v1/report {install, version, text, email, zip(base64)}; zip = mesolens.log + settings and, if ticked, screenshots (main.js:8262-8285, problemZip).
download_stats: GET /v1/stats?since= (prices from everyone), /v1/shops (live shop spots; paid tiers), /v1/spots, /v1/feed (every 10 min, "independent market data partner"), /v1/niadata (meowdb-derived quests/drops), /v1/maprate.
rate_limit_and_scrape_watch: main.js:1244 comment: "the server's watch for scripts counts these downloads". Privacy page: per-account lookup counts, IP + program + version logged 30 days, email alert on suspected scraping.
other_hosts_contacted_by_client: osmsdataexplorer.com (data/api/v1/ meta.json + changed files, images), maplestory-classic.com (market.json, monster drop pages; src/core/drops.js says robots.txt allows), download.mesolens.app (installer; gated), mesolens.app and discord.gg (links). Dev-only: maplemarket.fyi (section 5). Link allowlist main.js:83: mesolens.app, maplestory-classic.com, osmsdataexplorer.com, meso.watch, meowdb.com, maplemarket.fyi, mapleclassic.wiki, github.com, discord.gg, discord.com, shinybanditguide.pages.dev.
no_third_party_analytics: no analytics/crash SDK in dependencies or URLs.
local_secrets: tokens kept via Electron safeStorage (imported); not reviewed in detail.

## 4. update channel (risk surface)
mechanism: checkUpdate() GET /v1/app returns {latest, url, notes, min, sha256, size, file|gated}. Download is gated by account. The client downloads (main.js:8075), computes SHA-256 (8078-8093), compares it with the value the SAME server supplied, then spawns the installer silently: `spawn(f, ['/S','/RUN'])` (8117). `min` forces an "Update required" screen and the server refuses older versions.
implication: no independent signature pin in the client (hash and file both come from the operator's server). Any future build can change behaviour, so every conclusion here is about 0.3.69 only. Normal for auto-updaters; capability, not evidence of intent.
dev_publish_path: main.js:9430-9476 Dev > Release uploads a file + sha256 via /v1/admin/app with an admin key.

## 5. dev-only and sourcing notes
devmode: src/core/devmode.js. Unlock needs a dev key checked against a salted scrypt hash, or the hub admin key (/v1/admin/check). No key recovered; do not try to.
mapleMarket_sync: src/data/mmsync.js + src/core/maplemarket.js + main.js:6988-7060. In a MesoLens window signed in to maplemarket.fyi (separate session partition `persist:maplemarket`), it requests each item page + chart (RSC) at >= 1.5 s spacing (honours 429/Retry-After); tiers: top 100 hourly, next 400 every 6 h, rest daily; POSTs summaries to the shared DB at /v1/admin/outside. Comments claim MapleMarket's owner shares this through the site, not a feed. Unverified.
niadb: src/data/niadata.js. The server reads meowdb.com "at NiaDB's pace, with their permission" and redistributes via /v1/niadata; src/data/npc-shops.json is bundled "with NiaMeowDB's permission (2026-10-28)" per THIRD-PARTY-NOTICES.md. The meowdb owner can confirm or deny.
market_data_partner: main.js:1198-1260. "Independent market data partner" feed every 10 min, anonymous by request. Source unknown.
license_issue: THIRD-PARTY-NOTICES.md says maplestory-classic.com data is CC BY-NC-SA 4.0 (non-commercial only) while mesolens.app sells monthly tiers ($5/$10/$20).

## 6. did it take our stuff?
strings_absent_in_their_app: scumlord, turbosauce, workers.dev, mesowatch (meso.watch appears only in the link allowlist), mesoindex, cozy.markets, classicrank, maplestory.market, maplestory.quest, maplestory.watch, kerning.gg, mesoarbitrage, claude, Glorg, canary names (see scripts/canary.py).
exact_line_overlap: 0. Method: all .js/.html/.css under resources/app excluding node_modules/vendor, lines >= 45 chars after whitespace/comment-prefix normalisation, vs every .js/.py/.html/.css/.md in our repo except dist, data, fixtures, vendor, node_modules, files > 3 MB.
vision_models: own trained digit models; our tracker uses a different layout (tracker/core/shopread.js, chatlines.js, feetfind.js, ...). Numeric weights not compared.
exp_table: src/core/exptable.js levels 1-49 cites maplestory-classic.com's EXP calculator and matches OSMS values we also use; shared upstream, not evidence of copying us.
shared_upstreams: OSMS Data Explorer, meowdb/NiaDB, Minerva (MIT). Feature overlap with our tracker is explained by common sources and genre.
conclusion: nothing in the 0.3.69 client ties it to our repo. Any copying would be of ideas/features or of data via the server side, which this review cannot see.

## 7. what could not be determined, and why
gap_server_side: Convex functions and DB are not in the client. Only the self-hostable server/hub.js (client copy) was read; production may differ.
gap_stock_electron_diff: MesoLens.exe (246 MB) not byte-compared to stock Electron (no official build to compare offline). A tampered Electron binary is unlikely but unchecked.
gap_node_modules: koffi native binaries and tesseract wasm not decompiled; only names and package-lock reviewed. koffi can call any DLL, but the only call sites are in src/winrect.js.
gap_canary_test: build predates canary.
gap_chat_upload: no hub upload of megaphone posts found by grep; a dynamic path was not traced end to end.
gap_account_flow: src/data/account.js (Clerk-backed sign-in, applink/poll device flow) skimmed, not fully traced.
gap_mac_build: macOS zips not obtained.
gap_site_assets: help/*.webp|gif screenshots not compared with our images.
gap_runtime_behaviour: no dynamic analysis (out of bounds). Real upload cadence, the partner feed contents and hidden server-controlled settings can only be seen by running it in a sandbox.
gap_binary_resources: resources.pak, ICU and LICENSES are stock Chromium; not examined.

## 8. ideas for Glorg
idea_1_canary_retest: after any new MesoLens version, diff resources/app against this report's file list and sizes and re-grep for the names in scripts/canary.py CANARIES, in the app and in public hub responses. Their rankings page (https://dazzling-rhinoceros-791.convex.site/rankings) is public.
idea_2_version_tracker: poll https://mesolens.app/download (data-files JSON has version and size) and flag changes. The installer itself is gated (401 without a session).
idea_3_hub_surface: with Danny's OK, note the unauthenticated behaviour of GET /v1/health and /v1/app on the hub (counts, latest-version record). No credentials, no admin endpoints.
idea_4_partner_feed_origin: compare the anonymous /v1/feed partner against bot-fed sources (mapleclassicprices.com, meso.watch, mesoindex, cozy.markets) by record shape and timing, if a feed sample ever comes from a legitimately installed copy.
idea_5_room_precision_watch: if meso.watch/mesoindex suddenly gain channel/room precision, check whether MesoLens users are their source.
idea_6_license_note: maplestory-classic.com is CC BY-NC-SA; Danny may mention the commercial use to that site's owner. Not for us to publish.
idea_7_our_exposure: keep scripts/canary.py rotating monthly (log dates in docs/ai/external-sites.md); with Danny's approval add a canary to the tracker server's public API responses.
idea_8_hash_table: record installer_sha256 per version so a changed binary under the same version number is detectable.
idea_9_out_of_scope: do not brute-force the dev key or probe /v1/admin/*.
idea_10_cv_line_check: MesoLens uses OpenProcess 0x1000 for elevation checks. Grep tracker/ for koffi/ffi/OpenProcess so we can state our own CV-only line accurately.

## 9. cross-references
mapleclassicprices: docs/ai/external-sites.md line "2026-11-01 mapleclassicprices.com". That review: one-person Windia FM price index on Vercel + Supabase, fed by user-run "FM Sniper" bots, planned paid API, no canary or wording overlap. How its bots read the game is OPEN. MesoLens is a comparison point: it reads shops by screen capture (2.1) and uploads seller IGN + room + channel. Compare record fields (item, price, qty, seller, ch, room, time) before assuming the two are related.
sen_context: Danny's concern is a Sen-style botnet. In 0.3.69 there is no code that attaches to the game, injects, or sends input, and no C2. Distribution is account-gated with per-download tokens, so the operator gets download telemetry on every installer recipient.
decisions_to_log (if Danny agrees): 2026-11-01 (Danny): MesoLens investigated; canary trap shipped; no contact, no public accusation.

## 10. evidence index (paths relative to resources/app unless noted)
main.js:83 allowed link hosts
main.js:1198-1260 market data partner feed
main.js:1462,1499,1500,1884,9675 desktopCapturer
main.js:5608 sendInputEvent into own window
main.js:6988-7060 MapleMarket sync window
main.js:7197 shop snapshot shape
main.js:8075-8117 update download, sha256 check, silent installer spawn
main.js:8123-8140 hello ping
main.js:8262-8285 problem report upload
main.js:9430-9476 dev release upload
src/winrect.js:13-60 all native calls
src/data/market.js:~106-120 boss kill upload; ~316-330 snapshot upload
src/core/installcode.js whole file: filename token
src/vision/{shop,chat,pickup,channel,minimap}.js headers
THIRD-PARTY-NOTICES.md (installer root) credits and licences
README.txt (installer root) install and privacy claims
package.json hubUrl
server/hub.js header comment lists the hub API
