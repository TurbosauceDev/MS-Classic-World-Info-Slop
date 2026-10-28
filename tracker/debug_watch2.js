// debug 2: unfold via fold toggle, then add
const {chromium} = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("PAGEERROR:", e.message));
  await page.addInitScript(require("./tests/ui-host"));
  await page.goto("file://" + __dirname + "/app/index.html");
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.siteMkFake = {read: "2026-10-17", listed: "2026-10-17 12:00",
      it: {"4000019": [300, 290, 330, 16866, 0, -0.06], "2000001": [50, 48, 55, 120, 0, 0.4]},
      hist: {"4000019": [["2026-10-15", 350, 2014], ["2026-10-16", 310, 2326], ["2026-10-17", 300, 1662]],
             "2000001": [["2026-10-16", 40, 50], ["2026-10-17", 50, 60]]},
      asks: {"4000019": [[299, 1, 15, "FM <10>", "Levon", 29886734]]},
      tot: {sales: 721874, top: ["4000019", 330, 2, "12:00"]}};
    window.siteMkCb(window.siteMkFake, Date.now());
    document.querySelectorAll("#watchBox.folded .fold, #pulseBox.folded .fold").forEach(b => b.click());
  });
  await page.waitForTimeout(100);
  const vis = await page.evaluate(() => [document.querySelector("#watchBox").className, getComputedStyle(document.querySelector("#watchSearch")).display, document.querySelector("#watchSearch").offsetParent !== null]);
  console.log("unfolded:", JSON.stringify(vis));
  await page.fill("#watchSearch", "Orange Potion");
  await page.click("#watchAdd");
  await page.waitForTimeout(200);
  const r2 = await page.evaluate(() => [JSON.stringify(window.st.siteWatch), $("#watchRows").innerHTML.slice(0, 200), $("#watchNote").textContent]);
  console.log("after add:", JSON.stringify(r2).slice(0, 400));
  await browser.close();
})().catch(e => { console.error("FAIL:", e.message.slice(0, 300)); process.exit(1) });
