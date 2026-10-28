// Tracker window, conditions & alerts (0.2.78, the WeakAuras-shaped engine behind "Alerts and goal"): triggers on the
// live numbers (rates, respawns, the KPQ clock, the goal, idle) and on drop events; each alert says it through a sound,
// a toast on the overlay, a flash and a run-log line. Maths in core/alerts.js (no DOM there); this file owns the state,
// the 5 s tick, the instant drop path and the Settings rows. Loaded after renderer-live.js (beep/flash/note) and before
// renderer-overlay.js (whose push carries the toasts).
const A = GrindAlerts;
let alertStates = {}, alertEvts = [], alertToasts = [], alertSession = null, alertSavedT = null;
const alertList = () => A.normalize(settings.alerts);
const alertHas = (kind) => A.has(settings.alerts, kind, true);
// a fresh session resets every trigger's memory (Start, not Stop: Stop keeps states so Edit-run-safe alerts don't re-fire)
function alertReset(){ alertStates = {}; alertEvts = [] }
function alertPrune(){ const t = Date.now(); alertToasts = alertToasts.filter(x => t - x.at < 6500) }
// one fired entry -> sound + flash + status + run-log + overlay toast
function alertFire(f){
  if (f.sound) alertSound(f.sound);
  if (f.w === "loot") flash();   // the tracker window's own top flash (the overlay flashes its own card)
  $("#status").textContent = f.text;
  if (f.log) note(f.text, "alert");
  if (f.toast){ alertPrune(); alertToasts.push({id: f.id + ":" + Date.now(), text: f.text, at: Date.now(), sev: f.sev, w: f.w});
    if (alertToasts.length > 4) alertToasts.splice(0, alertToasts.length - 4) }
  if (typeof ovSend === "function") try { ovSend(true) } catch {}
}
// the synthesized chimes (no asset files): patterns of the existing beep()
function alertSound(kind){
  const seq = {low: [[330, .6]], mid: [[880, .25]], high: [[660, .15], [990, .25]],
    double: [[660, .15], [990, .25], [660, .15]]}[kind] || [[880, .25]];
  let t = 0;
  for (const [hz, sec] of seq){ setTimeout(() => beep(hz, sec), Math.round(t * 1000)); t += sec + .06 }
}
// a pickup arrives: the drop triggers answer at once (a 5 s wait would kill the point)
function alertEvent(e){
  if (!Array.isArray(settings.alerts)) return;
  alertEvts = [...alertEvts, e].slice(-20);
  const drops = alertList().filter(a => a.kind === "lootWorth" || a.kind === "lootNamed");
  for (const f of A.evaluate(drops, {events: alertEvts.slice(-3)}, alertStates, Date.now())) alertFire(f);
}
// the 5 s heartbeat for every trigger that watches time (rates, idle, respawns, KPQ, session, goal)
function alertsTick(){
  alertPrune();
  if (session !== alertSession){ alertSession = session; alertReset() }
  if (!session || timer == null || wrap) return;
  const s = session.stats(), now = Date.now(), evts = alertEvts;
  alertEvts = [];
  const ctx = {on: timer != null, paused: s.paused, runT0, st: s,
    respawns: session.respawns ? session.respawns(now) : [],
    kpq: kpq?.on && kpq.left !== null ? {left: kpq.left, rounds: kpq.rounds} : null,
    events: evts,
    prices: window.sitePriceCtx ? window.sitePriceCtx() : []};   // site-price alerts (renderer-site.js)
  for (const f of A.evaluate(alertList(), ctx, alertStates, now)) alertFire(f);
}
setInterval(alertsTick, 5000);

// ---- the Settings rows ---------------------------------------------------------------------
const ALERT_TEST = {expHrBelow: "EXP/hr fell under the threshold (test)", expHrAbove: "EXP/hr is over the threshold (test)",
  mesosHrBelow: "Mesos/hr fell under the threshold (test)", mesosHrAbove: "Mesos/hr is over the threshold (test)",
  killsHrBelow: "Kills/hr fell under the threshold (test)", killsHrAbove: "Kills/hr is over the threshold (test)",
  bossDue: "Mushmom (boss) is back now (test)", kpqClock: "KPQ clock under 60 s (test)",
  sessionTime: "120 min this session — time for a break? (test)", goalReached: "Goal reached: level 30 (test)",
  idleExp: "No EXP for 2 min (test)", lootWorth: "A drop worth 1,000,000 picked up (test)",
  lootNamed: "Drop you're watching for: Glove ATK Scroll (test)"};
