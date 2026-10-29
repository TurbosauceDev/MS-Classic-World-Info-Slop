/* Checks on a run before it counts. A failed run is still stored (with the reason), just left out of the numbers.
   Limits are our own choices, not game data: they only catch broken readings and made-up runs. */
export function cleanRun(r, G){
  const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
  if (!r || typeof r !== "object") return {error: "not a run"};
  if (typeof r.install !== "string" || !/^[a-z0-9-]{16,40}$/i.test(r.install)) return {error: "install id"};
  if (!num(r.minutes, 14.5, 20)) return {error: "minutes"};
  if (!num(r.party, 1, 6) || !num(r.exp, 0, 1e8) || !num(r.kills, 0, 1e5) || !num(r.mesos ?? 0, 0, 1e8)) return {error: "numbers"};
  if (r.level != null && !num(r.level, 1, 200)) return {error: "level"};
  if (r.date && (typeof r.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(r.date))) return {error: "date"};
  const text = (v, n) => typeof v === "string" ? v.slice(0, n) : null;   // text fields: strings only
  // a map id the server doesn't know (a newer tracker): keep the run under its name rather than lose it
  const map = r.map != null && G.maps[String(r.map)] ? String(r.map) : null;
  // counts: whole numbers from 0 up, a monster's kills no more than the run's (they add up to the Confirmed Drops)
  const cnt = (v, hi) => Math.min(hi, Math.max(0, Math.floor(+v) || 0)), kills = cnt(r.kills, 1e5);
  // ids are game numbers only: anything else ("__proto__", "constructor") is dropped (it would corrupt the summary's tables)
  const ID = /^\d{1,10}$/;
  const itemsOf = (o, n) => Object.fromEntries(Object.entries(o && typeof o === "object" && !Array.isArray(o) ? o : {}).filter(([k]) => ID.test(k)).slice(0, n).map(([k, v]) => [k, cnt(v, 1e4)]).filter(([, v]) => v));
  const mobs = Array.isArray(r.mobs) ? r.mobs.filter(m => m && typeof m === "object" && ID.test(String(m.id))).slice(0, 20).map(m => ({id: String(m.id), kills: cnt(m.kills, kills),
    mesos: cnt(m.mesos, 1e8), mesoDrops: cnt(m.mesoDrops, 1e5), items: itemsOf(m.items, 50)})) : [];
  const items = itemsOf(r.items, 100);
  const run = {date: r.date || new Date().toISOString().slice(0, 10), map, map_name: map ? G.mapnames[map] || null : text(r.mapName, 60) || null,
    level: r.level == null ? null : Math.round(r.level), job: text(r.job, 40) || null, party: r.party | 0, minutes: r.minutes, exp: Math.round(r.exp),
    msg_exp: cnt(r.msgExp, 1e8), bar_exp: cnt(r.barExp, 1e8), kills, mesos: Math.round(r.mesos || 0), mobs, items,
    deaths: r.deaths == null ? null : cnt(r.deaths, 100),
    hour: Number.isInteger(r.hour) && r.hour >= 0 && r.hour < 24 ? r.hour : null,
    used_cost: r.usedCost == null ? null : cnt(r.usedCost, 1e7)};   // UTC hour the run started (best time to farm)
  // honesty: no farming at all; monsters that don't live on this map; EXP bar and EXP messages that disagree a lot
  let why = null;
  if (run.kills < 1 || run.exp <= 0) why = "no kills";
  // farming time (breaks over a minute left out) under half the run: an idle stretch got into it (trackers before 0.2.59)
  else if (num(r.activeMin, 0, 20) && r.activeMin < r.minutes / 2) why = "mostly idle";
  // every kill is an EXP message of at least 1, so kills can't be more than the messages' EXP
  else if (run.msg_exp > 0 && run.kills > run.msg_exp) why = "more kills than EXP";
  else if (map && mobs.some(m => !G.maps[map].includes(m.id))) why = "monster not on this map";
  // more than 2 levels' worth of EXP an hour: a broken reading or a made-up run (mapleexp.com's leaderboard uses the same cut).
  // Only from Lv 20: below that a level can take minutes
  else if (run.level >= 20 && G.exp?.[run.level] && run.exp / (run.minutes / 60) > 2 * G.exp[run.level]) why = "too much EXP for this level";
  // the bar can be well above the messages (lines fade before they're read), never well below them
  else if (run.bar_exp > 0 && run.msg_exp > 0 && (run.bar_exp < run.msg_exp * 0.8 || run.bar_exp > run.msg_exp * 6)) why = "EXP bar and messages disagree";
  return {run, ok: !why, why};
}

