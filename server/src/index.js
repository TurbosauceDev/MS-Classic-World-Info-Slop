/* Shared grind data for MS Classic World Info (Cloudflare Worker + D1).
   POST /api/runs     a 15-minute run from the grind tracker (sharing on)
   POST /api/shop     shop rows the tracker read off a merchant shop (item, qty, price, sold); GET /api/shop/summary = per-item medians, items seen by 3+ installs
   POST /api/kpq      a cleared KPQ round from the grind tracker (sharing on): the KPQ leaderboard
   POST /api/party    live party view: post your numbers, get your party's (same party code)
   GET  /api/summary  everything the site needs, anonymous: one row per player per map/party (their typical run),
                      plus drop counts per monster. The site's daily build bakes this into the page.
   POST /api/feedback a note from the site's Feedback page
   GET  /api/feedback Danny's inbox (Authorization: Bearer FEEDBACK_KEY, a Worker secret); POST /api/feedback/done marks or deletes
   GET  /api/runs/recent  Danny's inbox of shared runs (Bearer FEEDBACK_KEY): the last ?limit= runs received, counted or
                     not, each with ok and why — the runs-side twin of /api/kpq/recent
   GET  /admin       the owner panel in a browser: KPQ inbox (each round's ok + why), shared-runs inbox, feedback inbox,
                     public summary. The page itself carries no data; the key is asked once and kept in the browser
                     (localStorage fbkey) */
import G from "./gamedata.json" with {type: "json"};
import {cleanRun, cleanKpq, cleanShop, cleanSpot, median, KPQ_MIN, mapCeiling} from "./check.js";
import Kpq from "../../tracker/core/kpqscore.js";   // the same scoring the tracker previews with
import {ADMIN_HTML} from "./admin.js";

const CORS = {"access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, authorization"};
const json = (v, status = 200) => new Response(JSON.stringify(v), {status, headers: {"content-type": "application/json", ...CORS}});
// a run is 15 min, so 4/hour is the real most; the rest is slack. Per IP: a whole party can share one home network
// (6 players x 4 runs/hr x 12 hr = 288), so up to 6 tracker copies and 300 runs a day
const MAX_PER_HOUR = 6, MAX_PER_IP_DAY = 300, MAX_INSTALLS_PER_IP_DAY = 6;
// rows older than this leave the hot tables for the archive ones (schema.sql) during the summary rebuild: the rebuild
// then reads a bounded runs table instead of every run ever sent (Danny, 2026-10-26: "add an archive table"). 180 days
// of farmed runs is the window the site's medians and drop tables see; the KPQ boards read live + archive, so their
// all-time bests never age out (exported for the tests)
export const ARCHIVE_DAYS = 180;
// distinct mob ids the stored summary's drop table keeps (see summary() below). Honest data sits in the dozens:
// gamedata has 71 monsters, and check.js only lets counted runs carry mobs that live on their map
export const SUMMARY_MOB_CAP = 500;

async function sha(s){ return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32) }
// the pepper that makes the IP hashes one-way lives OUTSIDE the database, as the Worker secret IP_SALT (audit
// 2026-11-05, Danny approved): the old static salt sat in the same D1 the hashes live in, so anyone with a dump
// (or the decrypted nightly backup) could brute-force every hash back to an IP — 2^32 IPv4s is minutes on a laptop.
// Re-hashing stored rows on read is impossible by design: hashes made with an older salt stay valid for EQUALITY
// only (same secret in, same hash out). The caps are per-day buckets, so a secret roll simply gives every network
// a fresh day — no data is lost, the ledger ages out with its day anyway. Falls back to the salt row in D1's meta
// only while the secret is unset, loudly, so a deploy without the secret keeps working instead of breaking.
let SALT_CACHE;
async function salt(env){
  if (typeof env.IP_SALT === "string" && env.IP_SALT) return env.IP_SALT;
  if (SALT_CACHE) return SALT_CACHE;
  console.error("IP_SALT is not set: falling back to the salt row in the D1 meta table, which a database dump can read — set the Worker secret (`wrangler secret put IP_SALT`) and redeploy (schema.sql's ipday note has the details)");
  let row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'salt'").first();
  if (!row){ await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('salt', ?)").bind(crypto.randomUUID()).run(); row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'salt'").first() }
  SALT_CACHE = row.v;
  return SALT_CACHE;
}
// the per-network caps must bind a whole household, and an IPv6 home connection holds a /64 — 2^64 addresses.
// Hashing the full address let one person rotate addresses inside its /64 past every per-IP cap (audit
// 2026-11-05: 20 installs accepted from one /64 vs 6 for IPv4). IPv6 collapses to its /64 (first 4 hextets, ::
// expanded); IPv4 stays whole (/32). Exported for the tests.
export function netKey(ip){
  if (typeof ip !== "string" || !ip) return "";
  if (!ip.includes(":")) return ip;                        // IPv4 (or an opaque id): unchanged
  const s = ip.split("%")[0];                              // drop a zone id (fe80::1%eth0)
  const half = s.split("::");
  if (half.length > 2) return s;                           // malformed: left whole, the caps merely over-count
  const head = half[0] ? half[0].split(":") : [], tail = half.length > 1 && half[1] ? half[1].split(":") : [];
  const pad = Math.max(0, 8 - head.length - tail.length);
  return head.concat(Array(pad).fill("0"), tail).slice(0, 4).map(g => (g || "0").padStart(4, "0")).join(":");   // /64
}
// The abuse caps count live rows, so "Delete what I shared" used to hand the daily budget back (hit the cap, forget,
// refill, forever). ipday_ledger keeps each network-day's high-water marks — rows ever accepted and distinct trackers
// ever seen today — and the caps read max(live rows, ledger). Forget leaves the ledger alone on purpose: it is the
// network-day's tally, not the install's data (the same day-scoped salted hash the rows themselves carry), and it ages
// out with the day. The bump is a MAX() upsert, so two requests racing can only ever over-count, never under.
async function ledgerPeak(db, ipday){
  return await db.prepare("SELECT posts, installs FROM ipday_ledger WHERE ipday = ?").bind(ipday).first() || {posts: 0, installs: 0};
}
async function ledgerBump(db, ipday, day, posts, installs){
  await db.prepare(`INSERT INTO ipday_ledger (ipday, day, posts, installs, updated) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(ipday) DO UPDATE SET posts = MAX(posts, excluded.posts), installs = MAX(installs, excluded.installs), updated = excluded.updated`)
    .bind(ipday, day, posts, installs, new Date().toISOString()).run();
}

