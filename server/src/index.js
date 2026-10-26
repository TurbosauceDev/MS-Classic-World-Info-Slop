/* Shared grind data for MS Classic World Info (Cloudflare Worker + D1).
   POST /api/runs     a 15-minute run from the grind tracker (sharing on)
   POST /api/kpq      a cleared KPQ round from the grind tracker (sharing on): the KPQ leaderboard
   POST /api/party    live party view: post your numbers, get your party's (same party code)
   GET  /api/summary  everything the site needs, anonymous: one row per player per map/party (their typical run),
                      plus drop counts per monster. The site's daily build bakes this into the page.
   POST /api/feedback a note from the site's Feedback page
   GET  /api/feedback Danny's inbox (Authorization: Bearer FEEDBACK_KEY, a Worker secret); POST /api/feedback/done marks or deletes */
import G from "./gamedata.json" with {type: "json"};
import {cleanRun, cleanKpq, median, KPQ_MIN} from "./check.js";

const CORS = {"access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, authorization"};
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
  const ins = await env.DB.prepare(`INSERT INTO runs (install, ipday, received, date, map, map_name, level, job, party, minutes, exp, msg_exp, bar_exp,
    kills, mesos, ok, why, mobs, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(body.install, ipday, now.toISOString(), r.date, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.msg_exp, r.bar_exp,
      r.kills, r.mesos, c.ok ? 1 : 0, c.why, JSON.stringify(r.mobs), JSON.stringify(r.items)).run();
  const runId = ins.meta.last_row_id;
  if (r.hour != null || r.deaths != null || r.used_cost != null)
    await env.DB.prepare("INSERT OR REPLACE INTO run_extra (run_id, deaths, hour, used_cost) VALUES (?, ?, ?, ?)").bind(runId, r.deaths, r.hour, r.used_cost).run();
  const code = typeof body.partyCode === "string" ? body.partyCode.trim().toLowerCase().slice(0, 20) : "";
  if (code && r.party > 1){   // a code only groups party runs: friends soloing the same map with one code are separate players
    await env.DB.prepare("INSERT OR REPLACE INTO run_groups (run_id, grp) VALUES (?, ?)").bind(runId, await sha("party:" + code + await salt(env.DB))).run();
  }
  return json({ok: true, counted: c.ok, why: c.why});
}

// KPQ rounds: a round takes minutes, so 12 an hour per tracker is plenty; per IP the same daily cap as runs
const KPQ_PER_HOUR = 12;
async function postKpq(req, env){
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  const c = cleanKpq(body);
  if (c.error) return json({error: c.error}, 400);
  const now = new Date(), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(ip + now.toISOString().slice(0, 10) + await salt(env.DB));
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM kpq_rounds WHERE install = ? AND received > ?").bind(body.install, new Date(now - 3600e3).toISOString()).first();
  const today = await env.DB.prepare("SELECT COUNT(*) n, COUNT(DISTINCT install) k, SUM(install = ?) mine FROM kpq_rounds WHERE ipday = ?").bind(body.install, ipday).first();
  if (recent.n >= KPQ_PER_HOUR || today.n >= MAX_PER_IP_DAY || today.k >= MAX_INSTALLS_PER_IP_DAY && !today.mine) return json({error: "too many rounds"}, 429);
  // the same round sent twice (a retry, or the site's Send pressed again): same install, same clear, in the last 30 min
  const dup = await env.DB.prepare("SELECT id FROM kpq_rounds WHERE install = ? AND clear = ? AND received > ?").bind(body.install, c.round.clear, new Date(now - 1800e3).toISOString()).first();
  if (dup) return json({ok: true, counted: false, why: "already sent"});
  const r = c.round, code = typeof body.partyCode === "string" ? body.partyCode.trim().toLowerCase().slice(0, 20) : "";
  const grp = code && r.party > 1 ? await sha("party:" + code + await salt(env.DB)) : null;
  const ins = await env.DB.prepare(`INSERT INTO kpq_rounds (install, ipday, received, date, hour, mode, party, level, job, clear, total, clock, exp, mesos, stages, grp, ok, why)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(body.install, ipday, now.toISOString(), r.date, r.hour, r.mode, r.party, r.level, r.job,
    r.clear, r.total, r.clock, r.exp, r.mesos, JSON.stringify(r.stages), grp, c.ok ? 1 : 0, c.why).run();
  if (r.name) await env.DB.prepare("INSERT OR REPLACE INTO kpq_names (kpq_id, name) VALUES (?, ?)").bind(ins.meta.last_row_id, r.name).run();
  if (r.src !== "tracker") await env.DB.prepare("INSERT OR REPLACE INTO kpq_src (kpq_id, src) VALUES (?, ?)").bind(ins.meta.last_row_id, r.src).run();
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
  const {results} = await db.prepare(`SELECT r.install, r.ipday, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.kills, r.mesos, r.mobs, g.grp, x.deaths, x.hour, x.used_cost
    FROM runs r LEFT JOIN run_groups g ON g.run_id = r.id LEFT JOIN run_extra x ON x.run_id = r.id WHERE r.ok = 1`).all();
  // one row per player per map and solo/party: their typical (median) run
  const per = new Map(), mobs = Object.create(null);   // no prototype: a stored id can never reach Object.prototype
  // one home network = one player: installs that ever sent runs from the same connection on the same day are joined, so
  // one person with fresh installs (or a whole household) can't make up the "3+ players" a map needs on their own
  const uf = new Map(), find = k => { let r = k; while (uf.has(r) && uf.get(r) !== r) r = uf.get(r); uf.set(k, r); return r },
    join = (a, b) => { const x = find(a), y = find(b); if (x !== y) uf.set(x, y) };
  const kq = (await db.prepare("SELECT k.install, k.ipday, k.date, k.mode, k.party, k.level, k.job, k.clear, k.total, k.clock, k.exp, k.mesos, k.stages, k.grp, k.hour, k.received, n.name, x.src FROM kpq_rounds k LEFT JOIN kpq_names n ON n.kpq_id = k.id LEFT JOIN kpq_src x ON x.kpq_id = k.id WHERE k.ok = 1 AND k.clear >= ? ORDER BY k.id").bind(KPQ_MIN).all()).results;
  for (const r of [...results, ...kq]) join("i" + r.install, "n" + r.ipday);
  const net = install => find("i" + install);
  // parties: a party code joined with its members' networks (a separate set, so soloing friends who partied once stay apart)
  const puf = new Map(), pfind = k => { let r = k; while (puf.has(r) && puf.get(r) !== r) r = puf.get(r); puf.set(k, r); return r };
  for (const r of [...results, ...kq]) if (r.grp && r.party > 1){ const x = pfind("p" + r.grp), y = pfind(net(r.install)); if (x !== y) puf.set(x, y) }
  const timed = [];   // runs with their start hour: [key, EXP/hr, UTC hour]
  for (const r of results){
    const k = [r.install, r.map ?? "?" + r.map_name, r.party > 1 ? 1 : 0].join("|"), h = r.minutes / 60;
    if (!per.has(k)) per.set(k, {map: r.map, mapName: r.map_name, party: [], level: [], job: [], exp: [], mesos: [], kills: [], deaths: [], used: [], grp: null});
    const p = per.get(k);
    p.grp = r.party > 1 ? pfind(r.grp ? "p" + r.grp : net(r.install)) : net(r.install);
    if (r.hour != null && r.map) timed.push([k, r.exp / h, r.hour]);
    p.party.push(r.party); p.level.push(r.level); p.job.push(r.job); p.exp.push(r.exp / h); p.mesos.push(r.mesos / h); p.kills.push(r.kills / h); if (r.deaths != null) p.deaths.push(r.deaths / h); if (r.used_cost != null) p.used.push(r.used_cost / h);
    for (const m of JSON.parse(r.mobs || "[]")){
      if (!/^\d{1,10}$/.test(m.id)) continue;   // runs stored before ids were checked
      const t = mobs[m.id] || (mobs[m.id] = {kills: 0, mesos: 0, mesoDrops: 0, items: Object.create(null), players: new Set()});
      t.kills += m.kills; t.mesos += m.mesos; t.mesoDrops += m.mesoDrops; t.players.add(net(r.install));
      for (const [id, n] of Object.entries(m.items || {})) if (/^\d{1,10}$/.test(id)) t.items[id] = (t.items[id] || 0) + (+n || 0);
    }
  }
  const last = a => a.filter(v => v != null).at(-1) ?? null;
  // group: the party or the player's home network; a short label, not the code, network or install ID
  const groupKey = p => (p.party.at(-1) > 1 ? "P" : "S") + p.grp;
  const label = new Map(), grp = p => { const k = groupKey(p); if (!label.has(k)) label.set(k, "g" + label.size); return label.get(k) };
  const rows = [...per.values()].map(p => ({group: grp(p), map: p.map, mapName: p.mapName, party: Math.round(median(p.party)), level: last(p.level), job: last(p.job),
    runs: p.exp.length, expHr: Math.round(median(p.exp)), mesosHr: Math.round(median(p.mesos)), killsHr: Math.round(median(p.kills)),
    deathsHr: p.deaths.length ? Math.round(median(p.deaths) * 10) / 10 : null, usedHr: p.used.length ? Math.round(median(p.used)) : null}));
  for (const t of Object.values(mobs)){ t.players = t.players.size }
  // best time to farm: each run against the same player's typical run on that map (so a time of day isn't "fast" just
  // because stronger players play then), by 3-hour UTC block; a block shows once 3+ players (networks/parties) ran it then
  const tb = Object.create(null);
  for (const [k, hr, hour] of timed){
    const p = per.get(k); if (p.exp.length < 3) continue;   // too few runs of their own to compare against
    const b = (tb[p.map] ||= Array.from({length: 8}, () => ({x: [], g: new Set()})))[hour / 3 | 0];
    b.x.push(hr / median(p.exp)); b.g.add(groupKey(p));
  }
  const times = Object.create(null);
  for (const [map, bl] of Object.entries(tb)){
    const out = bl.map((b, i) => b.g.size >= 3 ? [i * 3, Math.round(median(b.x) * 100) / 100, b.g.size] : null).filter(Boolean);
    if (out.length >= 2) times[map] = out;   // [UTC start hour, speed vs the players' usual, players]; one block alone compares nothing
  }
  // KPQ leaderboards (Danny, 2026-10-18), one line per party (party code) or player (home network):
  //  Rush: every round, fastest clear (1st stage to leaving the Last stage, so Bonus time never counts against it)
  //  Bonus: rounds that reached the Bonus stage, most EXP + mesos gained that round (1 meso = 1 point, our own weighting);
  //   Bonus stage seconds shown beside it. A faster Rush leaves more Bonus time, which already shows up as more EXP/mesos.
  // Every party member's tracker sends the same round, so a group's round count is its busiest tracker's, not the sum
  const BONUS = "80000500", kg = {Rush: new Map(), Bonus: new Map()};
  const score = r => (r.exp || 0) + (r.mesos || 0), bonusSec = r => { try { return JSON.parse(r.stages || "{}")[BONUS] || 0 } catch { return 0 } };
  for (const r of kq){
    const g = r.party > 1 && r.grp ? "P" + pfind("p" + r.grp) : "S" + net(r.install), bs = bonusSec(r);
    for (const mode of bs > 0 && r.exp != null ? ["Rush", "Bonus"] : ["Rush"]){   // site-timed rounds carry no EXP: Rush only
      const m = kg[mode]; if (!m.has(g)) m.set(g, {g, best: null, vals: [], per: new Map(), names: new Map()});
      const e = m.get(g), better = mode === "Rush" ? !e.best || r.clear < e.best.clear : !e.best || score(r) > score(e.best);
      e.vals.push(mode === "Rush" ? r.clear : score(r)); e.per.set(r.install, (e.per.get(r.install) || 0) + 1);
      if (r.name) e.names.set(r.install, r.name);   // each member's tracker sends its own name: the latest one per tracker
      if (better) e.best = {...r, bonus: bs};
    }
  }
  const klabel = new Map(), lab = g => { if (!klabel.has(g)) klabel.set(g, "k" + klabel.size); return klabel.get(g) };
  const kpq = {rounds: kq.length, groups: kg.Rush.size, board: {}};
  for (const mode of ["Rush", "Bonus"]){
    const list = [...kg[mode].values()].sort(mode === "Rush" ? (a, b) => a.best.clear - b.best.clear : (a, b) => score(b.best) - score(a.best)).slice(0, 50);
    if (list.length) kpq.board[mode] = list.map(e => { const b = e.best; return {group: lab(e.g), best: mode === "Rush" ? b.clear : score(b), median: Math.round(median(e.vals)),
      rounds: Math.max(...e.per.values()), names: [...new Set(e.names.values())].slice(0, 6), party: b.party, level: b.level, job: b.job, date: b.date, at: b.received, clock: !!b.clock,
      clear: b.clear, bonus: b.bonus, exp: b.exp, mesos: b.mesos} });
  }
  // every counted round for the site's filters (party size, job, period, timing), newest 3000. A party's trackers each send
  // the same round: one line per party round (same group, date and hour, clears within 5 s), names merged, the best EXP + mesos kept.
  // at = when the server received the round (first tracker to send it), so the site can list a day's runs in arrival order
  const KS = ["80000000", "80000100", "80000200", "80000300", "80000400", "80000500"], merged = [], open = new Map();
  for (const r of kq){
    const g = r.party > 1 && r.grp ? "P" + pfind("p" + r.grp) : "S" + net(r.install), key = [g, r.date, r.hour].join("|");
    let st; try { st = JSON.parse(r.stages || "{}") } catch { st = {} }
    const prev = (open.get(key) || []).find(e => Math.abs(e.c - r.clear) <= 5 && !e.ins.has(r.install));
    if (prev){ prev.ins.add(r.install); if (r.name && !prev.n.includes(r.name)) prev.n.push(r.name); if (score(r) > (prev.x || 0) + (prev.m || 0)){ prev.x = r.exp; prev.m = r.mesos } continue }
    const e = {g: lab(g), d: r.date, at: r.received, p: r.party, l: r.level, j: r.job, c: r.clear, t: r.total, k: r.clock ? 1 : 0, x: r.exp, m: r.mesos,
      s: KS.map(id => st[id] ?? null), n: r.name ? [r.name] : [], src: r.src || "tracker", ins: new Set([r.install])};
    merged.push(e); (open.get(key) || open.set(key, []).get(key)).push(e);
  }
  kpq.list = merged.slice(-3000).map(({ins, ...e}) => e);
  const players = new Set(results.map(r => r.install)).size, hours = results.reduce((a, r) => a + r.minutes, 0) / 60;
  return {updated: new Date().toISOString(), runs: results.length, players, hours: Math.round(hours * 10) / 10, rows, mobs, times, kpq};
}

