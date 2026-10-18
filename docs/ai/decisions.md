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

## Tracker and server
- 2026-10-17 Build the screen reader anyway (no official Nexon rule found); it reads pixels only, no memory, files or input.
- 2026-10-18 Release only on his "release", push only on his "push"; bundle small fixes into one release. He updates in-app.
- 2026-10-18 Sharing is opt-in; the UI must not call it "anonymous" (it feeds leaderboards).
- 2026-10-18 Themes: brighten purple a little, several colorways, editor with share codes (shipped 0.2.43).
- 2026-10-18 KPQ Bonus/Rush is a label he picks; rounds before 0.2.40 can't be backfilled to the KPQ leaderboard.
- 2026-10-18 Tracker default theme is "Default" = the site's colours exactly (follows Windows light/dark); Lilac, Henesys, Perion sand toned down from "flash bang" white.
