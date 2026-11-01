# MesoLens teardown (public surface), 2026-11-01

Investigation requested by Turbozo 2026-11-01 15:41Z ("do a deep investigation into this tool, see what you can find, it's been reported they're stealing from us. use REA"). Everything below is from their public pages, their public API and our repo. The installer is account-gated, so the binary itself is the one thing not analyzed yet; REA 6.8.0 is installed in the sandbox and ready for it.

## What MesoLens is

- Screen-reading overlay for MapleStory Classic World, v0.3.69 (Windows installer 112 MB + Mac beta). Reads the screen like a stream does, never touches the game (their framing). Site https://mesolens.app, downloads on https://download.mesolens.app.
- Features (their marketing + screenshots): shop price badges on every listing ("Overpriced +84% / Above market / Great deal / Fair", item "worth" values), own-shop pricing advice ("You could ask more · sell 30K · you 24K · usual 30K · quick 27K"), deals log, live shop spots and "where it's listed now" (paid tiers), EXP/mesos grind card ("93K EXP/h", "Lv up in 1h15", "Net +12K", "no pots", progress % of level, Stop/Pause), quest helper (item counts per quest, e.g. "Vicious in Need 75/20 Tree Branch"), map/monster guide with portal-by-portal steps ("Ant Tunnel I · +20K EXP/h · 22K/h drops"), field boss kill sharing with a "Killed now" button, weekly EXP/mesos-per-hour rankings.
- Monetization: free tier + Supporter $5 / Merchant $10 / Tycoon $20 monthly (Stripe), streamer creator codes (20% off, partners), "earn it" free week by opening shops. Terms dated 2026-10-31.

## Who runs it

