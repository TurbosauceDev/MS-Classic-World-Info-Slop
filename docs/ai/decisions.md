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

## Data sync (meso.watch → GitHub)

- 2026-10-19 CSV ingest of meso.watch into `data/sources/mesowatch_csv/` is sanctioned; Danny is friends with the meso.watch team and has verbal OK. Don't extend to per-item sales ledger or model training without checking.
- 2026-10-19 Use side branch `data/mesowatch-sync` for the CSV push, NOT `claude/trusting-bell-fqgar6`. Avoids wasteful Pages/CI rebuilds and racing Danny's active pushes to the default branch.
- 2026-10-19 Push via Git Data API only (no clone). force=false, retry on 422 race. Token in `/home/z/my-project/.secrets/gh-token` (fine-grained, scoped to this repo, Contents:write). Rotate via GitHub UI + overwrite the file; don't paste in chat.
- 2026-10-19 Standing push/publish approval for CSV refreshes only — "i trust what we're doing here. i want our mesowatch item pricing to always be fairly accurate." (Danny). Still honor the in-thread `push` rule for anything else.
- 2026-10-19 Poller is on-demand ("refresh" in chat), not scheduled. No cron/systemd in Danny's CLI sandbox. If Danny wants persistence, he copies the scripts to his own box and runs them on cron.
- 2026-10-19 Two endpoints tracked: `data/market.json` (~daily, full pricing snapshot) and `data/fresh/Classic%20World.json` (~15 min, live FM listings). Each only triggers a CSV rewrite when its own `generated_at` advances — they update on different cadences.
- 2026-10-19 localStorage is the transport between agent-browser's JS eval and the bash script. Blob-URL downloads dropped silently on the second invocation (Chrome bug, see handoff doc).
