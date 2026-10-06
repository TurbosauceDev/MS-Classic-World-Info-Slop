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
- Quest time = 3 min walking/talking (guess) + kills × `mobKill` time; quest EXP includes the kills' EXP.
  Only quests with no item requirements are timed (no drop rates); item quests are listed under the plan, and their chain
  successors are blocked. Skipped: Event, Crafting, repeatable, Citizenship, other classes' job quests, Maple Island from 10.
  Quests >5 levels under the starting level count as done.
- Mix = each quest as it unlocks (lowest level first) + grind between; optional "only faster than grinding". At the model's
  grinding speed almost no quest beats grinding on EXP/hr (e.g. lv 40: ~140k/h grinding vs 50–105k/h for the best quests).
- Pace multipliers 1 / 1.5 / 2 on all times are guesses (crowding, potions, breaks).

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
- `weapons` [[name, type, reqLv, STR, DEX, INT, LUK, ATK, MATK, speed, jobLabel, price]]
- `skills` {job: [{id, n, max, req:[[name,lv]], k kind, att, mob (number or per-level array), st per-level text[], d desc}]}; `icons` {skillId: base64 png}
- `quests` (non-Citizenship) / `citq` (Citizenship) rows: name, lvl, npc, region, exp, mesos, req, kills, mult (Bonus), eq_kills,
  eq_mob, pct_level, reward, rep (daily/weekly), id, grade, contrib, contrib_by_grade, town, pool, one_time,
  kl [[mobId, n]], il [[item, n, sourceMobId|null]], pre [questId],
  chain, cpos, cn, ri (reward groups {k: get|pick|rand, job, it: [[itemId, count, chance%]]}), info (tooltip: d, req, mesos, items, start, prev, next, chain, rep, contrib, eq)
- `items` {itemId: {n, c category, s sub, st stats, job, p price, d desc, wt weapon type, spd, sp spec}}; `iicons` {itemId: base64}
- `latermobs` [mobId], `latermobnames` [name]. Note `maps` spawn lists drop long-respawn spawns (mob_time > 60), e.g. Fairy 2
  (Someone Else's House) and Fairy 3 (Tree Dungeon, Forest Up North VI/VII): they ARE at launch, just not in the ranking.

## Ideas not done yet
- Hide/show toggle for quest columns on phones; Citizenship grade-progress estimator (needs confirmed daily limits).
- Re-run everything against the launch client export once OSMS publishes it (bump OSMS_REF, rebuild, re-verify numbers).
