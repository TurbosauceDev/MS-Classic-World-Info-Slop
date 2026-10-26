// Overlay window: floating widgets over the game, on any monitor (Danny, 2026-10-26: "a true overlay style mode", shown
// maplestory.watch's live overlay). The tracker window reads the game and does all the maths; this page only renders what
// it's sent (renderer-overlay.js builds the payload, main.js relays it). Edit mode: drag the cards anywhere and pick what
// to track; Done locks the overlay and every click goes through to the game until Ctrl+Shift+E (or View menu) edits again.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const fmt = n => Math.round(n).toLocaleString();
const hm = h => h < 1 ? Math.round(h * 60) + " min" : h.toFixed(1) + " h";
const mss = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") };
const respT = ms => { const m = Math.ceil(ms / 6e4); return m > 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min" };
const clockT = t => new Date(t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
const runClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600);
  return (h ? h + ":" : "") + String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, "0") + ":" + String(s % 60).padStart(2, "0") };

// what can be tracked: the toolbar lists these, in this order. HOME is where each lands the first time (desktop pixels)
const KINDS = {status: "Status", exp: "EXP", kills: "Kills", mesos: "Mesos", loot: "Loot", map: "Map & spawns", party: "Party", kpq: "KPQ", log: "Run log"};
const HOME = {status: {on: true, x: 24, y: 24}, exp: {on: true, x: 24, y: 108}, map: {on: true, x: 24, y: 250},
  kills: {on: false, x: 24, y: 620}, mesos: {on: false, x: 24, y: 700}, loot: {on: false, x: 24, y: 780},
  party: {on: false, x: 24, y: 860}, kpq: {on: false, x: 24, y: 940}, log: {on: false, x: 24, y: 1020}};
let DATA = null, CFG = {edit: true, widgets: {}}, DESK = {x: 0, y: 0, width: 1920, height: 1080}, zTop = 1;

