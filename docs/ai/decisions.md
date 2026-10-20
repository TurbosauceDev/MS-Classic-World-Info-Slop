# Danny's decisions (search before proposing)

One dated line per call Danny made. `grep -i <word> docs/ai/decisions.md` before suggesting a feature, a default or a
removal. Add a line (newest at the bottom of its section) in the same push as the work. Backfilled 2026-10-18 from
project memory; older dates are the day the call was recorded.

## Process
- 2026-10-06 Data comes from the OSMS game-file export; Classic World only, launch content only (no Orbis, El Nath, Forgotten Hollow, 3rd job unless asked).
- 2026-10-07 Pushing to the default branch is production; needs his in-thread "push" (he OK'd direct pushes 10-07, a guard may still ask).
- 2026-10-18 Terse replies, no filler; push back when wrong. Token-hungry asks (audits, rewrites, broad research) get a cheaper alternative first.
- 2026-10-18 One feature per thread, close it when shipped; a new tracker feature gets a fresh thread.
- 2026-10-18 Every number cites a source (OSMS, meowdb, maplestory.quest, meso.watch, docs/notes.md, his screenshots); estimates say so.
- 2026-10-18 Outside specs and handoffs are idea lists only: verify every number against our data first.
- 2026-10-18 Every real bug becomes a test or fixture; automated tests in CI over Claude audit passes.
- 2026-10-18 Hand-off: threads read CLAUDE.md, their area page and this file first, and leave 2-3 lines on the area page plus dated decisions here in the same push.
- 2026-10-18 Prediction-vs-real-runs check for Where to train: later, not until there are users.
- 2026-10-18 Don't ask again unless he raises it: mapleexp leaderboard export, 2nd job Bowman stat window, scroll odds calculator (not interested).

## Data and sources
- 2026-10-06 Quest-item drop rate assumption 30% per kill (15% "cautious"); no real drop rates exist anywhere.
- 2026-10-08 Loot income assumption 5% per kill (he called 15% too optimistic); 10%/15%/off selectable; always labelled an assumption.
- 2026-10-13 mapleexp.com drops are CMS v79 (China), not Classic: never use them. Its EXP table to Lv 100 is fine.
- 2026-10-18 Magician 1st job is Lv 10 in Classic ("its 10 now"), not the pre-BB 8.
- 2026-10-18 meso.watch: never bypass its Cloudflare check; refresh only from the dev CSV he drops in chat.
- 2026-10-18 Where to train uses OSMS per-map `mob_capacity`, not meowdb's 75%-of-spawns guess.
- 2026-10-18 Builder screenshot import counts gear at base stats ("average drop").
- 2026-10-18 Daily shared-data.yml job may commit shared tracker runs to the default branch.
- 2026-10-18 beanguri's overlay: MIT reader ideas only; their shared data/API needs their permission.
- 2026-10-20 "You can trust everything from OSMS": OSMS Data Explorer formulas (client-read and its capture-fitted mesos/party EXP) override meowdb/COT2 numbers.

## Site
- 2026-10-08 Clicking a map name opens its World Map card, not the Map Navigator (directions live behind "Route here").
- 2026-10-08 Home is the landing page; site split into categories with a second row of page buttons.
- 2026-10-08 Items tab "Has a known source" filter on by default.
- 2026-10-09 World Map: the card changes only on click; hover shows a small label. Never hover-to-select (it disrupted him).
- 2026-10-10 World Map "Undervalued maps" stays vibes: never tie it to the planner, class or level.
- 2026-10-17 "The List" (KSers) tab removed ("im over it"), changelog entry too; don't re-add.
- 2026-10-18 Home cards expand into a "billboard" on click: chill look, no ad banner. Grind Tracker section first after Home.
- 2026-10-18 Small cute in-game sprites on Home card headers and on each billboard link; not flashy, not big.
- 2026-10-18 Grind Tracker page may fetch the live /api/summary (the one exception to "no external requests").
- 2026-10-18 EXP/hr calculator: screenshot-pair time fill and share-as-image card OK'd.
- 2026-10-18 Share links extend the existing `#key=value&` hash; no new scheme. Search: Ctrl+K or `/`, @prefixes.
- 2026-10-18 Universal Back/Forward buttons, tied to the browser Back/Forward: step through pages and places inside a page.

- 2026-10-19 Senpai House report ideas: build cheapest-live-listing for non-equipment only (ignore rolls/scrolls), price trend, sell-through tags, tracker rough-price marks, Builder avatar. Relying on maplestory.io live at runtime is OK ("a fundamental site for the community").
- 2026-10-19 Never use maplestory.market / classicrank.com data (bot + packet-sniffer sourced, no permission).
- 2026-10-19 Cheapest listing shows "Listings updated X ago" (worked out in the browser), not a UTC time.
- 2026-10-20 FM Sniper page (Mesos and Trade): live listings vs the meso.watch median, sort by mesos under or % of value; under 100% = deal, over 100% = not a deal or a sign the price is rising with demand (marked "rising" when meso.watch's trend is up). Built overnight on his OK to push and publish.
- 2026-10-20 FM Sniper round 2: Danny approved every idea in reports/fm-sniper-ideas-2026-10-20.md (NPC flag, flip, shopping trip, crafting flips, targets + alerts, sell helper, movers, mood, volatility, presets, keys, needed by me) and deal lifetime stats (from the poll's git history). Discord pings deferred ("later"); phone push: remind him later. Pipeline asks (all listings, seen time, askMedian, history) approved, routed via Danny.

## Tracker and server
- 2026-10-17 Build the screen reader anyway (no official Nexon rule found); it reads pixels only, no memory, files or input.
- 2026-10-18 Release only on his "release", push only on his "push"; bundle small fixes into one release. He updates in-app.
- 2026-10-18 Sharing is opt-in; the UI must not call it "anonymous" (it feeds leaderboards).
- 2026-10-18 Themes: brighten purple a little, several colorways, editor with share codes (shipped 0.2.43).
- 2026-10-18 KPQ Bonus/Rush is a label he picks; rounds before 0.2.40 can't be backfilled to the KPQ leaderboard.
- 2026-10-18 KPQ board shows character names (his round = Turbow). Separate boards: Rush = fastest to beating King Slime;
  Bonus = EXP + mesos gained (more Bonus time = faster Rush, already in the gain).
- 2026-10-18 KPQ name off = a fixed made-up name (1st job + 4 digits, e.g. Archer4821), never blank.
- 2026-10-18 Tracker settings live in a Preferences popup from the title bar; panel tabs are only Session, Loot, History.
- 2026-10-18 Tracker default theme is "Default" = the site's colours exactly (follows Windows light/dark); Lilac, Henesys, Perion sand toned down from "flash bang" white.
- 2026-10-18 Site gets a Theme picker with the tracker's presets and MSCT1 share codes, so both can match in any theme.
- 2026-10-18 Keep or sell lists only equips/use/monster-drop materials; quest items (403xxxx block or handed out by a quest) are always kept in-game, so they are dropped.
- 2026-10-18 Tracker run log: WoW-combat-log style, batched (every 2 s), skinny box near the run name; side-by-side docking must be obvious ("i can only move things up and down").
- 2026-10-18 Ignore the price checker's blue tube "1 not read" and the tracker's "117 on pale selected slot" misreads unless the exact same issue comes up again.
- 2026-10-18 Split big source files to make threads cheaper (Danny: "we will take every 'free' savings"); pure refactors, no behaviour change.
- 2026-10-18 Tracker main card (run name + tiles) is a movable, dockable box like the rest. Preferences renamed back to Settings, opened from File (no title-bar entry).
- 2026-10-18 Tracker Mini: compact, readable view (EXP/hr, mesos/hr, EXP gained, active and total time, time to level, run log, items, monsters, consumables), "not small for the sake of being small".
- 2026-10-18 Tracker: Dummy data button to try layouts (never saved/shared); docked boxes fill in with no empty space; run log looks like a chat box.
- 2026-10-18 Tracker: "I only buy meat and lemons" button becomes a small "Dropped potions are free" switch in the Consumables used footer (settings.meatOnly unchanged).
- 2026-10-18 Tracker Compact view: a toggle between full and Mini that hides the Session/Loot/History tabs and shrinks the window to fit.
- 2026-10-19 Tracker resize bars hidden until Shift/Alt is held; dragging the gap under a box changes its height. Mini content grows to fill a bigger window. Released on his go ("release when ready do not wait").
- 2026-10-19 Tracker layout: Fit on by default (side-by-side boxes keep their content width, rows wrap when narrow); "window height follows the boxes" is an opt-in setting. Danny: "do more than you think you have to"; push + release OK'd in advance ("push and publish everything ... when finished").
- 2026-10-19 Tracker Event log: a second log beside the run log for everything that isn't loot/EXP (map, level, deaths, party, job, pauses, KPQ, app messages); "the two logs should be readable to recreate the run, like WoW dungeon/raid logs". Status line kept as the newest message.
- 2026-10-19 Tracker party kills: EXP shares that fit several monsters are left out of Monsters killed (no "Not told apart" row; Danny: "the kill log was working seemingly perfect"); no need to count every party kill per monster, the tracker is about the player's own performance (Danny).
- 2026-10-19 Tracker KPQ: saved runs must let rounds/Bonus/next round be read straight off the log (Danny); added kpq.timeline.
- 2026-10-19 Tracker History: compare more than two runs at once and flesh out History; Danny left the extra features to Claude ("i trust you to come up with ideas"). Pushed + released on his "push" / "publish if permission needed".
- 2026-10-19 Tracker layout: a "line up every box" button (crisp shared column edges, same top/bottom per row, even gaps); auto-snap after drags is on by default (Settings > Layout to turn off). Danny OK'd push + release ("push and publish when done").
- 2026-10-19 Tracker: Session/Loot/History tabs and Compact view replaced by a pop-out Modules toolbox; drag modules in, × (or drag back) puts them away. Saved layouts migrate (nothing lost), History starts in the toolbox, Mini stays.
- 2026-10-19 Site + tracker bug hunt: Danny OK'd pushing to the default branch and publishing the artifact without asking ("you are allowed to push and publish whenever you see fit"); still rebase, test, live-check every push.

## Data sync (meso.watch → GitHub)

- 2026-10-19 CSV ingest of meso.watch into `data/sources/mesowatch_csv/` (on branch `data/mesowatch-sync`) is sanctioned; Danny is friends with the meso.watch team and has verbal OK. Don't extend to per-item sales ledger or model training without checking.
- 2026-10-19 Use side branch `data/mesowatch-sync` for the CSV push, NOT `claude/trusting-bell-fqgar6`. Avoids wasteful Pages/CI rebuilds and racing Danny's active pushes to the default branch.
- 2026-10-19 Push via Git Data API only (no clone). force=false, retry on 422 race. Token in `/home/z/my-project/.secrets/gh-token` (fine-grained, scoped to this repo, Contents:write). Rotate via GitHub UI + overwrite the file; don't paste in chat.
- 2026-10-19 Standing push/publish approval for CSV refreshes only — "i trust what we're doing here. i want our mesowatch item pricing to always be fairly accurate." (Danny). Still honor the in-thread `push` rule for anything else.
- 2026-10-19 Poller is on-demand ("refresh" in chat), not scheduled. No cron/systemd in Danny's CLI sandbox. If Danny wants persistence, he copies the scripts to his own box and runs them on cron.
- 2026-10-19 Two endpoints tracked: `https://meso.watch/data/market.json` (~daily, full pricing snapshot) and `https://meso.watch/data/fresh/Classic%20World.json` (~15 min, live FM listings). Each only triggers a CSV rewrite when its own `generated_at` advances — they update on different cadences.
- 2026-10-19 localStorage is the transport between agent-browser's JS eval and the bash script. Blob-URL downloads dropped silently on the second invocation (Chrome bug, see handoff doc).
- 2026-10-19 Cloud threads consume the poller's CSVs (scripts/refresh_mesowatch.sh); the poller itself (headless browser) stays in Danny's sandbox. Danny: "please just interact with this tool".
- 2026-10-19 Build every idea from both 10-19 bug-hunt reports except tracker #3 (new frames from Danny; later). Danny: "implement all those suggested ideas".
- 2026-10-19 Home "Site version" stamp shows the viewer's local time zone, not UTC. Danny: "I'm getting confused looking at UTC".
- 2026-10-19 Tracker profiles (0.2.61): save/switch named UI profiles (layout, box sizes, window size, theme, layout switches) and import a friend's code like ElvUI/Plater; extends MSCS1 setup codes, preview before applying.
- 2026-10-19 Site gets a version number (0.x.y like the tracker), one per changelog entry since Oct 6, shown beside the Home stamp. Site and tracker changelogs kept separate (tracker: Help > Patch notes + Grind Tracker page). Danny asked for both.
- 2026-10-19 Tracker icon: cute green slime on a purple gradient tile, not a flat fill (Danny). Danny then: use the game's sprite (like the site favicon), not drawn art.
- 2026-10-20 Tracker pop-ups (Settings, Help/F1, Patch notes, bug report): inset card over a blurred backdrop with subtle open/close animation, never appended under the layout and never resizing the window. Goal: look and feel "far too professional for what it is" (Danny).
- 2026-10-20 Ship Danny's own profile code as a built-in profile "Danny's Default" (tracker 0.2.67).
- 2026-10-20 Site favicon: keep the Orange Mushroom ("cute"), soften the corners, more interesting colour (Danny). Shipped as the tracker Slime's purple gradient tile so they read as a set.
- 2026-10-20 Default branch renamed to `main` (Danny, on GitHub); workflows, CLAUDE.md and the meso.watch scripts point at it. Enforce HTTPS on for the custom domain.
- 2026-10-20 Home footer shows meso.watch data state next to the site version: price count, sales-up-to date, live listings with relative age (Danny asked; relative time per his 10-19 call).
- 2026-10-20 Nav redesign (picked in A/B mockup rounds): Serebii-like sidebar with random per-page sprites (Home snail fixed), white outlined game-style page names (hairline + lilac glow in dark themes), big accent section titles, game-name sections (My Character, Training, Victoria Island, Maple Database, Mesos and Trade), KPQ page named "Kerning PQ", Changelog/Credits in the footer. Theme offers Basic mode and the old Two rows. All text +8%; wide-screen Page size 1-5, default 3 (82% wide, x1.15). Meso drop icons from maplestory.io MCW client (not in OSMS export).


## Architecture consolidation (chat-CLI poller → scheduled CI workflow)

- 2026-10-20 Consolidated meso.watch pipeline into one scheduled GitHub Actions workflow (.github/workflows/mesowatch-poll.yml). Cron `0,30 * * * *` fires every 30 min; fetches meso.watch via agent-browser in CI; runs fetch_mesowatch.py + build_data.py prices + build.py; commits to main as 'meso.watch helper' if anything changed; Pages redeploys via workflow_run hook. Old chat-CLI poller + side branch + mesowatch-sync.yml workflow removed as redundant.
- 2026-10-20 CI workflow uses GITHUB_TOKEN (auto-injected, no PAT in CI). OSMS data cached via actions/cache keyed on OSMS_REF — first run ~60s (cache miss + Chrome install), subsequent runs ~30s (cache hit).
- 2026-10-20 Commit author renamed from 'meso.watch bot' to 'meso.watch helper' (Danny: "the word bot is a bad look"). Historical commits force-rewritten via Git Data API to scrub 'bot' from author metadata.
- 2026-10-20 Dropped the Anthropic API dependency for commit messages. The commit-message script (scripts/mesowatch_claude_review.py) now templates from the diff locally — top movers + anomalies + live listing changes. Old Claude-API version is in git history (commit 2da935f0a955) if we want to revive it.
- 2026-10-20 Git Data API ref updates don't fire GitHub Actions push events (only git push via HTTPS/SSH or the Contents API does). The old chat-CLI poller worked around this by explicitly triggering workflow_dispatch after each push. The new CI workflow sidesteps the issue entirely by doing the fetch + build + commit all inside one workflow.
- 2026-10-20 Default branch renamed from `claude/trusting-bell-fqgar6` to `main` (Danny's call on GitHub). All scripts + workflows + handoff doc updated. Force-rewritten historical commits accordingly.
- 2026-10-20 Deleted scripts/refresh_mesowatch.sh (dead since the side branch `data/mesowatch-sync` was removed in the consolidation). The CI poller (`scripts/mesowatch-sync/mesowatch_poll_ci.sh`) calls `scripts/fetch_mesowatch.py` + `scripts/build_data.py` prices + `scripts/build.py` directly. Updated `docs/ai/site.md` (commands block + Known traps + Market data section) and `docs/ai/mesowatch-sync.md` to reflect the new architecture: prices refresh automatically via the scheduled workflow, Claude threads never fetch meso.watch themselves.
- 2026-10-20 Scroll check in Price check: read the screen, player hovers each scroll, its tooltip names it, slot ticks green (Danny's ask). Built on the site via browser screen share (no install); the tracker could reuse the reader later.
