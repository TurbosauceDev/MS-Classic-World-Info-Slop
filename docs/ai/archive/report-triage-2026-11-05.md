> Archived 2026-11-05 by Hermes: the report folders below marked FIXED were renamed -checked and are deleted (17 by a local launch-test run before its Pictures isolation fix, 4 KPQ ones the same way earlier). This table is their record. NOT FIXED / UNKNOWN reports and the fixture candidates 04-12-12 and 09-37-53 still exist.

# Triage of Danny's 33 unchecked tracker bug reports (against origin/main 511bac5, tracker 0.3.42)

Method: current readers (`GrindReaders.work` / `findInventory` / `readInventory` / `readCounts` / `mapTextCrop` / `chatCrop`+`boxFromText`)
run over each report's saved frames in a throwaway worktree (throwaway probe scripts built on tracker_frame_probe.js; the worktree and scripts are deleted, results are in this file). Ground truth = my own reading of each frame (vision on crops). Inventory reads were
fed twice (t, t+3 s) so the "same read twice" rule fires. Nothing was changed in the repo.

Verdict rule (strict): FIXED = the current code reads that report's frames right, or the exact mechanism was removed/fixed with a test.
NOT FIXED = the complaint still reproduces on the report's own frames (a headline-fixed report with one still-wrong slot is listed
NOT FIXED and says so). UNKNOWN = frames/log can't settle it.
Test location matters: `core.test.js`, `cv.test.js`, `ui.test.js` run in CI; `inventory.test.js`, `kpq.test.js`, `readers.test.js` do NOT.

Caveats: old reports (0.2.x) carry no learned glyph table, so pickup-line reads here are "cold table"; the saved frames are 3 s apart so
pickup lines (which live a few seconds) are rarely caught; frame sizes are mixed (1280x720 and 2560x1440) inside one report.

