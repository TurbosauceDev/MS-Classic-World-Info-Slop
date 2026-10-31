// Re-pull meowdb's community drop lists and "Mesos per kill" reports for every monster in data.json (mobdb + field mobs) into
// data/sources/meowdb_drops.json and meowdb_mesos.json (meowdb monster ids = OSMS ids).
// meowdb sits behind Cloudflare, so the API is called from inside a headless-Chromium page.
// Run: node scripts/fetch_meowdb_drops.js   then   python3 scripts/build_data.py extras mobdb && python3 scripts/build.py
// (cloud sessions: set CHROMIUM=/opt/pw-browsers/chromium)
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), SRC = path.join(ROOT, "data/sources/meowdb_drops.json"),
  MSRC = path.join(ROOT, "data/sources/meowdb_mesos.json");
(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, "data/data.json")));
  const ids = [...new Set([...Object.keys(D.mobdb), ...Object.keys(D.mobs)])].sort((a, b) => a - b);
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}), p = await require("./meowdb_page.js").open(b, "https://meowdb.com/msclassic");
  const got = await p.evaluate(async ids => { const o = {};
    for (const id of ids){ const r = await fetch("/msclassic/api/drops?monsterId=" + id);
      const m = await fetch("/msclassic/api/mesos-reports?monsterId=" + id);
      o[id] = r.ok && m.ok ? [(await r.json()).drops.map(x => [x.itemIconKey, x.itemName, x.upvotes, x.downvotes]), await m.json()] : null;
      await new Promise(z => setTimeout(z, 250)) }
    return o }, ids);
  await b.close();
  const bad = ids.filter(id => got[id] === null); if (bad.length) throw new Error("meowdb failed for monsters " + bad.join(", "));
  const day = new Date().toISOString().slice(0, 10), j = JSON.parse(fs.readFileSync(SRC)); j.read = day;
  j.mobs = Object.fromEntries(ids.filter(id => got[id][0].length).map(id => [id, got[id][0]]));
  fs.writeFileSync(SRC, JSON.stringify(j));
  console.log(`${Object.keys(j.mobs).length} monsters, ${Object.values(j.mobs).flat().length} reports -> ${SRC}`);
  // mesos: meowdb's summary = median of trusted reports; name from our data for readability
  const nm = id => (D.mobdb[id] || {}).name || (D.mobs[id] || [])[0], k = JSON.parse(fs.readFileSync(MSRC)); k.read = day;
  k.monsters = Object.fromEntries(ids.filter(id => got[id][1].reports.length).map(id => [id, {name: nm(id), summary: got[id][1].summary,
    reports: got[id][1].reports.map(r => ({minMesos: r.minMesos, maxMesos: r.maxMesos, dropChancePct: r.dropChancePct, score: r.score, createdAt: r.createdAt}))}]));
  fs.writeFileSync(MSRC, JSON.stringify(k, null, 1));
  console.log(`${Object.keys(k.monsters).length} monsters with meso reports -> ${MSRC}`);
})();
