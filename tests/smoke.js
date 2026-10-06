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
  console.log(errs.length ? "\n" + errs.join("\n") : "\nall good");
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