- Terms of use: "MesoLens, run by Ramy Loutfy, sole proprietor, 2-3631 rue Fénelon, Montreal, Quebec H2A 1M9, Canada". Contact info.mesolens@gmail.com. "Made in Quebec" in the footer.
- Discord guild "MesoLens" (invite discord.gg/yjwBDuEzC8): 3 members, inviter "spiritorix". Their public rankings show 2 players this week (#1 "Spiritox", Bandit Lv 44). Very young/small operation.

## Infrastructure (mapped, no auth bypassed)

- Cloudflare in front of everything; `download.mesolens.app` is a Worker that returns 401 for every artifact without a Clerk session (installer, Mac zips, `latest.yml` all gated; the app's Update button opens `mesolens.app/download?update=1`, so updates go through the site too).
- Auth: Clerk (`clerk.mesolens.app`, `accounts.mesolens.app`, sign-in by Google or email code). Backend: Convex (`dazzling-rhinoceros-791.convex.site`). Payments: Stripe.
- Public API surface found: `GET /rankings` (HTML), `GET /v1/rankings?board=exp|rate|mesos...` (JSON, no auth). App/web APIs (Bearer Clerk token required): `POST /v1/web/{me,applink,cancel,delete,download,pause,portal,profile,resume,subscribe}`. No other route answered.
- Published installer SHA-256: `54578be3e5c9f6a7d7717f23e28f23294d7da7814274d18c86ec97e73e5454b6` (Windows, 0.3.69).

## What their terms/privacy say (2026-10-31 versions)

- They collect: shop listings WITH seller character name, shop title, channel and room (shown to other players to find the shop), field boss kills (kept one day), grind data for opt-in rankings, per-account daily lookup counts, and IP/version security records kept 30 days with email alerts "if that looks like a script copying the database".
- Terms: "Don't copy the shared database: no automated downloading, scraping or getting around the daily limits." One account per person; don't share installers or download links.
- Data sources they cite for game data: OSMS Data Explorer (CC BY 4.0, attributed) and maplestory-classic.com. No reference to us anywhere.

## The theft question, evidence so far

Checked, and found NOTHING on any public surface linking them to us or our data:

- Zero mentions of `mesolens` in our repo; zero mentions of `mesolens.app` in any public GitHub code (search API, 0 hits).
- Zero forks of `TurbosauceDev/MS-Classic-World-Info-Slop` on GitHub.
- Their public pages/JS contain none of our identifiers: no `scumlord`, `workers.dev`, `maplestoryclassic`, `kpq`, `clanker`, `glorg`, `meowdb`, `meso.watch`, `mesoindex`, `maplestory.watch`, our OSMS pin `7e1c4eb`, `busyPct`, `shotFuzzy`, `kpqscore`.
- No marketing text lifted from our site: our phrases vs theirs ("Know what every item is worth...", "Never miss a deal", "portal by portal", "the moment you open a shop") are not in our repo; the only shared phrase is the generic "time to level".
- Their UI is its own look (navy/orange, Nunito font), not our Elv or glass skins. Feature overlap (shop price overlay, EXP/mesos per hour, net-after-potions, boss timers, quest tracking) is genre-wide: GitHub lists a dozen MS-Classic screen-reading trackers updated this week, several openly "vibecoded".

What public evidence CANNOT answer (the binary and our logs can):

1. Whether their Electron app embeds our code. License context (updated 2026-11-01): Danny licensed the repo under PolyForm Noncommercial 1.0.0 in `9cacacf` (LICENSE, NOTICE.md, README, decision logged in PR #35). Before that the repo had no license at all (default all-rights-reserved), so a copy made before or since and shipped inside a monetized product ($5/$10/$20 tiers) would violate PolyForm Noncommercial 1.0.0 either way; copied code would still carry our strings (changelog text, card names, function names, `Clanker Chic`, preset codes) for REA to find.
2. Whether their client or backend pulls from our endpoints (`/api/summary`, `/api/shop`, site price data in `index.html`, KPQ boards) to seed their "shared price database".
3. Whether their price data is home-grown (they have ~2 ranked players, so a real FM price DB either took months of their own users or came from somewhere else).

## What we need to go further

1. **The installer** (the decisive artifact): anyone with an email can make the free account and download `MesoLens-Setup-0.3.69.exe` (112 MB, SHA-256 above; verify the hash after download). Drop it in `upload/` and REA (installed) tears it down: asar unpack, endpoint/identifier scan against our repo strings.
2. **The specifics of the report**: what exactly was reported as stolen (data, code, wording, a screenshot?), and where it was reported. It narrows the search to a concrete artifact.
3. **Our side (Danny)**: Cloudflare dashboard for the Worker and the Pages site, filter by UA/IP for their client or Convex IPs hitting `/api/*` or the site data. That answers the data-siphoning question directly from our logs. The owner panel at `/admin` (needs Danny's key) shows the same traffic.

## Posture notes (while we're here)

- License settled 2026-11-01: PolyForm Noncommercial 1.0.0 (`9cacacf`) means any commercial use of our code, including inside MesoLens's paid tiers, needs Danny's written permission. That turns "did they copy our code" from a moral question into a license check REA can settle.
- Our server already rate-limits what matters and the blind-spot batch added watchdogs; if CF logs show scraping, a UA allowlist or turnstile on `/api/*` is the next step. Mirror of their own rule: they ban "copying the database" too.

## Second pass: GitHub/GitLab hunt (2026-11-01 ~16:35Z)

Question from Turbozo: "you found their github?" Answer: **no public MesoLens code exists to find.**

- GitHub repo search `mesolens` / `meso-lens` / `maplestory mesolens`: 6 hits, all the UK microscopy company's lab software (JanSchniete, johndempster, 2015-2026) — unrelated.
- No GitHub user/org for `mesolens`, `rloutfy`/`ramyloutfy`, or `spiritorix`. Handles `SpiritOx` (2021, profile-config repo only) and `spiritox000` (created 2026-01, zero repos) match the name style but have nothing published.
- GitHub code search across all default branches: 0 hits for `mesolens.app`, their Convex host `dazzling-rhinoceros-791`, `clerk.mesolens.app`, or `info.mesolens@gmail.com` — nobody public is carrying their code.
- Their site links no git host anywhere (only the Discord invite).
- Their Convex-hosted public rankings (HTML + `/v1/rankings` JSON boards exp/mesos/rate) re-scanned against our identifiers: clean. Their data model is its own (branch/job/level/map/hours/value/week) and the whole ranked universe is 2 players (Spiritox Lv44 Bandit, "39" Lv39).
- GitLab API sweep attempted from the sandbox; response not reachable as JSON — unresolved, low relevance.

Conclusion: nothing public to diff, so the installer stays the decisive artifact (Danny's free account → `MesoLens-Setup-0.3.69.exe`, verify SHA-256 above, drop in `upload/`, REA tears it down). If anyone has actually been shown a MesoLens GitHub link, hand it over and it gets the same teardown.

## Third pass: the installer, torn down (2026-11-01 ~19:15Z)

Turbozo delivered the installer via Google Drive (re-shared "anyone with the link" after the first link bounced anonymous visitors to Google sign-in; datacenter-IP enforcement or a Restricted share — same wall family as Clerk). Full attempt log in the sandbox worklog. Nothing was executed; everything below is static analysis of the extracted payload.

Artifact: `MesoLens-Setup-0.3.69.exe`, 117,847,712 bytes, SHA-256 `54578be3e5c9f6a7d7717f23e28f23294d7da7814274d18c86ec97e73e5454b6` — **exact match** with the hash their download page publishes, so this is the same binary every user gets. NSIS 3.09-4 64-bit (p7zip 16.02 can't open it; 7-Zip 25.01 static binary works). Payload: 494 files, 419 MB. Electron 44.7.0. The app ships as a plain `resources/app` directory — no asar, no obfuscation, readable JS throughout.

Heads-up for Turbozo: the installer's **file name carries a 24-char one-time sign-in token tied to the downloading account** (`src/core/installcode.js`, redeemed via `POST /v1/installcode/redeem`; the installer also records its name + download HostUrl in `installed-from.txt`). So a MesoLens installer identifies who downloaded it. The token is in the file name you uploaded to Drive — if you had not yet installed/redeemed it, anyone you shared the file with could have redeemed it. If you already installed, it is burned. Do not re-share future installers with the token intact (zip it or rename it, and note the name leaks in Drive previews).

### Verdict: no theft of ours in 0.3.69

Cross-checked against the parallel report (`docs/ai/mesolens-glorg-report.md`, Danny's local Claude, 2026-11-01 18:11Z). This pass is an independent confirmation with its own tooling; where both passes agree, that is stated.

1. **Identifier/canary sweep (independent, scripts/mesolens_installer_scan.py):** 367 files scanned, full-tree, UTF-8 + UTF-16LE. ZERO hits for: scumlord, turbosauce, MS-Classic repo marks, `busyPct`, `shotFuzzy`, `kpqscore`, `Clanker Chic`, classicrank, maplestoryclassic, OSMS pin `7e1c4eb`, workers.dev, and every canary word (Brindlewick, Tidewarden, Moss Snail, CANARY-V1, lantern shard, ear loop, chocolate chip cookies). Only hits: `meowdb` ×36 and `msclassic` ×11 — **all of them `meowdb.com/msclassic/…` URLs**, i.e. NiaMeowDB's community DB, a shared upstream our own repo also fetches (`scripts/fetch_meowdb_*.js`, `data/sources/meowdb_*.json`, `meowdb-market-poll.yml`). Their notice file documents meowdb permission granted 2026-10-28/29. Not ours, not theft.
2. **Our domains (independent grep):** zero hits for workers.dev, scumlord.*, mesoindex, classicrank, maplestoryclassic.com, maplestory.watch, mesoarbitrage, cozy.markets, kerning.gg. The single our-adjacent string in the whole binary is `meso.watch` in the in-app click allowlist (main.js:83) — a community price site, innocent. **The client cannot talk to our endpoints at all**: its hub is hardcoded to `dazzling-rhinoceros-791.convex.site` (package.json `mesolens.hubUrl`), and every game-data sync targets osmsdataexplorer.com, maplestory-classic.com, and meowdb.com via their own hub.
3. **Code overlap (independent, scripts/mesolens_overlap_check.py):** 12,161 unique normalized long lines (≥45 chars) from their JS/HTML/CSS (node_modules/vendor excluded) vs 29,678 from our repo (dist/data/fixtures/vendor excluded) → **0 exact matches**. The parallel report got 0 over 11,649 lines with a second method. PolyForm Noncommercial is therefore not implicated — there is no evidence our code is in there.
4. **No memory reading, no injection, no game input, no C2:** koffi FFI is confined to `src/winrect.js` (window rects, elevation checks; `OpenProcess 0x1000` = PROCESS_QUERY_LIMITED_INFORMATION, not a memory right). Screen reading is Electron `desktopCapturer` + tesseract.js OCR with self-trained digit models. No `SendInput`/hooks against the game, no raw sockets, no remote eval: every `executeJavaScript` targets MesoLens's own windows with local data; the only external `loadURL` is maplemarket.fyi (dev-mode sync).
5. **Canary: untestable on this build.** Payload files are dated 2026-11-01 02:41Z; our canary shipped 15:49Z. If they were scraping our site, only a *later* build could carry the strings. Re-test on the next release (their update flow: server supplies both file and hash, then silently spawns `/S /RUN` — every verdict here is per-build). Watch `https://mesolens.app/download`'s version JSON.

### How their "shared database" is actually seeded (answers first-pass Q3)

Their THIRD-PARTY-NOTICES.md is a complete sourcing confession, with permission dates:

- **OSMS Data Explorer** (CC BY 4.0): items, monsters, maps, NPCs, recipes, quests — incremental sync every few hours.
- **maplestory-classic.com**: FM `market.json` + monster drop tables. Their own notice says this data is MapleClassic Wiki under **CC BY-NC-SA 4.0 → non-commercial only** — while they charge $5/$10/$20 monthly. That is a real license exposure, but it is between them and maplestory-classic.com's owner (and ultimately MapleClassic Wiki); not our lever. Danny may mention it to that site's owner if he wants; do not publish accusations ourselves.
- **NiaMeowDB** (meowdb.com): NPC shop DB bundled (`src/data/npc-shops.json`, "copied 2026-10-28"), FM summaries read server-side at ≤1 req/10 s "with their permission (2026-10-29)".
- **MapleMarket** (maplemarket.fyi): one week of FM listings (2026-10-22→29, with channels/rooms/sellers) merged once, "with its owner's permission".
- **Anonymous "independent market data partner"** (main.js:1198-1260): a feed the hub re-serves every 10 min; partner asked to stay anonymous; source undisclosed. The one open question.
- **Their own users**: opt-in shop scans upload seller IGN + shop title + channel + FM room in batches of 100 (`POST /v1/snapshots`, gzip, only while `hubShare` is on). Boss kills, grind rankings, myshop: all opt-in, matches their privacy page.

So the price DB is accounted for by legitimate upstreams + their user base. No need for our data to explain it.

### Remaining blind spots (unchanged from the parallel report)

Server side (Convex functions/DB) is invisible; the partner feed's origin is unknown; production hub may differ from the self-hostable `server/hub.js` shipped in the client. Their server watches per-account download counts and emails the operator on "suspected script copying the database" — so hub probing stays minimal and manual, if ever. Dev mode is scrypt-hashed; do not brute-force it (also: pointless).

### Bottom line

The theft report, as of 0.3.69, **does not hold against our repo**: no our code, no our data, no our wording, no contact with our endpoints. The operation itself is exactly as young/sloppy as assessed earlier (solo proprietor in Montreal, 3-member Discord, 2 ranked players), but the client is an honest, unobfuscated screen-reader whose data story checks out. Keep the canary live, keep `scripts/canary.py` rotating, re-run the identifier sweep on the next MesoLens release, and if CF logs ever show their Convex/Worker IPs on our `/api/*`, that becomes the actual case — nothing in the binary suggests it today.