async function postRun(req, env){
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  const c = cleanRun(body, G);
  if (c.error) return json({error: c.error}, 400);
  const now = new Date(), day = now.toISOString().slice(0, 10), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(netKey(ip) + day + await salt(env));
  // the same run sent twice (the tracker retries when the ack is lost on the wire): same install, same map and numbers.
  // The retry rides the 10-min flush, so a 12-min window catches it; a real next run is always 14.5+ min later (the
  // minutes floor), so the window can never swallow one. IS, not =: an unknown map's NULL must compare NULL-safe.
  const dup = await env.DB.prepare("SELECT id FROM runs WHERE install = ? AND minutes = ? AND exp = ? AND kills = ? AND mesos = ? AND map IS ? AND map_name IS ? AND received > ?")
    .bind(body.install, c.run.minutes, c.run.exp, c.run.kills, c.run.mesos, c.run.map, c.run.map_name, new Date(now - 12 * 60e3).toISOString()).first();
  if (dup) return json({ok: true, counted: false, why: "already sent"});
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM runs WHERE install = ? AND received > ?").bind(body.install, new Date(now - 3600e3).toISOString()).first();
  const today = await env.DB.prepare("SELECT COUNT(*) n FROM runs WHERE ipday = ?").bind(ipday).first();
  // one vote per player: a new install ID from an IP that already sent 6 others today is refused (ID rotation)
  const ids = await env.DB.prepare("SELECT COUNT(DISTINCT install) n, SUM(install = ?) mine FROM runs WHERE ipday = ?").bind(body.install, ipday).first();
  const peak = await ledgerPeak(env.DB, ipday);
  if (recent.n >= MAX_PER_HOUR || Math.max(today.n, peak.posts) >= MAX_PER_IP_DAY || Math.max(ids.n, peak.installs) >= MAX_INSTALLS_PER_IP_DAY && !ids.mine) return json({error: "too many runs"}, 429);
  const r = c.run;
  const ins = await env.DB.prepare(`INSERT INTO runs (install, ipday, received, date, map, map_name, level, job, party, minutes, exp, msg_exp, bar_exp,
    kills, mesos, ok, why, mobs, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(body.install, ipday, now.toISOString(), r.date, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.msg_exp, r.bar_exp,
      r.kills, r.mesos, c.ok ? 1 : 0, c.why, JSON.stringify(r.mobs), JSON.stringify(r.items)).run();
  const runId = ins.meta.last_row_id;
  if (r.hour != null || r.deaths != null || r.used_cost != null)
    await env.DB.prepare("INSERT OR REPLACE INTO run_extra (run_id, deaths, hour, used_cost) VALUES (?, ?, ?, ?)").bind(runId, r.deaths, r.hour, r.used_cost).run();
  if (r.name) await env.DB.prepare("INSERT OR REPLACE INTO run_names (run_id, name) VALUES (?, ?)").bind(runId, r.name).run();   // the weekly ladder's display name (P1-5), opt-in
  const code = typeof body.partyCode === "string" ? body.partyCode.trim().toLowerCase().slice(0, 20) : "";
  if (code && r.party > 1){   // a code only groups party runs: friends soloing the same map with one code are separate players
    await env.DB.prepare("INSERT OR REPLACE INTO run_groups (run_id, grp) VALUES (?, ?)").bind(runId, await sha("party:" + code + await salt(env))).run();
  }
  await ledgerBump(env.DB, ipday, day, Math.max(today.n, peak.posts) + 1, Math.max(ids.n + (ids.mine ? 0 : 1), peak.installs));
  return json({ok: true, counted: c.ok, why: c.why});
}

// KPQ rounds: a round takes minutes, so 12 an hour per tracker is plenty; per IP the same daily cap as runs
const KPQ_PER_HOUR = 12;
// KPQ scored boards (2026-10-29): Rush, Bonus, best full run, "what could have been" (a group's best Rush + best Bonus, which
// can be different rounds) and an MMR-style average. Scores come from core/kpqscore.js over the raw numbers, never from the client.
// One line per party/player like the older boards; a party's trackers send the same round, so those pair into one round whose
// best-scoring member counts. Rounds sent before 0.3.20 have stage times only: they score Rush (no loot), never Bonus.
const MMR_MIN_ROUNDS = 3;   // our own floor: an average of 1-2 rounds is a fluke, not a rating
function kpqScores(kq, pfind, net, lab){
  const pj = t => { try { return JSON.parse(t || "{}") } catch { return {} } };
  const rounds = [], open = new Map();
  for (const r of kq){
    const g = r.party > 1 && r.grp ? "P" + pfind("p" + r.grp) : "S" + net(r.install), key = [g, r.date, r.hour].join("|");
    const prev = (open.get(key) || []).find(e => Math.abs(e.rows[0].clear - r.clear) <= 5 && !e.rows.some(x => x.install === r.install));
    if (prev){ prev.rows.push(r); continue }
    const e = {g, rows: [r]}; rounds.push(e); (open.get(key) || open.set(key, []).get(key)).push(e);
  }
  const rawOf = r => r.raw ? pj(r.raw) : {stages: pj(r.stages), rush: {loot: Kpq.emptyLoot()}, bonus: null};
  const ref = Kpq.buildRef(rounds.map(e => { const raws = e.rows.map(rawOf); return {stages: raws[0].stages, bonus: raws.map(x => x.bonus).filter(Boolean).sort((a, b) => ((b.exp || 0) + (b.mesos || 0)) - ((a.exp || 0) + (a.mesos || 0)))[0] || null} }));
  for (const e of rounds){
    let best = null;
    for (const r of e.rows){ const raw = rawOf(r), sc = Kpq.score(raw, ref); if (!best || sc.total > best.sc.total) best = {sc, raw, r} }
    const r = e.rows[0], names = [...new Set(e.rows.map(x => x.name).filter(Boolean))].slice(0, 6);
    Object.assign(e, best, {names, rush: best.sc.rush, bonusSc: best.sc.bonus, row: {party: r.party, level: best.r.level, job: best.r.job, date: r.date, at: r.received, clear: r.clear}});
  }
  const groups = new Map();
  for (const e of rounds){ if (!groups.has(e.g)) groups.set(e.g, []); groups.get(e.g).push(e) }
  const line = (g, e, pts, extra) => ({group: lab(g), pts: Math.round(pts), names: e.names, ...e.row, rounds: groups.get(g).length, provisional: e.sc.provisional, ...extra});
  const top = a => a.sort((x, y) => y.pts - x.pts).slice(0, 50);
  const out = {ref: {...ref, minRounds: Kpq.REF_MIN}, rush: [], bonus: [], total: [], could: [], mmr: []};
  for (const [g, list] of groups){
    const pick = f => list.filter(e => f(e) != null).sort((a, b) => f(b) - f(a))[0];
    const br = pick(e => e.rush.pts), bb = pick(e => e.bonusSc?.pts), bt = pick(e => e.sc.total);
    out.rush.push(line(g, br, br.rush.pts, {clear: br.row.clear, speed: br.rush.speed, perfect: br.rush.perfect > 0}));
    if (bb) out.bonus.push(line(g, bb, bb.bonusSc.pts, {exp: bb.raw.bonus.exp, mesos: bb.raw.bonus.mesos, npc: bb.raw.bonus.loot.npc, sec: bb.raw.bonus.sec}));
    out.total.push(line(g, bt, bt.sc.total, {rush: bt.rush.pts, bonus: bt.bonusSc?.pts ?? null}));
    if (bb) out.could.push(line(g, br, br.rush.pts + bb.bonusSc.pts, {rush: br.rush.pts, bonus: bb.bonusSc.pts, sameRound: br === bb}));
    if (list.length >= MMR_MIN_ROUNDS) out.mmr.push(line(g, bt, list.reduce((a, e) => a + e.sc.total, 0) / list.length, {best: bt.sc.total}));
  }
  for (const k of ["rush", "bonus", "total", "could", "mmr"]) out[k] = top(out[k]);
  return out;
}

async function postKpq(req, env){
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  const c = cleanKpq(body);
  if (c.error) return json({error: c.error}, 400);
  const now = new Date(), day = now.toISOString().slice(0, 10), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(netKey(ip) + day + await salt(env));
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM kpq_rounds WHERE install = ? AND received > ?").bind(body.install, new Date(now - 3600e3).toISOString()).first();
  const today = await env.DB.prepare("SELECT COUNT(*) n, COUNT(DISTINCT install) k, SUM(install = ?) mine FROM kpq_rounds WHERE ipday = ?").bind(body.install, ipday).first();
  const peak = await ledgerPeak(env.DB, ipday);
  if (recent.n >= KPQ_PER_HOUR || Math.max(today.n, peak.posts) >= MAX_PER_IP_DAY || Math.max(today.k, peak.installs) >= MAX_INSTALLS_PER_IP_DAY && !today.mine) return json({error: "too many rounds"}, 429);
  // the same round sent twice (a retry, or the site's Send pressed again): same install, same clear, in the last 30 min
  const dup = await env.DB.prepare("SELECT id FROM kpq_rounds WHERE install = ? AND clear = ? AND received > ?").bind(body.install, c.round.clear, new Date(now - 1800e3).toISOString()).first();
  if (dup) return json({ok: true, counted: false, why: "already sent"});
  const r = c.round, code = typeof body.partyCode === "string" ? body.partyCode.trim().toLowerCase().slice(0, 20) : "";
  const grp = code && r.party > 1 ? await sha("party:" + code + await salt(env)) : null;
  const ins = await env.DB.prepare(`INSERT INTO kpq_rounds (install, ipday, received, date, hour, mode, party, level, job, clear, total, clock, exp, mesos, stages, grp, ok, why)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(body.install, ipday, now.toISOString(), r.date, r.hour, r.mode, r.party, r.level, r.job,
    r.clear, r.total, r.clock, r.exp, r.mesos, JSON.stringify(r.stages), grp, c.ok ? 1 : 0, c.why).run();
  if (r.name) await env.DB.prepare("INSERT OR REPLACE INTO kpq_names (kpq_id, name) VALUES (?, ?)").bind(ins.meta.last_row_id, r.name).run();
  if (r.raw) await env.DB.prepare("INSERT OR REPLACE INTO kpq_raw (kpq_id, raw) VALUES (?, ?)").bind(ins.meta.last_row_id, JSON.stringify(r.raw)).run();
  if (r.src !== "tracker") await env.DB.prepare("INSERT OR REPLACE INTO kpq_src (kpq_id, src) VALUES (?, ?)").bind(ins.meta.last_row_id, r.src).run();
  await ledgerBump(env.DB, ipday, day, Math.max(today.n, peak.posts) + 1, Math.max(today.k + (today.mine ? 0 : 1), peak.installs));
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
  const grp = await sha("party:" + code + await salt(env)), now = Date.now();
  // job/mapName reach OTHER members' clients, so they get the nick scrub too (round 2): raw strings rode to every
  // party member's UI while only nick was filtered
  const scrub = (v, n) => typeof v === "string" ? v.replace(/[^\p{L}\p{N} _.'-]/gu, "").trim().slice(0, n) || null : null;
  const me = {nick: typeof b.nick === "string" ? b.nick.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12) : "", job: scrub(b.job, 40),
    level: num(b.level, 200), mapName: scrub(b.mapName, 60), expHr: num(b.expHr, 1e8), expHr5: num(b.expHr5, 1e8),
    killsHr: num(b.killsHr, 1e5), mesosHr: num(b.mesosHr, 1e8), active: num(b.active, 1e7)};
  // the throttle follows the install, not (grp, install): rotating the party code would otherwise reset it on every post
  const old = await env.DB.prepare("SELECT updated FROM party_live WHERE install = ? ORDER BY updated DESC LIMIT 1").bind(b.install).first();
  if (old && now - Date.parse(old.updated) < PARTY_EVERY) return json({error: "too often"}, 429);
  // one machine can't fill the table: at most 6 tracker copies per network. Forget deletes this install's row, so the
  // cap reads the same ipday_ledger high-water mark as every other route (round 2: forget used to hand the party slot
  // back, and the schema comment claimed forget couldn't touch this table — it can).
  const rawIp = req.headers.get("cf-connecting-ip") || "";
  const ip = await sha("ip:" + netKey(rawIp) + await salt(env));
  const day = new Date(now).toISOString().slice(0, 10), ipday = await sha(netKey(rawIp) + day + await salt(env));
  const peak = await ledgerPeak(env.DB, ipday);
  let inst = peak.installs;
  if (!old){
    const k = await env.DB.prepare("SELECT COUNT(DISTINCT install) n, SUM(install = ?) mine FROM party_live WHERE ip = ?").bind(b.install, ip).first();
    if ((k.n >= PARTY_MAX || peak.installs >= PARTY_MAX) && !k.mine) return json({error: "too many trackers"}, 429);
    inst = Math.max(k.n + (k.mine ? 0 : 1), peak.installs);
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM party_live WHERE grp = ? AND updated > ?").bind(grp, new Date(now - PARTY_FRESH).toISOString()).first();
    if (n.n >= PARTY_MAX) return json({error: "party full"}, 429);
  }
  await env.DB.prepare("DELETE FROM party_live WHERE updated < ?").bind(new Date(now - 3600e3).toISOString()).run();
  await env.DB.prepare("INSERT OR REPLACE INTO party_live (grp, install, updated, ip, data) VALUES (?, ?, ?, ?, ?)").bind(grp, b.install, new Date(now).toISOString(), ip, JSON.stringify(me)).run();
  await ledgerBump(env.DB, ipday, day, 0, inst);   // posts 0: the ledger's MAX() keeps the stored rows mark; only installs move here
  const {results} = await env.DB.prepare("SELECT install, updated, data FROM party_live WHERE grp = ? AND updated > ? ORDER BY install")
    .bind(grp, new Date(now - PARTY_FRESH).toISOString()).all();
  const members = results.map(r => ({...JSON.parse(r.data), you: r.install === b.install, ago: Math.round((now - Date.parse(r.updated)) / 1000)}));
  return json({members, expHr: members.reduce((a, m) => a + (m.expHr || 0), 0)});
}

// move rows past the window into the archive tables. The copy skips rows the archive already holds (keyed on the
// (id, received) pair — see below), and the delete removes only rows whose pair is in the archive: a crash between
// the copy and the delete can't double-move a row, the next rebuild just retries the delete. Called inside the
// summary rebuild, which the summary lock already makes one-at-a-time; runs at most every 5 minutes, so the indexed
// received scan touches only the handful of rows at the window's edge. Returns the archive totals for the panel
async function archiveOld(db){
  const cut = new Date(Date.now() - ARCHIVE_DAYS * 86400e3).toISOString();
  // copy only rows whose (id, received) the archive doesn't hold, then delete exactly the rows that are now in the
  // archive. Rowids restart at 1 when a table is emptied, so a bare INSERT OR IGNORE + unconditional DELETE could
  // lose a run outright if the hot table ever emptied while the archive kept rows (round 3): the id would collide,
  // OR IGNORE would skip the copy, and the delete would still fire. Keying both sides on (id, received) keeps the
  // crash safety too — a crash between copy and delete leaves the row in both tables, and the next rebuild's delete
  // (EXISTS on the same pair) removes it without re-copying
  await db.prepare(`INSERT OR IGNORE INTO runs_archive (id, install, ipday, received, date, map, map_name, level, job, party, minutes, exp, msg_exp, bar_exp, kills, mesos, ok, why, mobs, items, archived)
    SELECT id, install, ipday, received, date, map, map_name, level, job, party, minutes, exp, msg_exp, bar_exp, kills, mesos, ok, why, mobs, items, ? FROM runs WHERE received < ?
    AND NOT EXISTS (SELECT 1 FROM runs_archive a WHERE a.id = runs.id AND a.received = runs.received)`).bind(cut, cut).run();
  await db.prepare("DELETE FROM runs WHERE received < ? AND EXISTS (SELECT 1 FROM runs_archive a WHERE a.id = runs.id AND a.received = runs.received)").bind(cut).run();
  // the archive tables keep no extras/party-code/name columns: their rows would point at run ids the hot table no
  // longer has, forever (the KPQ side tables stay — the archive rounds keep their ids and are read with them)
  await db.prepare("DELETE FROM run_extra WHERE run_id NOT IN (SELECT id FROM runs)").run();
  await db.prepare("DELETE FROM run_groups WHERE run_id NOT IN (SELECT id FROM runs)").run();
  await db.prepare("DELETE FROM run_names WHERE run_id NOT IN (SELECT id FROM runs)").run();
  // the abuse ledger ages out with its day: keep today and yesterday, drop anything older (the caps are per UTC day,
  // so yesterday's tally can never bind again — 36 h back covers the whole of yesterday whichever side of midnight)
  await db.prepare("DELETE FROM ipday_ledger WHERE day < ?").bind(new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10)).run();
  await db.prepare(`INSERT OR IGNORE INTO kpq_rounds_archive (id, install, ipday, received, date, hour, mode, party, level, job, clear, total, clock, exp, mesos, stages, grp, ok, why, archived)
    SELECT id, install, ipday, received, date, hour, mode, party, level, job, clear, total, clock, exp, mesos, stages, grp, ok, why, ? FROM kpq_rounds WHERE received < ?
    AND NOT EXISTS (SELECT 1 FROM kpq_rounds_archive a WHERE a.id = kpq_rounds.id AND a.received = kpq_rounds.received)`).bind(cut, cut).run();
  await db.prepare("DELETE FROM kpq_rounds WHERE received < ? AND EXISTS (SELECT 1 FROM kpq_rounds_archive a WHERE a.id = kpq_rounds.id AND a.received = kpq_rounds.received)").bind(cut).run();
  const r = await db.prepare("SELECT COUNT(*) n FROM runs_archive").first();
  const k = await db.prepare("SELECT COUNT(*) n FROM kpq_rounds_archive").first();
  return {runs: r.n, rounds: k.n};
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
  const kqFrom = t => `SELECT ${t}.install, ${t}.ipday, ${t}.date, ${t}.mode, ${t}.party, ${t}.level, ${t}.job, ${t}.clear, ${t}.total, ${t}.clock, ${t}.exp, ${t}.mesos, ${t}.stages, ${t}.grp, ${t}.hour, ${t}.received, n.name, x.src, w.raw, ${t}.id AS id
    FROM ${t} LEFT JOIN kpq_names n ON n.kpq_id = ${t}.id LEFT JOIN kpq_src x ON x.kpq_id = ${t}.id LEFT JOIN kpq_raw w ON w.kpq_id = ${t}.id WHERE ${t}.ok = 1 AND ${t}.clear >= ?`;
  // live + archive: an all-time board never loses a record to the archive move (the archive tables keep the same ids, so
  // the union comes back in send order and the merge below still pairs a party's trackers)
  const kq = (await db.prepare(`${kqFrom("kpq_rounds")} UNION ALL ${kqFrom("kpq_rounds_archive")} ORDER BY id`).bind(KPQ_MIN, KPQ_MIN).all()).results;
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
    // a stored row's mobs is JSON we wrote, but a half-written or hand-edited row must not take the public summary down
    // for as long as the row lives (round 3 — every other stored-JSON parse here is guarded, this one wasn't)
    let rmobs; try { rmobs = JSON.parse(r.mobs || "[]") } catch { rmobs = [] }
    for (const m of Array.isArray(rmobs) ? rmobs : []){
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
  // hard ceiling on the aggregate: the validation caps (check.js) bound what comes in, but the stored copy must stay
  // far under D1's 2 MB row limit whatever the data looks like — past the cap the extra mob entries are dropped with
  // a log line (audit 2026-11-05: 40 junk runs once made a 623 KB summary; the caps keep honest data near zero)
  const mobIds = Object.keys(mobs);
  if (mobIds.length > SUMMARY_MOB_CAP){
    console.error(`summary: ${mobIds.length} distinct mob ids over the ${SUMMARY_MOB_CAP} cap — dropping the extras from the stored copy`);
    for (const id of mobIds.slice(SUMMARY_MOB_CAP)) delete mobs[id];
  }
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
  kpq.scores = kpqScores(kq, pfind, net, lab);
  kpq.ref = kpq.scores.ref; kpq.weights = Kpq.WEIGHTS;
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
  const now = new Date(), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(netKey(ip) + now.toISOString().slice(0, 10) + await salt(env));
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
// Backs the owner panel at GET /admin, which asks for the key once and lists these in a browser (no curl needed)
async function getKpqRecent(req, env){
  const no = fbAdmin(req, env); if (no) return no;
  // Math.trunc: a fractional limit ("?limit=2.5") reached SQLite's LIMIT as a REAL and 500'd (round 3)
  const n = Math.min(500, Math.max(1, Math.trunc(Number(new URL(req.url).searchParams.get("limit"))) || 100));
  const {results} = await env.DB.prepare(`SELECT k.id, k.received, k.date, k.hour, k.mode, k.party, k.level, k.job, k.clear, k.total, k.clock, k.exp, k.mesos, k.ok, k.why, k.stages, n.name, x.src
    FROM kpq_rounds k LEFT JOIN kpq_names n ON n.kpq_id = k.id LEFT JOIN kpq_src x ON x.kpq_id = k.id ORDER BY k.id DESC LIMIT ?`).bind(n).all();
  const all = await env.DB.prepare("SELECT COUNT(*) n FROM kpq_rounds").first();
  return json({total: all.n, rounds: results.map(r => ({...r, src: r.src || "tracker"}))});
}

// owner inbox for shared runs: the runs-side twin of getKpqRecent (Danny, 2026-10-26: "lets also get it to show all
// shared runs as well, not just the KPQ runs"). Everything the server received, counted or not, newest first, each with
// ok and why. Same key as the feedback inbox; read-only; no install or IP data. The per-run mobs/items JSON is reduced
// to counts here so the inbox stays light — the public summary is what turns the counted ones into the site's tables.
async function getRunsRecent(req, env){
  const no = fbAdmin(req, env); if (no) return no;
  const n = Math.min(500, Math.max(1, Math.trunc(Number(new URL(req.url).searchParams.get("limit"))) || 100));
  const {results} = await env.DB.prepare(`SELECT r.id, r.received, r.date, r.map, r.map_name, r.level, r.job, r.party, r.minutes, r.exp, r.kills, r.mesos, r.ok, r.why, r.mobs, x.deaths, x.hour, x.used_cost
    FROM runs r LEFT JOIN run_extra x ON x.run_id = r.id ORDER BY r.id DESC LIMIT ?`).bind(n).all();
  const all = await env.DB.prepare("SELECT COUNT(*) n FROM runs").first();
  return json({total: all.n, runs: results.map(r => {
    let mobs = []; try { mobs = JSON.parse(r.mobs || "[]") || [] } catch {}
    const sum = a => a.reduce((b, v) => b + (+v || 0), 0);
    return {...r, mobs: {kinds: mobs.length, kills: sum(mobs.map(m => m.kills)), mesos: sum(mobs.map(m => m.mesos)),
      drops: sum(mobs.map(m => m.mesoDrops)), items: sum(mobs.map(m => Object.values(m.items || {})))}};
  })});
}


// Shop prices (tracker renderer-shop.js, Danny 2026-10-31): rows read off merchant shops. Same limits idea as runs: rows per
// install per hour, rows per IP per day, installs per IP per day (one home network = one player).
// "Delete what I shared" (tracker Settings, blind-spot report A2): removes everything one install ever sent. The install ID is a random
// secret only that tracker copy knows, so knowing it is the proof; nothing else is needed and nothing is returned but counts.
async function postForget(req, env){
  let b; try { b = await req.json() } catch { return json({error: "bad json"}, 400) }
  if (!b || typeof b.install !== "string" || !/^[a-z0-9-]{16,40}$/i.test(b.install)) return json({error: "install id"}, 400);
  const db = env.DB, i = b.install, n = {};
  const one = async (k, sql) => { n[k] = (await db.prepare(sql).bind(i).run()).meta?.changes ?? 0 };
  // the archive keeps no extras/groups/names columns: a run that already moved there leaves its side rows behind, so the
  // forget reads both tables (the runs themselves go further down, while the subqueries can still see them)
  await one("extra", "DELETE FROM run_extra WHERE run_id IN (SELECT id FROM runs WHERE install = ?1 UNION SELECT id FROM runs_archive WHERE install = ?1)");
  await one("groups", "DELETE FROM run_groups WHERE run_id IN (SELECT id FROM runs WHERE install = ?1 UNION SELECT id FROM runs_archive WHERE install = ?1)");
  await one("run_names", "DELETE FROM run_names WHERE run_id IN (SELECT id FROM runs WHERE install = ?1 UNION SELECT id FROM runs_archive WHERE install = ?1)");   // the ladder's names go with the runs
  for (const t of ["names", "src", "raw"]) await one("kpq_" + t, `DELETE FROM kpq_${t} WHERE kpq_id IN (SELECT id FROM kpq_rounds WHERE install = ?1 UNION SELECT id FROM kpq_rounds_archive WHERE install = ?1)`);
  // the 2026-10-30 reset's backup tables hold whole rounds (and the names/src/raw that hang off them) from before
  // the reset: a forget reaches in there too (round 2 — children first, the rounds they point into after)
  for (const t of ["names", "src", "raw"]) await one("kpq_bak_" + t, `DELETE FROM kpq_bak_20261030_${t} WHERE kpq_id IN (SELECT id FROM kpq_bak_20261030_rounds WHERE install = ?1 UNION SELECT id FROM kpq_bak_20261030_archive WHERE install = ?1)`);
  await one("kpq_bak_rounds", "DELETE FROM kpq_bak_20261030_rounds WHERE install = ?"); await one("kpq_bak_archive", "DELETE FROM kpq_bak_20261030_archive WHERE install = ?");
  await one("runs", "DELETE FROM runs WHERE install = ?"); await one("runs_archive", "DELETE FROM runs_archive WHERE install = ?");
  await one("kpq", "DELETE FROM kpq_rounds WHERE install = ?"); await one("kpq_archive", "DELETE FROM kpq_rounds_archive WHERE install = ?");
  // shop_ext first: its rows are found through shop_obs, so deleting the observations first would orphan the seller
  // name/title/ch/room forever (bug-hunt 2026-11-02 — "Delete what I shared" has to mean everything)
  await one("party", "DELETE FROM party_live WHERE install = ?"); await one("shop_ext", "DELETE FROM shop_obs_ext WHERE obs_id IN (SELECT id FROM shop_obs WHERE install = ?1)"); await one("shop", "DELETE FROM shop_obs WHERE install = ?");
  await one("spots", "DELETE FROM boss_spots WHERE install = ?");
  const removed = n.runs + n.runs_archive + n.kpq + n.kpq_archive + n.kpq_bak_rounds + n.kpq_bak_archive
    + n.kpq_names + n.kpq_src + n.kpq_raw + n.kpq_bak_names + n.kpq_bak_src + n.kpq_bak_raw
    + n.shop + n.shop_ext + n.spots + n.party + n.run_names;
  // only a KNOWN install busts the caches (audit 2026-11-05: a made-up ID deleted the cached summary without
  // removing anything, and the cache-less rebuild path then ran with no lock — a cheap unauthenticated way to
  // force full table scans). Nothing to remove: the caches stay, the rebuild keeps serving its copy.
  if (removed > 0) await db.prepare("DELETE FROM meta WHERE k IN ('summary', 'shop_summary', 'ladder')").run();   // the cached public numbers rebuild without it
  else console.log("forget: unknown install, nothing removed, caches left alone");
  return json({ok: true, removed});
}
const SHOP_PER_HOUR = 240, SHOP_PER_IP_DAY = 1500, SHOP_KEEP_DAYS = 14, SHOP_MIN_INSTALLS = 3;
async function postShop(req, env){
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  const c = cleanShop(body, G);
  if (c.error) return json({error: c.error}, 400);
  const now = new Date(), day = now.toISOString().slice(0, 10), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(netKey(ip) + day + await salt(env));
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM shop_obs WHERE install = ? AND received > ?").bind(body.install, new Date(now - 3600e3).toISOString()).first();
  const today = await env.DB.prepare("SELECT COUNT(*) n, COUNT(DISTINCT install) k, SUM(install = ?) mine FROM shop_obs WHERE ipday = ?").bind(body.install, ipday).first();
  const peak = await ledgerPeak(env.DB, ipday);
  if (recent.n + c.rows.length > SHOP_PER_HOUR || Math.max(today.n, peak.posts) + c.rows.length > SHOP_PER_IP_DAY || Math.max(today.k, peak.installs) >= MAX_INSTALLS_PER_IP_DAY && !today.mine) return json({error: "too many rows"}, 429);
  const t = now.toISOString();
  const ids = (await env.DB.batch(c.rows.map(r => env.DB.prepare("INSERT INTO shop_obs (install, ipday, received, item, qty, price, sold) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(body.install, ipday, t, r.id, r.qty, r.price, r.sold)))).map(x => x.meta?.last_row_id);
  // 0.3.30: the upload names the shop (Turbozo): one ext row per obs row, same values for the whole read
  if (c.seller || c.title || c.ch != null || c.room != null || c.map != null)
    await env.DB.batch(ids.filter(Boolean).map(id => env.DB.prepare("INSERT INTO shop_obs_ext (obs_id, seller, title, ch, room, map) VALUES (?, ?, ?, ?, ?, ?)").bind(id, c.seller, c.title, c.ch, c.room, c.map)));
  await ledgerBump(env.DB, ipday, day, Math.max(today.n, peak.posts) + c.rows.length, Math.max(today.k + (today.mine ? 0 : 1), peak.installs));
  return json({ok: true, stored: c.rows.length});
}
// per item over the last 7 days: median price each of open asks and of sold rows, with how many rows and how many different
// installs. An item shows only once SHOP_MIN_INSTALLS installs have seen it (one tracker alone can't set a price).
async function shopSummary(db){
  await db.prepare("DELETE FROM shop_obs WHERE received < ?").bind(new Date(Date.now() - SHOP_KEEP_DAYS * 864e5).toISOString()).run();
  // the observations age out after 14 days, so their ext rows (seller IGN/title/ch/room) must go with them: an orphaned
  // ext row kept a seller identity past the rows' stated life and grew the table forever (round 3)
  await db.prepare("DELETE FROM shop_obs_ext WHERE obs_id NOT IN (SELECT id FROM shop_obs)").run();
  const {results} = await db.prepare("SELECT item, install, qty, price, sold FROM shop_obs WHERE received > ? ORDER BY id DESC LIMIT 60000").bind(new Date(Date.now() - 7 * 864e5).toISOString()).all();
  // one vote per install: each install's own median first, then the median of those. A single install posting 240 rows an
  // hour at 1 meso can't drag the price just because it has the most rows (2026-10-31 blind-spot report B2).
  const by = {};
  for (const r of results){
    const o = by[r.item] || (by[r.item] = {installs: new Set(), ask: {}, sold: {}}), side = r.sold ? o.sold : o.ask;
    o.installs.add(r.install); (side[r.install] || (side[r.install] = [])).push(r.price / r.qty);
  }
  const vote = side => { const v = Object.values(side); return v.length ? [Math.round(median(v.map(median))), v.reduce((n, x) => n + x.length, 0)] : null };
  const items = {};
  for (const [id, o] of Object.entries(by)){
    if (o.installs.size < SHOP_MIN_INSTALLS) continue;
    items[id] = {installs: o.installs.size, ask: vote(o.ask), sold: vote(o.sold)};
  }
  return {updated: new Date().toISOString(), days: 7, minInstalls: SHOP_MIN_INSTALLS, fields: "ask/sold: [median price each, rows]", items};
}
async function getShopSummary(env){
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'shop_summary'").first();
  let body = row?.v;
  try { if (!body || Date.now() - Date.parse(JSON.parse(body).updated) > 10 * 60e3) body = null } catch { body = null }
  if (!body){ body = JSON.stringify(await shopSummary(env.DB)); await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('shop_summary', ?)").bind(body).run() }
  return new Response(body, {headers: {"content-type": "application/json", "cache-control": "public, max-age=600", ...CORS}});
}

// Shared boss spots (0.3.30, Turbozo: the boss tracker becomes a network). POST = one timed-kill report (the Share
// switch governs; the same boss from one install within 30 min is a no-op), GET ?map= = witnesses per boss + channel
// over the last 24 h: t = the freshest kill report, n = how many different trackers saw it. No identity in, no identity out.
const SPOT_PER_HOUR = 120, SPOT_PER_IP_DAY = 400, SPOT_KEEP_H = 24, SPOT_SAME_MIN = 30;
async function postSpot(req, env){
  let body; try { body = await req.json() } catch { return json({error: "bad json"}, 400) }
  const c = cleanSpot(body, G);
  if (c.error) return json({error: c.error}, 400);
  const now = new Date(), day = now.toISOString().slice(0, 10), ip = req.headers.get("cf-connecting-ip") || "", ipday = await sha(netKey(ip) + day + await salt(env));
  const hour = await env.DB.prepare("SELECT COUNT(*) n FROM boss_spots WHERE install = ? AND received > ?").bind(body.install, new Date(now - 3600e3).toISOString()).first();
  const today = await env.DB.prepare("SELECT COUNT(*) n FROM boss_spots WHERE ipday = ?").bind(ipday).first();
  const peak = await ledgerPeak(env.DB, ipday);
  if (hour.n >= SPOT_PER_HOUR || Math.max(today.n, peak.posts) >= SPOT_PER_IP_DAY) return json({error: "too many spots"}, 429);
  const dup = await env.DB.prepare("SELECT id FROM boss_spots WHERE install = ? AND map = ? AND mob = ? AND received > ?").bind(body.install, c.spot.map, c.spot.mob, new Date(now - SPOT_SAME_MIN * 60e3).toISOString()).first();
  if (dup) return json({ok: true, dup: true});
  // the 24 h TTL sweep lives here, on the write path: a public GET /api/spots must stay read-only (audit 2026-11-05)
  await env.DB.prepare("DELETE FROM boss_spots WHERE received < ?").bind(new Date(now - SPOT_KEEP_H * 3600e3).toISOString()).run();
  await env.DB.prepare("INSERT INTO boss_spots (install, ipday, received, map, mob, ch, t) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(body.install, ipday, now.toISOString(), c.spot.map, c.spot.mob, c.spot.ch, c.spot.t).run();
  await ledgerBump(env.DB, ipday, day, Math.max(today.n, peak.posts) + 1, 0);   // no install-rotation cap here: installs 0 keeps the stored mark
  return json({ok: true});
}
async function getSpots(env, url){
  const map = url.searchParams.get("map") || "";
  if (!/^\d{1,10}$/.test(map) || !G.timed || !G.timed[map]) return json({error: "map"}, 400);
  const cut = new Date(Date.now() - SPOT_KEEP_H * 3600e3).toISOString();
  // read-only GET (audit 2026-11-05): the 24 h TTL sweep used to run here, so a public GET wrote to D1 on every
  // call; it moved to postSpot, where the writes already happen. Rows past the window answer nothing either way.
  const {results} = await env.DB.prepare("SELECT mob, ch, MAX(t) t, COUNT(DISTINCT install) n FROM boss_spots WHERE map = ? AND received > ? GROUP BY mob, ch").bind(map, cut).all();
  const info = Object.fromEntries(G.timed[map].map(([id, sec, boss]) => [id, {sec, boss}]));
  return new Response(JSON.stringify({updated: new Date().toISOString(), hours: SPOT_KEEP_H,
    spots: results.map(r => ({mob: r.mob, name: G.mobnames?.[r.mob] || "Monster " + r.mob, sec: info[r.mob]?.sec ?? 3600, boss: !!(info[r.mob]?.boss), ch: r.ch, t: r.t, n: r.n}))}),
    {headers: {"content-type": "application/json", "cache-control": "public, max-age=30", ...CORS}});
}

/* Weekly grind ladder (P1-5) + weekly community map rates (P1-9), 2026-11-02.
   Opt-in display names ride with runs (run_names, the KPQ-names pattern) and join per network the way the
   KPQ boards join names. Anti-cheat adopts Minerva's two layers BEFORE launch (adoption plan item 5, ADR
   0032): a physics ceiling per map flags impossible EXP/h (check.js mapCeiling, computed at data build
   time), and a line over 2x the board's #1 with >= 8 other lines auto-flags — report, never reject, and a
   flagged line is held back from the public board (the count says so) while every run stays in the owner's
   inbox. One home network = one player, exactly as the summary joins them. */
export const LADDER_MIN_MINUTES = 30;      // a board line needs this much farming in the week
export const LADDER_OVER_TOP = 2;          // ...x the board's best ...
export const LADDER_OVER_TOP_OTHERS = 8;   // ... with at least this many other lines on the board
export const LADDER_RATE_MIN_PLAYERS = 2;  // a map's community rate shows once 2+ networks farmed it this week

// the Monday 00:00 UTC a week covers: {key: "2026-11-02", start, end}
export function weekBounds(now = new Date()){
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
  return {key: mon.toISOString().slice(0, 10), start: mon.toISOString(), end: new Date(mon.getTime() + 7 * 864e5).toISOString()};
}

// rows = ok runs inside one week: {install, ipday, grp, map, map_name, party, level, job, minutes, exp, mesos, received, name}
export function buildLadder(rows, G){
  const uf = new Map(), find = k => { let r = k; while (uf.has(r) && uf.get(r) !== r) r = uf.get(r); uf.set(k, r); return r },
    join = (a, b) => { const x = find(a), y = find(b); if (x !== y) uf.set(x, y) };
  for (const r of rows) join("i" + r.install, "n" + r.ipday);
  const net = install => find("i" + install);
  const puf = new Map(), pfind = k => { let r = k; while (puf.has(r) && puf.get(r) !== r) r = puf.get(r); puf.set(k, r); return r };
  for (const r of rows) if (r.grp && r.party > 1){ const x = pfind("p" + r.grp), y = pfind(net(r.install)); if (x !== y) puf.set(x, y) }
  const gk = r => (r.party > 1 && r.grp ? "P" + pfind("p" + r.grp) : "S" + net(r.install));
  // one fold serves every board: group lines (overall), group x map lines (per map), map x network (rates)
  const fold = keyfn => {
    const m = new Map();
    for (const r of rows){
      const k = keyfn(r);
      if (k == null) continue;
      const h = r.minutes / 60;
      if (h <= 0) continue;
      const e = m.get(k) || (m.set(k, {best: null, bestM: null, names: new Map(), minutes: 0, runs: 0}), m.get(k));
      e.minutes += r.minutes; e.runs++;
      if (r.name) e.names.set(r.install, r.name);
      if (!e.best || r.exp / h > e.best.exp / (e.best.minutes / 60)) e.best = r;
      if (!e.bestM || r.mesos / h > e.bestM.mesos / (e.bestM.minutes / 60)) e.bestM = r;
    }
    return m;
  };
  const toLine = (e, key) => { const b = e.best, h = b.minutes / 60;
    return {key, names: [...new Set(e.names.values())].slice(0, 6), map: b.map, mapName: b.map_name, party: b.party, level: b.level, job: b.job,
      expHr: Math.round(b.exp / h), mesosHr: Math.round(e.bestM.mesos / (e.bestM.minutes / 60)), minutes: Math.round(e.minutes), runs: e.runs, at: b.received} };
  // the flag pass (see the block comment): (a) the map's physics ceiling, then (b) too far above the best
  // surviving line once the board is busy enough to compare. Flagged lines leave the public list; `hidden` counts them.
  const pub = (list, metric) => {
    const all = [...list].filter(([, e]) => e.minutes >= LADDER_MIN_MINUTES).map(([k, e]) => toLine(e, k));
    for (const l of all){ const c = mapCeiling(G, l.map); if (c != null && l.expHr > c) l.flag = "over the map's ceiling" }
    const rank = all.filter(l => !l.flag).sort((a, b) => b[metric] - a[metric]);
    if (rank.length > LADDER_OVER_TOP_OTHERS) for (const l of rank.slice(1)) if (l[metric] > LADDER_OVER_TOP * rank[0][metric]) l.flag = "too far above the board";
    const rows = all.filter(l => !l.flag).sort((a, b) => b[metric] - a[metric]).slice(0, 50);
    const lab = new Map(), g = l => { if (!lab.has(l.key)) lab.set(l.key, "l" + lab.size); return lab.get(l.key) };
    // hidden = the lines the watchdogs hold back; a board longer than 50 just shows the top 50 (the site's copy says
    // "held back by the watchdogs" — honest lines past the cut are not that)
    return {rows: rows.map(l => ({group: g(l), ...l, key: undefined})), hidden: all.filter(l => l.flag).length};
  };
  const groups = fold(gk);
  // key: "map\u0000group" — a string. An array key never matches itself in a Map (SameValueZero compares identity),
  // so every run became its own per-map line, each under the 30-minute floor, and boards.maps shipped empty (round 2)
  const perMap = fold(r => (r.map == null ? null : r.map + "\u0000" + gk(r)));
  // community map rates (P1-9): the median over networks of each network's median EXP/h on the map this week
  const byMapNet = new Map();
  for (const r of rows){
    if (r.map == null) continue;
    const h = r.minutes / 60;
    if (h <= 0) continue;
    const m = byMapNet.get(r.map) || byMapNet.set(r.map, new Map()).get(r.map);
    const e = m.get(net(r.install)) || m.set(net(r.install), {exp: [], mesos: []}).get(net(r.install));
    e.exp.push(r.exp / h); e.mesos.push(r.mesos / h);
  }
  const rates = [...byMapNet].filter(([, nets]) => nets.size >= LADDER_RATE_MIN_PLAYERS).map(([map, nets]) =>
    ({map, mapName: G.mapnames?.[String(map)] || null, expHr: Math.round(median([...nets.values()].map(v => median(v.exp)))),
      mesosHr: Math.round(median([...nets.values()].map(v => median(v.mesos)))), players: nets.size}));
  return {
    players: new Set(rows.map(r => net(r.install))).size, runs: rows.length,
    boards: {
      overall: pub(groups, "expHr"),
      mesos: pub(groups, "mesosHr"),
      maps: Object.fromEntries([...new Set([...perMap.keys()].map(k => k.split("\u0000")[0]))].map(map =>
        [map, pub(new Map([...perMap].filter(([k]) => k.split("\u0000")[0] === map).map(([k, e]) => [k.split("\u0000")[1], e])), "expHr")]))
    },
    rates
  };
}

// GET /api/ladder: this week and last week, cached 5 minutes like the shop summary (a week of runs is a
// small table; the cache only stops every visitor rebuilding it)
async function ladderBody(db){
  const wk = weekBounds();
  const lastStart = new Date(Date.parse(wk.start) - 7 * 864e5).toISOString();
  const {results} = await db.prepare(`SELECT r.install, r.ipday, r.map, r.map_name, r.party, r.level, r.job, r.minutes, r.exp, r.mesos, r.received, g.grp, n.name
    FROM runs r LEFT JOIN run_groups g ON g.run_id = r.id LEFT JOIN run_names n ON n.run_id = r.id
    WHERE r.ok = 1 AND r.received >= ?`).bind(lastStart).all();
  const mk = rows => { const b = buildLadder(rows, G); return {players: b.players, runs: b.runs, boards: b.boards, rates: b.rates} };
  return {updated: new Date().toISOString(), week: wk,
    this: mk(results.filter(r => r.received >= wk.start)),
    last: mk(results.filter(r => r.received < wk.start)),
    note: "names are the display names players chose to send; flagged lines are held back, never deleted"};
}
async function getLadder(env){
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'ladder'").first();
  let body = row?.v;
  try { if (!body || Date.now() - Date.parse(JSON.parse(body).updated) > 5 * 60e3) body = null } catch { body = null }
  if (!body){ body = JSON.stringify(await ladderBody(env.DB)); await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('ladder', ?)").bind(body).run() }
  return new Response(body, {headers: {"content-type": "application/json", "cache-control": "public, max-age=300", ...CORS}});
}

// D1 rows max out at 2 MB: a summary copy at or past 1.5 MB has to shrink before it can be stored. The KPQ round list
// is the one unbounded field, so it gives back its oldest rounds until the copy fits — a binary search keeps as many as
// possible (the old fixed 1000-then-none steps either wasted rounds or kept none). If even an empty list doesn't fit,
// nothing can shrink it safely: the full copy is served fresh and not stored (the next rebuild retries — real data sits
// far below the line; bug-hunt follow-up 2026-11-02). Exported for the tests.
export function trimSummary(s, limit = 1.5e6){
  const full = JSON.stringify(s);
  if (full.length < limit) return full;
  const all = s.kpq && s.kpq.list;
  if (!Array.isArray(all) || !all.length) return full;   // nothing left to give
  s = {...s, kpq: {...s.kpq, list: []}};                 // the copy works on its own object; the caller's is untouched
  if (JSON.stringify(s).length >= limit) return full;    // the list can't save it
  let lo = 0, hi = all.length;                           // lo fits, hi doesn't
  while (lo < hi){
    const mid = (lo + hi + 1) >> 1;
    s.kpq.list = all.slice(-mid);
    if (JSON.stringify(s).length < limit) lo = mid; else hi = mid - 1;
  }
  s.kpq.list = lo ? all.slice(-lo) : [];                 // slice(-0) is the whole array: guard the empty fit
  return JSON.stringify(s);
}

// a fresh claim with no copy to serve: poll briefly for the winner's copy instead of rebuilding alongside it.
// A worker that died mid-rebuild never publishes; the caller steals its expired-or-live claim after this returns null
async function waitOrServe(env){
  for (let i = 0; i < 4; i++){
    await new Promise(r => setTimeout(r, 250));
    const again = await env.DB.prepare("SELECT v FROM meta WHERE k = 'summary'").first();
    if (again?.v) try { if (JSON.parse(again.v).updated) return again.v } catch {}
  }
  return null;
}

async function route(req, env){
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, {headers: CORS});
  if (url.pathname === "/api/runs" && req.method === "POST") return postRun(req, env);
  if (url.pathname === "/api/kpq" && req.method === "POST") return postKpq(req, env);
  if (url.pathname === "/api/shop" && req.method === "POST") return postShop(req, env);
  if (url.pathname === "/api/forget" && req.method === "POST") return postForget(req, env);
  if (url.pathname === "/api/spots" && req.method === "POST") return postSpot(req, env);
  if (url.pathname === "/api/spots" && req.method === "GET") return getSpots(env, url);
  if (url.pathname === "/api/shop/summary" && req.method === "GET") return getShopSummary(env);
  if (url.pathname === "/api/ladder" && req.method === "GET") return getLadder(env);
  if (url.pathname === "/api/party" && req.method === "POST") return partyLive(req, env);
  if (url.pathname === "/api/feedback" && req.method === "POST") return postFeedback(req, env);
  if (url.pathname === "/api/feedback" && req.method === "GET") return getFeedback(req, env);
  if (url.pathname === "/api/kpq/recent" && req.method === "GET") return getKpqRecent(req, env);
  if (url.pathname === "/api/runs/recent" && req.method === "GET") return getRunsRecent(req, env);
  if (url.pathname === "/api/feedback/done" && req.method === "POST") return doneFeedback(req, env);
  // the owner panel: a static page, no data on it — every data route it calls stays behind the key
  if (url.pathname === "/admin" && req.method === "GET")
    return new Response(ADMIN_HTML, {headers: {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"}});
  if (url.pathname === "/api/summary" && req.method === "GET"){
    // worked out at most every 5 minutes and kept in the meta table (each request would otherwise read every run; the
    // Cache API does nothing on workers.dev)
    const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'summary'").first();
    let body = null, okCopy = null; try { okCopy = row?.v ? JSON.parse(row.v) : null } catch {}
    const fresh = okCopy && Date.now() - Date.parse(okCopy.updated) <= 5 * 60e3;
    // one rebuild at a time, whatever shape the cache is in — including no copy at all. The old code skipped the
    // lock when the row was missing or unparseable, so a fake-ID forget (which used to clear the row) followed by
    // three concurrent GETs ran three full rebuilds, 45 queries (audit 2026-11-05).
    const build = async force => {
      await env.DB.prepare("DELETE FROM meta WHERE k = 'summary_lock'").run();   // an expired claim is cleared; force=true steals a live one
      // INSERT OR IGNORE inside a batch (one transaction on D1) makes the claim race-safe: exactly one concurrent
      // GET wins the rebuild; a loser serves the stale copy or waits for the winner's
      const claim = (await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('summary_lock', ?)").bind(String(Date.now()))]))[0];
      if (!claim?.meta?.changes && !force) return null;
      // rows past the window leave the hot tables first, so this rebuild already reads the shrunken ones
      const archived = await archiveOld(env.DB);
      const s = await summary(env.DB);
      s.archived = archived;
      // D1 rows max out at 2 MB: trimSummary gives back KPQ rounds (newest kept) until the copy stores; past that it
      // is served fresh and left unstored rather than half-emptied on every request
      const out = trimSummary(s);
      if (out.length < 1.5e6) await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('summary', ?)").bind(out).run();
      await env.DB.prepare("DELETE FROM meta WHERE k = 'summary_lock'").run();   // released: the next stale GET may rebuild
      return out;
    };
    if (fresh) body = row.v;
    else {
      const lockRow = await env.DB.prepare("SELECT v FROM meta WHERE k = 'summary_lock'").first();
      const held = lockRow && Date.now() - Number(lockRow.v) <= 60e3;
      if (held && okCopy) body = row.v;   // a usable (if stale) copy: serve it while another request rebuilds
      else if (held) body = (await waitOrServe(env)) ?? await build(true);   // wait for the winner's copy; steal only if it never published
      else if (!(body = await build(false))) body = okCopy ? row.v : (await waitOrServe(env)) ?? await build(true);
    }
    return new Response(body, {headers: {"content-type": "application/json", "cache-control": "public, max-age=300", ...CORS}});
  }
  if (url.pathname === "/") return json({about: "MS Classic World Info shared grind data", summary: "/api/summary"});
  return json({error: "not found"}, 404);
}
