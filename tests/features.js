// Features from the 2026-10-19 ideas list: Where to train keeps the Builder hand-off, Price check -> Keep or sell, Builder
// job compare, data-source dates in Credits. Run: node tests/features.js (CI: tests.yml)
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
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

  // 5. Scroll check. a) Danny's tooltip frames (tests/fixtures/tip-*.png, 2x crops, 2026-10-20) read to the right scroll; the
  // sword one is a holdout (its name font letters weren't copied into the table). b) a shared "game window" (a canvas stream
  // standing in for getDisplayMedia): the Use tab fixture with a Greater scroll of its own plus 3 drawn in, each hovered in turn
  // with one of Danny's tooltips placed where the game puts it (hover-blunt-greater: below the pointer)
  const TIPS = [["tip-hat-accuracy-lesser", "Hat Accuracy Scroll: Lesser", 21], ["tip-earring-str-intermediate", "Earring STR Scroll: Intermediate", 22],
    ["tip-1h-sword-attack-intermediate", "One-Handed Sword Attack Scroll: Intermediate", 23]];
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "inv");
    const b64 = f => fs.readFileSync(path.resolve(__dirname, f)).toString("base64");
    const read = await p.evaluate(async tips => {
      const load = async b => { const im = new Image(); im.src = "data:image/png;base64," + b; await im.decode(); return im };
      const nat = im => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        return GrindReaders.native({w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data}) };
      window.TIPIMG = {};
      const out = [];
      for (const [f, b] of tips){ const img = nat(await load(b)), t = SCAN.tooltip(img);
        // the tooltip box (from just left of and above its bullet), as a native-size canvas to paste into the scene
        const c = document.createElement("canvas"); c.width = img.w; c.height = img.h; const id = new ImageData(new Uint8ClampedArray(img.d), img.w, img.h); c.getContext("2d").putImageData(id, 0, 0);
        TIPIMG[f] = {c, b: t?.b};
        out.push(t?.m ? D.items[t.m.id].n : `none (${t?.tip?.name?.text} / ${t?.tip?.desc.map(l => l.text).join(" ")})`) }
      return out }, TIPS.map(([f]) => [f, b64(`fixtures/${f}.png`)]));
    check(TIPS.every(([, n], k) => read[k] === n), `scroll check: Danny's tooltips read (${read.join(" · ")})`);
    // Danny's live frames (hover-*.png, 2x, 2026-10-20): the hovered slot is the one above the tooltip, not one below it (the
    // old rule ticked slot 18 for 8); a slot the glove covered from the start (no picture seen) is still taken
    const HOV = [["hover-blunt-greater", 21], ["hover-hat-acc-lesser", 7], ["hover-hat-acc-greater", 8]];
    const hov = await p.evaluate(async fr => { const C = await INVP.cands(), out = [];
      for (const [b, want] of fr){ const im = new Image(); im.src = "data:image/png;base64," + b; await im.decode();
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        const raw = g.getImageData(0, 0, c.width, c.height).data, W = c.width >> 1, H = c.height >> 1, d = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){ const i = (y * 2 * c.width + x * 2) * 4; d.set(raw.subarray(i, i + 4), (y * W + x) * 4) }
        const f = SCAN.readFrame({w: W, h: H, d, k: 2}, C, null, null), id = f.tip?.m?.id;
        if (!id){ out.push("unread"); continue }
        const at = (unk) => SCAN.hovered(f.inv, [...Array(30).keys()].map(i => ({i, ids: unk || i !== want ? [] : [id], unk: unk && i === want})), id, f.tip.b, f.tip.tip, f.h)?.i;
        out.push(at(false) + "/" + at(true)) }
      return out }, HOV.map(([f, w]) => [b64(`fixtures/${f}.png`), w]));
    check(HOV.every(([, w], k) => hov[k] === w + "/" + w), `scroll check: hovered slot from Danny's frames (${hov.join(" · ")})`);
    // every scroll in the game data, read with the letters the tables don't have yet as "?" (and some touching pairs as one
    // glyph): never the wrong scroll; with the description in view, always the right one
    const sweep = await p.evaluate(() => {
      const ids = Object.keys(D.items).filter(i => D.items[i].c === "Scroll"), bad = [], miss = [];
      const nameCh = new Set(SCAN.FONT.filter(g => /1/.test(g.bits)).map(g => g.ch)), descCh = new Set(SCAN.FONT.filter(g => !/1/.test(g.bits)).map(g => g.ch));
      const blur = (t, set, merge, nm) => { const chars = [], glyphs = []; for (const c of t){ if (c === " ") continue;
          if (set.has(c)){ chars.push(c); glyphs.push({w: 6, bits: nm ? "1" : "2"}) }
          else if (merge && chars.at(-1) === "?" && glyphs.at(-1).w < 14) glyphs.at(-1).w += 7; else { chars.push("?"); glyphs.push({w: 7, bits: nm ? "1" : "2"}) } }
        return {text: chars.join(""), chars, glyphs} };
      for (const id of ids){ const it = D.items[id], d = (it.d || "").split("\n");
        for (const tip of [{name: blur(it.n, nameCh, false, 1), desc: d.map(t => blur(t, descCh, false))}, {name: blur(it.n, nameCh, true, 1), desc: d.map(t => blur(t, descCh, true))},
          {name: blur(it.n, nameCh, true, 1), desc: []}, {name: {text: "???"}, desc: d.map(t => blur(t, descCh, true))}]){
          const m = SCAN.match(tip); if (m && D.items[m.id].n !== it.n) bad.push(it.n + " -> " + D.items[m.id].n); else if (!m && tip.desc.length) miss.push(it.n) } }
      return {n: ids.length, bad, miss} });
    check(sweep.n > 200 && !sweep.bad.length && !sweep.miss.length, `scroll check: ${sweep.n} scrolls with unread letters: none named wrong, all named from the description (${sweep.bad.slice(0, 3).join(", ")}${sweep.miss.slice(0, 3).join(", ")})`);
    const inv = b64("../tracker/tests/frames-inv/use-12162.png");
    await p.evaluate(async inv => {
      const load = async b => { const im = new Image(); im.src = "data:image/png;base64," + b; await im.decode(); return im };
      const im = await load(inv), les = await load(D.iicons["2040000"]), mid = await load(D.iicons["2040001"]);
      const W = 640, H = 480, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
      const big = document.createElement("canvas"); big.width = W * 2; big.height = H * 2; const bg = big.getContext("2d"); bg.imageSmoothingEnabled = false;
      // tip: [fixture, slot on screen]; scrolled: the tab scrolled down one row (rows 1-5 move up, an empty row comes in)
      window.scene = (tip, scrolled) => {
        g.fillStyle = "rgb(90,120,160)"; g.fillRect(0, 0, W, H); g.drawImage(im, 60, 40);
        const at = i => ({sx: 68 + 36 * (i % 5), cy: 119 + 34 * Math.floor(i / 5)});
        { const e = at(29), s2 = at(2); g.drawImage(c, e.sx, e.cy - 30, 33, 34, s2.sx, s2.cy - 30, 33, 34) }   // slot 2 emptied (an empty slot copied in)
        for (const [i, ic] of [[2, mid], [21, les], [22, mid], [23, mid]]){ const {sx, cy} = at(i); g.drawImage(ic, sx + 16 - (ic.width >> 1), cy + 3 - ic.height) }
        if (scrolled){ const a = at(5), z = at(30); g.drawImage(c, 63, a.cy - 30, 192, z.cy - a.cy, 63, a.cy - 64, 192, z.cy - a.cy) }
        // the bullet 16 px right of and 43 px under the pointer's tip, here the slot's middle (the tooltip opens below the pointer)
        if (tip){ const [f, k] = tip, T = TIPIMG[f], {sx, cy} = at(k), bx = sx + 16 + 16, by = cy - 13 + 43;
          g.drawImage(T.c, T.b.x - 6, T.b.y - 9, T.c.width, T.c.height, bx - 6, by - 9, T.c.width, T.c.height) }
        bg.drawImage(c, 0, 0, W * 2, H * 2) };
      scene(null);
      navigator.mediaDevices.getDisplayMedia = async () => big.captureStream(10);
      setInterval(() => { const v = big.getContext("2d"); v.fillStyle = "rgba(0,0,0,0)"; v.fillRect(0, 0, 1, 1) }, 50);   // keep frames flowing
    }, inv);
    await p.click("#ssgo");
    await p.waitForFunction(() => document.querySelectorAll("#ssgrid .sscell.sc").length === 5, null, {timeout: 60000}).catch(() => {});
    const before = await p.evaluate(() => ({sc: document.querySelectorAll("#ssgrid .sscell.sc").length, st: $("#ssst").textContent}));
    check(!errs.length && before.sc === 5 && /0 of 5/.test(before.st), `scroll check: 5 scrolls waiting (${JSON.stringify(before)})`);
    // [fixture, slot on screen, scrolled, slot in the whole tab]: slot 2 is the top row, where the tooltip covers the window's
    // red line; then the tab scrolled one row down, so screen slot 17 is the tab's 22
    for (const [f, k, sc, at] of [[TIPS[0][0], 21, false, 21], [TIPS[1][0], 2, false, 2], [TIPS[1][0], 17, true, 22], [TIPS[2][0], 18, true, 23]]){
      await p.evaluate(sc => scene(null, sc), sc); await p.waitForTimeout(700);
      await p.evaluate(([f, k, sc]) => scene([f, k], sc), [f, k, sc]);
      await p.waitForFunction(k => document.querySelector(`#ssgrid .sscell[data-i="${k}"]`)?.classList.contains("ok"), at, {timeout: 8000}).catch(() => {});
    }
    const hint = await p.textContent("#sshint");
    check(/^Reading: One-Handed Sword Attack Scroll: Intermediate$/.test(hint), `scroll check: live line names the hovered scroll (${hint})`);
    await p.evaluate(() => scene(null)); await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ok: [...document.querySelectorAll("#ssgrid .sscell.ok")].map(e => +e.dataset.i), st: $("#ssst").textContent,
      list: [...document.querySelectorAll("#sslist .itname")].map(e => e.textContent), table: [...document.querySelectorAll("#ivbody .itname")].map(e => e.textContent),
      wide: $("#ssgrid").scrollWidth - $("#ssgrid").clientWidth, cells: [...new Set([...document.querySelectorAll("#ssgrid .sscell")].map(e => e.offsetWidth + "x" + e.offsetHeight))]}));
    // Danny 10-20: a scroll check prices scrolls only (the picture check does the rest); the grid has no sideways scroll and
    // every cell is the same size whatever its border
    check(r.table.length && r.table.every(n => / Scroll/.test(n)), `scroll check: the price table holds scrolls only (${r.table.length})`);
    check(r.wide <= 0 && r.cells.join() === "40x40", `scroll check: grid cells even, no sideways scroll (${r.wide}, ${r.cells})`);
    check(!errs.length && r.ok.join() === "2,21,22,23" && /4 of 5/.test(r.st), `scroll check: each tooltip ticks its own slot (${JSON.stringify(r.ok)}, ${r.st})`);
    const sum = await p.textContent("#sssum");
    check(/^4 scanned · worth ~[\d,]+ mesos/.test(sum), `scroll check: scanned total (${sum})`);
    await p.click("#ssreset"); await p.waitForTimeout(800);
    const reset = await p.evaluate(() => ({ok: document.querySelectorAll("#ssgrid .sscell.ok").length, li: document.querySelectorAll("#sslist li").length}));
    check(!reset.ok && !reset.li, `scroll check: Start over forgets the scans (${JSON.stringify(reset)})`);
    check(TIPS.every(([, n]) => r.list.includes(n) && r.table.includes(n)), `scroll check: names in the list and the price table (${r.table.filter(n => /Scroll:/.test(n)).join(" · ")})`);
    await p.click("#ssstop");
    check(!(await p.isHidden("#ssgo")) && errs.length === 0, `scroll check: stop sharing (${errs.join(" | ")})`);
    await ctx.close() }
  // monkey 2026-10-20: at phone width the "can't share" message pushed the page sideways
  { const {p, errs, ctx} = await page(); await p.setViewportSize({width: 360, height: 800}); await p.goto(URL); await open(p, "inv");
    await p.evaluate(() => { navigator.mediaDevices.getDisplayMedia = async () => { throw new DOMException("no", "NotSupportedError") } });
    await p.click("#ssgo"); await p.waitForTimeout(200);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    check(!errs.length && w <= 360 && /share your screen/.test(await p.textContent("#ssst")), `scroll check: refused share fits a phone (${w}px)`);
    await ctx.close() }

  // meowdb refresh 2026-10-21: Items page "Prices" lists every source (NPC shop from meowdb's launch list first) and flags
  // items an NPC sells for less than player shops; drop reports say "N confirmed"
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "items");
    await p.evaluate(() => { const e = document.createElement("span"); e.className = "itname"; e.dataset.item = "2000000"; document.querySelector("#items").prepend(e); e.click() }); await p.waitForTimeout(150);
    const t = await p.evaluate(() => document.querySelector("#itprices")?.innerText || "");
    check(!errs.length && /Usual price/i.test(t) && /NPC shop\s*50\b/i.test(t) && /NPC buys\s*5\b/i.test(t) && /Where to buy/i.test(t), `items: price tiles for Red Potion (${t.replace(/\s+/g, " ").slice(0, 160)})`);
    const r = await p.evaluate(() => { const keep = PWNOW["2000000"], out = [];
      PWNOW["2000000"] = [999, 1, 1, "", ""]; out.push(!!npcCheaper("2000000"), /NPC sells for less/.test(npcCheaperPill("2000000")));
      PWNOW["2000000"] = [20, 1, 1, "", ""]; out.push(!!npcCheaper("2000000"));
      if (keep) PWNOW["2000000"] = keep; else delete PWNOW["2000000"]; return out });
    check(JSON.stringify(r) === "[true,true,false]", `items: "NPC sells for less" only when the shop beats the listing (${r})`);
    check(/\d+ confirmed/.test(await p.evaluate(() => votesHtml(12))), "drop reports read \"N confirmed\"");
    // 7-day sparklines 2026-10-22: D.pw.hist -> line chart in Prices box, small one in the meso.watch row; none without 2+ days
    const sp = await p.evaluate(() => { const id = "2000000", k = PWH[id], out = [];
      PWH[id] = [["2026-10-20", 50, 3], ["2026-10-21", 40, 5], ["2026-10-22", 45, 2]]; const svg = pwSpark(id, 1), m = svg.match(/<path d="M([^"]+)"/);
      out.push(/<svg class="pwspark big down"/.test(svg), (m?.[1].match(/L/g) || []).length, /10 sold/.test(priceBox(id)), /pwspark/.test(PRICE_SRC[0](id)?.spark || ""));
      delete PWH[id]; out.push(pwSpark(id) === "", !/pxchart/.test(priceBox(id))); if (k) PWH[id] = k; return out });
    check(JSON.stringify(sp) === "[true,2,true,true,true,true]", `items: 7-day price sparkline (${sp})`);
    // classicmarket.kr + meowdb 2026-10-21: a Prices row per source with its sample count; pwPrice falls back
    // meso.watch -> classicmarket.kr market (combined, Layer B) -> meowdb usual -> classicmarket.kr asks -> buy orders
    const c = await p.evaluate(() => { const id = "2000000", kp = PW[id], kc = CM[id], km = MDB[id], kk = CMP[id], ka = MA[id], kw = MW[id], ki = MI[id], kh = PWH[id], out = [];
      delete PWH[id];   // the fakes must not meet the item's real daily medians (pwUsual swaps them in when the price is moving)
      delete MA[id]; delete MW[id]; delete MI[id];
      CM[id] = [40, 45, 3, 30, 28, 2]; CMP[id] = [65, 50, 90, 12, 40, 3, "2026-10-21"]; MDB[id] = [55, 20, 7, 50, null, 4, null, 0, null, 0]; const rows = PRICE_SRC.map(f => f(id)).filter(Boolean);
      out.push(rows.some(r => r.src === "classicmarket.kr" && r.v === 45 && /3 posts/.test(r.n)) && rows.some(r => r.buy && r.v === 28) && rows.some(r => r.src === "meowdb" && r.v === 55 && /20 asks \+ 7 sales/.test(r.n)) && rows.some(r => r.src === "classicmarket.kr" && r.v === 65 && /12 sold · 40 seen/.test(r.n) && /50-90 · 3 for sale now/.test(r.detail)));
      PW[id] = [60, 50, 70, 9, 0]; out.push(pwPrice(id).src);
      delete PW[id]; out.push(pwPrice(id).src + " " + pwPrice(id).v);
      delete CMP[id]; out.push(pwPrice(id).src + " " + pwPrice(id).v);
      delete MDB[id]; out.push(pwPrice(id).src + " " + pwPrice(id).v);
      CM[id] = [null, null, 0, 30, 28, 2]; out.push(pwPrice(id).src);
      delete CM[id];   // P5 tail starts only when the trade posts have nothing at all
      MA[id] = [24000, 9, 20000, 40, 23000, 5, 0]; out.push(pwPrice(id).src + " " + pwPrice(id).v);   // P5 tail: sale median first
      MA[id] = [0, 0, 300, 4, 0, 0, 0]; out.push(pwPrice(id).src + " " + pwPrice(id).v);   // no sales: cheapest ask, rough
      delete MA[id]; MW[id] = [25000, 40, 22000, 10, 25000, 0]; out.push(pwPrice(id).src + " " + pwPrice(id).v);
      delete MW[id]; MI[id] = [26000, 24000, 28000, 7, 30, 25500, 20, 2, 0, 0]; out.push(pwPrice(id).src + " " + pwPrice(id).v);
      delete MI[id]; out.push(pwPrice(id) === null ? "none" : pwPrice(id).src);
      if (kp) PW[id] = kp; if (kc) CM[id] = kc; else delete CM[id]; if (km) MDB[id] = km; if (kk) CMP[id] = kk;
      if (ka) MA[id] = ka; else delete MA[id]; if (kw) MW[id] = kw; else delete MW[id]; if (ki) MI[id] = ki; else delete MI[id];
      if (kh) PWH[id] = kh; else delete PWH[id]; return out });
    check(JSON.stringify(c) === '[true,"meso.watch","classicmarket.kr market 65","meowdb 55","classicmarket.kr asks 45","classicmarket.kr buy orders","mesoarbitrage.com 24000","mesoarbitrage.com 300","maplestory.watch 25000","mesoindex.com 26000","none"]', `prices: source rows + fallback order (${c})`);
    // P3 + P4 (Danny 2026-10-26): a source row past its cadence gets a stale pill; the Usual tile carries a sources range + agreement pill
    const q = await p.evaluate(() => { const id = "2000000", keep = [PW[id], CMP[id], MDB[id], CM[id], MA[id], MW[id], MI[id], D.cmp.read, PWH[id]];
      // fresh/old timestamps relative to now: hardcoding a date broke at UTC midnight when it crossed the 48 h staleness line (10-28)
      const fresh = new Date(Date.now() - 36e5).toISOString().slice(0, 16).replace("T", " "), old = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 16).replace("T", " ");
      delete PWH[id]; delete MA[id]; delete MW[id]; delete MI[id]; delete CM[id];   // PWH: real history must not outvote the fakes
      PW[id] = [100, 90, 110, 30, 0]; CMP[id] = [105, 95, 115, 20, 30, 5, fresh]; MDB[id] = [110, 50, 8, 100, null, 4, null, 0, null, 0];
      const out = [];
      out.push(/3 solid sources · 100-110/.test(priceBox(id)) && /sources within 25%/.test(priceBox(id)));
      CMP[id] = [400, 300, 500, 20, 30, 5, fresh];
      out.push(/sources 4x apart/.test(priceBox(id)));
      D.cmp.read = old;
      out.push(/stale \d+ d/.test(priceBox(id)));
      D.cmp.read = fresh;
      out.push(!/stale \d/.test(priceBox(id)));
      [PW[id], CMP[id], MDB[id], CM[id], MA[id], MW[id], MI[id]] = keep; D.cmp.read = keep[7];
      if (keep[8]) PWH[id] = keep[8]; else delete PWH[id]; return out });
    check(JSON.stringify(q) === "[true,true,true,true]", `prices: stale pill + sources context (${q})`);
    // Danny 2026-10-21: "Where to buy" lists every listing with a place (meso.watch cheapest + meowdb posts), cheapest first
    await p.evaluate(() => { const id = "2000000", kn = PWNOW[id], kl = MDBL[id], now = Math.round(Date.now() / 6e4);
      PWNOW[id] = [70, 5, 6, "Free Market <4>", "CINDY"];
      MDBL[id] = [[0, 90, 10, 3, 0, "Kerning bottom left", "Jayce", now - 30, 0, ""], [0, 60, 1, 7, 7, "middle", "ChadX", now - 5, 0, ""], [1, 40, 100, 0, 0, "", "Buyer", now, 1, ""]];
      window._pxkeep = [kn, kl, MWLS[id], MILS[id], PWASK[id]]; delete MWLS[id]; delete MILS[id]; delete PWASK[id]; const e = document.createElement("span"); e.className = "itname"; e.dataset.item = id; document.querySelector("#items").prepend(e); e.click() });
    await p.waitForTimeout(150);
    const w = await p.evaluate(() => { const id = "2000000", [kn, kl, kw, ki, ka] = window._pxkeep, t = [...document.querySelectorAll("#itprices .pxls")].map(e => e.innerText.replace(/\s+/g, " "));
      if (kn) PWNOW[id] = kn; else delete PWNOW[id]; if (kl) MDBL[id] = kl; else delete MDBL[id]; if (kw) MWLS[id] = kw; if (ki) MILS[id] = ki; if (ka) PWASK[id] = ka; return t });
    check(w.length === 2 && /^Each.*60 cheapest.*Ch 7 · FM 7 · middle ChadX.*70.*Ch 6 · FM 4 CINDY.*90.*Ch 3 · Kerning bottom left Jayce/i.test(w[0]) && /40.*×100.*whisper \/ meet up Buyer/.test(w[1]),
      `prices: where to buy sorted, buy orders apart (${w.join(" | ").slice(0, 300)})`);
    // Danny 2026-10-28: freshness tiers on Where to buy - <=8 h shops first, 8-12 h marked low-confidence, older ones
    // hide behind "Show older" while anything fresher exists (a shop that old has usually closed)
    await p.evaluate(() => { const id = "2000000", now = Math.round(Date.now() / 6e4);
      window._frkeep = [PWNOW[id], MDBL[id], PWASK[id], MWLS[id], MILS[id]];
      delete PWNOW[id]; delete PWASK[id]; delete MWLS[id]; delete MILS[id];
      MDBL[id] = [[0, 100, 1, 1, 1, "", "FreshShop", now - 30, 0, ""], [0, 80, 1, 2, 2, "", "AgingShop", now - 9 * 60, 0, ""],
        [0, 60, 1, 3, 3, "", "DeadShop", now - 20 * 60, 0, ""], [0, 90, 1, 4, 4, "", "GoneShop", now - 26 * 60, 0, ""]];
      const e = document.createElement("span"); e.className = "itname"; e.dataset.item = id; document.querySelector("#items").prepend(e); e.click() });
    await p.waitForTimeout(150);
    const fr1 = await p.evaluate(() => { const tbl = document.querySelector("#itprices .pxls"), rows = [...tbl.querySelectorAll("tbody tr:not(.pxx)")];
      return { ord: rows.map(r => (r.innerText.match(/FreshShop|AgingShop|DeadShop|GoneShop/) || [])[0]).filter(Boolean).join(","),
        hid: tbl.querySelectorAll("tbody tr.pxx").length, btn: document.querySelector("#itprices [data-pxall]")?.textContent,
        warn: !!document.querySelector("#itprices .pxold"), text: tbl.innerText.replace(/\s+/g, " ") } });
    check(fr1.ord === "FreshShop,AgingShop" && fr1.hid === 2 && fr1.warn === false && /low-confidence/.test(fr1.text)
      && !/may be closed/.test(fr1.text) && fr1.btn === "Show 2 older listings — shops may have closed",
      `prices: fresh shops first, older hidden (${JSON.stringify(fr1).slice(0, 240)})`);
    const fr2 = await p.evaluate(() => { document.querySelector("#itprices [data-pxall]").click();
      const id = "2000000", [kn, kl, ka, kw, ki] = window._frkeep, txt = document.querySelector("#itprices .pxls").innerText.replace(/\s+/g, " ");
      if (kn) PWNOW[id] = kn; else delete PWNOW[id]; if (kl) MDBL[id] = kl; else delete MDBL[id];
      if (ka) PWASK[id] = ka; else delete PWASK[id]; if (kw) MWLS[id] = kw; else delete MWLS[id]; if (ki) MILS[id] = ki; else delete MILS[id];
      delete window._frkeep; return { dead: /DeadShop/.test(txt), closed: /may be closed/.test(txt) } });
    check(fr2.dead && fr2.closed, `prices: show-older reveals the closed shops (${JSON.stringify(fr2)})`);
    // all-stale item: nothing fresher exists, so the old shops show inline with the closed-shop warning and no toggle
    const old = await p.evaluate(() => { const id = "2000000", now = Math.round(Date.now() / 6e4);
      window._oldkeep = [PWNOW[id], MDBL[id], PWASK[id], MWLS[id], MILS[id]];
      delete PWNOW[id]; delete PWASK[id]; delete MWLS[id]; delete MILS[id];
      MDBL[id] = [[0, 60, 1, 3, 3, "", "DeadShop", now - 20 * 60, 0, ""], [0, 90, 1, 4, 4, "", "GoneShop", now - 26 * 60, 0, ""]];
      const e = document.createElement("span"); e.className = "itname"; e.dataset.item = id; document.querySelector("#items").prepend(e); e.click() });
    await p.waitForTimeout(150);
    const oldOut = await p.evaluate(() => { const id = "2000000", [kn, kl, ka, kw, ki] = window._oldkeep, box = document.querySelector("#itprices");
      const out = { warn: /12 h\+ old/.test(box.innerText), closed: /may be closed/.test(box.innerText),
        nobtn: !box.querySelector("[data-pxall]"), cheap: /may be closed/.test(box.querySelector(".pxtiles").innerText) };
      if (kn) PWNOW[id] = kn; else delete PWNOW[id]; if (kl) MDBL[id] = kl; else delete MDBL[id];
      if (ka) PWASK[id] = ka; else delete PWASK[id]; if (kw) MWLS[id] = kw; else delete MWLS[id]; if (ki) MILS[id] = ki; else delete MILS[id];
      delete window._oldkeep; return out });
    check(oldOut.warn && oldOut.closed && oldOut.nobtn && oldOut.cheap, `prices: all-stale warning, no toggle (${JSON.stringify(oldOut)})`);
    // Z.ai todo #1 (Danny 2026-10-22): meso.watch listings show how long they've been up (D.pw.asks first-seen), 3+ days = stale tag
    const st = await p.evaluate(() => { const id = "2000000", now = Math.round(Date.now() / 6e4), k = PWASK[id];
      PWASK[id] = [[50, 1, 2, "Free Market <1>", "Old", now - 4 * 1440], [55, 1, 3, "Free Market <2>", "Fresh", now - 120], [60, 1, 4, "Free Market <3>", "NoSeen", null]];
      const l = listingsOf(id).filter(x => x.src === "meso.watch"); if (k) PWASK[id] = k; else delete PWASK[id];
      return l.map(x => x.ago + "|" + !!pxStale(x)).join(",") });
    check(/^up 4 days\|true,up 2 h\|false,.*\|false$/.test(st), `prices: meso.watch listing age + stale (${st})`);
    // mesoindex.com (14-mesoindex.js): a Prices row from D.mi.it and Where to buy rows from D.mi.ls with channel + FM room or map
    const mi = await p.evaluate(() => { const id = "1002101", k = [MI[id], MILS[id]], now = Math.round(Date.now() / 6e4);
      MI[id] = [2949, 2899, 3749, 6, 23, 1450, 146, 2, -1, now - 60];
      MILS[id] = [[1450, 1, 5, 3, "ArrowShop", "sale", now - 10, ""], [1600, 2, 11, null, "KcShop", "", now - 20, "Kerning City Construction Site"]];
      const r = PRICE_SRC.map(f => f(id)).find(x => x?.src === "mesoindex.com"), l = listingsOf(id).filter(x => x.src === "mesoindex.com");
      [MI[id], MILS[id]] = k; if (!k[0]) delete MI[id]; if (!k[1]) delete MILS[id];
      return [r?.v, r?.n, l.length, l[0].room, l[1].spot] });
    check(JSON.stringify(mi) === '[2949,"6 sales",2,"FM 3","Kerning City Construction Site"]', `prices: mesoindex row + shops (${mi})`);
    // mesoarbitrage.com + maplestory.watch 2026-10-21: one Prices row each with sample counts; maplestory.watch shops seen in
    // the last day join Where to buy with seller + FM room, older ones (likely closed) drop out
    const ss = await p.evaluate(() => { const id = "2000000", now = Math.round(Date.now() / 6e4), k = [MA[id], MW[id], MWLS[id]];
      MA[id] = [48, 60, 45, 143, 35, 15, now - 200]; MW[id] = [40, 20, 35, 22, 45, now - 10];
      MWLS[id] = [[33, 100, null, 1, "Tomatos", "pots <b>cheap</b>", now - 20], [30, 1, 4, 4, "Gone", "old", now - 1500]];
      const rows = PRICE_SRC.map(f => f(id)).filter(Boolean), ls = listingsOf(id).filter(x => x.src === "maplestory.watch");
      [MA[id], MW[id], MWLS[id]] = k; for (const [o, v] of [[MA, k[0]], [MW, k[1]], [MWLS, k[2]]]) if (!v) delete o[id];
      return [rows.some(r => r.src === "mesoarbitrage.com" && r.v === 48 && r.n === "60 sales" && !r.few),
        rows.some(r => r.src === "maplestory.watch" && r.v === 40 && r.n === "20 sales" && /▼11%/.test(r.trend)),
        ls.length === 1 && ls[0].who === "Tomatos" && ls[0].room === "FM 1" && ls[0].qty === 100 && pxWhere(ls[0]).includes("&lt;b&gt;")] });
    check(JSON.stringify(ss) === "[true,true,true]", `prices: mesoarbitrage + maplestory.watch rows and listings (${ss})`);
    await ctx.close() }

  // classicrank.com "Load by IGN" (59-crlookup.js), API mocked: every job in GET /api/v1/jobs (2026-10-21) maps to a builder
  // class/branch (Beginner, Pirate -> none), the reply is sanitised (markup, foreign URLs), loading sets the builder and Where to train
  { const {p, errs, ctx} = await page();
    const JOBS = [["Beginner","Beginner"],["Archer","Bowman"],["Magician","Magician"],["Pirate","Pirate"],["Thief","Thief"],["Swordsman","Warrior"],
      ["Crossbowman","Bowman"],["Hunter","Bowman"],["Cleric","Magician"],["Wizard (Fire/Poison)","Magician"],["Wizard (Ice/Lightning)","Magician"],
      ["Brawler","Pirate"],["Gunslinger","Pirate"],["Assassin","Thief"],["Bandit","Thief"],["Fighter","Warrior"],["Page","Warrior"],["Spearman","Warrior"],
      ["Ranger","Bowman"],["Sniper","Bowman"],["Mage (Fire/Poison)","Magician"],["Mage (Ice/Lightning)","Magician"],["Priest","Magician"],
      ["Marauder","Pirate"],["Outlaw","Pirate"],["Chief Bandit","Thief"],["Hermit","Thief"],["Crusader","Warrior"],["Dragon Knight","Warrior"],["White Knight","Warrior"]];
    const reply = {GGboom: {name: "GGboom", display_name: "GG<b>boom</b>", level: 74, job: "Spearman", job_tier: 2, family: "Warrior", overall_rank: 3, job_rank: 1,
        level_updated: "2026-10-20T18:58:56Z", photo: "https://classicrank.com/api/avatar/GGboom?v=1", profile_url: "https://classicrank.com/user/GGboom"},
      Sneaky: {name: "Sneaky", level: 45, job: "Wizard (Ice/Lightning)", family: "Magician", photo: "https://evil.example/x.png", profile_url: "javascript:alert(1)"}};
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    await ctx.route("https://classicrank.com/**", r => { if (/\/api\/avatar\//.test(r.request().url())) return r.fulfill({status: 200, contentType: "image/png", body: PNG}); const n = decodeURIComponent(r.request().url().split("?")[0].split("/").pop());
      return reply[n] ? r.fulfill({status: 200, contentType: "application/json", headers: {"access-control-allow-origin": "*"}, body: JSON.stringify({data: reply[n]})})
        : r.fulfill({status: 404, contentType: "application/json", headers: {"access-control-allow-origin": "*"}, body: '{"error":{"status":404}}'}) });
    await p.goto(URL); await open(p, "plan");
    const m = await p.evaluate(J => J.map(([job, family]) => { const j = CRL.jobOf({job, family}); return j.cls ? j.cls + "|" + j.branch : "-" }), JOBS);
    const okMap = await p.evaluate(m => m.every(v => v === "-" || BLD.BRANCHES[v.split("|")[0]].some(b => b[0] === v.split("|")[1])), m);
    check(okMap && m.filter(v => v === "-").length === 6 && m[JOBS.findIndex(j => j[0] === "Wizard (Ice/Lightning)")] === "Magician|I/L Wizard" && m[JOBS.findIndex(j => j[0] === "Hermit")] === "Thief|Assassin",
      `classicrank jobs map to builder jobs (${m.join(", ")})`);
    await p.fill('.crl[data-for="plan"] input', "GGboom"); await p.click('.crl[data-for="plan"] button');
    await p.waitForFunction(() => /Spearman/.test(document.querySelector('.crl[data-for="plan"] .crlout').innerText));
    const b = await p.evaluate(() => { const o = document.querySelector('.crl[data-for="plan"] .crlout'); return {S: BLD.S.cls + "|" + BLD.S.branch + "|" + BLD.S.lvl,
      bold: !!o.querySelector("b b"), txt: o.innerText.replace(/\s+/g, " "), img: o.querySelector("img")?.src, a: o.querySelector("a").href} });
    check(!errs.length && b.S === "Warrior|Spearman|74" && !b.bold && /GG<b>boom<\/b>/.test(b.txt) && /Overall #3 · Spearman #1/.test(b.txt) && b.img === "https://classicrank.com/api/avatar/GGboom?v=1" && b.a === "https://classicrank.com/user/GGboom",
      `Load by IGN sets the builder, escapes the name (${JSON.stringify(b)})`);
    await open(p, "maps"); await p.fill('.crl[data-for="maps"] input', "Sneaky"); await p.click('.crl[data-for="maps"] button');
    await p.waitForFunction(() => document.querySelector('.crl[data-for="maps"] .crlout a'));
    const w = await p.evaluate(() => { const o = document.querySelector('.crl[data-for="maps"] .crlout'); return {cls: $("#cls").value, lvl: $("#lvl").value, img: !!o.querySelector("img"), a: o.querySelector("a").href} });
    check(!errs.length && w.cls === "I/L Wizard" && w.lvl === "45" && !w.img && w.a === "https://classicrank.com/user/Sneaky", `Load by IGN sets Where to train, drops foreign URLs (${JSON.stringify(w)})`);
    await p.fill('.crl[data-for="maps"] input', "Nobody"); await p.click('.crl[data-for="maps"] button');
    await p.waitForFunction(() => /isn't on classicrank/.test(document.querySelector('.crl[data-for="maps"] .crlout').innerText));
    await p.fill('.crl[data-for="maps"] input', "<img>"); await p.click('.crl[data-for="maps"] button');
    check(/letters and numbers/.test(await p.innerText('.crl[data-for="maps"] .crlout')), "Load by IGN: unknown name and bad input say so");
    await p.reload(); await open(p, "plan");
    check(await p.inputValue('.crl[data-for="plan"] input') === "Sneaky" && /Sneaky/.test(await p.innerText('.crl[data-for="plan"] .crlout')), "Load by IGN: last character remembered after reload");
    // @char in Ctrl K: one request after typing stops (300 ms), Enter loads it into the open page (Builder here)
    let asked = []; p.on("request", r => { if (/\/api\/v1\/characters\//.test(r.url())) asked.push(r.url().split("?")[0].split("/").pop()) });
    await p.keyboard.press("Control+k"); await p.type("#srchq", "@char GGboom", {delay: 40});
    await p.waitForFunction(() => /Overall #3/.test(document.querySelector("#srchres").innerText));
    const row = await p.innerText("#srchres li"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    const sc = await p.evaluate(() => ({S: BLD.S.cls + "|" + BLD.S.branch + "|" + BLD.S.lvl, plan: !$("#plan").hidden, open: !$("#srch").hidden}));
    check(!errs.length && asked.join() === "GGboom" && /Character/.test(row) && sc.S === "Warrior|Spearman|74" && sc.plan && !sc.open, `@char search asks once and loads the builder (${asked.join()}; ${row.replace(/\s+/g, " ")}; ${JSON.stringify(sc)})`);
    // job census card (D.crank): every launch job with players listed, the builder's job highlighted and summed up
    const cen = await p.evaluate(() => ({rows: document.querySelectorAll("#pcensusbody tbody tr").length, want: D.crank.jobs.filter(j => j[3] > 0 && j[1] <= 2).length,
      hi: document.querySelector("#pcensusbody tr.vrow td")?.innerText, line: document.querySelector("#pcensusbody p")?.innerText, badge: document.querySelector('.crl[data-for="plan"] .crlout').innerText}));
    check(cen.rows === cen.want && cen.rows >= 10 && /^Spearman/.test(cen.hi) && /^Spearman is the .*most played 2nd job of \d+: [\d,]+ characters/.test(cen.line) && /Spearman #1 of [\d,]+/.test(cen.badge),
      `job census card + "of N" on the badge (${JSON.stringify(cen)})`);
    await ctx.close() }

  // audit P10: mob pages show "players' actual" mesos/kill from shared runs beside the meowdb estimate (>= 100 kills to mean anything)
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "mobs");
    await p.fill("#mbsearch", "Pig"); await p.dispatchEvent("#mbsearch", "input"); await p.waitForTimeout(80);
    await p.evaluate(() => [...document.querySelectorAll("#mbrows .mbtn")].find(b => b.textContent.startsWith("Pig")).click()); await p.waitForTimeout(80);
    const pig = await p.evaluate(() => { const t = document.querySelector("#mbpage").innerText, c = D.shared.mobs["8"], act = (c.mesos / c.kills).toFixed(1);
      return {h2: document.querySelector("#mbpage h2").innerText, m: t.match(/players' actual: ([\d.]+) mesos per kill over ([\d,]+) tracker kills \(read [^)]+\)( — meowdb's [\d.]+ sits \d+% (?:under|over) this)?/), act} });
    check(!errs.length && pig.h2 === "Pig" && pig.m && pig.m[1] === pig.act && /meowdb's \d/.test(pig.m[0]),
      `Pig page shows players' actual (${pig.m ? pig.m[0] : "missing"}), computed ${(pig.m || [])[1]} = ${pig.act}`);
    await p.click("#mbback"); await p.fill("#mbsearch", "Iron Hog"); await p.dispatchEvent("#mbsearch", "input"); await p.waitForTimeout(80);
    await p.click("#mbrows .mbtn"); await p.waitForTimeout(80);
    const hog = await p.evaluate(() => ({h2: document.querySelector("#mbpage h2").innerText, has: /players' actual/.test(document.querySelector("#mbpage").innerText), k: D.shared.mobs["24"]?.kills || 0}));
    check(hog.h2 === "Iron Hog" && !hog.has && hog.k < 100, `a mob under 100 shared kills stays quiet (${hog.h2}, ${hog.k} kills)`);
    await ctx.close() }

  await b.close();
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
