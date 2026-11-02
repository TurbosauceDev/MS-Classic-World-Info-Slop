// NX / Decoration (Danny 11-01): "slime t" found nothing because the cosmetic items weren't in the data; the Deco tab paste
// (tests/fixtures/deco-turbow.png) must read his 10 cosmetics, and the Equip tab shot must not read any as false hits.
const {chromium} = require("playwright"), path = require("path");
const ROOT = path.join(__dirname, "..");
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++ };
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}), p = await b.newPage({viewport: {width: 1300, height: 900}});
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.join(ROOT, "dist/index.html"));
  await p.keyboard.press("Control+k"); await p.fill("#srchq", "slime t"); await p.waitForTimeout(300);
  const txt = await p.evaluate(() => document.body.innerText);
  ok(/Slime T-Shirt/.test(txt) && !/No match/.test(txt), "search 'slime t' finds Slime T-Shirt");
  await p.keyboard.press("Escape");
  ok(await p.evaluate(() => { const c = D.items["1047025"].crate; return c && c[0][0] === "Founder's Mystery Fashion Crate" && c[0][1] === 1 }), "Slime T-Shirt is 1% in the Founder's Mystery Fashion Crate (Danny's list)");
  ok(await p.evaluate(() => { const i = D.items["1047025"]; return i && i.n === "Slime T-Shirt" && i.c === "Cash" && i.s === "Top" }), "Slime T-Shirt is in D.items as NX Top");
  await p.click("#t-plan"); await p.waitForTimeout(300);
  const one = () => p.waitForFunction(() => !/Reading/.test(document.querySelector("#pimpst").textContent) && document.querySelectorAll("#pimpshots .pishot").length, null, {timeout: 120000});
  await p.setInputFiles("#pimpfile", path.join(__dirname, "fixtures/equip-turbow.png")); await one();
  ok(await p.evaluate(() => BLD.S.deco.length) === 0, "Equip tab shot reads no NX items");
  await p.click("#preset"); await p.waitForFunction(() => !document.querySelectorAll("#pimpshots .pishot").length);
  await p.setInputFiles("#pimpfile", path.join(__dirname, "fixtures/deco-turbow.png")); await one();
  const deco = await p.evaluate(() => BLD.S.deco.map(id => D.items[id].n).sort().join("|"));
  ok(deco === ["Slime T-Shirt", "Silent Sea of Clouds", "Founder's Label Ring", "Founder's Chat Ring", "Slime Earrings", "Black Sunglasses", "White Jeans", "Slime Slippers", "Mark of the Founder (Black)", "Blue Watch"].sort().join("|"), "Deco tab shot reads 10 items: " + deco);
  ok(await p.evaluate(() => BLD.S.lvl) === 42, "Character Info panel gives Level 42");
  ok(errs.length === 0, "no page errors " + errs.join(";"));
  await b.close(); process.exit(fails ? 1 : 0);
})();
