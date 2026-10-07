# Notes: formulas, data, sources, decisions

## Sources
Credited on the page in the Credits tab (src/index.html #credits); add new sources there too.
| What | Source |
|---|---|
| Monsters, maps, spawns, quests, items, skills, icons, citizenship quests | OSMS Data Explorer COT2 export — github.com/ohmi69/osms_datamine_dashboard (pinned in scripts/fetch_osms.sh) |
| 2008 comparison (tab removed 2026-10-06) | same repo, `data/patches/v49`; analyze.py still computes mob/skill diffs, build_data drops them |
| EXP table 1–70 | maplestory.quest (checked: 10→30 = 545,290; 30→40 = 1,713,976) |
| Accuracy / hit / damage / defense formulas | COT2 client audit published on maplestory.quest / OSMS `tabs/formulas.js` |
| SP rules | meowdb guides (glossary; Warrior 1–30; Page 30–70) |
| Citizenship grades, discounts, storage fees, civic shops, how to join | meowdb.com/msclassic/citizenship (says: COT2; housing, daily limits, reactivation fees unconfirmed). Read through a summarising fetch — every shop item name was checked to exist in the export, prices/grades were not verifiable |
| Maple Island sequence, beginner gear/AP, job instructors | meowdb beginner guide (updated 2026-10-02) and Roxie's new player guide, read with headless Chromium (plain fetches get a Cloudflare 403) |
| Valuable quests (tiers, reasons) | metaroad.gg "Must-Do Quests & Valuable Rewards" (Jota, upd. 2026-09-19), maplestory.quest "Valuable quest rewards worth the detour" (Chief Stan), meowdb beginner guide. Read with headless Chromium (WebFetch blocked; metaroad hides level tabs, so hidden panels were forced visible). Reddit blocked from the cloud env. Forgotten Hollow picks (Road Back Home, Matters of the Heart, Heart of Stillness) left out |
| Crafting | export `crafting.json` (348 recipes, 6 professions) + Crafting-region quests. Craft EXP per level and the character-level gate (5 × craft level) from the OSMS dashboard's `tabs/crafting.js` (CRAFT_LEVELS_COT2, read from the COT2 client), not a data file. Dye/helmet prices: meowdb shop list |
| Class guides 1–30 (Path Planner) | meowdb Warrior/Magician/Bowman/Thief class guides + beginner guide (read 2026-10-06 with headless Chromium): SP order, AP per level, weapons, gear, ammo, citizenship town, Training Advisor maps → src/js/16-guides.js |
| Mechanics (meowdb guides, read 2026-10-06) | attack-speed ladder, damage/hit/incoming-damage formulas, HP/MP gains, EXP table to 100 (51+ historical), party bonus, spawn capacity per player, crafting material drops (grind-maps guide), KPQ |
| 2nd-job guides 30–70 | meowdb Fighter/Page/Spearman/Hunter/Crossbowman/Assassin/Bandit/F-P/I-L/Cleric guides → GUIDE2 in src/js/16-guides.js |
| maplestory.quest (permission from the owner to use all its data, per Danny 2026-10-06) | raw COT2 client JSON API: `/api/raw/overview?v=COT2`, `/api/raw/category?v=COT2&key=<mob|item|skill|quest|map|craft|...>&page=N&page_size=50`, files under `/api/raw/file/COT2/wz/...` (sprites). Same client as OSMS; adds mob Magic Attack, mob skills, NPC dialogue, hidden skill rows. No drop tables or shop stock (server-side); its monster pages take player drop reports |
| maplestory.io | WZ API with an `MCW` region (versions `1` = COT1, `CBT2` = our COT2): item/mob/NPC images and data, e.g. `/api/MCW/CBT2/item/{id}`. Usable at build time only (page must stay self-contained) |
| Not usable | nexon.com game-build API (401, launcher auth; build manifests, not game data) |
| Launch scope | meowdb release-date guide (no Orbis/El Nath/3rd job at launch); meowdb news 2026-10-03 (level cap 100, Forgotten Hollow later) |

No drop tables exist in the export, so nothing depends on drop rates ("source n/a" on quest items).

## Client formulas (COT2)
- Accuracy, common = DEX×1.2 + Level×2 + LUK×0.6. Warrior common/2.5+10 · Bowman common/4.8+20 · Thief common/4+15 ·
  Magician (INT×1.2 + L×2 + LUK×0.6)/5.1+20. Skill bonuses from per-level skill tables (Precise Strikes max +20, Nimble Body +15, Focus, Bless).
- Avoid = trunc(LUK/3) + trunc(DEX/6) + 5 (+ skills).
- Hit chance: Base = Acc×100/((max(0,diff)×2+51)×5); Spread = 0.15 + 0.2/(1+exp((Base−Avoid)/12));
  P = clamp((1+Spread−Avoid/Base)/(2×Spread), 0, 1).
- Physical: MIN = Skill×(0.8 + (Prim×WepMult×Mastery + Sec)/100 + AttackPower/50)×WeaponAttack;
  MAX = Skill×(1.0 + (Prim×WepMult + Sec)/100 + AttackPower/50)×WeaponAttack. WeaponAttack includes stars/arrows.
  Mastery = (0.1 + masteryLevel/10)×0.8 (0.08 unlearned, 0.88 max). Lucky Seven: mastery 0.5, multiplier 3.0.
- Weapon multipliers (swing/stab, or shoot): 1H Sword 1.8/1.8 · 2H Sword 2.5/2.5 · 1H Axe/Blunt 2.4/1.2 · 2H Axe/Blunt 3/2 ·
  Spear 1.5/3.5 · Polearm 3.5/1.5 · Bow/Crossbow/Claw 2.5 · Dagger 1/2 · Wand/Staff 1.8. Melee assumed 60% swing (crossbow 50/50).
- Magic: MAGIC = floor(INT/2) + MATK; MIN = BA/100×MAGIC×(INT×Mastery/100+1); MAX = BA/100×MAGIC×(INT/100+1).
- Defense: dmg×100/(def+100). Level penalty: d<10: 1/(d²×0.005+1); d≥10: 1/(d×0.05+1).
  Elements: weak 1.25 / strong 0.75 / immune 0 (1.5 only for 3rd-job Element Composition). Crit base 5% for +20%. Damage cap 99,999.
- Party EXP: +10/20/30% for 2/3/4+ players (meowdb, measured in COT2); map capacity 75% solo +5%/player to 100% at 6 (meowdb:
  not fully confirmed). Party option (Where to train, planner grinding): per-player rate = min(N × kill rate, map EXP ×
  capacity / 7.56 s) / N × (1 + bonus); assumes equal players splitting kills and EXP. Quests stay solo.
- Attack time: meowdb's measured ladder per speed tier 0-10 (swing / spear-polearm stab / crossbow columns), SPEED_MS in
  50-builder.js. Spells always tier 6 (810 ms). Savage Blow = 30 × ceil(960 × (10 + tier) / 16 / 30). Spears and polearms
  60% swing + 40% stab. Spell Booster is 3rd job (not modeled).
- Final Attack: kept on only if it raises DPS; each proc adds 0.88 × the weapon's attack time (fits meowdb's −12% for a
  single-target Lv 70 Fighter). Hunter's Final Attack: Bow fires 3 arrows (data: "90% to up to 3 enemies"; meowdb: three
  90% arrows, all on a lone mob) → ×3 payload; crossbow and melee Final Attacks hit once.
