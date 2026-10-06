# Notes: formulas, data, sources, decisions

## Sources
| What | Source |
|---|---|
| Monsters, maps, spawns, quests, items, skills, icons, citizenship quests | OSMS Data Explorer COT2 export — github.com/ohmi69/osms_datamine_dashboard (pinned in scripts/fetch_osms.sh) |
| 2008 comparison | same repo, `data/patches/v49` (GMS v49, Jan 2008) |
| EXP table 1–70 | maplestory.quest (checked: 10→30 = 545,290; 30→40 = 1,713,976) |
| Accuracy / hit / damage / defense formulas | COT2 client audit published on maplestory.quest / OSMS `tabs/formulas.js` |
| SP rules | meowdb guides (glossary; Warrior 1–30; Page 30–70) |
| Citizenship grades, discounts, storage fees, civic shops, how to join | meowdb.com/msclassic/citizenship (says: COT2; housing, daily limits, reactivation fees unconfirmed). Read through a summarising fetch — every shop item name was checked to exist in the export, prices/grades were not verifiable |
| Maple Island sequence, beginner gear/AP, job instructors | meowdb beginner guide (updated 2026-10-02) and Roxie's new player guide, read with headless Chromium (plain fetches get a Cloudflare 403) |
| Valuable quests (tiers, reasons) | metaroad.gg "Must-Do Quests & Valuable Rewards" (Jota, upd. 2026-09-19), maplestory.quest "Valuable quest rewards worth the detour" (Chief Stan), meowdb beginner guide. Read with headless Chromium (WebFetch blocked; metaroad hides level tabs, so hidden panels were forced visible). Reddit blocked from the cloud env. Forgotten Hollow picks (Road Back Home, Matters of the Heart, Heart of Stillness) left out |
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
- Party EXP (COT2): +10/20/30% for 2/3/4+ players; spawns 75% solo → 100% at 6. Sources disagree on party numbers — not used.

## Estimates the page makes (flagged in its "How" boxes)
- **Attack interval** = 0.42 + 0.06 × speed stage; booster −2 stages. Not from the client — DPS is approximate.
- **Ammo attack** (stars, arrows) uses old-game values; the export has none.
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
- AoE build (planner default): default skill weighs targets as if ~3 are in reach (Rush, Steal, Power Knockback excluded).
  Hits per cast per map = average over spawn points of min(targets, 1 + 0.75 × spawn points on the same platform
  (|dy| ≤ 60 px) within reach, busier facing). Reach = skill `range`, Thunder Bolt's ±170 px box, or 300 px projectile
  corridor. Kill time per monster ÷ hits; respawn cap unchanged. Where to train stays single target.
- Collecting ahead: while grinding, wanted drops (quests within 5 levels, accepted or not; assumes monster-named ETC items
  drop without the quest, as the guides advise saving them) go in a bag at kills/s = count × rate / cycle EXP × drop rate.
  Map score = (level EXP + credit) / time, credit per saved item = (kill time × best EXP/s − kill EXP) / drop rate,
  i.e. the dedicated farming it saves. Replaces the old "≥ 50% of best EXP/hr" rewards-mode heuristic.
- "Most rewards" mode: every quest with mesos or items (timed or not, minus "Skip" and other classes' class-only picks) plus
  their prerequisites; order = community tier, then level, then reward value. Grinding prefers maps holding monsters that
  open/soon-open (≤ L+3) reward quests need, if the map is ≥ 50% of the best EXP/hr (judgment call). Item drops not timed.

## Valuable quests (src/js/15-valuable.js)
- Hand-curated VALUE map, quest id -> tier (Must do / Recommended / Worth doing / Situational / Skip), reward, why, class-only, sources.
  Tier = what the guides say; where they differ, the more cautious label + the caveat in "why" (e.g. Pia's Gift: S in
  maplestory.quest, Situational in metaroad because of input cost).
- Quest Database: pill + reason under the name, "Valuable quests only" toggle (localStorage qval), "Why players do it" in the tooltip.
- Path Planner: shown as untimed side-task rows at the level the quest's chain starts (checkbox, default on); class-only picks
  hidden for other classes; timed valuable quests stay in the plan even with "only faster than grinding".

## Suspicious data to double-check
- Lucky Seven `attack_count` = 1 and Double Shot = 2 targets × 1 hit in the export (old game: 2 stars / 2 hits).
- Precise Strikes +20 acc in the skill table vs a +50 note in an earlier formula audit — page uses the skill table.
- "Event" region quests are included; unknown if they run at launch.

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
- `mobdiff` [[name, level, null | {level,hp,exp,acc,eva,PADamage,PDDamage,MDDamage: [old, new]}]]
- `skilldiff` [[class, job, name, oldText, newText, oldMaxLv, newMaxLv, changed]]
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
- `latermobs` [mobId], `latermobnames` [name]. Note `maps` spawn lists drop long-respawn spawns (mob_time > 60), e.g. Fairy 2
  (Someone Else's House) and Fairy 3 (Tree Dungeon, Forest Up North VI/VII): they ARE at launch, just not in the ranking.

## Ideas not done yet
- Hide/show toggle for quest columns on phones; Citizenship grade-progress estimator (needs confirmed daily limits).
- Re-run everything against the launch client export once OSMS publishes it (bump OSMS_REF, rebuild, re-verify numbers).
