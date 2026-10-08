// Re-pull meowdb's community drop lists for every monster in data.json (mobdb + field mobs) into data/sources/meowdb_drops.json.
// meowdb sits behind Cloudflare, so the API is called from inside a headless-Chromium page.
// Run: node scripts/fetch_meowdb_drops.js   then   python3 scripts/build_data.py extras mobdb && python3 scripts/build.py
// (cloud sessions: set CHROMIUM=/opt/pw-browsers/chromium)
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), SRC = path.join(ROOT, "data/sources/meowdb_drops.json");
(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, "data/data.json")));
  const ids = [...new Set([...Object.keys(D.mobdb), ...Object.keys(D.mobs)])].sort((a, b) => a - b);
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}), p = await b.newPage();
  await p.goto("https://meowdb.com/msclassic", {timeout: 60000});
  const got = await p.evaluate(async ids => { const o = {};
    for (const id of ids){ const r = await fetch("/msclassic/api/drops?monsterId=" + id);
      o[id] = r.ok ? (await r.json()).drops.map(x => [x.itemIconKey, x.itemName, x.upvotes, x.downvotes]) : null;
      await new Promise(z => setTimeout(z, 250)) }
    return o }, ids);
  await b.close();
  const bad = ids.filter(id => got[id] === null); if (bad.length) throw new Error("meowdb failed for monsters " + bad.join(", "));
  const j = JSON.parse(fs.readFileSync(SRC)); j.read = new Date().toISOString().slice(0, 10);
  j.mobs = Object.fromEntries(ids.filter(id => got[id].length).map(id => [id, got[id]]));
  fs.writeFileSync(SRC, JSON.stringify(j));
  console.log(`${Object.keys(j.mobs).length} monsters, ${Object.values(j.mobs).flat().length} reports -> ${SRC}`);
})();
