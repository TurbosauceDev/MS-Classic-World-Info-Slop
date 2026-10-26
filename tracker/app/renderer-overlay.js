// Overlay mode, tracker-window side (renderer.js is split in load order; all share one global scope): the reading and the
// maths stay here — this file only builds a small snapshot of the session and pushes it to the overlay window every time
// the view re-renders (throttled). The overlay (app/overlay.js) renders it as floating widgets; main.js relays and owns
// the window. Dummy data flows through the same path, so layouts can be tried without tracking.
let ovOpen = false, ovSentT = 0, ovFeed = [];
// the run log in plain text for the overlay (feedAdd's lines, HTML stripped there)
function ovPlain(l){
  if (l.kind === "exp") return `${l.who} gained ${fmt(l.n)} EXP${l.detail ? ` (${l.detail})` : ""}`;
  if (l.kind === "meso") return `${l.who} picked up ${fmt(l.n)} mesos`;
  if (l.kind === "loot") return `${l.who} looted ` + (l.parts || []).map(p => `${fmt(p.n)} ${p.name}`).join(", ") + (l.unread ? ` (+${l.unread} unread)` : "");
  return String(l.text || "");
}
function ovFeedPush(lines){
  if (!Array.isArray(lines)) return;
  for (const l of lines) if (l?.kind) ovFeed.push({t: l.t || Date.now(), kind: l.kind, text: ovPlain(l)});
  if (ovFeed.length > 30) ovFeed.splice(0, ovFeed.length - 30);
}
function ovBuild(s){
  const mid = s.nowMap != null ? String(s.nowMap) : s.map != null ? String(s.map) : null;
  const list = mid && G.maps[mid] ? G.maps[mid][2] : [];   // [mob, count] per the game data
  const spawns = list.filter(([id]) => G.mobs[id]).map(([id, n]) => ({name: G.mobs[id][0], lv: G.mobs[id][1], exp: G.mobs[id][3], n: n || 0}));
  const respawns = (session.respawns ? session.respawns(Date.now()) : []).map(r => ({name: r.name, boss: r.boss, sec: r.sec, killed: r.killed}));
  const bar = session.state.bar, r = TH.resolve(themeNow(), darkQ.matches);
  return {t: Date.now(), on: timer != null, wrap: !!wrap, held: !!held, paused: s.paused, dummy: dummyOn,
    runT0, state: $("#stateText").textContent,
    st: {activeMin: s.activeMin, exp: s.exp, expHr: s.expHr, expHr5: s.expHr5, toLevelHrs: s.toLevelHrs, kills: s.kills, killsHr: s.killsHr,
      mesos: s.mesos, mesosHr: s.mesosHr, lootHr: s.lootHr, deaths: s.deaths, level: s.level, pct: bar?.pct ?? null, firstBar: s.firstBar, party: s.party},
    map: {id: mid, name: s.nowMapName || s.mapName, spawns, respawns},
    kpq: kpq?.on ? {rounds: kpq.rounds, stage: kpq.stage ? KPQ_STAGE[kpq.stage.id] : null, stageT0: kpq.stage?.t0 ?? null,
      round: kpq.round ? {t0: kpq.round.t0} : null, clock: kpq.left !== null ? {left: kpq.left, leftT: kpq.leftT} : null, hold: !!kpq.hold} : null,
    party: partyLive,
    feed: ovFeed.slice(-8),
    th: {c: r.c, mode: r.mode}};
}
function ovSend(force){
  if (!ovOpen || !session) return;
  const t = Date.now();
  if (!force && t - ovSentT < 500) return;
  ovSentT = t;
  try { host.overlayPush?.(ovBuild(session.stats())) } catch {}
}
// every re-render pushes (throttled): render() runs on each tick while tracking and on start/stop/pause/dummy
const _render = render;
render = function(...a){ const r = _render.apply(this, a); try { ovSend() } catch {} return r };
// and every run-log line goes over too (the Loot and Run log widgets read it)
const _feedAdd = feedAdd;
feedAdd = function(lines){ const r = _feedAdd.apply(this, arguments); try { ovFeedPush(lines) } catch {} return r };
// the Overlay button beside Focus Mode's, and the View-menu actions
$("#overlayBtn").onclick = () => host.overlay?.(!ovOpen);
host.onOverlay?.(st => {
  const was = ovOpen; ovOpen = !!st.open;
  $("#overlayBtn").setAttribute("aria-pressed", String(ovOpen));
  if (ovOpen) ovSend(true);
  else if (was) $("#status").textContent = "Overlay closed.";
});
// the View-menu actions land in renderer-settings.js's onMenu dispatch ("overlay", "overlayEdit")
