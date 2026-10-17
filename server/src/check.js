/* Checks on a run before it counts. A failed run is still stored (with the reason), just left out of the numbers.
   Limits are our own choices, not game data: they only catch broken readings and made-up runs. */
export function cleanRun(r, G){
  const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
  if (!r || typeof r !== "object") return {error: "not a run"};
  if (typeof r.install !== "string" || !/^[a-z0-9-]{16,40}$/i.test(r.install)) return {error: "install id"};
  if (!num(r.minutes, 14.5, 20)) return {error: "minutes"};
  if (!num(r.party, 1, 6) || !num(r.exp, 0, 1e8) || !num(r.kills, 0, 1e5) || !num(r.mesos ?? 0, 0, 1e8)) return {error: "numbers"};
  if (r.level != null && !num(r.level, 1, 200)) return {error: "level"};
  if (r.date && !/^\d{4}-\d\d-\d\d$/.test(r.date)) return {error: "date"};
  const map = r.map == null ? null : String(r.map);
  if (map !== null && !G.maps[map]) return {error: "map"};
  const mobs = Array.isArray(r.mobs) ? r.mobs.slice(0, 20).map(m => ({id: String(m.id), kills: m.kills | 0, mesos: m.mesos | 0,
    mesoDrops: m.mesoDrops | 0, items: Object.fromEntries(Object.entries(m.items || {}).slice(0, 50).map(([k, v]) => [String(k), v | 0]))})) : [];
  const items = Object.fromEntries(Object.entries(r.items || {}).slice(0, 100).map(([k, v]) => [String(k), v | 0]));
  const run = {date: r.date || new Date().toISOString().slice(0, 10), map, map_name: map ? G.mapnames[map] || null : String(r.mapName || "").slice(0, 60) || null,
    level: r.level ?? null, job: r.job ? String(r.job).slice(0, 40) : null, party: r.party | 0, minutes: r.minutes, exp: Math.round(r.exp),
    msg_exp: Math.round(r.msgExp || 0), bar_exp: Math.round(r.barExp || 0), kills: r.kills | 0, mesos: Math.round(r.mesos || 0), mobs, items};
  // honesty: no farming at all; monsters that don't live on this map; EXP bar and EXP messages that disagree a lot
  let why = null;
  if (run.kills < 1 || run.exp <= 0) why = "no kills";
  else if (map && mobs.some(m => !G.maps[map].includes(m.id))) why = "monster not on this map";
  else if (run.bar_exp > 0 && run.msg_exp > 0 && (run.bar_exp < run.msg_exp * 0.8 || run.bar_exp > run.msg_exp * 2)) why = "EXP bar and messages disagree";
  return {run, ok: !why, why};
}

// typical value of a list (half above, half below) and the middle half
export function median(a){ const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
