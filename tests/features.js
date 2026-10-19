// Features from the 2026-10-19 ideas list: Where to train keeps the Builder hand-off, Price check -> Keep or sell, Builder
// job compare, data-source dates in Credits. Run: node tests/features.js (CI: tests.yml)
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };

(async () => {
  const b = await chromium.launch();
  const page = async () => { const ctx = await b.newContext({viewport: {width: 1300, height: 900}}), p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message.slice(0, 160))); return {p, errs, ctx} };
  const open = (p, t) => p.evaluate(t => { const b = document.querySelector("#t-" + t); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }, t);

  // 1. Builder -> "Use this in Where to train" survives a reload (it used to reset to a level 25 Warrior, default damage)
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "plan");
    await p.click('#pclass button[data-v="Thief"]'); await p.waitForTimeout(50);
    await p.$eval("#plvl", e => { e.value = 42; e.dispatchEvent(new Event("input", {bubbles: true})) }); await p.waitForTimeout(50);
    await p.click("#psend"); await p.waitForTimeout(100);
    const before = await p.evaluate(() => ({cls: $("#cls").value, lvl: $("#lvl").value, note: $("#mapnote").innerText.match(/Damage: \S+/)?.[0], src: /Character Builder setup/.test($("#mapnote").innerText)}));
    await p.reload(); await open(p, "maps"); await p.waitForTimeout(100);
    const after = await p.evaluate(() => ({cls: $("#cls").value, lvl: $("#lvl").value, note: $("#mapnote").innerText.match(/Damage: \S+/)?.[0], src: /Character Builder setup/.test($("#mapnote").innerText)}));
    check(!errs.length && before.src && JSON.stringify(before) === JSON.stringify(after) && after.cls === "Thief" && after.lvl === "42", `Where to train keeps the Builder hand-off after reload (${JSON.stringify(before)} -> ${JSON.stringify(after)})`);
    await p.selectOption("#party", "3"); await p.reload(); await open(p, "maps");
    check(await p.inputValue("#party") === "3", "Where to train keeps its own settings (party 3) after reload");
    // changing class or level drops the hand-off, and that sticks too
    await p.fill("#lvl", "30"); await p.dispatchEvent("#lvl", "input"); await p.reload(); await open(p, "maps"); await p.waitForTimeout(100);
    check(!/Character Builder setup/.test(await p.innerText("#mapnote")), "changing the level drops the saved hand-off");
    // a share link wins over saved settings and doesn't carry the saved builder numbers
    const enc = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    await p.goto(URL + "#t=" + enc({cls: "Bowman", lvl: "20"})); await p.reload(); await p.waitForTimeout(100);
    const t = await p.evaluate(() => ({cls: $("#cls").value, lvl: $("#lvl").value, src: /Character Builder setup/.test($("#mapnote").innerText)}));
    check(t.cls === "Bowman" && t.lvl === "20" && !t.src, `#t link beats saved settings (${JSON.stringify(t)})`);
    await ctx.close() }

  // 2. Price check marks each item keep/sell with the Keep or sell rules and totals "sell now"
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "inv");
    await p.setInputFiles("#ivfile", path.resolve(__dirname, "../tracker/tests/frames-inv/etc-12162.png"));
    await p.waitForFunction(() => document.querySelector("#ivbody").children.length > 0, null, {timeout: 60000});
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll("#ivbody tr")].map(x => ({n: x.cells[0].innerText.trim(), c: x.cells[2].innerText, v: x.cells[6].innerText}));
      const exp = [...document.querySelectorAll("#ivbody tr")].reduce((a, x) => { const id = x.querySelector("[data-item]").dataset.item, q = +x.cells[2].innerText.replace(/,/g, "") || 1, k = KEEPSELL(id, q);
        return a + (k?.sell ? Math.round(k.sell * (+x.cells[5].innerText.replace(/[^\d]/g, "") / q || 0)) : 0) }, 0);
      return {rows, sell: $("#ivsell").innerText, exp, quest: KEEPSELL("4031000", 1)?.v, junk: Object.keys(D.items).filter(i => D.items[i].c === "Etc").map(i => KEEPSELL(i, 3)).find(k => k?.v === "Sell")?.sell} });
    const feather = r.rows.find(x => /Stiff Feather/.test(x.n)), ore = r.rows.find(x => /Iron Ore/.test(x.n));
    check(!errs.length && /Keep \d+, sell \d+/.test(feather?.v) && /If you craft/.test(ore?.v), `rows get Keep or sell verdicts (${feather?.v} · ${ore?.v})`);
    const sellNow = +(r.sell.match(/Sell now: ([\d,]+)/)?.[1] || "x").replace(/,/g, "");
    check(sellNow > 0 && Math.abs(sellNow - r.exp) <= 2, `"sell now" adds the sold part at the suggested price (${sellNow} vs ${r.exp})`);
    check(r.quest === "Quest item" && r.junk === 3, `quest items kept, Etc nothing wants sold (${r.quest}, ${r.junk})`);
    await ctx.close() }

  // 3. Builder: compare two jobs at one level with buildAt
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "plan"); await p.waitForTimeout(100);
    const t = await p.innerText("#pcmp table");
    check(!errs.length && /FIGHTER LV 45/i.test(t) && /PAGE LV 45/i.test(t) && /\d+% harder/.test(t), "compare: Fighter vs Page at 45 by default");
    const same = await p.evaluate(() => { const b = buildAt("Warrior", "Fighter", null, 45); return document.querySelector("#pcmprows tr:nth-child(3) td").innerText.replace(/,/g, "") == Math.round(b.dps) });
    check(same, "compare damage = buildAt's");
    await p.fill("#pcmplvl", "20"); await p.dispatchEvent("#pcmplvl", "change"); await p.waitForTimeout(50);
    check(/Warrior Lv 20 \(Fighter opens at 30\)/i.test(await p.innerText("#pcmphead")), "below 30 a 2nd job falls back to its 1st job, and says so");
    await p.selectOption("#pcmpa", "me"); await p.reload(); await open(p, "plan");
    check(await p.inputValue("#pcmpa") === "me" && await p.inputValue("#pcmplvl") === "20", "compare picks are saved");
    await ctx.close() }

  // 4. Credits: when each data source was last read
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "credits");
    const t = await p.innerText("#srcdates");
    check(!errs.length && /OSMS export [0-9a-f]{7}/.test(t) && /meso\.watch prices: \w+ \d+, 20\d\d/.test(t) && /Shared runs: \w+ \d+, 20\d\d/.test(t) && !/undefined|NaN|Invalid/.test(t), `Credits lists source dates (${t.replace(/\n/g, " | ")})`);
    await ctx.close() }

  await b.close();
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
