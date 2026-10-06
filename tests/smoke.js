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
  for (const m of ["mix", "quests", "grind"]) {
    await p.click(`#xmode button[data-v="${m}"]`);
    check((await p.$$eval("#xrows tr", r => r.length)) > 0 && !/NaN|undefined/.test(await p.textContent("#path")), `path plan (${m}) renders`);
  }
  await p.click("#xrows .stepchk input >> nth=0");
  check(await p.$eval("#xrows tr[data-k]", r => r.classList.contains("done")), "planner step tick fades the row");
  await p.click("#xrows .stepchk input >> nth=0");
  // Where to train
  await p.click("#t-maps"); check(await p.$$eval("#maps tbody tr", r => r.length) > 0, "map ranking renders");
  // Quest Database
  await p.click("#t-quests");
  check((await p.textContent("#qcount")).includes("quests"), "quest table renders");
  await p.click("#qhead th[data-k=lvl] button");
  await (await p.$(".chainbtn")).click(); check(!(await p.isHidden("#qchainbar")), "questline filter");
  await p.click("#qchainclear");
  await p.click("#qeq"); check(await p.$$eval("#qrows tr", r => r.length) > 0, "equipment filter"); await p.click("#qeq");
  // What changed since 2008
  await p.click("#t-diff"); check((await p.textContent("#difffacts")).length > 0, "diff facts");
  // Citizenship
  await p.click("#t-cit");
  for (const t of ["Henesys", "Kerning City"]) {
    await p.click(`#ctown button[data-t="${t}"]`);
    check(await p.$$eval("#cgrades tr", r => r.length) === 10, `${t} grades table`);
  }
  console.log(errs.length ? "\n" + errs.join("\n") : "\nall good");
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