| report folder | ver | Danny's note (short) | what went wrong | verdict | evidence | fixture candidate |
|---|---|---|---|---|---|---|
| 2026-10-17T23-34-18 | 0.2.7 | item box not read, no potion/arrow data | Inventory was closed; only quick slots on screen. 0.2.7 read nothing from them | FIXED | Current `work()` reads quick slots White 25 / Lemon 9 / Orange 5 = what I read on the frame (3/3). 0.2.8 "item counts from video frames" | frame 4 quick-slot crop (1780,1145,2085,1305) @2560: clean 3-count case |
| 2026-10-17T23-35-03 | 0.2.7 | item box + quick slots not read | Use/Etc tabs and quick slots unread | NOT FIXED (headline fixed) | Use tab: 17/17 counts + wallet 9,069 right (arrows 375/668/765/1000 etc). Quick slots right. Etc tab: 25 stacks on screen, best frame reads 22; the stacks with 84, 87(?), 7, 32 (row 4-5) come and go (`partial` 4000010/4000018/4000020). Class A | idx 5 inventory crop (2066,846,2524,1456): Etc with 25 stacks, 3 intermittently unread |
| 2026-10-18T04-12-12 | 0.2.25 | arrows read as +600 | Start read 10,933, end 11,601 = the selected (first, 668) arrow stack missed at start -> "+668 arrows gained" | FIXED | Current reader on frame 0 returns arrows 11,601, 0 unknown. My sum of the arrow stacks by row: 668+4x800=3,868; 4x800+364=3,564; 5x800=4,000; 169 -> 11,601. The 668 stack sits in the blue-bordered selected slot | frame 0 (1280): arrows 11,601 incl. selected 668; regression for the selected slot |
| 2026-10-18T04-18-20 | 0.2.25 | unnamed item | Pickup line read `Hornv Mushroo...` (y read as v) -> no name | NOT FIXED | `itemByName("Hornv Mushroo...","Etc")` still null (readers.js:812: only `?` and i/l/1 are wildcards, no substitution). Same frames do read `Green Mushroo...` -> 4000013. Class D | none in frames (line not in the 8 frames); unit text is enough |
| 2026-10-18T04-25-06 | 0.2.25 | another unconfirmed drop | Two lines read `Horn??hroo...` / `Biue Potion` | NOT FIXED | Biue Potion now resolves (core.test.js:340). Frame 5 shows two `Horny Mushroo... x1 earned. (Etc)` lines; current code still reads `Horn??hroo...` -> itemraw (itemByName returns [] for it). Cold glyph table, so with Danny's learned table this may differ (guess) | frame 5 crop (900,380,1280,640): `Horny Mushroo...` on busy scenery |
| 2026-10-18T04-26-09 | 0.2.25 | "now at 5" (unread counter) | `Biue Potion` x2 unread (l/i) | FIXED | core.test.js:340 `Biue Potion` -> 2000003; `Red Potion` (2000000 vs 2000007) now picks the first (readers.js:819). Unit check by me: both resolve. Other unread lines predate the log window, can't check | n/a |
| 2026-10-18T04-32-11 | 0.2.25 | unconfirmed drop 6 | `Red Potion` (2 same-named ids) and `Biue Potion` unread | FIXED | same as above (itemByName returns 2000000 / 2000003). Frames hold no pickup line | n/a |
| 2026-10-18T06-44-06 | 0.2.29 | tool not reading inventories well | Etc tab: 19 stacks | NOT FIXED (residual) | Tab found 8/8 (pale pink), 18 of 19 stacks right; the orange-bordered selected slot (ticket, count 2) is unread -> `partial 4001001`. Class A | idx 1 inventory crop: 19-stack Etc with selected ticket |
| 2026-10-18T07-08-35 | 0.2.29 | sample frames (no complaint) | n/a | NOT FIXED (new finding) | Tabs cash/use/cash/deco/use/etc/etc/etc all found right; Etc 16/16 right. Use tab: arrows total 6,608 vs 6,823 (800x7... I read 458 and 215 and 550): the `215` stack is not read (count) -> unknown 1. Class A/B | idx 1 (2560): use tab with `215`, `550`, `458`; also cash/deco tab frames (not item tabs) |
| 2026-10-18T07-14-22 | 0.2.29 | exp/hr suddenly spiked | stats: activeMin 0.084 (5 s) with 935 EXP -> expHr 670,651 while expHr5 was 22,529 (pause flapping in KPQ left almost no active time) | NOT FIXED | core/session.js:233 `per = v => hrs > 0 ? v / hrs : 0`: no minimum active time for /hr (the /min displays guard `activeMin >= 1`, renderer.js:281). 0.3.40 removed the per-bar pause flapping that shrank activeMs, but the divide is still unguarded. Class F. Code reading, not a frame proof | none (session unit test) |
| 2026-10-18T07-43-05 | 0.2.29 | issues reading equip inventory | Equip tab not found / named | FIXED | Equip tab found on 8/8 frames, 2/2 items read (a pointer hand over empty slots makes phantom `unknown` 1-2 on some frames, class C; item names `Green Woodsman Boots` / `Deer Huntertop` not verified against the icons, the second looks like a boot, guess: mis-named) | idx 3 (2560): equip, pointer over empty slots |
| 2026-10-18T07-44-11 | 0.2.29 | inventory not being read | Etc tab | NOT FIXED (residual) | Tab found 8/8; 17 of 18 stacks right. `37` Bronze Ore count unread -> partial. (Selected 120 slot reads fine here.) Class A | idx 0 (1280): Etc with `37` |
| 2026-10-18T08-50-03 | 0.2.35 | moving around the inventory | Folder has 0 frames (report taken while "Saving sample frames 1-5/60" ran), 7 status lines | UNKNOWN | no frames, no events | n/a |
| 2026-10-18T08-52-13 | 0.2.35 | test inventory movement | Use tab: arrows 4,534 (log, 0.2.35) | NOT FIXED | Current: counts read perfectly (800x6 + 534) but slot 3's icon is unmatched (`missed [3]`): the pointer hand sits on it -> total 4,534 vs real 5,334. Equip frame also gets a phantom unknown slot. Class C | idx 2 (2560): Use tab, hand over arrow slot 3 |
| 2026-10-18T08-57-19 | 0.2.37 | Clear does nothing in run compare | History compare Clear | FIXED | Compare was rebuilt in 0.2.54; `cmpClear` handler renderer-history.js:185 and `tests/ui.test.js:522` clicks it and asserts no run stays ticked (ui job in CI). No frames in the report | n/a |
| 2026-10-18T09-18-40 | 0.2.38 | opening Etc isn't fixing unread names | unread counter stayed 2 after Etc was read | FIXED | KPQ "earned" lines that don't resolve are no longer counted as unread drops (session.js:154; I ran `createSession`: itemraw `.? ??.?on ...` on 80000500 -> unreadItems 0); inventory gain fills real misses (session.js:248-254). Etc tab reads 6/6 stacks by frame 5 (Green 3, Horny 2, ...). Caveat: symptom suppressed, names not recovered | n/a |
| 2026-10-18T09-19-09 | 0.2.38 | "I think it's the reward box" | Companion's Magic Box in Use tab | NOT FIXED | Box icon now reads as Companion's Magic Box x1; but frame 5 has an item tooltip over the empty slots and the reader reports 6 phantom unknown slots (26 slots vs 20 real). Class C. Arrows 5,171/5,165 right (637+... verified) | idx 5: tooltip over slot area |
| 2026-10-18T09-22-44 | 0.2.38 | arrows not properly counted | Arrow stacks missing | NOT FIXED | Frame 0 arrows read 4,000; real 4,993 (792 selected, 800x5, 201). `792` and `201` counts unread, both icons also `missed [0,6]` because digit pixels enter the icon compare. Class A+B | frame 0 (1280): `792` + `201` stacks |
| 2026-10-18T09-23-31 | 0.2.38 | lemons used from hot bar not tracked | Quick-slot lemon drop missed | FIXED | Probe emits `use 2010005 n1` and `use 2000001 n1` on these frames; quick slots read 98->97 lemons, 21->20 oranges, matches the crops | n/a (quick slot crop 890,570,1045,655 is a nice 8-slot sample) |
| 2026-10-18T09-30-31 | 0.2.38 | 2 maces reported, only 1 | Pickup line counted twice, inventory not used to correct | FIXED | Mechanism in session.js:248-250, test core.test.js:372 (CI). Equip frame reads 1 mace (slots 1, unknown 0) | n/a |
| 2026-10-18T09-37-53 | 0.2.38 | warrior potions used, app forgot | Stack gone/unread after going 2->1 | FIXED | core.test.js:365-371 (Warrior Potion 2->1 counted). Frames: Etc tab only; its orange-selected `39` Horny stack is unread (class A, not the complaint) | idx 5 (1280): Etc, selected slot `39` |
| 2026-10-18T09-38-16 | 0.2.38 | used arrow count keeps jumping | Arrow total jumping between reads | UNKNOWN | Frames are Etc tab + quick slots, no Use tab to read. Session side mitigated (core.test.js:347 stack-missed, :352 partial, :359 arrows left), but the reader still drops stacks on a first look (see 09-22-44, 08-52-13), so jumps can still start there | n/a |
| 2026-10-18T09-38-50 | 0.2.38 | arrow count updated, 1235 more accurate | same | FIXED | Use tab frames: arrows 4,099 + crossbow 53, exact vs my reading (5x800 + 99; 53). The "used 1235" figure is a session calc and was not replayed | idx 4 (1280): Use tab, `99` + `53` |
| 2026-10-18T19-03-45 | 0.2.42 | arrows jumping, want exact count | Totals 2,775 / 2,767 etc | FIXED | Frame 4 reads 2,775 (592+800+800+583), frame 7 reads 2,767 (584+...) = my sums; `use` events 6 then 2 | idx 4 and 7: sequential arrow use 592->584 |
| 2026-10-18T19-12-58 | 0.2.42 | "only 30 arrows used", read numbers carefully | Log reads 1,965 then 2,652 | FIXED | Frame 5 reads 2,652 = 687+800+800+365 (my reading). Pet Food (milk carton `14`) is an unknown icon, flagged partial, harmless | idx 5 (2560): 4 arrow stacks + Pet Food |
| 2026-10-18T19-44-24 | 0.2.42 | couldn't find the Etc inventory | Etc tab (pale / pulsing pink) missed | FIXED | Tab sequence in frames: use,use,etc,etc,etc,etc,etc,etc (pale/pink/pulse); current finds etc on 6/6, use on 2/2. Selected Horny stack is partial (class A) | idx 2 and 4 tab strips (pale vs bright): already in etc-pale-tab/etc-pulse-tab (frames-inv) |
| 2026-10-18T23-52-27 | 0.2.48 | staff dropped, not caught | `Emerald Sta?` unmatched | FIXED | core.test.js:337-339: `Emerald Sta?` -> [1382002] (CI); the report's pickup line isn't in any frame | n/a |
| 2026-10-19T00-01-11 | 0.2.48 | learn to spot Companion's Magic Box (opened 3) | Feature gap | FIXED | 0.2.53 chat reader: on frames 6 and 7 `chatCrop` -> OCR -> `boxFromText` returns a group (`Red Potion x5 earned` + `Companion's Magic Box x1 has been lost`); frame 3 pickup not read. Only 1 of 3 boxes visible in the frames | idx 6 chat crop |
| 2026-10-19T00-02-35 | 0.2.48 | box items not calculated | Feature gap; Equip tab "couldn't find inventory" in log | FIXED | Same box mechanism; Equip tab now found 8/8, 2/2 items (Emerald Staff, Sapphire Earrings). Pointer gives a phantom unknown on one frame | n/a |
| 2026-10-19T00-04-44 | 0.2.48 | tool cannot read equip slot | Equip tab not found | FIXED | 8/8 frames find equip, read Emerald Staff + Sapphire Earrings (orange selected). 0.2.50, fixtures equip-video-staff / equip-native-staff-2x (frames-inv, tested in inventory.test.js: not CI) | already a fixture |
| 2026-10-19T03-55-07 | 0.2.52 | opened a box, did Ctrl+Shift+G | Feature (box rewards) | FIXED | core.test.js:433-440 is built from this report's frame; my run: frames 6 and 7 -> `White Pation/Potion x15`, `Red Potion x5`, box `has been lost` grouped (CI test uses the OCR text) | n/a |
| 2026-10-19T04-08-03 | 0.2.52 | Monsters killed module not tracking | Module stopped counting | UNKNOWN | Log shows kills still counted (stats.kills 425, exp events through the last minute), so session side works; module is UI. 0.2.56 changed the module ("Not told apart" row removed). No frames of the module | n/a |
| 2026-10-24T22-58-10 | 0.2.71 | can't read minimap | Title never read | NOT FIXED | Frames 0-6 show a clear `Victoria Road / East Rocky Mountain IV` panel; current `mapTextCrop` finds the wrong rect (frame 0: x 1-398, y 39-95) or none on 7/8 frames, only frame 7 reads (rect 1,28-191,55). Class E | frames 0, 3, 5 top-left crop (0,0,520,220) @1280 |

## Counts
FIXED 19 | NOT FIXED 11 | UNKNOWN 3 (33 total).
NOT FIXED: 10-17T23-35-03, 10-18T04-18-20, 04-25-06, 06-44-06, 07-08-35, 07-14-22, 07-44-11, 08-52-13, 09-19-09, 09-22-44, 10-24T22-58-10.
UNKNOWN: 10-18T08-50-03 (no frames), 10-18T09-38-16 (no Use tab), 10-19T04-08-03 (UI module).
Of the 11, four are "headline fixed, one stack still unread" (23-35-03, 06-44-06, 07-08-35 is a no-complaint sample, 07-44-11); the rest reproduce the complaint (arrow totals 08-52-13, 09-22-44; pickup names 04-18-20, 04-25-06; minimap 22-58-10; EXP/hr 07-14-22; tooltip phantoms 09-19-09). The inventory reader leaks are classes A-C below.

## NOT FIXED (open bug classes)

**A. Stack counts that do not read (selected slot, `37`, `215`, `201`, `792`, `39`, `2`)** — reports 23-35-03, 06-44-06, 07-08-35, 07-44-11, 09-22-44, 09-37-53, 19-44-24.
- Where: `readCounts` readers.js:837 (digit "ink" needs near-pure white rows `is()` at :843, light-blue rows by `RED` at :839), called from `readInventory` :1048.
- Observed: orange-bordered selected slot (Etc: `39`, ticket `2`) and a few 3-digit/2-digit counts over the quiver (`215`, `201`, `792`, `37`) return no digits; every other count in the same window reads (e.g. 17/17 in 23-35-03 use tab).
- Hypothesis (guess, not proven): the orange selection border (and the quiver's brown shaft under 2nd/3rd digits) lands inside the digit columns and breaks the `dark`/ink test or the exact glyph key (`keyOf` :849); `37`/`792` may also miss the "7" template (CDIG "7" is a 3-wide, 3-row-top glyph, :831).
- Cheap test (cv.test.js, CI): paste the idx 0 crop of 09-22-44 (1280, inventory at its position) / 07-08-35 idx 1 into a blank frame; `readCounts` must return 792 and 201 (resp. 215), and `readInventory(...).slots` n !== null. Then 09-37-53 idx 5 (`39`) and 07-44-11 idx 0 (`37`).

**B. A slot whose count didn't read also loses its icon -> stack dropped from the total** — 09-22-44 (`missed [0,6]`), 07-08-35.
- Where: readers.js:1064-1069. When `num` is not found, `end = sx - 12`, so `slotIcon` (:1025) compares the digit pixels too and misses (`best.sc < 80 && second > best.sc * 1.5`, :1044). Guess: mask the count band (rows cy-9..cy) always, so the icon still matches and the stack goes to the existing `partial` path instead of vanishing.
- Test: `readInventory` on the 09-22-44 crop must give ids [2060001] for slots 0 and 6 even with n null.

**C. Pointer hand / tooltip over the window** — 08-52-13 (arrow slot hidden by pointer: 4,534 vs 5,334), 09-19-09 (tooltip: 6 phantom unknown), 07-43-05 and 00-02-35 (pointer: 1-2 phantom unknown on empty equip slots).
- Where: empty-slot test readers.js:1058 (`off < 30` pixels differing from (225,223,213)); anything else counts as a filled slot, then `unknown++` at :1069. Also inflates `unknown`, which blocks the session's "inventory is right" corrections (session.js:248-250 needs `!tab.last.unknown`).
- Guess: skip slots whose non-empty pixels are the pointer's white/cyan glove with black outline or a navy tooltip block; or treat a slot whose count did not read AND whose picture is unmatched as "covered", neither unknown nor used.
- Test: cv.test.js crops 08-52-13 idx 2 (assert arrows total 5,334 via slot 3 matched or marked covered), 09-19-09 idx 5 (unknown == 0).

**D. Truncated pickup names with a misread letter** — 04-18-20 (`Hornv Mushroo...`), 04-25-06 (`Horn??hroo...`).
- Where: `itemByName` readers.js:809-821; `?` = `.{1,2}` (:812) and the only fuzzy rule is i/l/I/1; the game cuts names to 15 chars + `...` (Horny Mushroom Cap -> `Horny Mushroo...`).
- Test (core.test.js, CI, 1 line): `itemByName("Hornv Mushroo...","Etc",true)` and `("Horn??hroo...","Etc",true)` both `["4000019"]`. Guess at the fix: allow one substitution when the prefix is unique, and let a `?` run stand for up to ~5 chars before a `...` cut.

**E. Minimap title rect on bright scenery** — 22-58-10 (7 of 8 frames).
- Where: `mapTextRect` readers.js:529-583 / `mapCols` :586; `ink` = min(r,g,b) > 190 over the top-left 40% x 30% of the frame. Sand/cloud scenery to the right of the minimap is "ink", frame 0's rect comes back x 1-398 and OCR returns scenery noise; other frames find no bands.
- Guess: clamp the search to the minimap panel (its blue-grey body / right border, ~190-260 px) or require the title's grey-blue backing; do not extend `mapCols` past the panel edge.
- Test (cv.test.js): paste frame-0 crop (0,0,520,220) from 22-58-10 into a blank 1280x720; `mapTextCrop(img).rect.x1 < 260` and OCR/`mapFromText` -> East Rocky Mountain IV (id 10004053). Also add frames 3 and 5 (rect currently null).

**F. EXP/hr from a few seconds of active time** — 07-14-22.
- Where: core/session.js:233 `per`; also `toLevelHrs`/`toGoalHrs` (:238-242) built on it.
- Hypothesis: no floor on `activeMs`; 5 s of play shows 670k EXP/hr. Cheap test (core.test.js): session with 935 EXP and 5 s active -> `stats().expHr` should be null/0 below e.g. 60 s (threshold is my guess; 60 s matches `recentExpHr`'s `ms < 60e3` guard at session.js:225).

## Frame fixtures worth adding (none of these frames are in tracker/tests/frames*; add rows to docs/ai/fixtures.md)
- 09-22-44 idx 0 (792 + 201), 07-08-35 idx 1 (215), 07-44-11 idx 0 (37), 09-37-53 idx 5 (selected 39), 06-44-06 idx 1 (selected ticket): class A/B.
- 08-52-13 idx 2 (pointer on arrow slot), 09-19-09 idx 5 (tooltip): class C.
- 04-12-12 idx 0: arrows 11,601 incl. selected 668 as a regression.
- 22-58-10 idx 0/3/5 top-left crops: class E.
- 04-25-06 idx 5 pickup lines (`Horny Mushroo...`): class D.
- Existing coverage to reuse: frames-inv/{equip-video-staff, equip-native-staff-2x, etc-pale-tab, etc-pulse-tab, use-arrows-kpq} are from these reports' era but only asserted in inventory.test.js (not CI).
