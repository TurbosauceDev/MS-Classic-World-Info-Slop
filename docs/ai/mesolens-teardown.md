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
