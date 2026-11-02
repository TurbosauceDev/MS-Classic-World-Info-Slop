// Shared boss spots (0.3.30, Turbozo 2026-11-01: "make our boss tracker more automatic, more accurate, easier to use —
// if it's better, implement it"): the respawn cards become a network. Kills the tracker already detects (the EXP line
// attribution in core/session.js) and the "killed it" buttons report {map, mob, ch, t} to the server's /api/spots when
// the Share switch is on — no IGN, the install ID only dedupes votes and powers "Delete what I shared". Every tracker
// on the same map sees the freshest witnessed kill per boss ("3 saw it"), sharing or not: the GET is public.
// Channel: sent as null until the tracker can read the game's channel display (the wire format is ready for it).
let spotRows = [], spotMap = null, spotAt = 0;
const spotSent = new Map();   // mob id -> the kill time we already reported (a fresh kill is newer)
// the respawn rows this map should show: ours, with any shared kill fresher than ours folded in
function respawnsWithSpots(now){
  if (!session) return [];
  const mine = session.respawns(now).map(r => ({...r}));
  if (!spotRows.length || spotMap !== String(session.state?.map ?? "")) return mine;
  for (const r of mine){
    const s = spotRows.find(x => x.mob === String(r.id));
    if (!s || s.t <= (r.killed || 0)) continue;   // ours is as fresh or fresher: keep ours, the witnesses agree
    r.killed = s.t; r.dueIn = Math.max(0, s.t + r.sec * 1000 - now); r.shared = s.n || 0; r.ch = s.ch ?? null;
  }
  return mine;
}
// witnesses for the current map, at most once a minute (the server keeps 24 h and answers grouped)
async function spotsPull(force){
  if (!session || timer == null) return;
  const map = session.state?.map; if (!map) return;
  if (!force && spotMap === String(map) && Date.now() - spotAt < 60e3) return;
  spotAt = Date.now();
  try { const r = await host.spotsGet(String(map)); if (r && Array.isArray(r.spots)){ spotRows = r.spots; spotMap = String(map); render() } } catch {}
}
setInterval(() => { spotsPull(false).catch(() => {}) }, 30e3);
// report kills: a timed monster's kill time newer than the last one we sent, seen in the last 10 minutes (older ones
// are marked seen without uploading — a late map event must not turn into a stale spot)
function spotsShareTick(){
  if (!settings.share || !session || timer == null) return;
  const map = session.state?.map; if (!map || !G.timed?.[String(map)]) return;
  const now = Date.now();
  for (const r of session.respawns(now)){
    if (r.killed == null || r.killed <= (spotSent.get(r.id) || 0)) continue;
    spotSent.set(r.id, r.killed);
    if (now - r.killed > 10 * 60e3) continue;
    Promise.resolve(host.spotShare?.({map: String(map), mob: String(r.id), ch: null, t: r.killed})).catch(() => {});
    spotsPull(true).catch(() => {});   // our own report comes back with the next pull
  }
}
setInterval(spotsShareTick, 5000);
