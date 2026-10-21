// Re-pull meowdb's NPC shop list (https://meowdb.com/msclassic/npc-shops) into data/sources/meowdb_shops.json.
// The page is server-rendered: the shop list is JSON inside its Next.js flight payload (self.__next_f), read in headless Chromium
// (meowdb sits behind Cloudflare). Victoria Island + Maple Island shops only; Ossyria (map ids 2xxxxxxxx) is not in the launch.
// Run: node scripts/fetch_meowdb_shops.js   then   python3 scripts/build_data.py extras itemdb quests crafting && python3 scripts/build.py
// (cloud sessions: set CHROMIUM=/opt/pw-browsers/chromium)
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const SRC = path.join(path.resolve(__dirname, ".."), "data/sources/meowdb_shops.json");
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}), p = await b.newPage();
  await p.goto("https://meowdb.com/msclassic/npc-shops", {timeout: 60000});
  const raw = await p.evaluate(() => (self.__next_f || []).map(x => typeof x[1] === "string" ? x[1] : "").join(""));
  await b.close();
  const shops = [];
  for (const m of raw.matchAll(/\{"slug":"/g)) {   // each shop object starts {"slug": ...; scan to its matching brace
    let d = 0, i = m.index, q = false;
    for (; i < raw.length; i++) { const c = raw[i];
      if (q) { if (c === "\\") i++; else if (c === '"') q = false } else if (c === '"') q = true;
      else if (c === "{") d++; else if (c === "}" && !--d) break }
    try { const o = JSON.parse(raw.slice(m.index, i + 1)); if (o.npcName && o.items) shops.push(o) } catch (e) {}
  }
  if (shops.length < 25) throw new Error(`only ${shops.length} shops parsed; page layout changed?`);
  const out = shops.filter(s => !s.mapId.startsWith("02") && s.items.some(x => x.classicPrice != null)).map(s => ({
    npc: s.npcName, kind: s.npcFunction, prices: s.patch === "LAUNCH" ? "Launch prices" : s.patch + " prices",
    map: s.videoMapName.split(": ").pop(), mapId: String(+s.mapId),
    items: s.items.filter(x => x.classicPrice != null).map(x => [x.name, x.classicPrice, x.citizenReq || null])}));
  fs.writeFileSync(SRC, JSON.stringify({source: "https://meowdb.com/msclassic/npc-shops", read: new Date().toISOString().slice(0, 10),
    note: "prices = meowdb's tag per shop: Launch (re-read in the live game) or COT2/COT1 (last read in that test)", shops: out}, null, 1));
  console.log(`${out.length} shops (${out.filter(s => s.prices === "Launch prices").length} launch-priced), ${out.flatMap(s => s.items).length} rows -> ${SRC}`);
})();