// typical value of a list (half above, half below) and the middle half
export function median(a){ const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }

/* A KPQ round for the leaderboard. Same idea as cleanRun: a failed round is kept with the reason, not counted. The time
   limits are our own sanity bounds (no real round is under a minute), not game data. */
const KPQ_IDS = ["80000000", "80000100", "80000200", "80000300", "80000400", "80000500"];
// character name for the board: letters and digits, up to 12 (our own bound, same as the tracker's name box); anything else
// is dropped, the round still counts
const kpqName = v => typeof v === "string" && /^[A-Za-z0-9]{2,12}$/.test(v.trim()) ? v.trim() : null;
// fastest believable KPQ clear: 4 minutes (Danny 2026-10-21); faster ones are kept but never counted
export const KPQ_MIN = 240;
// the v2 raw round (tracker 0.3.20+): numbers only, each bounded, anything else dropped; scores are never trusted from the client
const LOOT_KEYS = ["etc", "use", "scroll", "equip", "pan"];
function cleanLoot(l){
  const n = (v, hi) => typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(0, Math.round(v))) : 0;
  l = l && typeof l === "object" ? l : {};
  return {...Object.fromEntries(LOOT_KEYS.map(k => [k, n(l[k], 500)])), npc: n(l.npc, 5e7)};
}
function cleanRaw(v, stages){
  if (!v || typeof v !== "object") return null;
  const n = (x, hi) => typeof x === "number" && isFinite(x) ? Math.min(hi, Math.max(0, Math.round(x))) : 0;
  const b = v.bonus && typeof v.bonus === "object" ? {sec: n(v.bonus.sec, 3600), exp: n(v.bonus.exp, 1e7), mesos: n(v.bonus.mesos, 1e7), kills: n(v.bonus.kills, 5000), loot: cleanLoot(v.bonus.loot)} : null;
  return {stages, rush: {loot: cleanLoot(v.rush?.loot)}, bonus: b && b.kills > 0 ? b : null};
}
export function cleanKpq(r){
  const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
  if (!r || typeof r !== "object") return {error: "not a round"};
  if (typeof r.install !== "string" || !/^[a-z0-9-]{16,40}$/i.test(r.install)) return {error: "install id"};
  if (!num(r.clear, 1, 7200) || !num(r.party, 1, 6)) return {error: "numbers"};
  if (r.level != null && !num(r.level, 1, 200)) return {error: "level"};
  if (r.date && (typeof r.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(r.date))) return {error: "date"};
  const cnt = (v, hi) => v == null ? null : Math.min(hi, Math.max(0, Math.round(+v) || 0));
  const st = r.stages && typeof r.stages === "object" && !Array.isArray(r.stages) ? r.stages : {};
  const stages = Object.fromEntries(KPQ_IDS.filter(id => num(st[id], 0, 7200)).map(id => [id, Math.round(st[id])]));
  const round = {date: r.date || new Date().toISOString().slice(0, 10), hour: Number.isInteger(r.hour) && r.hour >= 0 && r.hour < 24 ? r.hour : null,
    mode: r.mode === "Rush" ? "Rush" : "Bonus", party: r.party | 0, level: r.level == null ? null : Math.round(r.level),
    job: typeof r.job === "string" ? r.job.slice(0, 40) || null : null, clear: Math.round(r.clear), total: cnt(r.total, 7200),
    clock: r.clock ? 1 : 0, exp: cnt(r.exp, 1e7), mesos: cnt(r.mesos, 1e7), stages, name: kpqName(r.name),
    src: r.src === "site" ? "site" : "tracker", raw: cleanRaw(r.v2, stages)};   // site = the site's KPQ timer (stages split by key press, 2026-10-21)
  let why = null;
  if (round.clear < KPQ_MIN || round.clear > 3600) why = "clear time";
  else if (round.total != null && round.total < round.clear) why = "total under clear";
  else if (["80000000", "80000400"].some(id => !(id in stages))) why = "stages missing";
  else if (KPQ_IDS.slice(0, 5).reduce((a, id) => a + (stages[id] || 0), 0) > round.clear + 60) why = "stage times over clear";
  return {round, ok: !why, why};
}
