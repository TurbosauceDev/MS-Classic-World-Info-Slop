# Test image index (pick a fixture here, don't open images to find one)

Every image under `tests/fixtures/` and `tracker/tests/frames*/` has one row: size, what it shows, the values a test
expects from it, and the test that reads it. All are Danny's in-game screenshots or tracker captures unless noted
(native 2560x1440, UI "Ideal Ratio" 2x). Rows are the source of truth for expected values only as far as the test
says; the test file is authoritative. `tests/docs.test.js` fails CI if an image is missing here or a row names a file
that's gone.

**Adding a fixture:** save it in the folder for its reader, name it after what it shows or the value it should read
(`meso-3571.png`, `timer-2037.png`; some tests read the expected value off the name), add the test case, add a row here.
**Viewing one:** crop to the region the row names first (PIL, to the scratchpad); never view a 2560x1440 frame whole.

## tests/fixtures/ (site: tests/smoke.js)
| file | px | shows | expected |
|---|---|---|---|
| stat.png | 743x569 | Lv 28 Magician Character Stat window | builder import: AP 4/4/127/25, "Level 28 Magician · Ice Wand · Magic Claw 20" |
| equip.png | 344x568 | same Magician, Equipment Inventory | 5 gear pieces, Ice Wand |
| skill.png | 393x742 | same Magician, Skill Inventory | Magic Claw 20 |
| bow-stat.png | 751x573 | Lv 28 Archer Character Stat | ACC 66, AVOID 28, HP/MP 845/669, W.DEF/M.DEF 107/30 |
| bow-equip.png | 366x601 | same Archer, Equipment | Battle Bow |
| bow-skill.png | 406x756 | same Archer, Skill Inventory | 5 skills read, incl. The Eye of Amazon (927e349 bug) |
| bow-equip2.png | 355x587 | Archer equipment, uploaded first | "Add: Stats" prompt |
| bow-stat2.png | 745x573 | Archer stats, uploaded after equip2 | weapon Battle Bow, no "over budget" note |
| bow-full.png | 2557x1439 | Danny's whole screen, Lv 30 Hunter, Skill (1st job tab) + Equipment + Character Stat open | one paste: Lv 30 Hunter, Battle Bow, 6 armor, AP 29/133/4/4, 5 skills, asks for 1 Hunter SP; 17 boxes in big view (smoke.js) |
| bank-0.png, bank-1.png, bank-2.png, bank-3.png, bank-4.png | ~425x730 | bank window scrolled 0-4 rows | together: Green Mushroom Cap 387, Arrows for Bows 1,970, Set of Match Cards 3, bank 5,825 mesos |
| bank-inv.png | 846x735 | bank with inventory open beside it | inventory side ignored (no "Equip:" read) |
| tip-hat-accuracy-lesser.png | 604x263 | 2x crop: scroll tooltip (bullet, bold name, picture box, chat-font description) | features.js: Hat Accuracy Scroll: Lesser |
| tip-earring-str-intermediate.png | 588x245 | same, scenery behind | Earring STR Scroll: Intermediate |
| hover-blunt-greater.png | 950x868 | 2x live frame: full Use tab, glove on slot 21, tooltip below it | features.js: hovered slot 21 |
| hover-hat-acc-lesser.png | 1451x1119 | 2x live frame: glove on slot 7, tooltip below-right | hovered slot 7 (old rule failed) |
| hover-hat-acc-greater.png | 1037x723 | 2x live frame: glove on slot 8 above the tooltip | hovered slot 8 (old rule ticked 18) |
| tip-1h-sword-attack-intermediate.png | 748x232 | same, wrapped description, glove pointer in view (pointer offset source); name font holdout | One-Handed Sword Attack Scroll: Intermediate |

## tracker/tests/frames/ (tracker/tests/readers.test.js: EXP bar, level, pickup lines, map name)
Full 2560x1440 frames, playfield blanked, KPQ Bonus map. EXP bar bottom middle, pickup lines bottom right, map name top left.
| file | px | expected (exp, %, level, pickups) |
|---|---|---|
| frame-000.png | 2560x1440 | 18572, 64.09, Lv 22; meso 16, exp 7, bonus 2; map 80000500 "1st Accompaniment <Bonus>" |
| frame-006.png | 2560x1440 | 18757, 64.72, Lv 22; no pickup check |
| frame-042.png | 2560x1440 | 19803, 68.33, Lv 22; meso 20, exp 7, bonus 2 |
| frame-046.png | 2560x1440 | 19894, 68.65, Lv 22; meso 20, item 4000019 (Horny Mushroom Cap); map 80000500 |