// ---- the widgets -----------------------------------------------------------
const RENDER = {
  status(d){
    return `<div class="big" style="font-size:14px;color:var(--ink)"><span class="dot ${d.on ? (d.paused ? "warn" : "ok") : ""}"></span>${esc(d.state || (d.on ? "Tracking" : "Stopped"))}</div>
      <div class="rows"><div><span>On the clock</span><b>${d.runT0 && (d.on || d.dummy) ? runClock(d.t - d.runT0) : "-"}</b></div>
      <div><span>Farming</span><b>${d.st ? hm((d.st.activeMin || 0) / 60) : "-"}</b></div></div>`;
  },
  exp(d){
    const s = d.st || {}, next = s.toLevelHrs == null ? "-" : s.toLevelHrs < 1 ? Math.round(s.toLevelHrs * 60) + " min" : s.toLevelHrs.toFixed(1) + " h";
    const a = s.firstBar, b = s.level != null ? {level: s.level, pct: s.pct} : null;
    let lv = "";
    if (a && b && b.pct != null && b.level >= a.level){
      const gained = Math.max(0, (b.level - a.level) * 100 + b.pct - a.pct);
      lv = `<div class="lvbar"><span>Lv <b>${a.level}</b></span><div class="trk" title="Started at Lv ${a.level} ${a.pct}%, now Lv ${b.level} ${b.pct}%"><i style="width:${Math.min(100, Math.max(0, b.pct))}%"></i></div><span>Lv <b>${b.level}</b></span></div>
        <div class="sub pos">+${gained.toFixed(2)}% this run</div>`;
    }
    return `<div class="big">${fmt(s.expHr || 0)}<small> EXP/hr</small></div>
      <div class="sub">${s.expHr5 != null ? "last 5 min " + fmt(s.expHr5) : "last 5 min —"}</div>
      <div class="rows"><div><span>gained</span><b class="pos">+${fmt(s.exp || 0)}</b></div><div><span>next level</span><b>${next}</b></div></div>` + lv;
  },
  kills(d){
    return `<div class="big">${fmt(d.st?.killsHr || 0)}<small> kills/hr</small></div>
      <div class="rows"><div><span>total</span><b>${fmt(d.st?.kills || 0)}</b></div><div><span>deaths</span><b class="${d.st?.deaths ? "neg" : ""}">${fmt(d.st?.deaths || 0)}</b></div></div>`;
  },
  mesos(d){
    return `<div class="big">${fmt(d.st?.mesosHr || 0)}<small> mesos/hr</small></div>
      <div class="rows"><div><span>picked up</span><b class="pos">+${fmt(d.st?.mesos || 0)}</b></div><div><span>loot/hr</span><b>${fmt(d.st?.lootHr || 0)}</b></div></div>`;
  },
  loot(d){
    const lines = (d.feed || []).filter(l => l.kind === "loot").slice(-5).reverse();
    return lines.length ? lines.map(l => `<div class="lr loot"><span>${esc(l.text)}</span></div>`).join("") : `<div class="empty">Nothing yet.</div>`;
  },
  map(d){
    const m = d.map || {}, list = m.spawns || [];
    const mobs = list.slice(0, 6).map(x => `<div class="mrow"><b>${esc(x.name)}</b><span>${x.n ? "×" + x.n + " · " : ""}Lv ${x.lv} · ${fmt(x.exp)} EXP</span></div>`).join("");
    const resp = (m.respawns || []).map(r => { const due = r.killed ? r.killed + r.sec * 1000 - d.t : null;
      return `<div class="mrow"><b>${esc(r.name)}${r.boss ? " (boss)" : ""}</b><span class="${due != null && due <= 0 ? "pos" : ""}">${r.killed ? due > 0 ? "back in ~" + respT(due) : "due now" : "every " + respT(r.sec * 1000)}</span></div>` }).join("");
    return `<div class="mapname">${esc(m.name || "No map yet")}</div>`
      + (list.length ? `<div class="sub">${list.reduce((a, x) => a + (x.n || 0), 0)} spawns</div>` + mobs + (list.length > 6 ? `<div class="sub dim">and ${list.length - 6} more</div>` : "") : "")
      + (resp ? `<div class="sect">respawns</div>` + resp : "");
  },
  party(d){
    const n = d.st?.party || 1, p = d.party;
    let rows = "";
    if (p?.members?.length) rows = `<div class="sub pos">${fmt(p.expHr || 0)} EXP/hr together</div>` + p.members.slice(0, 6).map(m =>
      `<div class="mrow"><b>${m.you ? "<span class=dim>you</span>" : esc(m.nick || m.job || "member")}</b><span>${m.level ? "Lv " + m.level + " · " : ""}${fmt(m.expHr || 0)}/hr</span></div>`).join("");
    else if (n > 1) rows = `<div class="sub dim">party view off (Settings)</div>`;
    return `<div class="big" style="font-size:16px">${n > 1 ? "Party of " + n : "Solo"}</div>` + rows;
  },
  kpq(d){
    const k = d.kpq;
    if (!k) return `<div class="empty">Not in KPQ.</div>`;
    const clock = k.clock ? mss(k.clock.left - (d.t - k.clock.leftT) / 1000) : null;
    return `<div class="big" style="font-size:16px">Round ${k.rounds || "-"}</div>
      ${k.round ? `<div class="sub">this round ${mss((d.t - k.round.t0) / 1000)}</div>` : ""}
      ${k.stage ? `<div class="sub">${esc(k.stage)} stage${k.stageT0 ? " " + mss((d.t - k.stageT0) / 1000) : ""}</div>` : ""}
      ${clock ? `<div class="rows"><div><span>KPQ clock</span><b>${clock}</b></div></div>` : ""}
      ${k.hold ? `<div class="sub dim">paused between rounds</div>` : ""}`;
  },
  log(d){
    const lines = (d.feed || []).slice(-6).reverse();
    return lines.length ? lines.map(l => `<div class="lr ${esc(l.kind)}"><time>${clockT(l.t)}</time><span>${esc(l.text)}</span></div>`).join("") : `<div class="empty">Nothing yet.</div>`;
  },
};

// ---- theme: the tracker pushes its current colours, the overlay follows live -------------------------------
const VARS = {bg: "--bg", panel: "--panel", ink: "--ink", muted: "--muted", line: "--line", accent: "--accent", soft: "--accent-soft", on: "--on-accent", leaf: "--leaf", warn: "--warn", bad: "--bad"};
function theme(th){
  const r = document.documentElement.style;
  if (th?.c) for (const [k, v] of Object.entries(VARS)) if (th.c[k]) r.setProperty(v, th.c[k]);
  document.documentElement.style.colorScheme = th?.mode === "light" ? "light" : "dark";
}

