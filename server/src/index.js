/* Shared grind data for MS Classic World Info (Cloudflare Worker + D1).
   POST /api/runs     a 15-minute run from the grind tracker (sharing on)
   GET  /api/summary  everything the site needs, anonymous: one row per player per map/party (their typical run),
                      plus drop counts per monster. The site's daily build bakes this into the page. */
import G from "./gamedata.json" with {type: "json"};
import {cleanRun, median} from "./check.js";

const CORS = {"access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type"};
const json = (v, status = 200) => new Response(JSON.stringify(v), {status, headers: {"content-type": "application/json", ...CORS}});
const MAX_PER_HOUR = 6, MAX_PER_IP_DAY = 100;   // a run is 15 min, so 4/hour is the real most; the rest is slack

async function sha(s){ return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32) }
async function salt(db){
  let row = await db.prepare("SELECT v FROM meta WHERE k = 'salt'").first();
  if (!row){ await db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('salt', ?)").bind(crypto.randomUUID()).run(); row = await db.prepare("SELECT v FROM meta WHERE k = 'salt'").first() }
  return row.v;
}

async function postRun(req, env){
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  const c = cleanRun(body, G);
  if (c.error) return json({error: c.error}, 400);
  const now = new Date(), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(ip + now.toISOString().slice(0, 10) + await salt(env.DB));
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM runs WHERE install = ? AND received > ?").bind(body.install, new Date(now - 3600e3).toISOString()).first();
  const today = await env.DB.prepare("SELECT COUNT(*) n FROM runs WHERE ipday = ?").bind(ipday).first();
  // one vote per player: a new install ID from an IP that already sent 3 others today is refused (ID rotation)
  const ids = await env.DB.prepare("SELECT COUNT(DISTINCT install) n, SUM(install = ?) mine FROM runs WHERE ipday = ?").bind(body.install, ipday).first();
  if (recent.n >= MAX_PER_HOUR || today.n >= MAX_PER_IP_DAY || ids.n >= 3 && !ids.mine) return json({error: "too many runs"}, 429);
  const r = c.run;
  await env.DB.prepare(`INSERT INTO runs (install, ipday, received, date, map, map_name, level, job, party, minutes, exp, msg_exp, bar_exp,
    kills, mesos, ok, why, mobs, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(body.install, ipday, now.toISOString(), r.date, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.msg_exp, r.bar_exp,
      r.kills, r.mesos, c.ok ? 1 : 0, c.why, JSON.stringify(r.mobs), JSON.stringify(r.items)).run();
  const code = typeof body.partyCode === "string" ? body.partyCode.trim().toLowerCase().slice(0, 20) : "";
  if (code){
    const {id} = await env.DB.prepare("SELECT MAX(id) id FROM runs WHERE install = ?").bind(body.install).first();
    await env.DB.prepare("INSERT OR REPLACE INTO run_groups (run_id, grp) VALUES (?, ?)").bind(id, await sha("party:" + code + await salt(env.DB))).run();
  }
  return json({ok: true, counted: c.ok, why: c.why});
}

export async function summary(db){
  const {results} = await db.prepare(`SELECT r.install, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.kills, r.mesos, r.mobs, g.grp
    FROM runs r LEFT JOIN run_groups g ON g.run_id = r.id WHERE r.ok = 1`).all();
  // one row per player per map and solo/party: their typical (median) run
  const per = new Map(), mobs = {};
  for (const r of results){
    const k = [r.install, r.map ?? "?" + r.map_name, r.party > 1 ? 1 : 0].join("|"), h = r.minutes / 60;
    if (!per.has(k)) per.set(k, {map: r.map, mapName: r.map_name, party: [], level: [], job: [], exp: [], mesos: [], kills: [], grp: null});
    const p = per.get(k);
    if (r.grp) p.grp = r.grp;
    p.party.push(r.party); p.level.push(r.level); p.job.push(r.job); p.exp.push(r.exp / h); p.mesos.push(r.mesos / h); p.kills.push(r.kills / h);
    for (const m of JSON.parse(r.mobs || "[]")){
      const t = mobs[m.id] || (mobs[m.id] = {kills: 0, mesos: 0, mesoDrops: 0, items: {}, players: new Set()});
      t.kills += m.kills; t.mesos += m.mesos; t.mesoDrops += m.mesoDrops; t.players.add(r.install);
      for (const [id, n] of Object.entries(m.items)) t.items[id] = (t.items[id] || 0) + n;
    }
  }
  const last = a => a.filter(v => v != null).at(-1) ?? null;
  // group: the party (by party code) or the player alone; a short label, not the code or the install ID
  const label = new Map(), grp = (p, i) => { const k = p.grp || "solo" + i; if (!label.has(k)) label.set(k, "g" + label.size); return label.get(k) };
  const rows = [...per.values()].map((p, i) => ({group: grp(p, i), map: p.map, mapName: p.mapName, party: Math.round(median(p.party)), level: last(p.level), job: last(p.job),
    runs: p.exp.length, expHr: Math.round(median(p.exp)), mesosHr: Math.round(median(p.mesos)), killsHr: Math.round(median(p.kills))}));
  for (const t of Object.values(mobs)){ t.players = t.players.size }
  const players = new Set(results.map(r => r.install)).size, hours = results.reduce((a, r) => a + r.minutes, 0) / 60;
  return {updated: new Date().toISOString(), runs: results.length, players, hours: Math.round(hours * 10) / 10, rows, mobs};
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, {headers: CORS});
    if (url.pathname === "/api/runs" && req.method === "POST") return postRun(req, env);
    if (url.pathname === "/api/summary" && req.method === "GET"){
      // worked out at most every 5 minutes (each request would otherwise read every run)
      const cache = typeof caches !== "undefined" ? caches.default : null, hit = cache && await cache.match(req);
      if (hit) return hit;
      const res = json(await summary(env.DB));
      res.headers.set("cache-control", "public, max-age=300");
      if (cache) await cache.put(req, res.clone());
      return res;
    }
    if (url.pathname === "/") return json({about: "MS Classic World Info shared grind data", summary: "/api/summary"});
    return json({error: "not found"}, 404);
  },
};
