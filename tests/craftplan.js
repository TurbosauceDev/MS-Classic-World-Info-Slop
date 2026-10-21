// Craft planner (Mesos and Trade): crafting maths on a fixed inventory, parts made on the way, farming estimates (5% vs shared
// runs' real drop counts), hand entry, screenshots shared with Price check, bad saved state. Prices come from the build's
// meso.watch data, which the poll changes every 30 min, so only invariants are checked against them. Run: node tests/craftplan.js
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };

(async () => {
  const b = await chromium.launch();
  const page = async () => { const ctx = await b.newContext({viewport: {width: 1300, height: 900}}), p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message.slice(0, 160))); await p.goto(URL);
    await p.evaluate(() => { const b = document.querySelector("#t-cplan"); document.querySelector("#c-" + b.dataset.cat).click(); b.click() });
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
      tot: document.querySelector("#cptot").textContent, price: document.querySelectorAll("#ivbody tr").length, text: document.querySelector("#cplan").innerText}));
    check(/1 screenshot read/.test(ui.inv) && /Gold Ore ×10/.test(ui.inv) && ui.price > 0, `screenshot shared with Price check (${ui.price} rows there; ${ui.inv})`);
    check(/Gold Ingot/.test(ui.now) && /^Make \d+ items? for \+[\d,]+ mesos|^Nothing to craft/.test(ui.tot.trim()), `craft now + total (${ui.tot.trim().slice(0, 60)})`);
    check(!/NaN|undefined|Infinity/.test(ui.text), "no NaN/undefined/Infinity on the page");
    await p.selectOption("#cpfree", "1");
    check(/over the craft fees/.test(await p.textContent("#cptot")), "materials as free: total says over the fees");
    await p.click('[data-cprm="4010006"]');
    check(!/Gold Ore ×10/.test(await p.textContent("#cpinv")), "hand item removed");
    check(!errs.length, "no JS errors " + errs.join(" | "));
    await ctx.close() }

  // bad saved state never breaks the page
  { const {p, errs, ctx} = await page();
    await p.evaluate(() => localStorage.setItem("cplan", JSON.stringify({lv: [99, "x", -1, 3.5], cls: "<img src=x onerror=alert(1)>", L: 1e308, free: "yes", hand: {999: 5, 4010001: -3, 4010000: 2.5, 4010006: 7}})));
    await p.reload(); await p.evaluate(() => { const b = document.querySelector("#t-cplan"); document.querySelector("#c-" + b.dataset.cat).click(); b.click() });
    const s = await p.evaluate(() => ({lv: [...document.querySelectorAll("#cplv select")].map(x => x.value).join(), cls: document.querySelector("#cpcls").value, L: document.querySelector("#cplvl").value, inv: document.querySelector("#cpinv").textContent}));
    check(s.lv.startsWith("0,0,0,4") && s.cls === "Warrior" && s.L === "100" && /Gold Ore ×7/.test(s.inv) && !/Bronze|Iron Ore/.test(s.inv), `bad saved state cleaned (${JSON.stringify(s)})`);
    check(!errs.length, "no JS errors on bad state " + errs.join(" | "));
    await ctx.close() }

  await b.close();
  console.log(fails ? `${fails} FAILED` : "all ok"); process.exit(fails ? 1 : 0);
})();