function alertRow(a){
  const def = A.KINDS[a.kind];
  const fields = def.fields.map(([k, label, , t]) => t === "t"
    ? `<input class="ap" data-k="${k}" type="text" value="${esc(String(a[k] ?? ""))}" placeholder="${esc(label)}" title="${esc(label)}">`
    : `<label class="apw">${esc(label)} <input class="ap" data-k="${k}" type="number" value="${esc(String(a[k] ?? ""))}"></label>`).join(" ");
  const sounds = ["none", ...A.SOUNDS].map(s => `<option${a.sound === s ? " selected" : ""}>${s}</option>`).join("");
  return `<div class="arow" data-id="${esc(a.id)}">
    <input type="checkbox" class="aon" title="On/off" ${a.on !== false ? "checked" : ""}>
    <select class="akind" title="What it watches">${Object.entries(A.KINDS).map(([k, d]) => `<option value="${k}"${k === a.kind ? " selected" : ""}>${esc(d.label)}</option>`).join("")}</select>
    ${fields}
    <select class="asnd" title="Sound">${sounds}</select>
    <button class="atest alt" title="Preview one">Test</button>
    <button class="adel" title="Remove">✕</button>
    <div class="anote">${esc(def.note)}</div>
  </div>`;
}
function alertsUi(){
  const box = $("#alertList"); if (!box) return;
  const list = alertList();
  box.innerHTML = (list.length ? list.map(alertRow).join("") : `<div class="note" id="alertEmpty">No conditions yet — add one and the tracker watches it for you.</div>`);
  box.querySelectorAll(".arow").forEach(row => {
    row.querySelector(".aon").onchange = alertsSave;
    row.querySelector(".akind").onchange = e => {   // a different kind: rebuild just this row with the new fields
      const i = [...box.querySelectorAll(".arow")].indexOf(row), list = alertList(), cur = list[i] || {};
      const kind = e.target.value, def = A.KINDS[kind], next = {id: cur.id || "a" + (i + 1), kind,
        on: row.querySelector(".aon").checked, act: {sound: def.sound}};
      for (const [k,, d] of def.fields) next[k] = d;
      list[i] = next; settings.alerts = list; renderAlertRow(i); alertsSave();
    };
    row.querySelector(".asnd").onchange = alertsSave;
    row.querySelector(".atest").onclick = () => alertFire({id: row.dataset.id, text: ALERT_TEST[row.querySelector(".akind").value] || "Test alert",
      sev: A.KINDS[row.querySelector(".akind").value]?.sev || "info", sound: row.querySelector(".asnd").value, toast: true, log: true, w: "status"});
    row.querySelector(".adel").onclick = () => { row.remove(); if (!box.querySelector(".arow")) box.innerHTML = `<div class="note" id="alertEmpty">No conditions yet — add one and the tracker watches it for you.</div>`; alertsSave() };
    row.querySelectorAll(".ap").forEach(inp => inp.onchange = alertsSave);
  });
}
function renderAlertRow(i){
  const box = $("#alertList"), a = alertList()[i]; if (!box || !a) return;
  const tmp = document.createElement("div"); tmp.innerHTML = alertRow(a);
  const old = box.querySelectorAll(".arow")[i];
  if (old) old.replaceWith(tmp.firstElementChild); else box.appendChild(tmp.firstElementChild);
  alertsUi();   // rewire (the simplest way to keep handlers right)
}
function alertsSave(){
  clearTimeout(alertSavedT);
  alertSavedT = setTimeout(async () => {
    const rows = [...document.querySelectorAll("#alertList .arow")];
    settings.alerts = rows.map(row => {
      const kind = row.querySelector(".akind").value, def = A.KINDS[kind], p = {id: row.dataset.id, kind, on: row.querySelector(".aon").checked,
        act: {sound: row.querySelector(".asnd").value, toast: true, log: true}};
      for (const [k,, d, t] of def.fields){ const inp = row.querySelector(`.ap[data-k="${k}"]`);
        p[k] = !inp ? d : t === "n" ? (Number.isFinite(+inp.value) ? +inp.value : d) : inp.value.slice(0, 500) }   // numbers as numbers
      return p;
    });
    settings = await host.settings({alerts: settings.alerts}).catch(() => settings);
  }, 300);
}
$("#alertAdd")?.addEventListener("click", () => {
  const list = alertList(), def = A.KINDS.expHrBelow;
  list.push({id: "a" + Date.now().toString(36), kind: "expHrBelow", on: true, act: {sound: def.sound},
    v: def.fields[0][2], min: def.fields[1][2]});
  settings.alerts = list;
  alertsUi(); alertsSave();
});
// migration + first render: called from renderer-settings.js's boot right after the real settings land (running earlier
// would race the boot's own fetch). The three pre-0.2.78 alerts (drop worth, watched names, the 2-min no-EXP beep)
// become engine alerts once; the old keys are cleared so the legacy paths in renderer-live.js stay quiet behind the engine.
async function alertsBoot(){
  if (!Array.isArray(settings.alerts)){
    settings = await host.settings({alerts: A.synth(settings), alertWorth: null, alertItems: null, stopBeep: false}).catch(() => settings);
  }
  alertsUi();
}
