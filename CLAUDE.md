# MS Classic World Data Slop

Planner site + Windows grind tracker for **MapleStory Classic World** (launch Oct 21 2026), built from the OSMS game-file
export. Owner: Danny (GitHub TurbosauceDev).

**Read only the doc for the area you touch:** site → [docs/ai/site.md](docs/ai/site.md) · tracker/server →
[docs/ai/tracker.md](docs/ai/tracker.md) · formulas, data schema, sources → `docs/notes.md` (grep its `##` headings, read one section).
Before proposing anything, grep [docs/ai/decisions.md](docs/ai/decisions.md) (Danny's past calls). Need a test image? Pick
it from [docs/ai/fixtures.md](docs/ai/fixtures.md) instead of opening images.

## Ground rules (Danny)
- **Classic World only.** No modern/retail info; 2008-era only if confirmed for Classic. Magician 1st job is Lv 10.
- **Launch content only.** Orbis, El Nath, Forgotten Hollow, 3rd job stay hidden unless asked.
- **No made-up numbers.** Every value cites the OSMS export, meowdb, maplestory.quest (owner's permission), meso.watch,
  docs/notes.md, or Danny's screenshots. Estimates say so on the page. Outside specs are idea lists: verify every number.
- Terse replies, no filler. Push back when something is wrong, and when Danny asks for token-hungry work (full audits,
  rewrites, broad research) offer a cheaper alternative first (a test, a targeted check).
- Every real bug becomes a test/fixture. Prefer automated tests (CI runs them) over Claude audit passes.
- One feature per thread; close it when shipped.
- **Hand-off on the way out:** in the same push as the work, add 2-3 lines to the docs/ai page for your area (what
  changed, new traps), a dated line to decisions.md for each call Danny made, and a row in fixtures.md per new test
  image. `node tests/docs.test.js` (CI: docs.yml) fails if a path or command named in these docs no longer exists.

## Token budget
- **Never read whole:** `data/data.json` (5.7 MB), `dist/index.html` (6.2 MB), `data/sources/*.json`, `vendor/`,
  image fixtures (`tests/fixtures/`, `tracker/tests/frames*/`). `.rgignore` keeps Grep out of dist/ and data.json.
  Query data with a one-liner that prints only what's needed:
  `python3 -c "import json;d=json.load(open('data/data.json'));print(d['mobs']['22'])"`.
- Big source files: grep for the symbol, then read that range (`sed -n 'A,Bp'`). Sizes and symbol-index commands are in
  the two docs/ai files.
- Images: crop/zoom to the region that matters before viewing (PIL crop to scratchpad). Don't re-view the same image.
- Pipe build/test output through `tail`. Screenshots only when layout changed.
- Never `git clone` in full or download >200 MB without asking. OSMS repo is 8.6 GB; `fetch_osms.sh` is shallow+sparse+
  blob-filtered. In `vendor/`, `git ls-tree -l` / `git log -p` / `git show` silently fetch blobs; use `--name-only`.
- Don't re-run `fetch_osms.sh` / `build_data.py` unless data logic or the export changed.
- Don't read the live artifact back; publish dist straight to it.

## Branches, deploy
- Default branch: `main` (renamed from `claude/trusting-bell-fqgar6` 2026-10-20). Site, tracker, server, CI all run from it.
- Pushing to it = production (Pages redeploys). Needs Danny's in-thread "push" unless the brief says he OK'd it.
- Before pushing: `git fetch origin main && git rebase origin/main`.
  Build/publish the artifact only from that latest base, so another thread's newer version isn't overwritten.
- After pushing: wait for pages.yml, check the Home "Site version: built ..." stamp on
  https://turbosaucedev.github.io/MS-Classic-World-Info-Slop/, smoke test green, then report once.
- Artifact (republish `dist/index.html` after every site change): https://claude.ai/artifact/Facfj1DVkTNyQyrbHHFQcH
- One owner per shared area (Home cards, global CSS, the data build, CLAUDE.md/docs): check with the coordinator first.
