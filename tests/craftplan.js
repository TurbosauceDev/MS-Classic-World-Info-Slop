// Crafting > Plan (was the Craft planner page) + the Crafting tabs and recipe pop-up: crafting maths on a fixed inventory, parts made on the way, farming estimates (5% vs shared
// runs' real drop counts), hand entry, screenshots shared with Price check, bad saved state. Prices come from the build's
// meso.watch data, which the poll changes every 30 min, so only invariants are checked against them. Run: node tests/craftplan.js
const { chromium } = require("playwright");
const path = require("path");
const boxGaps = require("./boxgaps");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };

(async () => {
  const b = await chromium.launch();
  const page = async () => { const ctx = await b.newContext({viewport: {width: 1300, height: 900}}), p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message.slice(0, 160))); await p.goto(URL);
    await p.evaluate(() => { const b = document.querySelector("#t-craft"); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }); await p.click('#crmode [data-m="plan"]');
    return {p, errs, ctx} };

  { const {p, errs, ctx} = await page();
    check(/Set a craft level/.test(await p.textContent("#cpnow")), "no levels set: asks for a craft level");
    // logic on a fixed inventory: Steel Helmet = Bronze Helmet + 2 Iron Ingot (fee 1,000); Iron Ingot = 5 Iron Ore (fee 100)
    const r = await p.evaluate(() => {
      const rec = id => D.craft.rec.map(([d, type, lvl, id, n, exp, mesos, ing]) => ({d, type, lvl, id, n, exp, mesos, ing})).find(r => r.id === id);
      const helm = rec("1002030"), C = window.CPLAN, inv = o => new Map(Object.entries(o));
      C.S.lv[0] = 2; const a = C.make(helm, 1, inv({1002029: 1, 4010001: 10}));
      const t = C.maxTimes(helm, inv({1002029: 5, 4010001: 23})), t0 = C.maxTimes(helm, inv({1002029: 5}));
      C.S.lv[0] = 1; const lowLv = C.maxTimes(helm, inv({1002029: 1, 4010001: 10}));   // Steel Helmet is Lv 2
      C.S.lv[0] = 0; const noSub = C.make(rec("4010101"), 1, inv({}));
      // only a Lv 2+ smith makes the ingots on the way: at Lv 2 with no ore, the 10 ore are missing, not the ingots
      C.S.lv[0] = 2; const miss = C.make(helm, 1, inv({1002029: 1}));
      return {a, t, t0, lowLv, noSub, miss};
    });
    check(r.a.fee === 1200 && r.a.used["4010001"] === 10 && r.a.parts.length === 1 && !Object.keys(r.a.miss).length && r.a.exp === 46,
      `Steel Helmet from ore: fee 1,200, 10 ore used, ingots made on the way, 46 craft EXP (${JSON.stringify(r.a)})`);
    check(r.t === 2 && r.t0 === 0, `times limited by the scarcest material (23 ore = 2 helmets: ${r.t}; no ore: ${r.t0})`);
    check(r.lowLv === 0, "a recipe above your craft level can't be made");
    check(r.miss.miss["4010001"] === 10 && !r.miss.miss["4010101"], "missing parts you can craft show as their raw materials");
    // farming: 5% per kill by default; a monster shared runs saw 100+ kills of uses their count instead
    const f = await p.evaluate(() => {
      const C = window.CPLAN; C.S.cls = "Warrior"; C.S.L = 30;
      const base = C.farm("4010001"), m = String(base[0]?.who[0]);
      D.shared.mobs = {[m]: {kills: 200, items: {4010001: 100}}}; C.S.L = 31; C.farm("4010000"); C.S.L = 30;   // level change clears the cache
      const real = C.farm("4010001"); D.shared.mobs = {[m]: {kills: 500, items: {}}}; C.S.L = 31; C.farm("4010000"); C.S.L = 30;
      const none = C.farm("4010001"); D.shared.mobs = {};
      return {n: base.length, hr: base[0]?.hr, real: real.find(x => x.map === base[0].map), none: none.some(x => x.map === base[0].map && x.who.length === 1)};
    });
    check(f.n >= 1 && f.n <= 2 && f.hr > 0, `Iron Ore: best farming maps (${f.n}, ${f.hr?.toFixed(1)}/hr)`);
    check(f.real && f.real.real && f.real.hr > f.hr * 5, `shared runs' 50% drop count beats the 5% assumption (${f.real?.hr?.toFixed(1)}/hr)`);
    check(!f.none, "shared runs with 500 kills and no drops: that monster isn't suggested");

    // UI: hand entry + a screenshot read once, shown on both pages
    await p.selectOption('[data-cpd="0"]', "3");
    await p.fill("#cpitem", "Gold Ore"); await p.fill("#cpn", "10"); await p.click("#cpaddb");
    await p.fill("#cpitem", "not an item"); await p.click("#cpaddb");
    check(/Pick an item/.test(await p.textContent("#cpst")), "unknown item name is refused");
    await p.setInputFiles("#cpfile", path.resolve(__dirname, "../tracker/tests/frames-inv/etc-12162.png"));
    await p.waitForFunction(() => /screenshots? read/.test(document.querySelector("#cpinv").textContent), null, {timeout: 30000});
    const ui = await p.evaluate(() => ({inv: document.querySelector("#cpinv").textContent, now: document.querySelector("#cpnow").textContent,
      tot: document.querySelector("#cptot").textContent, price: document.querySelectorAll("#ivbody tr").length, text: document.querySelector("#crp-plan").innerText}));
    check(/1 screenshot read/.test(ui.inv) && /Gold Ore ×10/.test(ui.inv) && ui.price > 0, `screenshot shared with Price check (${ui.price} rows there; ${ui.inv})`);
    check(/Gold Ingot/.test(ui.now) && /^Make \d+ items? for \+[\d,]+ mesos|^Nothing to craft/.test(ui.tot.trim()), `craft now + total (${ui.tot.trim().slice(0, 60)})`);
    check(!/NaN|undefined|Infinity/.test(ui.text), "no NaN/undefined/Infinity on the page");
    await p.selectOption("#cpfree", "1");
    check(/over the craft fees/.test(await p.textContent("#cptot")), "materials as free: total says over the fees");
    await p.click('[data-cprm="4010006"]');
    check(!/Gold Ore ×10/.test(await p.textContent("#cpinv")), "hand item removed");
    check(!errs.length, "no JS errors " + errs.join(" | "));
    await ctx.close() }

  // Danny 10-21: cards stacked flush, inner tables/inputs touching. Filled page (materials free, so rows don't hinge on live prices), desktop and phone: every box padded, no touching
  { const {p, errs, ctx} = await page();
    await p.evaluate(() => localStorage.setItem("cplan", JSON.stringify({lv: [3, 3, 3, 3, 3, 3], free: 1, hand: {4010001: 40, 4010000: 40, 1002029: 3, 4000021: 50, 4003000: 30, 4000003: 30}})));
    await p.reload(); await p.evaluate(() => { const b = document.querySelector("#t-craft"); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }); await p.click('#crmode [data-m="plan"]');
    for (const w of [1300, 390]){
      await p.setViewportSize({width: w, height: 900}); await p.waitForTimeout(150);
      const g = await p.evaluate(boxGaps, [6, "craft"]), rows = await p.$$eval("#cpnow tr, #cpalm tr", r => r.filter(x => !x.querySelector(".empty")).length);
      const add = await p.evaluate(() => { const [a, c] = [...document.querySelectorAll(".cpadd input")].map(e => e.getBoundingClientRect()); return c.top >= a.bottom || c.left - a.right >= 8 });
      check(rows >= 2 && !g.length && add, `padding at ${w}px: ${rows} rows, ${g.length ? g.slice(0, 3).join(" | ") : "no box flush or touching"}${add ? "" : ", item and count inputs touch"}`);
    }
    check(!errs.length, "no JS errors " + errs.join(" | "));
    await ctx.close() }

  // Crafting tabs (10-21 overhaul): old Craft planner links land on Plan; Recipes profit maths, "Only my levels", sort, recipe pop-up
  { const {p, errs, ctx} = await page();
    await p.goto(URL + "#g=cplan"); await p.reload(); await p.waitForTimeout(300);
    check(await p.evaluate(() => !document.querySelector("#craft").hidden && !document.querySelector("#crp-plan").hidden && document.querySelector('#crmode [data-m="plan"]').getAttribute("aria-selected") === "true"),
      "old #g=cplan link opens Crafting on the Plan tab");
    await p.selectOption('[data-cpd="0"]', "2"); await p.click('#crmode [data-m="rec"]');
    const e = await p.evaluate(() => { const C = window.CRAFT, bad = [];
      for (const r of C.R){ const x = C.econ(r);
        if (x.sell ? Math.abs(x.profit - (x.sell - r.mesos - x.mats)) > 1e-6 : x.profit !== null) bad.push(r.it.n);
        if (!isFinite(x.mats) || x.mats < 0) bad.push(r.it.n + " mats") }
      const ingot = C.R.find(r => r.id === "4010001"), w = window.CPLAN.worth("4010001"), helm = C.econ(C.R.find(r => r.id === "1002030"));
      return {bad, helm, part: w ? true : Math.abs(helm.mats - window.CPLAN.worth("1002029") - 2 * (ingot.mesos + 5 * window.CPLAN.worth("4010000")) / ingot.n) < 1e-6} });
    check(!e.bad.length && e.part, `profit = sells for − fee − ingredients on every recipe; unpriced parts cost their own recipe (${e.bad.slice(0, 3).join(", ")})`);
    const all = await p.$$eval("#crrows tr", r => r.length);
    await p.check("#crmine");
    const mine = await p.evaluate(() => ({n: +document.querySelector("#crcount").textContent.match(/\d+/)[0], want: window.CRAFT.R.filter(r => r.d === 0 && r.lvl <= 2).length}));
    check(mine.n === mine.want && mine.n < 290, `Only my levels: Smithing Lv 2 shows ${mine.n} recipes (want ${mine.want})`);
    await p.uncheck("#crmine"); await p.click('#crhead [data-k="profit"] button');
    const top = await p.evaluate(() => [...document.querySelectorAll("#crrows tr")].slice(0, 2).map(t => t.cells[6].textContent));
    check(all >= 60 && top.length === 2 && /^\+/.test(top[0]), `sort by profit: best first (${top.map(x => x.slice(0, 14)).join(" / ")})`);
    // pop-up: opens from a recipe name, links to the recipes that use the result, Esc closes and gives focus back
    await p.uncheck("#crprof").catch(() => {}); await p.fill("#crsearch", "Iron Ingot"); await p.waitForTimeout(100);
    const nm = "Iron Ingot";
    await p.click('#crrows .crname:text-is("Iron Ingot")');
    const pop = await p.evaluate(() => ({open: !document.querySelector("#crpop").hidden, h: document.querySelector("#crpoph").textContent, t: document.querySelector("#crpopb").innerText,
      used: document.querySelectorAll("#crpopb button[data-r]").length}));
    check(pop.open && pop.h.includes(nm) && /Ingredients/i.test(pop.t) && /Sells for/i.test(pop.t) && pop.used > 0 && !/NaN|undefined|Infinity/.test(pop.t), `recipe pop-up for ${nm}: tiles, ingredients, ${pop.used} links, no NaN${pop.open && pop.h.includes(nm) ? "" : " (" + pop.h + ")"}${/NaN|undefined|Infinity/.test(pop.t) ? " " + pop.t.match(/.{0,60}(NaN|undefined|Infinity).{0,30}/)?.[0] : ""}`);
    await p.click("#crpopb .setcard:has(h3:text('Used in')) button[data-r] >> nth=0");
    const h2 = await p.textContent("#crpoph");
    check(h2 !== pop.h, `"Used in" link opens that recipe (${h2.trim()})`);
    await p.keyboard.press("Escape");
    check(await p.evaluate(() => document.querySelector("#crpop").hidden && document.activeElement?.classList.contains("crname")), "Esc closes the pop-up, focus back on the recipe");
    check(!errs.length, "no JS errors " + errs.join(" | "));
    await ctx.close() }

  // bad saved state never breaks the page
  { const {p, errs, ctx} = await page();
    await p.evaluate(() => localStorage.setItem("cplan", JSON.stringify({lv: [99, "x", -1, 3.5], cls: "<img src=x onerror=alert(1)>", L: 1e308, free: "yes", hand: {999: 5, 4010001: -3, 4010000: 2.5, 4010006: 7}})));
    await p.reload(); await p.evaluate(() => { const b = document.querySelector("#t-craft"); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }); await p.click('#crmode [data-m="plan"]');
    const s = await p.evaluate(() => ({lv: [...document.querySelectorAll("#cplv select")].map(x => x.value).join(), cls: document.querySelector("#cpcls").value, L: document.querySelector("#cplvl").value, inv: document.querySelector("#cpinv").textContent}));
    check(s.lv.startsWith("0,0,0,4") && s.cls === "Warrior" && s.L === "100" && /Gold Ore ×7/.test(s.inv) && !/Bronze|Iron Ore/.test(s.inv), `bad saved state cleaned (${JSON.stringify(s)})`);
    check(!errs.length, "no JS errors on bad state " + errs.join(" | "));
    await ctx.close() }

  await b.close();
  console.log(fails ? `${fails} FAILED` : "all ok"); process.exit(fails ? 1 : 0);
})();
