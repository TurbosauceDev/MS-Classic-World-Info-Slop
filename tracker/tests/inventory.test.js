// node tests/inventory.test.js — item counts on the quick slots and the Use tab (tests/frames-inv: crops of Danny's
// screenshots, 2026-10-17, un-doubled to game pixels). Expected counts and items read off the screenshots by eye. Needs playwright.
const fs = require("fs"), path = require("path"), {chromium} = require("playwright");
const dir = path.join(__dirname, "frames-inv");
// [count, item]: quick slots (Meat, Lemon, White Potion, Orange Potion) and Use-tab stacks that are potions/food/arrows
const WANT = [[91, "2010003"], [85, "2010005"], [29, "2000002"], [8, "2000001"], [341, "2060000"], [1000, "2060000"], [435, "2060000"], [666, "2061000"],
  [1000, "2061000"], [8, "2000003"], [81, "2010003"], [10, "2010003"], [10, "2022000"], [5, "2000000"]];
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent("<!doctype html><title>inventory</title>");
  for (const f of ["gamedata.js", "shot.js", "readers.js"]) await page.addScriptTag({path: path.join(__dirname, "../app", f)});
  let fail = 0;
  for (const name of fs.readdirSync(dir).filter(f => /^inv-.*\.png$/.test(f)).sort()){
    const r = await page.evaluate(async b64 => {
      const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), img = {w: d.width, h: d.height, d: d.data, k: 1};
      const icons = window.ICONS ||= await GrindReaders.loadIcons(GAMEDATA), t0 = performance.now();
      const dbg = [], found = GrindReaders.readCounts(img).map(n => [n.n, GrindReaders.iconAt(img, n, icons, dbg)]);
      const ms = performance.now() - t0;
      // a White Potion drunk: the quick slot's "29" becomes "28" (an 8 copied over the 9); taken once read twice
      const rd = GrindReaders.createReaders(GAMEDATA, icons), n29 = GrindReaders.readCounts(img).filter(n => n.n === 29);
      const ev = [...rd.readFrame(img, 0)];
      const n8 = GrindReaders.readCounts(img).find(n => n.n === 8), d2 = new Uint8ClampedArray(d.data);
      for (const q of n29) for (let y = -8; y <= 0; y++) for (let x = 0; x < 6; x++){ const s = ((n8.y + y) * img.w + n8.x + x) * 4, t = ((q.y + y) * img.w + q.x + 8 + x) * 4; for (let k = 0; k < 4; k++) d2[t + k] = d.data[s + k] }
      const img2 = {...img, d: d2};
      ev.push(...rd.readFrame(img2, 2000), ...rd.readFrame(img2, 4000), ...rd.readFrame(img2, 6000));
      const wallet = GrindReaders.readMesoTotal(img), slots = new Set(GrindReaders.readCounts(img).map(n => n.slot)).size;
      return {slots, wallet, found, dbg, ms, used: ev.filter(e => e.type === "use"), n29: n29.length};
    }, fs.readFileSync(path.join(dir, name)).toString("base64"));
    const miss = WANT.filter(([n, id]) => !r.found.some(([m, i]) => m === n && i === id));
    const wrong = r.found.filter(([n, id]) => id && !WANT.some(([m, i]) => m === n && i === id));
    const used = JSON.stringify(r.used.map(e => [e.id, e.n]));
    if (r.wallet !== 4685) console.log("wallet read", r.wallet);
    // 5 Use-tab columns + 3 quick-slot columns with counts: "1000", "10", "7" and "2" in one column share one slot edge
    if (r.slots !== 8) console.log("slot columns", r.slots);
    const ok = r.slots === 8 && r.wallet === 4685 && !miss.length && !wrong.length && used === '[["2000002",1]]';
    if (!ok) fail++;
    if (process.env.V) console.log(JSON.stringify(r.found), JSON.stringify(r.dbg));
    console.log(name, ok ? "ok" : "FAIL", Math.round(r.ms) + " ms", miss.length ? "missing " + JSON.stringify(miss) : "", wrong.length ? "wrong " + JSON.stringify(wrong) : "", "used " + used, "29s " + r.n29);
  }
  // party HP bars (Danny's party HUD, one member): 1, 2 and 3 copies stacked like the HUD does -> no party / 2 / 3
  const bar = fs.readFileSync(path.join(dir, "party-hp-bar.png")).toString("base64");
  const party = await page.evaluate(async b64 => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    return [1, 2, 3].map(k => { const c = document.createElement("canvas"); c.width = 1280; c.height = 720; const g = c.getContext("2d");
      for (let i = 0; i < k; i++) g.drawImage(im, 88, 222 + i * 30);
      const d = g.getImageData(0, 0, 1280, 720); return GrindReaders.readParty({w: 1280, h: 720, d: d.data}) });
  }, bar);
  console.log("party HUD", JSON.stringify(party));
  if (JSON.stringify(party) !== "[null,2,3]"){ fail++; console.log("party FAIL") }
  // meso totals (bottom of Danny's inventory screenshots, un-doubled): the file name is the total shown
  const meso = [];
  for (const name of fs.readdirSync(dir).filter(f => /^meso-\d+\.png$/.test(f)).sort()){
    const got = await page.evaluate(async b64 => {
      const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height); return GrindReaders.readMesoTotal({w: d.width, h: d.height, d: d.data, k: 1});
    }, fs.readFileSync(path.join(dir, name)).toString("base64"));
    const want = +name.match(/\d+/)[0]; meso.push(got);
    if (got !== want){ fail++; console.log(name, "meso FAIL, read", got) }
  }
  console.log("meso totals", meso.join(" "));
  // a frame from the tracker's own capture (video: colors off by a few, Use tab with the selected slot's frame): quick
  // slots White Potion 24, Lemon 9, Orange Potion 5; Use tab bow arrows 375 + 668, crossbow 765 + 1000, Red 20, White 24,
  // Blue 18, Pure Water 10, Lemon 9, Orange 5 (read off the frame by eye, Danny's KPQ run 2026-10-17)
  const VWANT = [[24, "2000002"], [9, "2010005"], [5, "2000001"], [375, "2060000"], [668, "2060000"], [765, "2061000"], [1000, "2061000"],
    [20, "2000000"], [24, "2000002"], [18, "2000003"], [10, "2022000"], [9, "2010005"], [5, "2000001"]];
  const vid = await page.evaluate(async b64 => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), img = {w: d.width, h: d.height, d: d.data, k: 1};
    return GrindReaders.readCounts(img).map(n => [n.n, GrindReaders.iconAt(img, n, ICONS)]);
  }, fs.readFileSync(path.join(dir, "video-a.png")).toString("base64"));
  // the same frame with a box drawn around the quick slots only (they sit lower left in this crop): just their 3 counts
  const boxed = await page.evaluate(async b64 => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), img = {w: d.width, h: d.height, d: d.data, k: 1}, rd = GrindReaders.createReaders(GAMEDATA, ICONS);
    rd.setArea({x: 0, y: 100 / img.h, w: 160 / img.w, h: 100 / img.h});
    return GrindReaders.readCounts(img, rd.areaPx(img)).map(n => n.n).sort((a, b) => a - b).join(",");
  }, fs.readFileSync(path.join(dir, "video-a.png")).toString("base64"));
  console.log("quick slots in a box:", boxed);
  // learned box: the first read looks over the whole frame, the next ones only around the counts found; same counts, less
  // time. With the counts gone (window closed) it looks over the whole frame again on the next read.
  const learn = await page.evaluate(async b64 => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = 900; c.height = 700; const g = c.getContext("2d"); g.fillStyle = "#246"; g.fillRect(0, 0, 900, 700); g.drawImage(im, 300, 250);
    const d = g.getImageData(0, 0, 900, 700), img = {w: 900, h: 700, d: d.data, k: 1}, rd = GrindReaders.createReaders(GAMEDATA, ICONS);
    const spots = t => { rd.readFrame(img, t); return rd.info.useSpots };
    const a = spots(0), b = spots(2000), c2 = spots(4000);
    g.fillRect(0, 0, 900, 700); const blank = {w: 900, h: 700, d: g.getImageData(0, 0, 900, 700).data, k: 1};
    rd.readFrame(blank, 6000); const gone = rd.info.useSpots;
    g.drawImage(im, 20, 20); const moved = {w: 900, h: 700, d: g.getImageData(0, 0, 900, 700).data, k: 1};
    rd.readFrame(moved, 8000); return [a, b, c2, gone, rd.info.useSpots];
  }, fs.readFileSync(path.join(dir, "video-a.png")).toString("base64"));
  console.log("learned count box (spots: full, box, box, closed, moved):", learn.join());
  if (!(learn[0] > 0 && learn[1] === learn[0] && learn[2] === learn[0] && learn[3] === 0 && learn[4] === learn[0])) fail++;
  if (boxed !== "5,9,24") fail++;
  const vleft = [...vid], vmiss = VWANT.filter(([n, id]) => { const i = vleft.findIndex(([m, j]) => m === n && j === id); if (i < 0) return true; vleft.splice(i, 1) });
  const vwrong = vleft.filter(([, id]) => id);
  console.log("video frame", vmiss.length || vwrong.length ? "FAIL missing " + JSON.stringify(vmiss) + " wrong " + JSON.stringify(vwrong) : "ok", vid.length + " counts");
  if (vmiss.length || vwrong.length) fail++;
  // the inventory window (Danny's Use tab, 2026-10-18, 12,162 mesos): found by its red line and pink tab, every slot's item
  // and count; then as reader events (the same read twice = one "inv" event). Items read off the screenshot by eye.
  const IWANT = [[0, 130, "Arrows for Bows"], ...[1, 2, 3, 4, 5, 6, 7].map(i => [i, 800, "Bronze Arrows for Bows"]), [8, 217, "Bronze Arrows for Bows"],
    [9, 200, "Arrows for Crossbows"], [10, 11, "Orange Potion"], [11, 18, "Blue Potion"], [15, 6, "Lemon"], [16, 10, "Pure Water"],
    [17, 1, "Return Scroll to Perion"], [18, 1, "Return Scroll to Henesys"], [19, 1, "Return Scroll to Sleepywood"]];
  const inv = await page.evaluate(async b64 => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), img = {w: d.width, h: d.height, d: d.data, k: 1};
    const all = await GrindReaders.loadIcons(GAMEDATA, GAMEDATA.iicons), rd = GrindReaders.createReaders(GAMEDATA, []); rd.setInvIcons(all);
    const found = GrindReaders.findInventory(img), t0 = performance.now();
    const r = GrindReaders.readInventory(img, found, all.filter(ic => ["Consumable", "Scroll"].includes(GAMEDATA.items[ic.id].c)));
    const ms = performance.now() - t0, ev = [...rd.readFrame(img, 0), ...rd.readFrame(img, 2000), ...rd.readFrame(img, 4000)].filter(e => e.type === "inv");
    return {found, ms, wallet: GrindReaders.readMesoTotal(img), slots: r.slots.map(sl => [sl.i, sl.n, GAMEDATA.items[sl.ids[0]].n, sl.ids.length]), unknown: r.unknown, ev};
  }, fs.readFileSync(path.join(dir, "use-12162.png")).toString("base64"));
  const imiss = IWANT.filter(([i, n, name]) => !inv.slots.some(s => s[0] === i && s[1] === n && s[2] === name));
  const ev = inv.ev[0];
  const iok = inv.found?.tab === "use" && inv.wallet === 12162 && !imiss.length && inv.slots.length === 21 && !inv.unknown && inv.ev.length === 1 && ev.items["2060001"] === 800 * 7 + 217 && ev.unknown === 0;
  console.log("inventory window", iok ? "ok" : "FAIL " + JSON.stringify({imiss, inv: {...inv, ev: inv.ev.length}}), Math.round(inv.ms) + " ms");
  if (!iok) fail++;
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  if (fail) throw new Error(fail + " frame(s) failed");
  console.log("inventory test passed");
})().catch(e => { console.error(e.message); process.exit(1) });
