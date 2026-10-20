// Reference numbers: the model checked against values published by meowdb / the game files, so a change that quietly
// breaks the math fails here. Run: node tests/golden.js (after python3 scripts/build.py). Sources in docs/notes.md.
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.resolve(__dirname, "../dist/index.html"));
  const check = (ok, msg, got) => { if (!ok) errs.push(`FAILED: ${msg} (got ${JSON.stringify(got)})`); else console.log("ok  " + msg) };

  // HP / MP (meowdb HP/MP guide, COT2-measured)
  for (const [cls, L, want] of [["Beginner", 10, [194, 113]], ["Warrior", 11, [572, 275]], ["Magician", 10, [344, 463]], ["Bowman", 10, [444, 363]], ["Thief", 30, [1134, 953]]]) {
    const got = await p.evaluate(([c, l]) => hpmpAt(c, l), [cls, L]);
    check(got[0] === want[0] && got[1] === want[1], `${cls} ${L} HP/MP ${want.join("/")}`, got);
  }
  // EXP table: launch client (OSMS formulas page): 1-50 closed form, 51-89 ×1.0548, 90-99 ×2.1 (Lv 90 needs 11,938,059)
  const exp = await p.evaluate(() => [D.exp[10], D.exp[49], D.exp[50], D.exp[90], D.exp[99]]);
  check(exp.join() === [1716, 655200, 709716, 11938059, 9482161548].join(), "EXP to next at 10 / 49 / 50 / 90 / 99", exp);
  // monster mesos (OSMS formulas page): Ribbon Pig Lv 10 base 24, drops 21-26 on 67% of kills -> 15.76 avg per kill
  const ms = await p.evaluate(() => [Math.round(mesoKill("10") * 100) / 100, mesoRange(10).join("-")]);
  check(ms[0] === 15.76 && ms[1] === "21-26", "mesos per kill: Ribbon Pig 21-26 on 67% of kills = 15.76", ms);
  // launch-client formulas (OSMS formulas page): damage taken, party bonus (all members hitting), Iron Arrow 0.8^k
  const lc = await p.evaluate(() => [hitTaken(100, 50, 30), ...[2, 4, 6].map(n => Math.round(partyBonus(n) * 100)), D.craft.rec.every(r => r[2] <= 8)]);
  check(lc.join() === [114, 15, 45, 55, true].join(),
    "damage taken Atk 100 DEF 50 Lv 30 = 114; party bonus 2/4/6 = 15/45/55%; crafting capped at Lv 8", lc);
  // Beginner accuracy below 10 (OSMS formulas page): trunc(common / 2.5 + 5) whatever the planned class. Warrior Lv 5 with
  // the assumed stats (DEX 5, LUK 4): trunc((6 + 10 + 2.4) / 2.5 + 5) = 12; Lv 10 switches to the Warrior branch, also truncated
  const bacc = await p.evaluate(() => [classAcc("Warrior", 5), classAcc("Bowman", 5), Math.round(classAcc("Warrior", 10) * 100) / 100]);
  check(bacc.join() === [12, 25, 23].join(), "Beginner accuracy Lv 5 Warrior/Bowman = 12/25; Warrior Lv 10 = trunc(23.76) = 23", bacc);
  // portals to the nearest potion NPC (meowdb class guides)
  const pots = await p.evaluate(() => { const id = n => Object.keys(D.maps).find(k => D.maps[k][0].trim() === n && D.maps[k][1]);
    return ["Line 1 <Area 1>", "Transfer Area", "Tree Dungeon, Forest Up North IV", "Ant Tunnel III"].map(n => POTS[id(n)]?.[0]) });
  check(pots.join() === "3,4,5,5", "portals to potions: Line 1 3, Transfer Area 4, FUN IV 5, Ant Tunnel III 5", pots);
  // attack times: Fighter Lv 70 Chrono + Booster = 720 ms (83 Power Strikes/min, meowdb); spells always 810 ms
  const t = await p.evaluate(() => [buildAt("Warrior", "Fighter", "Axe", 70, false, true, true), buildAt("Magician", "I/L Wizard", null, 50, false, true, true)]);
  check(t[0].weapon === "Chrono" && t[0].skill === "Power Strike", "Fighter 70 guide build uses Chrono + Power Strike", [t[0].weapon, t[0].skill]);
  // Final Attack: every one parses a 25% proc and its damage at max level (OSMS renamed "success rate" to "trigger rate"
  // in the Oct 17 export and the builder read 0%, dropping Final Attack from all DPS; skills.json, e.g. id 3101000)
  const fa = await p.evaluate(() => Object.values(D.skills).flat().filter(s => /^Final Attack/.test(s.n)).map(s => [s.n, ...BLD.faStats(s.st.at(-1))]));
  check(fa.length === 8 && fa.every(f => f[1] === 25 && f[2] > 0), "Final Attack 25% proc + damage parsed for all 8", fa);
  const xb = await p.evaluate(() => ["Hunter", "Crossbowman", "Fighter", "Page", "Spearman"].map(b => buildAt(b === "Hunter" || b === "Crossbowman" ? "Bowman" : "Warrior", b, null, 50, false, true, true).skill));
  check(xb.every(s => !/^Final Attack/.test(s)), "no Lv 50 guide build casts Final Attack as its main skill", xb);
  // upkeep: 83 casts × 12 MP a minute ≈ 59,760 MP/hr + buffs (meowdb: "6.6 Lemons a minute")
  check(t[0].cost.mpHr > 59000 && t[0].cost.mpHr < 62000, "Fighter 70 MP upkeep ~60k/hr", Math.round(t[0].cost.mpHr));
  // Lucky Seven per cast (meowdb Thief guide, Lv 30: 139 LUK, 34 DEX, 5 STR, Adamantium Guards + Wolbi = 40 W.ATK): 366-622
  const tab = id => p.evaluate(id => document.querySelector(id).click(), id);   // tabs sit behind the category nav
  await tab("#t-plan");
  await p.click('#pclass button[data-v="Thief"]');
  // meowdb's totals include gear (+7 LUK, +4 DEX, +1 STR); as base AP they need a level-33 AP budget. Level doesn't enter damage.
  await p.fill("#plvl", "33"); await p.dispatchEvent("#plvl", "change");
  await p.selectOption("#pbranch", "Assassin");
  await p.selectOption("#pweapon", "Adamantium Guards");
  await p.selectOption("#pammo", { label: "Wolbi Throwing Stars (+17)" });
  for (const [k, v] of [["STR", 5], ["DEX", 34], ["INT", 4], ["LUK", 139]]) { await p.fill("#p" + k, String(v)); await p.dispatchEvent("#p" + k, "input") }
  await p.click("#pspreset");
  const l7 = await p.evaluate(() => { const b = [...document.querySelectorAll("#pskills .srow")].find(r => r.textContent.includes("Lucky Seven")); b.querySelector(".smax").click();
    const s = $("#pskill"); s.value = [...s.options].find(o => o.text === "Lucky Seven").value; s.dispatchEvent(new Event("change")); return $("#pattack").textContent });
  const m = l7.replace(/,/g, "").match(/Damage range(\d+) – (\d+)/);
  check(m && +m[1] * 2 >= 365 && +m[1] * 2 <= 368 && +m[2] * 2 >= 621 && +m[2] * 2 <= 624, "Lucky Seven 20 at Thief 30: 366-622 per cast (2 lines)", m && [m[1] * 2, m[2] * 2]);
  const sp = await p.textContent("#pdpsnote");
  check(/every ~0\.72 s/.test(sp), "Adamantium Guards (speed 4) attack time 720 ms", sp.slice(0, 80));
  // Path Planner pace check: COT2 testers took 3-4 h for 10->20 (meowdb EXP guide); the plan at 1.5x should be close
  await tab("#t-path"); await p.click('#xcls button[data-v="Warrior"]'); await p.click('#xmode button[data-v="mix"]');
  await p.selectOption("#xguide", "build"); await p.selectOption("#xpace", "1.5"); await p.fill("#xcur", "10"); await p.fill("#xgoal", "20"); await p.waitForTimeout(600);
  const h = +((await p.textContent("#xsum h3")).match(/([\d.]+) h/) || [])[1];
  check(h >= 2.5 && h <= 5.5, "Warrior 10->20 at average pace within 2.5-5.5 h (testers: 3-4 h)", h);
  // skill names the code names by hand must exist in the export (OSMS c661434 renamed "Arrow Bomb: Bow" -> "Arrow Bomb" and
  // "Iron Arrow: Crossbow" -> "Iron Arrow": Hunter/Crossbowman guides lost those SP and Where to train dropped Bowman AoE)
  const nw = Object.keys(JSON.parse("{" + require("fs").readFileSync(path.resolve(__dirname, "../src/js/50-builder.js"), "utf8").match(/const NEEDS_WEAPON = \{([^}]*)\}/)[1] + "}"));
  const lost = await p.evaluate(nw => { const names = new Set(Object.values(D.skills).flat().map(s => s.n)), out = new Set();
    for (const g of [...Object.values(GUIDE), ...Object.values(GUIDE2)]) for (const lv of Object.values(g.sp || {})) for (const n of Object.keys(lv)) if (!names.has(n) && !/[{]|^__/.test(n)) out.add(n);   // "{W} Mastery" = weapon-family template
    for (const n of [...nw, ...Object.keys(AOE_FALL), ...Object.values(AOE_SKILL).map(f => (f(30) || [])[1]).filter(Boolean)]) if (!names.has(n)) out.add(n);
    return [...out] }, nw);
  check(!lost.length, "every skill named in guides / AoE / weapon tables exists in the export", lost);
  const aoe = await p.evaluate(() => [classAoe("Warrior", 10)?.n ?? null, classAoe("Warrior", 11)?.n, classAoe("Bowman", 45)?.n, buildAt("Warrior", "Fighter", "Sword", 10, true).dps > 0]);
  check(aoe.join() === ",Slash Blast,Arrow Bomb,true", "area attacks: none at Warrior 10 (1 SP; Slash Blast needs Power Strike 1), Slash Blast at 11, Arrow Bomb at Bowman 45", aoe);
  console.log(errs.length ? "\n" + errs.join("\n") : "\nall reference numbers match");
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