// ---- cards: one element per kind, placed in desktop coordinates -------------------------------
function wPos(id){
  const saved = CFG.widgets[id], home = HOME[id] || {on: false, x: 24, y: 24};
  const xy = k => saved && Number.isFinite(+saved[k]) ? +saved[k] : home[k];   // 0 is a real spot (the desk's edge)
  return {on: saved ? saved.on !== false : home.on, x: xy("x"), y: xy("y")};
}
function mkCard(id){
  const el = document.createElement("section");
  el.className = "ovw"; el.id = "ovw-" + id; el.dataset.w = id;
  el.innerHTML = `<header><span class="t">${esc(KINDS[id])}</span><button class="x" title="Hide ${esc(KINDS[id])}" aria-label="Hide ${esc(KINDS[id])}">×</button></header><div class="b"></div>`;
  el.querySelector(".x").onclick = () => setOn(id, false);
  el.addEventListener("pointerenter", () => { if (CFG.edit) el.style.zIndex = ++zTop });
  return el;
}
function clampCard(el){
  const w = el.offsetWidth || 200, h = el.offsetHeight || 60;
  el.style.left = Math.min(Math.max(0, el.offsetLeft), Math.max(0, DESK.width - w)) + "px";
  el.style.top = Math.min(Math.max(0, el.offsetTop), Math.max(0, DESK.height - h)) + "px";
}
function place(){
  for (const id of Object.keys(KINDS)){
    const el = $("#ovw-" + id); if (!el || !el.isConnected) continue;
    el.style.left = Math.round(wPos(id).x - DESK.x) + "px";
    el.style.top = Math.round(wPos(id).y - DESK.y) + "px";
    clampCard(el);
  }
}
function setOn(id, on){
  CFG.widgets[id] = {...(CFG.widgets[id] || HOME[id] || {x: 24, y: 24}), on};
  const el = $("#ovw-" + id);
  if (on && !el?.isConnected) $("#ovroot").appendChild(el || mkCard(id));
  else if (!on && el?.isConnected) el.remove();
  syncBar(); ovSave(); if (on && DATA) apply(DATA);
}
let saveT = null;
const ovSave = () => { clearTimeout(saveT); saveT = setTimeout(() => window.ovhost.settings({overlay: {edit: CFG.edit, widgets: CFG.widgets}}).catch(() => {}), 200) };

// ---- data: re-render every card (a push, or the 1 s tick for the countdowns) -------------------------------
function apply(d){
  DATA = d;
  if (d.th) theme(d.th);
  for (const id of Object.keys(KINDS)){
    const el = $("#ovw-" + id);
    if (el?.isConnected) el.querySelector(".b").innerHTML = RENDER[id](d);
  }
}

// ---- edit toolbar: pick what to track, Done locks, Close shuts the overlay -------------------------------
function buildBar(){
  const bar = $("#ovbar");
  bar.innerHTML = `<b>Overlay</b><span class="hint">Drag the cards anywhere — even onto your other monitor. Everything saves by itself. Done locks the overlay: clicks go through to the game.</span>`
    + Object.entries(KINDS).map(([id, name]) => `<label><input type="checkbox" data-w="${id}"> ${name}</label>`).join("")
    + `<button id="ovDone">Done</button> <button id="ovClose" class="alt">Close</button>`;
  bar.querySelectorAll("input[data-w]").forEach(c => c.onchange = () => setOn(c.dataset.w, c.checked));
  $("#ovDone").onclick = () => window.ovhost.done();
  $("#ovClose").onclick = () => window.ovhost.close();
}
function syncBar(){
  document.querySelectorAll("#ovbar input[data-w]").forEach(c => c.checked = wPos(c.dataset.w).on);
  $("#ovbar").classList.toggle("hidden", !CFG.edit);
}

// ---- dragging (edit mode only): pointer events, saved in desktop coordinates -------------------------------
let drag = null;
addEventListener("pointerdown", e => {
  if (!CFG.edit || e.button) return;
  const card = e.target.closest?.(".ovw");
  if (!card || e.target.closest("button")) return;
  drag = {id: card.dataset.w, dx: e.clientX - card.offsetLeft, dy: e.clientY - card.offsetTop, card};
  card.setPointerCapture(e.pointerId); card.classList.add("moving");
  e.preventDefault();
});
addEventListener("pointermove", e => {
  if (!drag) return;
  drag.card.style.left = Math.round(e.clientX - drag.dx) + "px";
  drag.card.style.top = Math.round(e.clientY - drag.dy) + "px";
});
addEventListener("pointerup", () => {
  if (!drag) return;
  const {card, id} = drag; drag = null;
  card.classList.remove("moving");
  clampCard(card);
  CFG.widgets[id] = {...(CFG.widgets[id] || {}), x: DESK.x + card.offsetLeft, y: DESK.y + card.offsetTop, on: true};
  ovSave();
});

// ---- boot -------------------------------
(async () => {
  try {
    const st = await window.ovhost.state();
    CFG = {edit: st.edit !== false, widgets: st.widgets && typeof st.widgets === "object" ? st.widgets : {}};
    if (st.desk?.width) DESK = st.desk;
  } catch {}
  for (const id of Object.keys(KINDS)) if (wPos(id).on) $("#ovroot").appendChild(mkCard(id));
  buildBar();
  document.body.classList.toggle("edit", CFG.edit);
  document.body.classList.toggle("locked", !CFG.edit);
  syncBar();
  place();
  window.ovhost.onData(apply);
  window.ovhost.onMode(on => {
    CFG.edit = !!on;
    document.body.classList.toggle("edit", CFG.edit);
    document.body.classList.toggle("locked", !CFG.edit);
    syncBar(); place(); ovSave();
  });
  window.ovhost.onScreens(d => { if (d?.width){ DESK = d; place() } });
  setInterval(() => { if (DATA) apply({...DATA, t: Date.now()}) }, 1000);   // the countdowns and clocks tick between pushes
})();
