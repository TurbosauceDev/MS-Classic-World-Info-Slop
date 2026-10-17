/* Shared grind data for MS Classic World Info (Cloudflare Worker + D1).
   POST /api/runs     a 15-minute run from the grind tracker (sharing on)
   POST /api/party    live party view: post your numbers, get your party's (same party code)
   GET  /api/summary  everything the site needs, anonymous: one row per player per map/party (their typical run),
                      plus drop counts per monster. The site's daily build bakes this into the page. */
import G from "./gamedata.json" with {type: "json"};
import {cleanRun, median} from "./check.js";

const CORS = {"access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type"};
const json = (v, status = 200) => new Response(JSON.stringify(v), {status, headers: {"content-type": "application/json", ...CORS}});
// a run is 15 min, so 4/hour is the real most; the rest is slack. Per IP: a whole party can share one home network
// (6 players x 4 runs/hr x 12 hr = 288), so up to 6 tracker copies and 300 runs a day
const MAX_PER_HOUR = 6, MAX_PER_IP_DAY = 300, MAX_INSTALLS_PER_IP_DAY = 6;

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
  // one vote per player: a new install ID from an IP that already sent 6 others today is refused (ID rotation)
  const ids = await env.DB.prepare("SELECT COUNT(DISTINCT install) n, SUM(install = ?) mine FROM runs WHERE ipday = ?").bind(body.install, ipday).first();
  if (recent.n >= MAX_PER_HOUR || today.n >= MAX_PER_IP_DAY || ids.n >= MAX_INSTALLS_PER_IP_DAY && !ids.mine) return json({error: "too many runs"}, 429);
  const r = c.run;
  await env.DB.prepare(`INSERT INTO runs (install, ipday, received, date, map, map_name, level, job, party, minutes, exp, msg_exp, bar_exp,
    kills, mesos, ok, why, mobs, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(body.install, ipday, now.toISOString(), r.date, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.msg_exp, r.bar_exp,
      r.kills, r.mesos, c.ok ? 1 : 0, c.why, JSON.stringify(r.mobs), JSON.stringify(r.items)).run();
  const {id: runId} = await env.DB.prepare("SELECT MAX(id) id FROM runs WHERE install = ?").bind(body.install).first();
  if (r.deaths != null) await env.DB.prepare("INSERT OR REPLACE INTO run_deaths (run_id, deaths) VALUES (?, ?)").bind(runId, r.deaths).run();
  const code = typeof body.partyCode === "string" ? body.partyCode.trim().toLowerCase().slice(0, 20) : "";
  if (code && r.party > 1){   // a code only groups party runs: friends soloing the same map with one code are separate players
    await env.DB.prepare("INSERT OR REPLACE INTO run_groups (run_id, grp) VALUES (?, ?)").bind(runId, await sha("party:" + code + await salt(env.DB))).run();
  }
  return json({ok: true, counted: c.ok, why: c.why});
}

// party view: a tracker posts its live numbers with its party code and gets back everyone with the same code seen in the
// last 3 minutes. Nothing here is kept past an hour or used in the shared numbers. No install IDs go back out.
const PARTY_FRESH = 3 * 60e3, PARTY_MAX = 6, PARTY_EVERY = 20e3;
async function partyLive(req, env){
  let b; try { b = await req.json() } catch { return json({error: "bad json"}, 400) }
  const num = (v, hi) => typeof v === "number" && isFinite(v) && v >= 0 && v <= hi ? Math.round(v) : null;
  if (!b || typeof b.install !== "string" || !/^[a-z0-9-]{16,40}$/i.test(b.install)) return json({error: "install id"}, 400);
  const code = typeof b.partyCode === "string" ? b.partyCode.trim().toLowerCase().slice(0, 20) : "";
  if (!code) return json({error: "party code"}, 400);
  const grp = await sha("party:" + code + await salt(env.DB)), now = Date.now();
  const text = (v, n) => typeof v === "string" ? v.slice(0, n) : null;
  const me = {nick: typeof b.nick === "string" ? b.nick.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12) : "", job: text(b.job, 40),
    level: num(b.level, 200), mapName: text(b.mapName, 60), expHr: num(b.expHr, 1e8), expHr5: num(b.expHr5, 1e8),
    killsHr: num(b.killsHr, 1e5), mesosHr: num(b.mesosHr, 1e8), active: num(b.active, 1e7)};
  const old = await env.DB.prepare("SELECT updated FROM party_live WHERE grp = ? AND install = ?").bind(grp, b.install).first();
  if (old && now - Date.parse(old.updated) < PARTY_EVERY) return json({error: "too often"}, 429);
  // one machine can't fill the table: at most 6 tracker copies per IP (hashed) in the last hour
  const ip = await sha("ip:" + (req.headers.get("cf-connecting-ip") || "") + await salt(env.DB));
  if (!old){
    const k = await env.DB.prepare("SELECT COUNT(DISTINCT install) n, SUM(install = ?) mine FROM party_live WHERE ip = ?").bind(b.install, ip).first();
    if (k.n >= PARTY_MAX && !k.mine) return json({error: "too many trackers"}, 429);
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM party_live WHERE grp = ? AND updated > ?").bind(grp, new Date(now - PARTY_FRESH).toISOString()).first();
    if (n.n >= PARTY_MAX) return json({error: "party full"}, 429);
  }
  await env.DB.prepare("DELETE FROM party_live WHERE updated < ?").bind(new Date(now - 3600e3).toISOString()).run();
  await env.DB.prepare("INSERT OR REPLACE INTO party_live (grp, install, updated, ip, data) VALUES (?, ?, ?, ?, ?)").bind(grp, b.install, new Date(now).toISOString(), ip, JSON.stringify(me)).run();
  const {results} = await env.DB.prepare("SELECT install, updated, data FROM party_live WHERE grp = ? AND updated > ? ORDER BY install")
    .bind(grp, new Date(now - PARTY_FRESH).toISOString()).all();
  const members = results.map(r => ({...JSON.parse(r.data), you: r.install === b.install, ago: Math.round((now - Date.parse(r.updated)) / 1000)}));
  return json({members, expHr: members.reduce((a, m) => a + (m.expHr || 0), 0)});
}

export async function summary(db){
  const {results} = await db.prepare(`SELECT r.install, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.kills, r.mesos, r.mobs, g.grp, d.deaths
    FROM runs r LEFT JOIN run_groups g ON g.run_id = r.id LEFT JOIN run_deaths d ON d.run_id = r.id WHERE r.ok = 1`).all();
  // one row per player per map and solo/party: their typical (median) run
  const per = new Map(), mobs = Object.create(null);   // no prototype: a stored id can never reach Object.prototype
  for (const r of results){
    const k = [r.install, r.map ?? "?" + r.map_name, r.party > 1 ? 1 : 0].join("|"), h = r.minutes / 60;
    if (!per.has(k)) per.set(k, {map: r.map, mapName: r.map_name, party: [], level: [], job: [], exp: [], mesos: [], kills: [], deaths: [], grp: null});
    const p = per.get(k);
    if (r.grp) p.grp = r.grp;
    p.party.push(r.party); p.level.push(r.level); p.job.push(r.job); p.exp.push(r.exp / h); p.mesos.push(r.mesos / h); p.kills.push(r.kills / h); if (r.deaths != null) p.deaths.push(r.deaths / h);
    for (const m of JSON.parse(r.mobs || "[]")){
      if (!/^\d{1,10}$/.test(m.id)) continue;   // runs stored before ids were checked
      const t = mobs[m.id] || (mobs[m.id] = {kills: 0, mesos: 0, mesoDrops: 0, items: Object.create(null), players: new Set()});
      t.kills += m.kills; t.mesos += m.mesos; t.mesoDrops += m.mesoDrops; t.players.add(r.install);
      for (const [id, n] of Object.entries(m.items || {})) if (/^\d{1,10}$/.test(id)) t.items[id] = (t.items[id] || 0) + (+n || 0);
    }
  }
  const last = a => a.filter(v => v != null).at(-1) ?? null;
  // group: the party (by party code) or the player alone; a short label, not the code or the install ID
  const label = new Map(), grp = (p, i) => { const k = p.grp || "solo" + i; if (!label.has(k)) label.set(k, "g" + label.size); return label.get(k) };
  const rows = [...per.values()].map((p, i) => ({group: grp(p, i), map: p.map, mapName: p.mapName, party: Math.round(median(p.party)), level: last(p.level), job: last(p.job),
    runs: p.exp.length, expHr: Math.round(median(p.exp)), mesosHr: Math.round(median(p.mesos)), killsHr: Math.round(median(p.kills)),
    deathsHr: p.deaths.length ? Math.round(median(p.deaths) * 10) / 10 : null}));
  for (const t of Object.values(mobs)){ t.players = t.players.size }
  const players = new Set(results.map(r => r.install)).size, hours = results.reduce((a, r) => a + r.minutes, 0) / 60;
  return {updated: new Date().toISOString(), runs: results.length, players, hours: Math.round(hours * 10) / 10, rows, mobs};
}

export default {
  async fetch(req, env){
    // whatever a request holds, the answer is JSON: a crash would show Cloudflare's error page and log nothing useful
    try { return await route(req, env) } catch (e) { console.error(e); return json({error: "server error"}, 500) }
  },
};
async function route(req, env){
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, {headers: CORS});
  if (url.pathname === "/api/runs" && req.method === "POST") return postRun(req, env);
  if (url.pathname === "/api/party" && req.method === "POST") return partyLive(req, env);
  if (url.pathname === "/api/summary" && req.method === "GET"){
    // worked out at most every 5 minutes and kept in the meta table (each request would otherwise read every run; the
    // Cache API does nothing on workers.dev)
    const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'summary'").first();
    let body = row?.v;
    if (!body || Date.now() - Date.parse(JSON.parse(body).updated) > 5 * 60e3){
      body = JSON.stringify(await summary(env.DB));
      if (body.length < 1.5e6) await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('summary', ?)").bind(body).run();   // D1 rows max out at 2 MB
    }
    return new Response(body, {headers: {"content-type": "application/json", "cache-control": "public, max-age=300", ...CORS}});
  }
  if (url.pathname === "/") return json({about: "MS Classic World Info shared grind data", summary: "/api/summary"});
  return json({error: "not found"}, 404);
}
