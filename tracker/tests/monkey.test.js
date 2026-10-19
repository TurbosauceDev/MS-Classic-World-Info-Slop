// node tests/monkey.test.js — random clicks, menu picks, typing and window sizes on the tracker window (stubbed host, like
// ui.test.js), checking after every step: no page error, no sideways scroll, no "NaN"/"undefined" on screen. It found the
// Dummy data/job crash, Stop with no session, and a long run name running off the summary (2026-10-19). SEEDS=1,2 N=200 to vary.
const path = require("path"), {chromium} = require("playwright");
const SEEDS = (process.env.SEEDS || "2,5,7").split(",").map(Number), N = +(process.env.N || 150);
const MENUS = ["align", "fit", "mark", "mute", "pause", "saveImage", "toolbox", "mini", "dummy", "settings", "help", "invNow", "startStop",
  "onTop:true", "onTop:false", "clickThrough:true", "clickThrough:false"];
const SKIP = /csv|Install|updGo|Reset|delete|×|bugGo|sumImg/i;   // files, the updater, wiping settings or History: not this test's job
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ["--allow-file-access-from-files"]});
  for (const seed0 of SEEDS){
    let seed = seed0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
    const page = await browser.newPage({viewport: {width: 900, height: 900}}), errors = [], steps = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(require("./ui-host"));
    await page.goto("file://" + path.join(__dirname, "../app/index.html"));
    await page.click("#guideShare");
    for (let i = 0; i < N; i++){
      const r = rnd(); let act = "";
      try {
        if (r < 0.15){ act = "menu " + pick(MENUS); await page.evaluate(m => window.menu(m), act.slice(5)) }
        else if (r < 0.2){ const w = pick([340, 420, 600, 900, 1300]), h = pick([300, 600, 900]); act = "window " + w + "x" + h; await page.setViewportSize({width: w, height: h}) }
        else if (r < 0.25){ act = "Esc"; await page.keyboard.press("Escape") }
        else if (r < 0.3){ act = "type"; const f = await page.$$("input[type=text]:visible, input:not([type]):visible, textarea:visible");
          if (f.length) await pick(f).fill(pick(["", "<b>x</b>", "a".repeat(300), "Snail 🐌", "  "]), {timeout: 500}) }
        else { const els = await page.$$("button:visible, input[type=checkbox]:visible, select:visible, summary:visible, .tbItem:visible"), e = pick(els);
          act = "click " + await e.evaluate(x => x.id || x.className || x.textContent.trim().slice(0, 20)).catch(() => "?");
          if (SKIP.test(act)) continue;
          if (await e.evaluate(x => x.tagName === "SELECT").catch(() => false)) await e.selectOption(pick(await e.evaluate(x => [...x.options].map(o => o.value))), {timeout: 500});
          else await e.click({timeout: 500}) }
      } catch {}   // covered or gone by the time it was clicked: fine, on to the next step
      steps.push(act); await page.waitForTimeout(pick([10, 50, 200]));
      const bad = await page.evaluate(() => { const o = [];
        if (document.documentElement.scrollWidth > innerWidth + 1 && !document.body.classList.contains("mini")) o.push("sideways scroll " + document.documentElement.scrollWidth + " > " + innerWidth);
        for (const e of document.querySelectorAll("body *")) if (e.offsetParent) for (const t of e.childNodes) if (t.nodeType === 3 && /NaN|undefined|Infinity|\[object/.test(t.textContent)) o.push("on screen: " + t.textContent.slice(0, 80));
        return o });
      if (errors.length || bad.length) throw new Error(`seed ${seed0} step ${i} after ${steps.slice(-5).join(" | ")}: ${[...errors, ...bad].join("; ")}`);
    }
    await page.close();
  }
  await browser.close();
  console.log("monkey test passed (" + SEEDS.length + " x " + N + " steps)");
})().catch(e => { console.error(e.message); process.exit(1) });
