// node tests/monkey.js: random clicks, picks, typing, Back/Forward and window sizes all over the site (port of the
// tracker's tracker/tests/monkey.test.js), checking after every step: no page error, no sideways scroll, no
// "NaN"/"undefined"/"Infinity" on screen. SEEDS=1,2 N=300 to vary; a failure prints the seed and the last steps. CI: tests.yml
const path = require("path"), {chromium} = require("playwright");
const URL = process.env.SITE_URL || "file://" + path.resolve(__dirname, "../dist/index.html");
const SEEDS = (process.env.SEEDS || "1,2,3").split(",").map(Number), N = +(process.env.N || 150);
const SKIP = /^(ivfile|pimpfile|thcopy|ivclear|pgearclear)$/;   // file pickers and clipboard: other tests' job
const TEXT = ["", "0", "-5", "1e308", "abc", "<b>x</b>", "a".repeat(200), "Snail 🐌", "  ", "43-200", "999999999"];
const BAD = /NaN|undefined|Infinity|\[object/;
(async () => {
  const browser = await chromium.launch();
  for (const seed0 of SEEDS){
    let seed = seed0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
    const ctx = await browser.newContext({viewport: {width: 1300, height: 900}}), page = await ctx.newPage(), errors = [], steps = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route(/^https?:\/\/(?!fonts\.)/, r => r.abort());   // tracker server, links: offline (fallback data), never leave the page
    await page.goto(URL);
    for (let i = 0; i < N; i++){
      const r = rnd(); let act = "";
      try {
        if (r < 0.15){ const b = pick(await page.$$("nav button:visible")); act = "nav " + await b.evaluate(x => x.id); await b.click({timeout: 500}) }
        else if (r < 0.2){ const w = pick([360, 390, 800, 1300]); act = "window " + w; await page.setViewportSize({width: w, height: pick([700, 900])}) }
        else if (r < 0.24){ act = pick(["Escape", "Control+k", "Enter", "Tab"]); await page.keyboard.press(act) }
        else if (r < 0.27){ act = pick(["back", "forward"]); await page.evaluate(a => history[a](), act) }
        else if (r < 0.37){ const f = await page.$$("section:not([hidden]) input:visible:not([type=file]):not([type=checkbox]):not([type=range]), #srchq:visible, header input:visible");
          if (f.length){ const e = pick(f), v = pick(TEXT); act = "type " + await e.evaluate(x => x.id || x.className) + " = " + v.slice(0, 12);
            await e.fill(v, {timeout: 500}); await e.dispatchEvent("change") } }
        else { const els = await page.$$("section:not([hidden]) :is(button, select, summary, input[type=checkbox], input[type=range], [tabindex='0'], a[href^='#']):visible, #srchres li:visible, #thpop button:visible");
          if (!els.length) continue; const e = pick(els);
          act = "click " + await e.evaluate(x => x.id || x.dataset.tab || x.className || x.textContent.trim().slice(0, 20)).catch(() => "?");
          if (SKIP.test(act.slice(6))) continue;
          const tag = await e.evaluate(x => x.tagName + (x.type === "range" ? "range" : "")).catch(() => "");
          if (tag === "SELECT"){ const o = await e.evaluate(x => [...x.options].map(o => o.value)); if (o.length) await e.selectOption(pick(o), {timeout: 500}) }
          else if (tag === "INPUTrange") await e.evaluate((x, f) => { x.value = Math.round(+x.min + f * (x.max - x.min)); x.dispatchEvent(new Event("input", {bubbles: true})); x.dispatchEvent(new Event("change", {bubbles: true})) }, rnd());
          else await e.click({timeout: 500}) }
      } catch {}   // covered or gone by the time it was clicked: fine, on to the next step
      steps.push(act); await page.waitForTimeout(pick([10, 50, 150]));
      const bad = await page.evaluate(re => { const o = [], W = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > W + 1) o.push("sideways scroll " + document.documentElement.scrollWidth + " > " + W);
        for (const root of document.querySelectorAll("header, nav, section:not([hidden]), #qtip, #srch")){
          const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t;
          while ((t = tw.nextNode())) if (new RegExp(re).test(t.textContent) && t.parentElement?.offsetParent && !t.parentElement.closest("script,style,textarea,input")) { o.push("on screen: " + t.textContent.trim().slice(0, 80)); break } }
        return o }, BAD.source);
      if (errors.length || bad.length){ console.error(`seed ${seed0} step ${i} after ${steps.slice(-6).join(" | ")}: ${[...errors, ...bad].join("; ")}`); process.exit(1) }
    }
    await ctx.close();
  }
  await browser.close();
  console.log("site monkey test passed (" + SEEDS.length + " x " + N + " steps)");
})().catch(e => { console.error(e.message); process.exit(1) });