## tracker/tests/frames-beanguri/ (readers.test.js; MIT, from beanguri/Maple-Classic-Exp-Overlay, see its LICENSE)
EXP-bar crops at other window sizes; all read 68,601 [71.68%].
| file | px | shows |
|---|---|---|
| exp_full-1280x720.png | 572x112 | fullscreen 1280x720 |
| exp_full-1920x1080.png | 553x112 | fullscreen 1920x1080 |
| exp_win-1024x768.png | 143x28 | windowed 1024x768 |
| exp_win-1280x720.png | 143x28 | windowed 1280x720 |
| exp_win-1920x1080.png | 212x44 | windowed 1920x1080 |
| exp_win-1920x1200.png | 225x44 | windowed 1920x1200 |

## tracker/tests/frames-inv/ (tracker/tests/inventory.test.js unless noted)
| file | px | shows | expected |
|---|---|---|---|
| inv-a.png, inv-b.png, inv-c.png | ~250-400 wide | Use tab + 3 quick-slot columns, three crops | 8 slot columns, wallet 4,685, White Potion "29"->"28" counted once |
| use-12162.png | 208x288 | Use tab, 12,162 mesos | 21 slots, arrows 800x7+217; also site smoke Price check ("Lemon") |
| equip-12162.png | 210x288 | Equip tab (no counts) | Squishy Shoes, Pig Illustrated |
| equip-video-staff.png | 230x250 | tracker's video frame, Equip open, tab edge blurred (report 2026-10-19) | tab equip; Sapphire Earrings, Emerald Staff |
| equip-native-staff-2x.png | 460x500 | same at 2x (native 1440), red line's top row broken at the left | drawn at 1/2: tab equip; same 2 items |
| etc-12162.png | 211x291 | Etc tab, pale ores under counts | Bronze 3, Iron 1, Mithril 4, Adamantium 14, Silver 12, Orihalcon 2, ... |
| etc-pale-tab.png | 225x300 | Etc tab drawn pale pink, broken red line (KPQ run) | 4000019 x121, 4010000 x26, 4000013 x13, 4000063 x4, 4010104 x19 |
| etc-pulse-tab.png | 220x250 | Etc tab caught mid-pulse | tab still found |
| use-arrows-kpq.png | 220x250 | Use tab, arrow stacks 592/800/800/583 | arrows total 2,775; a missed stack keeps its last read |
| use-pointer-on-tabs.png | 225x300 | mouse hand over the red line | tab "use" |
| meso-2700.png, meso-3210.png, meso-3510.png, meso-3560.png, meso-3571.png, meso-3590.png | ~300x90 | meso total strip, un-doubled | the number in the file name |
| party-hp-bar.png | 80x26 | one party member's HP bar | stacked 1/2/3 copies -> no party / 2 / 3 |
| party-4-out-of-range.png | 380x160 | 1440p party window, 3 of 4 out of range (grey, empty bars), drawn at (0,420) on 2560x1440 | 4 |
| party-4-low-hp.png | 380x160 | 1440p party window, 4 in range, short red bars, drawn at (0,420) on 2560x1440 | 4 |
| video-a.png | 360x200 | tracker's own (video) capture, Use tab + quick slots | quick slots White 24, Lemon 9, Orange 5; Use arrows 375+668, crossbow 765+1000, Red 20, Blue 18, Pure Water 10 |
| minimap-kpq.png | 250x205 | KPQ minimap, two title lines bridged by icon | map text crop > 50 px tall |
| minimap-folded-2x.png | 660x44 | minimap folded to one line | crop < 50 px |
| statusbar-native-1440.png | 2560x118 | bottom status bar at native 1440 | screen scale k = 2 |

## tracker/tests/frames-kpq/ (tracker/tests/kpq.test.js)
Top-middle crops of KPQ frames (2560x1440 at 2x), pasted back at their spot on a blank frame.
| file | px | expected |
|---|---|---|
| timer-1848.png, timer-1852.png, timer-2037.png, timer-2041.png | 460x200 | "Time Left" clock = mm:ss in the file name |
| timer-2219.png (2x), timer-2216.png, timer-2546.png (1x frames, upscaled 2x nearest) | 460x200 | same; the real 6 and 9 shapes (the old guesses read null) |
| bar-1601.png | 700x80 | EXP bar "1,601 [2.51%]" (a 1 before a comma used to read 601) |

## On Danny's device (folder tools, already approved; not in the repo)
- `C:\Users\danny\Pictures\MS Classic Tracker frames`: debug and bug-report frames. New fixtures come from here.
- `C:\Users\danny\AppData\Roaming\MS Classic Grind Tracker`: saved sessions.
