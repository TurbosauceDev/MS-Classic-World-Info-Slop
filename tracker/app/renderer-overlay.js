// Overlay mode, tracker-window side (renderer.js is split in load order; all share one global scope): the reading and the
// maths stay here — this file only builds a small snapshot of the session and pushes it to the overlay window every time
// the view re-renders (throttled). The overlay (app/overlay.js) renders it as floating widgets; main.js relays and owns
// the window. Dummy data flows through the same path, so layouts can be tried without tracking.
let ovVit = null;   // last HP / MP read ({hp:[cur,max], mp:[cur,max], t}) for the Chat blocker bars (overlay.js RENDER.blocker)
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
  // n = the line's amount (EXP / mesos, for the log card's minimum filters); parts = loot with category + icon (the Loot card's
  // names / icons / type filters). Icons ride along only for the few lines kept, so the snapshot stays small.
  for (const l of lines) if (l?.kind) ovFeed.push({t: l.t || Date.now(), kind: l.kind, text: ovPlain(l), n: Number.isFinite(l.n) ? l.n : null,
    parts: l.kind === "loot" ? (l.parts || []).map(p => ({id: p.id, name: p.name, n: p.n, c: G.items[p.id]?.c || "", ic: G.iicons?.[p.id] || ""})) : undefined});
  if (ovFeed.length > 30) ovFeed.splice(0, ovFeed.length - 30);
}
// the rate trend (0.2.80, the card sparklines): a ring of samples, one every 20 s (30 min window), pushed with the
// snapshot so the overlay's EXP / Mesos / Kills cards can draw where the rate has been, not just where it is
let ovSpark = [], ovSparkSess = null;
function ovSparkSample(){
  if (session !== ovSparkSess){ ovSparkSess = session; ovSpark = [] }   // a new session starts a new trend
  if (!session || timer == null) return;
  const s = session.stats();
  ovSpark.push({t: Date.now(), exp: s.expHr5 ?? s.expHr ?? null, mesos: s.mesosHr ?? null, kills: s.killsHr ?? null});
  if (ovSpark.length > 90) ovSpark.shift();
}
setInterval(ovSparkSample, 20000);
// Borderless mode (0.2.94): the Simple and Focus views drawn as overlay cards (overlay.js RENDER.simple/focus), so they sit
// beside the other widgets, click-through, and are laid out with the overlay's edit mode. Same numbers, same helpers' data.
function ovSm(s){
  const mid = s.nowMap || s.map, rows = (l, f) => l.slice(0, 5).map(f), more = l => Math.max(0, l.length - 5);
  const pots = [...s.used.filter(u => u.n > 0).map(u => ({id: u.id, name: u.name, n: -u.n})), ...s.items.filter(i => G.items[i.id]?.c === "Consumable").map(i => ({id: i.id, name: i.name, n: i.n}))].slice(0, 6);
  const ic = id => G.iicons?.[id] || G.icons?.[id] || "";
  return {map: s.nowMapName || s.mapName || "", spawns: (G.maps[mid]?.[2] || []).reduce((a, [, c]) => a + (c || 0), 0), level: s.level || null, job: s.job || "",
    min: s.activeMin, exp: s.exp, best: s.bestMin || 0, a: s.firstBar || null, b: s.bar || null, perMin: (s.perMin || []).slice(-90),
    pots: pots.map(p => ({n: p.n, name: p.name, ic: ic(p.id)})), spent: s.usedCost, mesos: s.mesos, loot: s.lootValue,
    items: rows(s.items, i => ({name: i.name, n: i.n, ic: ic(i.id)})), itemsMore: more(s.items), mobs: rows(s.mobs, m => ({name: m.name, n: m.kills})), mobsMore: more(s.mobs)};
}
function ovBuild(s){
  const mid = s.nowMap != null ? String(s.nowMap) : s.map != null ? String(s.map) : null;
  const list = mid && G.maps[mid] ? G.maps[mid][2] : [];   // [mob, count] per the game data
  const spawns = list.filter(([id]) => G.mobs[id]).map(([id, n]) => ({name: G.mobs[id][0], lv: G.mobs[id][1], exp: G.mobs[id][3], n: n || 0}));
  const respawns = (session.respawns ? session.respawns(Date.now()) : []).map(r => ({name: r.name, boss: r.boss, sec: r.sec, killed: r.killed}));
  const bar = session.state.bar, r = TH.resolve(themeNow(), darkQ.matches);
  return {t: Date.now(), on: timer != null, wrap: !!wrap, held: !!held, paused: s.paused, dummy: dummyOn,
    runT0, clockMs: runClockMs(),   // frozen while paused by you / wrapping up (Danny 10-29: it kept counting)
    inv: Object.fromEntries(GrindBag.ALL.map(([k]) => [k, s.invTabs?.[k]?.last ?? null])), bagEvery: bagCfg().every, state: $("#stateText").textContent,
    st: {activeMin: s.activeMin, exp: s.exp, expHr: s.expHr, expHr5: s.expHr5, toLevelHrs: s.toLevelHrs, kills: s.kills, killsHr: s.killsHr,
      mesos: s.mesos, mesosHr: s.mesosHr, lootHr: s.lootHr, deaths: s.deaths, level: s.level, pct: bar?.pct ?? null, firstBar: s.firstBar, party: s.party},
    map: {id: mid, name: s.nowMapName || s.mapName, spawns, respawns},
    kpq: kpq?.on ? {rounds: kpq.rounds, stage: kpq.stage ? KPQ_STAGE[kpq.stage.id] : null, stageT0: kpq.stage?.t0 ?? null,
      round: kpq.round ? {t0: kpq.round.t0} : null, clock: kpq.left !== null ? {left: kpq.left, leftT: kpq.leftT} : null, hold: !!kpq.hold} : null,
    party: partyLive,
    vit: ovVit,
    chat: chatSnap(), chatOn: ovChatOn, shop: shopSnap(),
    sm: ovSm(s),
    feed: ovFeed.slice(-16),
    loot: s.items.slice(0, 40).map(i => ({id: i.id, name: i.name, n: i.n, v: Math.round(i.total || 0), c: G.items[i.id]?.c || "", ic: G.iicons?.[i.id] || ""})),   // the Loot card's inventory mode
    spark: ovSpark.slice(-60),   // the rate trend for the card sparklines (renderer-alerts.js's toasts ride along too)
    toasts: alertToasts.slice(-3),   // the conditions engine's fired alerts (renderer-alerts.js), aged out by the overlay
    th: {c: r.c, mode: r.mode, sk: r.sk}};   // sk (0.2.92): the panel style rides with the colours, the overlay re-skins live
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
$("#miniBd").onclick = () => host.borderless?.("simple");
$("#fzBd").onclick = () => host.borderless?.("focus");
$("#overlayBtn").onclick = () => host.overlay?.(!ovOpen);
host.onOverlay?.(st => {
  const was = ovOpen, wasB = ovBlocker, wasC = ovChatOn; ovOpen = !!st.open; ovBlocker = ovOpen && !!st.blocker; ovChatOn = ovOpen && !!st.chat;
  if (wasB !== ovBlocker || wasC !== ovChatOn) setTimeout(() => jr.wake(), 0);   // not inline: this file loads before renderer-dummy.js (dummyOn)
  $("#overlayBtn").setAttribute("aria-pressed", String(ovOpen));
  if (ovOpen) ovSend(true);
  else if (was) $("#status").textContent = "Overlay closed.";
});
// the View-menu actions land in renderer-settings.js's onMenu dispatch ("overlay", "overlayEdit")
