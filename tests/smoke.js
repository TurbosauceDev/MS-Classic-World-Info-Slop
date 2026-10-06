// Smoke test: open dist/index.html in Chromium, click through every tab and the main interactions,
// fail on any page error. Run: npm i -D playwright && node tests/smoke.js
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.resolve(__dirname, "../dist/index.html"));
  const check = (ok, msg) => { if (!ok) errs.push("FAILED: " + msg); else console.log("ok  " + msg) };

  // Character Builder
  for (const c of ["Warrior", "Magician", "Bowman", "Thief"]) {
    await p.click(`#pclass button[data-v="${c}"]`);
    await p.fill("#plvl", "45"); await p.dispatchEvent("#plvl", "change");
    check((await p.textContent("#pspleft")).includes("spent") || (await p.textContent("#pspleft")).includes("spare"), `${c} 45 auto-build spends all SP`);
    check(+(await p.textContent("#pdps")).replace(/,/g, "") > 0, `${c} 45 has damage`);
  }
  // Path Planner (opened from the builder)
  await p.click("#ppath");
  await p.waitForTimeout(300);
  check(!(await p.isHidden("#path")), "builder opens Path Planner");
  for (const m of ["mix", "quests", "grind", "rewards"]) {
    await p.click(`#xmode button[data-v="${m}"]`);
    check((await p.$$eval("#xrows tr", r => r.length)) > 0 && !/NaN|undefined/.test(await p.textContent("#path")), `path plan (${m}) renders`);
  }
  await p.click("#xrows .stepchk input >> nth=0");
  check(await p.$eval("#xrows tr[data-k]", r => r.classList.contains("done")), "planner step tick fades the row");
  await p.click("#xrows .stepchk input >> nth=0");
  for (const g of ["all", "build", ""]) {
    await p.selectOption("#xguide", g);
    check((await p.$$eval("#xrows tr", r => r.length)) > 0 && !/NaN|undefined/.test(await p.textContent("#path")), `class guides "${g || "off"}" plan renders`);
  }
  await p.selectOption("#xguide", "all"); await p.fill("#xcur", "10"); await p.fill("#xgoal", "30"); await p.waitForTimeout(400);
  check(/guide map/.test(await p.textContent("#xrows")) && /Lv 1\d: /.test(await p.textContent("#xrows")), "guide maps and level-up notes shown");
  for (const [br, n] of [["Bandit", "reset"], ["Hunter", "Hunter guide weapons"]]) {
    await p.click(`#xcls button[data-v="${br === "Bandit" ? "Thief" : "Bowman"}"]`); await p.selectOption("#xbranch", br);
    await p.fill("#xcur", "30"); await p.fill("#xgoal", "100"); await p.waitForTimeout(800);
    check((await p.textContent("#xrows")).includes(n) && /to level 100/.test(await p.textContent("#xsum")), `${br} 30-100 plan with ${n}`);
  }
  await p.selectOption("#xparty", "4"); await p.fill("#xcur", "15"); await p.fill("#xgoal", "30"); await p.waitForTimeout(500);
  check(/Kerning Party Quest/.test(await p.textContent("#xrows")) && /Safe|Caution|Danger/.test(await p.textContent("#xrows")), "party, KPQ and danger in the plan");
  await p.selectOption("#xparty", "1");
  // Where to train
  await p.click("#t-maps"); check(await p.$$eval("#maps tbody tr", r => r.length) > 0, "map ranking renders");
  await p.selectOption("#party", "3"); await p.fill("#lvl", "85"); await p.dispatchEvent("#lvl", "input");
  check(await p.$$eval("#maprows tr", r => r.length) > 0 && /portals to/.test(await p.textContent("#maprows")) && !/NaN|undefined/.test(await p.textContent("#maps")), "Where to train: level 85, party, danger, potions");
  // Quest Database
  await p.click("#t-quests");
  check((await p.textContent("#qcount")).includes("quests"), "quest table renders");
  await p.click("#qhead th[data-k=lvl] button");
  await (await p.$(".chainbtn")).click(); check(!(await p.isHidden("#qchainbar")), "questline filter");
  await p.click("#qchainclear");
  await p.click("#qeq"); check(await p.$$eval("#qrows tr", r => r.length) > 0, "equipment filter"); await p.click("#qeq");
  // Citizenship
  await p.click("#t-cit");
  for (const t of ["Henesys", "Kerning City"]) {
    await p.click(`#ctown button[data-t="${t}"]`);
    check(await p.$$eval("#cgrades tr", r => r.length) === 10, `${t} grades table`);
  }
  // Crafting
  await p.click("#t-craft");
  check(await p.$$eval("#crmasters .fact", r => r.length) === 6, "six profession masters");
  check(/^348 /.test(await p.textContent("#crcount")), "all 348 recipes listed");
  await p.click('#crdisc button[data-d="4"]'); await p.selectOption("#crcls", "Thief");
  check(await p.$$eval("#crrows tr", r => r.length) > 0, "Leatherworking Thief filter");
  await p.click("#crmats .crfind >> nth=0");
  check(await p.$$eval("#crrows tr", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#craft")), "material click filters recipes");
  // Keep or sell, armor, share links, crafting leveling, bosses, quest compact toggle
  await p.click("#t-keep"); check(/items/.test(await p.textContent("#kcount")) && await p.$$eval("#krows tr", r => r.length) > 50, "keep list renders");
  await p.click("#konly"); check(await p.$$eval("#krows tr", r => r.length) > 0, "keep list: no-source filter"); await p.click("#konly");
  { const tr = await p.$("#krows tr:has(td:nth-child(2) .p-hot)"); const before = await tr.$eval("td:nth-child(2)", e => e.textContent);
    await (await tr.$(".khave")).fill("999"); const after = await tr.$eval("td:nth-child(2)", e => e.textContent);
    check(/Keep \d/.test(before) && /Enough|Repeatable|If you craft/.test(after), "keep list: have count changes the verdict", [before, after]);
    await (await tr.$(".khave")).fill(""); }
  await p.selectOption("#kby", "c"); await p.selectOption("#kdisc", { index: 1 }); check(await p.$$eval("#krows tr", r => r.length) > 0, "keep list: crafting + profession filter");
  await p.selectOption("#kby", ""); await p.selectOption("#kdisc", "");
  await p.click("#t-credits"); check(await p.$$eval("#credits .card", c => c.length) === 6, "credits tab renders");
  await p.click("#t-craft"); await p.selectOption("#crlvdisc", "2"); check(/mesos to craft Lv 10/.test(await p.textContent("#crlvtot")) && await p.$$eval("#crlvrows tr", r => r.length) === 10, "crafting leveling plan");
  await p.click("#t-maps"); check(await p.$$eval("#timedrows tr", r => r.length) > 10 && /Mushmom/.test(await p.textContent("#timedrows")), "bosses and timed spawns");
  await p.click("#t-quests"); await p.click("#qcompact"); await p.click("#qcompact"); check(await p.$$eval("#qrows tr", r => r.length) > 0, "quest compact toggle");
  await p.click("#t-plan"); const opt = await p.$eval('#pgear select[data-slot="Hat"]', s => s.options[1]?.value);
  if (opt) { await p.selectOption('#pgear select[data-slot="Hat"]', opt); check(/1 piece/.test(await p.textContent("#pgearsum")), "armor slot equips"); await p.click("#pgearclear") }
  check(/mesos\/hr/.test(await p.textContent("#pcost")), "builder upkeep shown");
  await p.click("#pshare"); await p.waitForTimeout(200); check(!/NaN|undefined/.test(await p.textContent("#plan")), "copy build link");
  console.log(errs.length ? "\n" + errs.join("\n") : "\nall good");
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