- Axe Mastery bleed: uptime 1 − (1 − p)^(hits × 3 s / interval), payload X% of a plain hit over 3 s (meowdb: +5.5% for its
  Lv 70 Fighter; ours ~+6%). Poison Breath DoT: BA/100 × Magic × (INT/125 + 1) over 5 s, full uptime per target.
  Steal (Bandit, buffs on): +AP × success chance, minus 2 Steal casts a minute.
- Holy Arrow = 3 hits split over targets (fixed total, like Double Shot) → single target. Iron Arrow pierces at
  100/80/60/40% (AOE_FALL) → n targets count n − 0.1 n (n − 1).
- HP/MP (meowdb, COT2-measured): 50/5 at Lv 1, Beginner +16/+12 a level, class gain per level after 10 (Warrior 28/12,
  Bowman and Thief 22/17, Magician 16/22), +500 split by class at 1st and 2nd job (W 350/150, B/T 250/250, M 150/350),
  × Max HP / MP Increase. Checked: Lv 10 Beginner 194/113, Lv 11 Warrior 572/275, Lv 30 Thief 1,134/953.
- Danger = one touch from the map's hardest hitter / Max HP: Raw = PADamage × 1.3, taken = Raw × (1 − DEF / (DEF +
  5 × (L + 40) + 1.2 × Raw)); DEF = floor(STR/4) + skills (Magic Armor, Iron Will, Sword Mastery, Iron Body %, − Rage),
  × (1 − Invincible) × (1 − Magic Guard share). Magic: monsters with an attackN/info/magic = 1 attack (maplestory.quest raw
  client, data/sources/mq_mob_magic.json: only Tauromacis 386 and Taurospear 410 MADamage at launch) also hit with MADamage
  vs M.DEF = floor(INT/4) + Magic Armor, × Magic Guard share; the worse hit counts. No armor. Labels from meowdb (<10 Safe, 10-24 Caution, 25-49 Danger, 50+ Lethal).
  Checked: Fighter 35 Ant Tunnel II 8% (meowdb 7% with gear), Magician 20 Transfer Area Caution (meowdb Caution).