export default {
  async fetch(req, env){
    // whatever a request holds, the answer is JSON: a crash would show Cloudflare's error page and log nothing useful
    try { return await route(req, env) } catch (e) { console.error(e); return json({error: "server error"}, 500) }
  },
};
// Feedback page: a note is 5-2000 characters; a filled hidden field (bots) is thanked and dropped. Per IP 5 an hour and 20 a
// day, and 300 a day from everyone, so a flood can't fill the database.
const FB_KINDS = ["Idea", "Bug", "Wrong number", "Other"], FB_PER_HOUR = 5, FB_PER_IP_DAY = 20, FB_PER_DAY = 300;
const fbText = (v, n) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, n) : "";
async function postFeedback(req, env){
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  if (!body || typeof body !== "object") return json({error: "bad json"}, 400);
  if (body.website) return json({ok: true});   // honeypot
  const msg = fbText(body.msg, 2000), kind = FB_KINDS.includes(body.kind) ? body.kind : "Other";
  if (msg.length < 5) return json({error: "too short"}, 400);
  const now = new Date(), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(ip + now.toISOString().slice(0, 10) + await salt(env.DB));
  const mine = await env.DB.prepare("SELECT COUNT(*) n, SUM(received > ?) hr FROM feedback WHERE ipday = ?").bind(new Date(now - 3600e3).toISOString(), ipday).first();
  const all = await env.DB.prepare("SELECT COUNT(*) n FROM feedback WHERE received > ?").bind(new Date(now - 86400e3).toISOString()).first();
  if ((mine.hr || 0) >= FB_PER_HOUR || mine.n >= FB_PER_IP_DAY || all.n >= FB_PER_DAY) return json({error: "too many"}, 429);
  await env.DB.prepare("INSERT INTO feedback (received, ipday, kind, msg, contact, page, ver) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(now.toISOString(), ipday, kind, msg, fbText(body.contact, 100) || null, fbText(body.page, 40) || null, fbText(body.ver, 20) || null).run();
  return json({ok: true});
}
// constant-time compare so the key can't be guessed a character at a time
const sameKey = (a, b) => { if (!b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 };
function fbAdmin(req, env){
  if (!env.FEEDBACK_KEY) return json({error: "no key set on the server"}, 503);
  return sameKey((req.headers.get("authorization") || "").replace(/^Bearer /, ""), env.FEEDBACK_KEY) ? null : json({error: "wrong key"}, 401);
}
async function getFeedback(req, env){
  const no = fbAdmin(req, env); if (no) return no;
  const {results} = await env.DB.prepare("SELECT id, received, kind, msg, contact, page, ver, done FROM feedback ORDER BY id DESC LIMIT 500").all();
  return json({notes: results});
}
async function doneFeedback(req, env){
  const no = fbAdmin(req, env); if (no) return no;
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return json({error: "bad id"}, 400);
  if (body.delete) await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
  else await env.DB.prepare("UPDATE feedback SET done = ? WHERE id = ?").bind(body.done ? 1 : 0, id).run();
  return json({ok: true});
}

// owner inbox for KPQ rounds: everything the server received, counted or not, newest first. The public summary only shows
// counted rounds, so "runs were done today, are they not logged?" (Danny, 2026-10-26) was unanswerable from outside — this
// answers it with each round's ok and why. Same key as the feedback inbox; read-only; no install or IP data, names only.
async function getKpqRecent(req, env){
  const no = fbAdmin(req, env); if (no) return no;
  const {results} = await env.DB.prepare("SELECT k.id, k.received, k.date, k.hour, k.mode, k.party, k.level, k.job, k.clear, k.total, k.clock, k.exp, k.mesos, k.ok, k.why, n.name FROM kpq_rounds k LEFT JOIN kpq_names n ON n.kpq_id = k.id ORDER BY k.id DESC LIMIT 100").all();
  return json({rounds: results});
}

async function route(req, env){
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, {headers: CORS});
  if (url.pathname === "/api/runs" && req.method === "POST") return postRun(req, env);
  if (url.pathname === "/api/kpq" && req.method === "POST") return postKpq(req, env);
  if (url.pathname === "/api/party" && req.method === "POST") return partyLive(req, env);
  if (url.pathname === "/api/feedback" && req.method === "POST") return postFeedback(req, env);
  if (url.pathname === "/api/feedback" && req.method === "GET") return getFeedback(req, env);
  if (url.pathname === "/api/kpq/recent" && req.method === "GET") return getKpqRecent(req, env);
  if (url.pathname === "/api/feedback/done" && req.method === "POST") return doneFeedback(req, env);
  if (url.pathname === "/api/summary" && req.method === "GET"){
    // worked out at most every 5 minutes and kept in the meta table (each request would otherwise read every run; the
    // Cache API does nothing on workers.dev)
    const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'summary'").first();
    let body = row?.v;
    if (!body || Date.now() - Date.parse(JSON.parse(body).updated) > 5 * 60e3){
      // one rebuild at a time: while another request is working it out (claimed in the last minute), the old copy is served
      const lock = await env.DB.prepare("SELECT v FROM meta WHERE k = 'summary_lock'").first();
      if (!body || !lock || Date.now() - Number(lock.v) > 60e3){
        await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('summary_lock', ?)").bind(String(Date.now())).run();
        const s = await summary(env.DB);
        body = JSON.stringify(s);
        // D1 rows max out at 2 MB: past 1.5 MB keep fewer KPQ rounds for the filters, so the copy can still be stored
        for (const n of [1000, 0]) if (body.length >= 1.5e6 && s.kpq.list.length > n){ s.kpq.list = n ? s.kpq.list.slice(-n) : []; body = JSON.stringify(s) }
        if (body.length < 1.5e6) await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('summary', ?)").bind(body).run();
      }
    }
    return new Response(body, {headers: {"content-type": "application/json", "cache-control": "public, max-age=300", ...CORS}});
  }
  if (url.pathname === "/") return json({about: "MS Classic World Info shared grind data", summary: "/api/summary"});
  return json({error: "not found"}, 404);
}