- Portals to potions: BFS over `nav` from `potshops` (meowdb shops selling HP/MP potions, civic shops included). Matches the
  guides' counts (Line 1 <Area 1> 3, Transfer Area 4, FUN IV 5, Ant Tunnel III 5). Shown only, not scored.
- Level cap 100: D.exp 71-99 = previous × 1.0548 (meowdb; matches our table for 51-70 exactly); EXP_SURE = 49 is the last
  level meowdb says is confirmed. Where to train falls back to the best map of the rest when nothing is within 12 levels.

## Estimates the page makes (flagged in its "How" boxes)
- **Ammo attack** (stars, arrows): old-game values; Subi +15, Wolbi +17, Bronze arrows +1 confirmed by the meowdb class guides.
- **Map ranking**: time per kill = effective HP / DPS + 1.0 s; rate = min(map EXP / time, map EXP × 0.75 / 7.56 s respawn).
  Default DPS = 20 × level. Accuracy assumes all AP in the main stat, secondary = level, Precise Strikes (+20) / Nimble Body (+15)
  maxed from level 15. "Use this in Where to train" sends the builder's DPS and real accuracy instead (cleared when class/level is edited there). Maps need ≥8 mobs; bosses and mob_time > 60 excluded.
  meowdb's "max EXP/hr" ceiling = full-clear EXP × 0.75 × 3600 / 7.56 (verified exactly).
- **SP**: 1 at each job advancement + 3/level. 1st job = 61 (levels 10–30) and can only go into 1st job skills;
  2nd job = 1 + 3×(L−30). Spare SP shows once every visible 2nd-job skill is maxed (3rd job not in launch).
- **Auto skill build**: greedy, buys the next 1–5 points (incl. prerequisites) with the best (DPS × avg hit chance vs
  monsters within ±3 levels) gain per SP, then dumps leftovers into passives → buffs → rest.
- **Questline order** = level, then quest id (export gives the chain name, not step order).

## Path Planner (estimates, all said on the page)
- Character at each level = builder defaults via `buildAt` (best weapon, auto AP/SP, buffs on), cached per class/job/weapon/level.
  Below 10: damage 20 × level. 1st job used below 30, chosen 2nd job from 30.
- Grinding: best `mapRates` map; stays on the current map while it's within 10% of the best. No map near the level → best of the rest.
- Maple Island phase (start < 10 and "Still on Maple Island"): runs first in every mode. All 20 island quests in level/id order,
  island maps (id < 10,000,000) when a quest needs a higher level or until level 7, then Shanks (Southperry, lv 7+, 300 mesos,
  one way) to Lith Harbor, Lith Harbor quests, Phil's taxi (90% off as Beginner) to the job town at 10.
  Source: meowdb beginner guide (2026-10-02) + Roxie's new player guide: quests bring you to ~lv 8, Green Relaxer chair from Pio
  only on the island, Wooden Club (19 ATK) at creation then Razor at 5, 9 creation AP + 5/level all in the future main stat.
  Item-quest items with no drop source count as handed out (Pio's come from island boxes); drop items are shown "not timed".
- Beginner damage (below 10): basic attack, STR primary / DEX secondary, mastery 0.08, swing/stab 60/40. Checked against
  meowdb's table (13 STR, level 1 Snail, 45 HP): Club 3/3/2 hits min/avg/max, Sword and Hand Axe 4/3/3, matching exactly.
  Beginner accuracy uses the Warrior formula (Beginner's is unknown); island monsters have 0 avoid so it doesn't matter there.
- Quest time = 3 min walking/talking (1 min if same NPC as the previous quest; guesses) + kills × `mobKill` time;
  quest EXP includes the kills' EXP. 0-EXP quests are skipped unless another quest needs them.
  Only quests with no item requirements are timed (no drop rates); item quests are listed under the plan, and their chain
  successors are blocked. Skipped: Event, Crafting, repeatable, Citizenship, other classes' job quests, Maple Island from 10.
  Quests >5 levels under the starting level count as done.
- Mix = each quest as it unlocks (lowest level first) + grind between; optional "only faster than grinding". At the model's
  grinding speed almost no quest beats grinding on EXP/hr (e.g. lv 40: ~140k/h grinding vs 50–105k/h for the best quests).
- Pace multipliers 1 / 1.5 / 2 on all times are guesses (crowding, potions, breaks).
- Reward value column = quest mesos + NPC sell price of its items (get: all; pick: best; random: expected/average). A floor,
  not market value.
- Item drops (Danny's assumption, 2026-10-06): 30% per kill, or 15% "cautious". Quest cost = kill reqs + ceil(missing / rate)
  kills of the source monster, overlapping per monster. Items with no known source (NPC-made, boxes) stay untimed.
- Travel (estimates): walk 30 s per map crossed, cab 45 s between the 6 cab towns, NPC talk 60 s (30 s same NPC again; 180 s
  all-in when the NPC has no launch spot). Dijkstra over `nav` + cab links. A quest = walk to its NPC, each kill monster at
  the map minimising travel + kill time (kill time = max(n × kill time, n / (count × 0.75 / 7.56 s respawn))), then back.
  Grind maps: score = (level EXP + drop credit) / (grind time + travel from where you are). Position starts in Lith Harbor
  after the ship, unknown (no first-leg cost) when starting at 10+. Each leg is its own "travel" step (route text rebuilt
  from Dijkstra prev pointers); quest rows show talk + kill time only. Drop credit values saved kills at the quest's level.
- Map Navigator (65-navigator.js): same Dijkstra (`TRAVEL` from 60-planner.js), hops from its prev pointers. Maple Island
  -> Victoria = route to Southperry (60), Shanks' ship (one way, level 7+, 300 mesos), route from Lith Harbor. Victoria -> island:
  no route. Exit number per hop = the destination's number in minimap() (portals sorted by x). Maps not in `nav` (JQ, KPQ,
  Florina Beach, subway, Orbis...) have no route.
- AoE build (planner default): default skill weighs targets as if ~3 are in reach (Rush, Steal, Power Knockback excluded).
  Hits per cast per map = average over spawn points of min(targets, 1 + 0.75 × spawn points on the same platform
  (|dy| ≤ 60 px) within reach, busier facing). Reach = skill `range`, Thunder Bolt's ±170 px box, or 300 px projectile
  corridor. Kill time per monster ÷ hits; respawn cap unchanged. Where to train uses the same model by default (class area
  attack via AOE_SKILL, or the builder skill if it hits several), with a single-target option.
- Weapons: `wsrc` per weapon = meowdb NPC shops (data/sources/meowdb_shops.json, read 2026-10-06), export crafting
  recipes, quest rewards, meowdb drops (data/sources/meowdb_weapon_drops.json: only the 32 planner weapons that aren't
  sold/crafted; all 32 were MSEA reference lists, community lists didn't load). The planner's character (buildAt obt=true)
  only uses weapons obtainable at launch (shop, craft, launch quest, drop from a launch monster); a "weapon" step with
  sources appears whenever it changes. The Character Builder still offers every weapon.
- Collecting ahead: while grinding, wanted drops (quests within 5 levels, accepted or not; assumes monster-named ETC items
  drop without the quest, as the guides advise saving them) go in a bag at kills/s = count × rate / cycle EXP × drop rate.
  Map score = (level EXP + credit) / time, credit per saved item = (kill time × best EXP/s − kill EXP) / drop rate,
  i.e. the dedicated farming it saves. Replaces the old "≥ 50% of best EXP/hr" rewards-mode heuristic.
- "Most rewards" mode: every quest with mesos or items (timed or not, minus "Skip" and other classes' class-only picks) plus
  their prerequisites; order = community tier, then level, then reward value. Grinding prefers maps holding monsters that
  open/soon-open (≤ L+3) reward quests need, if the map is ≥ 50% of the best EXP/hr (judgment call). Item drops not timed.

## Crafting (src/js/45-crafting.js)
- Masters/quests per profession found from the Crafting quests: apprentice = no craft-level requirement, weekly = is_weekly
  (one pool of 6, 1 offered per week), the other = craft Lv 5 test (catalyst reward).
- "From scratch": crafted parts expanded to raw materials in whole batches (ceil(need / batch)), deepest parts last so shared
  parts aren't rounded twice. A part with several recipes uses the lowest craft level, then the biggest batch (skips the
  10 → 5 arrow swaps). Arrow swap recipes are listed as the export has them (Adamantium/Mithril pair looks crossed).
- Raw material sources: meowdb shops (two mis-parsed rows skipped: Jane, Arwen the Fairy), launch/citizenship quest rewards,
  monster = item named after it (`item_source`) or a monster named in its description (Firewood → Axe Stump, Tablecloth →
  Jr. Wraith, Cursed Doll → Zombie Lupin). A guess, said on the page. 13 materials have no known source (Leather,
  Fragment of Magic, Dragon Skin, Stiff Feather, Moon Rock, ...).
- Not in the files: success rates, catalyst odds, material drop rates.

## Upkeep, budget, armor, keep list (2026-10-06)
- Upkeep (builder calc → cost): attack MP/HP per cast × casts/hr + buffs kept up (MP/HP ÷ duration) + ammo (hits per cast, +3 per
  Hunter FA proc, × (1 − Claw Mastery return), 0 with Soul Arrow) at 1 meso/MP, 0.5/HP (Lemon / Red Potion), arrows 1, Bronze 2,
  star recharge 0.3-0.9 (meowdb Assassin guide). Crafted arrows have no price. "Up to" = attacking nonstop; getting hit not counted.
  Check: Fighter 70 = 83 PS/min × 12 MP ≈ 60k MP/hr (meowdb "6.6 Lemons a minute").
- mapRates row.att = share of time attacking (respawn-capped share × (time − 1 s walk per kill) / time); planner upkeep per grind
  step = cost/hr × model hours × att. Budget = weapons at cheapest meowdb shop price (free/crafted/quest/drop = 0) + upkeep;
  income = quest mesos + quest potions (D.potval, "get" rewards at cheapest meowdb shop price, capped at the upkeep they replace)
  + monster mesos.
- Monster mesos (2026-10-06): drop tables are server-side (not in the export; maplestory.quest has none). meowdb monster pages
  collect player reports: API `meowdb.com/msclassic/api/mesos-reports?monsterId=<id>` (meowdb ids = game mob ids; Cloudflare,
  so fetch from inside a headless-Chromium page). Saved to data/sources/meowdb_mesos.json (19 monsters, 1-2 trusted reports
  each, all say 100% drop chance). D.meso {mobId: [median (min+max)/2 × chance, reports]}; D.mesok = median mesos/level over
  reported monsters = 2.0 (Pig 7 → 13, Horny Mushroom 22 → 44, Lupin 37 → 74.5): the estimate for the rest. mapRates row.meso
  = rate × Σ count·meso / Σ count·EXP (mesos/s); planner drops = grind EXP ÷ rate × row.meso + quest kills (r.kl) × meso.
  If the real drop chance is under 100%, income scales down with it. Re-pull the reports as players add more.
- Hits-to-kill check (2026-10-06): on at-level monsters every class's main skill kills in about half the swings of a basic
  attack, so "skill on every attack" stays the upkeep assumption (it's what the plan's speed needs).
- Incoming hit chance (meowdb damage formula) shown with danger: A = mobACC×100/(5(G+51)), E = EVA/(1+EVA/80)/(1+G/40),
  f = 0.15+0.2/(1+e^((A−E)/12)), far out of reach 2-3%, then the 8% minimum-hit rescue. Shield Guard not counted.
- Armor (D.armor, 997 pieces): builder slots; stats add to total STR/DEX/INT/LUK (damage, accuracy, avoid, weapon requirements),
  W.DEF/M.DEF (base DEF before Iron Body %), HP/MP (after Max HP/MP Increase), crit. Shield ignored with 2H/bow/crossbow/claw/
  spear/polearm; overall replaces top + bottom. Planner/Where to train default characters wear none.
- Keep or sell tab: items launch quests (minus Event) or recipes ask for; quest-handed items (info.start) and unsellable items
  (no NPC price) left out unless a recipe uses them. Sources: quest data monster, crafting src, meowdb shops (shopsell), quest
  rewards, recipes, and D.drops (2026-10-06): meowdb community drop lists, `meowdb.com/msclassic/api/drops?monsterId=<game mob
  id>` (headless Chromium, Cloudflare), saved in data/sources/meowdb_drops.json; kept when upvotes − downvotes ≥ 1 (votes shown
  as "N players"). Also used by Crafting raw materials. Verdict per item: Keep all (no known source) > Keep N (one-time quests
  still open − "have"; Must do/Recommended quest first) > If you craft (recipes only) > Repeatable (weekly asks only) > Enough
  (have ≥ wanted) > Sell (wanting quests all done). "Have" = localStorage keephave {item id: n}; UI state = keep. Done quests =
  the Path Planner's pathdone "q<id>" ticks (Citizenship quests aren't in the planner, so they always count).
- Crafting leveling plan: per craft level, min (scratch fees + raw × NPC price) / craft EXP among recipes ≤ that level; crafts =
  ceil(level EXP / recipe EXP). Unpriced raws count 0 (flagged). Whether low recipes keep full EXP isn't known.
- Share links: #b= (builder S subset) / #p= (planner X) base64url JSON override localStorage; outside http(s) or inside the
  claude.ai artifact, links point at GitHub Pages (root index.html keeps the hash when forwarding).
- Bosses and timed spawns (D.timed): spawns with mob_time > 60 s or is_boss on launch maps. Mushmom: 60 min in data, players ~90.
- tests/golden.js: reference numbers (HP/MP, EXP, portals, Lucky Seven 366-622, 720 ms, Fighter upkeep, 10→20 pace).
- scripts/launch_diff.py <version>: a maplestory.io MCW version vs our COT2 data → docs/launch_diff.md. On 2026-10-06 "1" = COT1 (its values
  are the "before" side of OSMS's COT1→COT2 patch notes) and "CBT2" = our data, so no launch client yet; rerun when a new version appears.

## Class guides in the Path Planner (src/js/16-guides.js)
- "Class guides" select (localStorage `path.guide`): "all" (default) = guide build + guide maps, "build", "" = off.
- Build (buildAt guide=true): first-job SP from the guide's per-level table (kept at its Lv 30 result above 30; 2nd-job SP
  greedy), AP per the guide's table (Bowman crossbow variant), weapons = the guide's list for the level's checkpoint
  (10/15/20/25/30) that fit the weapon family, best by modeled DPS; no guide weapon for the family (Blunt, Spear, Polearm)
  → best shop-sold weapon. Free Beginner's Garnier for Thieves. Future Bandits use a claw before 30 ("Sindit").
  Attack = best of the skilled attacks (AoE: weighs up to 3 targets). Ammo: Wolbi / Bronze arrows from 25 (unlock at
  citizenship grade 3 = level 22 + 2,000 contribution; "by 25" is our assumption, said on the page).
- Guide warrior DEX assumes +DEX helmets for 20/25/30 weapons; the build doesn't enforce weapon stat requirements.
- Maps: grinding at 10–30 picks among the guide's Training Advisor maps for the checkpoint (score as usual: EXP, travel,
  drop credit); the model's fastest map is shown when it's >2% faster. Bowman has no level-10 picks → model.
- Steps: guide gear row at each checkpoint, citizenship town at 12, ammo upgrade at 25, per-level SP/AP notes under the
  step a level-up happens in (Beginner: Nimble Feet 2–4, Three Snails 5–7, Recovery 8–10, from the beginner guide's order).
- 30-70 (GUIDE2, per branch): 2nd-job SP table ({W} = weapon family; Bandit "__reset" at 40 with the reset first-job
  build), AP rules (last rule continues past 70), weapons per checkpoint (candidates filtered by family; Page sword uses the
  Fighter guide's swords; above 70 the model's best weapon competes), maps by name → open launch map ids (Forgotten Hollow
  picks drop out). Bandit: claw + Lucky Seven until 40, reset step in the plan. Cleric: solo order.
- Planner side steps: KPQ at 21 (Proof of Companionship, 10311), citizenship, gear rows per checkpoint up to 70, SP reset.
- Calibration (2026-10-06, after these changes, guide build, mix, 1.5×): 10→20 3.2-4.5 h, 20→30 8.9-10 h; meowdb reports COT2
  testers at 3-4 h and 8-9 h.
- Model check, 1→30 grinding at 1.5× pace (2026-10-06): guide build ≈ greedy build (13–14 h); guide maps slower in this model
  for Warrior (17 h vs 13), Magician (16 vs 14), Bowman (19 vs 13), faster for Thief (12 vs 13). The guides' maps require
  100% hit and guaranteed 2-hit kills and weigh danger/refill walks; this model ranks by average EXP/hr only.

## Valuable quests (src/js/15-valuable.js)
- Hand-curated VALUE map, quest id -> tier (Must do / Recommended / Worth doing / Situational / Skip), reward, why, class-only, sources.
  Tier = what the guides say; where they differ, the more cautious label + the caveat in "why" (e.g. Pia's Gift: S in
  maplestory.quest, Situational in metaroad because of input cost).
- Quest Database: pill + reason under the name, "Valuable quests only" toggle (localStorage qval), "Why players do it" in the tooltip.
- Path Planner: shown as untimed side-task rows at the level the quest's chain starts (checkbox, default on); class-only picks
  hidden for other classes; timed valuable quests stay in the plan even with "only faster than grinding".

## Suspicious data to double-check
- Lucky Seven `attack_count` = 1 and Double Shot = 2 targets × 1 hit in the export. Resolved (meowdb class guides + skill text):
  Lucky Seven = 2 lines, Double Shot = 2 arrows split over 1–2 targets (fixed total) → HITS_FIX in 50-builder.js. The Thief
  guide's Lv 30 example (366–622 per cast) matches the damage formula exactly with 2 hits and STR + DEX as Thief secondary.
- Precise Strikes: +20 ACC at max. Settled 2026-10-06: the skill table and meowdb's Warrior guide both say +20 (an earlier audit note said +50).
- "Event" region quests (7, "[Event] ..." leaf quests) are included; unknown if they run at launch. maplestory.quest's Founder's
  Access release notes page would say, but returned 404 / timed out on 2026-10-06. Re-check.

## Decisions
- Hidden weapons: names with "Wizet"/"GM", and the 1-meso summer-event tubes (Old Gladius kept).
- Weapon-type toggle (Sword/Axe, Sword/Blunt, Spear/Polearm, Bow/Crossbow, Claw/Dagger) hides the other family's
  weapons and mastery/booster/Final Attack skills; Magicians have none.
- Equipment rewards = item IDs 1,000,000–1,999,999.
- Not at launch: quests in El Nath/Orbis/Forgotten Hollow; monsters whose only spawns are Forgotten Hollow maps
  (map ids 10006xxx) → `latermobs`/`latermobnames`. Zombie Mushroom stays (also in Ant Tunnel).
- Wide screens zoom the page: ≥1350px 1.06, ≥1600px 1.12, ≥1900px 1.2.

## data/data.json schema
- `mobs` {id: [name, level, hp, exp, eva, PDD, MDD, elements{}, undead]}
- `maps` {id: [name, openAtLaunch 1/0, [[mobId, count], ...]]}
- `exp` {level: exp to next}
- `weapons` [[name, type, reqLv, STR, DEX, INT, LUK, ATK, MATK, speed, jobLabel, price, itemId]] (every weapon is also in `items`/`iicons`)
- `skills` {job: [{id, n, max, req:[[name,lv]], k kind, att, mob (number or per-level array), st per-level text[], d desc}]}; `icons` {skillId: base64 png}
- `quests` (non-Citizenship) / `citq` (Citizenship) rows: name, lvl, npc, region, exp, mesos, req, kills, mult (Bonus), eq_kills,
  eq_mob, pct_level, reward, rep (daily/weekly), id, grade, contrib, contrib_by_grade, town, pool, one_time,
  kl [[mobId, n]], il [[item, n, sourceMobId|null]], pre [questId],
  chain, cpos, cn, ri (reward groups {k: get|pick|rand, job, it: [[itemId, count, chance%]]}), info (tooltip: d, req, mesos, items, start, prev, next, chain, rep, contrib, eq)
- `items` {itemId: {n, c category, s sub, st stats, job, p price, d desc, wt weapon type, spd, sp spec}}; `iicons` {itemId: base64}
- `mmaps` {mapId: base64 minimap, open maps only}, `mmapType` "webp" | "png" (WebP needs Pillow at data-build time)
- `mmdim` {mapId: [w, h]} minimap pixels; `portals` {mapId: [[x, y, destMapId, hidden]]} x/y as 0-1 fractions of the minimap;
  `mapnames` {mapId: name} for portal destinations. Portal x/y in portals.json are pixels of the dashboard's full map
  renders; render sizes come from 64-byte range reads of each render (cached in vendor/render_dims.json). Per-axis stretch
  onto the minimap put 92% of monster spawn points on drawn platforms (uniform-scale variants: 86-91%).
- `npcs` {npcId: [name, [[mapId, x, y]]]} (x/y minimap fractions), `npcid` {name: npcId}, `npcimg` {npcId: png}, `npcmaps`
  [mapIds with quest NPCs; their minimaps/portals are included even if they have no monsters]; `mobimg` {mobId: png thumbnail}
- `nav` {mapId: [neighbour mapIds]} walkable launch-map graph from map exits (two-way); `cabs` [town mapIds with a cab NPC]
- `mpos` {mapId: [[x, y]]} monster spawn points (map pixels) of open maps; skills carry `rg` (range px per level)
- `craft` {disc: [[name, skillId, master NPC, apprentice qId, weekly qId, Lv 5 qId]], rec: [[disc index, output type,
  craft Lv, itemId, batch, craft EXP, mesos, [[itemId, n]]]], src: {raw itemId: {mob: [mobId], why: name|desc, shop: [[npc, mapId, map, price]]}}};
  every recipe item, catalyst and kit is in `items`/`iicons`
- `shopsell` {itemId: [npc, map, price]} (quest items sold by meowdb NPCs); `timed` [[mobId, name, lv, hp, exp, mapId, mapName, count,
  timer s, boss]]; `armor` [[id, name, slot, reqLv, job, gender, [reqSTR, DEX, INT, LUK], {stat: n}, shop price]]
- `mobatk` {mobId: [touch attack, accuracy]}; `potshops` [[npc, mapId, mapName]] (step_extras, `build_data.py extras`)
- `mobdb` {mobId: export monster fields (name, level, hp, mp, exp, PADamage, MADamage, PDDamage, MDDamage, acc, eva, speed,
  pushed, stagger, hp/mp_recovery, elements, undead, is_boss, aggro, invincible, passive, special, attacks, self_buffs, debuffs,
  revives), maps [[mapId, name, count, respawn s string, kind ""|KPQ|2nd job test]], dr [[itemId, name, net votes ≥ 0]] (meowdb),
  meso [per kill, reports, min, max, drop %] (meowdb), sp {mapId: [[x, y]]} spawn points as minimap fractions}: launch-reachable monsters (71) incl. bosses/KPQ/job test; `mskill`
  {mobSkillId: png}. Built by `build_data.py mobdb`; mobimg also gets thumbnails for these.
- `latermobs` [mobId]. Note `maps` spawn lists drop long-respawn spawns (mob_time > 60), e.g. Fairy 2
  (Someone Else's House) and Fairy 3 (Tree Dungeon, Forest Up North VI/VII): they ARE at launch, just not in the ranking.

## Ideas not done yet
- Hide/show toggle for quest columns on phones; Citizenship grade-progress estimator (needs confirmed daily limits).
- Re-run everything against the launch client export once OSMS publishes it (bump OSMS_REF, rebuild, re-verify numbers).
