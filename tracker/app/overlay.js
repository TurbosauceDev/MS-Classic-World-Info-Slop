// Overlay window: floating widgets over the game, on any monitor (Danny, 2026-10-26: "a true overlay style mode", shown
// maplestory.watch's live overlay). The tracker window reads the game and does all the maths; this page only renders what
// it's sent (renderer-overlay.js builds the payload, main.js relays it). Edit mode v2 (Danny, 2026-10-28, after ElvUI's
// Toggle Anchors, WoW Edit Mode and WeakAuras' MoverSizer): a panel picker replaces the checkbox strip, cards snap
// magnetically to each other and the screen (15 px, Shift skips), an alignment grid can show and snap, cards resize by
// corner grip / Ctrl+scroll / a scale slider, and arrows nudge the picked card. Done locks the overlay and every click
// goes through to the game until Ctrl+Shift+E (or View menu) edits again.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&quot;", '"': "&quot;"})[c]);
const fmt = n => Math.round(n).toLocaleString();
const hm = h => h < 1 ? Math.round(h * 60) + " min" : h.toFixed(1) + " h";
const mss = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") };
const respT = ms => { const m = Math.ceil(ms / 6e4); return m > 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min" };
const clockT = t => new Date(t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
const runClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600);
  return (h ? h + ":" : "") + String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, "0") + ":" + String(s % 60).padStart(2, "0") };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// what can be tracked: the panel lists these, in this order. HOME is where each lands the first time (desktop pixels)
const KINDS = {status: "Status", exp: "EXP", kills: "Kills", mesos: "Mesos", loot: "Loot", map: "Map & spawns", party: "Party", kpq: "KPQ", log: "Run log"};
const HOME = {status: {on: true, x: 24, y: 24}, exp: {on: true, x: 24, y: 108}, map: {on: true, x: 24, y: 250},
  kills: {on: false, x: 24, y: 620}, mesos: {on: false, x: 24, y: 700}, loot: {on: false, x: 24, y: 780},
  party: {on: false, x: 24, y: 860}, kpq: {on: false, x: 24, y: 940}, log: {on: false, x: 24, y: 1020}};
let DATA = null, CFG = {edit: true, widgets: {}, snap: true, grid: false, gsize: 64, panel: null, profile: "Default", profiles: null}, DESK = {x: 0, y: 0, width: 1920, height: 1080}, zTop = 1;
const picked = {id: null};

// ---- the widgets -----------------------------------------------------------
// the card sparkline (0.2.80): a tiny polyline of the rate's last samples, current-coloured, a dot on the newest value.
// Gaps (null samples) drop out; one sample or none draws nothing. Reads the theme vars live, so it follows re-themes.
function SPK(d, k){
  const vs = (Array.isArray(d.spark) ? d.spark : []).map(x => x?.[k]).filter(v => Number.isFinite(v));
  if (vs.length < 2) return "";
  const w = 122, h = 26, min = Math.min(...vs), span = (Math.max(...vs) - min) || 1;
  const pts = vs.map((v, i) => `${(i / (vs.length - 1) * (w - 3)).toFixed(1)},${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts.join(" ")}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>
    <circle cx="${pts.at(-1).split(",")[0]}" cy="${pts.at(-1).split(",")[1]}" r="2.2" fill="currentColor"/></svg>`;
}
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
      <div class="spk">${SPK(d, "exp")}</div>
      <div class="sub">${s.expHr5 != null ? "last 5 min " + fmt(s.expHr5) : "last 5 min —"}</div>
      <div class="rows"><div><span>gained</span><b class="pos">+${fmt(s.exp || 0)}</b></div><div><span>next level</span><b>${next}</b></div></div>` + lv;
  },
  kills(d){
    return `<div class="big">${fmt(d.st?.killsHr || 0)}<small> kills/hr</small></div>
      <div class="spk">${SPK(d, "kills")}</div>
      <div class="rows"><div><span>total</span><b>${fmt(d.st?.kills || 0)}</b></div><div><span>deaths</span><b class="${d.st?.deaths ? "neg" : ""}">${fmt(d.st?.deaths || 0)}</b></div></div>`;
  },
  mesos(d){
    return `<div class="big">${fmt(d.st?.mesosHr || 0)}<small> mesos/hr</small></div>
      <div class="spk">${SPK(d, "mesos")}</div>
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
      return `<div class="mrow"><b>${esc(r.name)}${r.boss ? " (boss)" : ""}</b><span class="${due != null && due <= 0 ? "pos" : due != null && due <= 120e3 ? "soon" : ""}">${r.killed ? due > 0 ? "back in ~" + respT(due) : "due now" : "every " + respT(r.sec * 1000)}</span></div>` }).join("");
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
// per-widget settings: on, x/y (desktop px), s = scale .5-2, o = opacity .25-1 (WeakAuras' per-region surface, tamed)
function wPos(id){
  const saved = CFG.widgets[id], home = HOME[id] || {on: false, x: 24, y: 24};
  const xy = k => saved && Number.isFinite(+saved[k]) ? +saved[k] : home[k];   // 0 is a real spot (the desk's edge)
  return {on: saved ? saved.on !== false : home.on, x: xy("x"), y: xy("y"),
    s: clamp(saved && Number.isFinite(+saved.s) ? +saved.s : 1, .5, 2), o: clamp(saved && Number.isFinite(+saved.o) ? +saved.o : 1, .25, 1)};
}
function mkCard(id){
  const el = document.createElement("section");
  el.className = "ovw"; el.id = "ovw-" + id; el.dataset.w = id;
  el.innerHTML = `<header><span class="t">${esc(KINDS[id])}</span><button class="x" title="Hide ${esc(KINDS[id])}" aria-label="Hide ${esc(KINDS[id])}">×</button></header><div class="b"></div><i class="rsz" title="Drag to resize"></i>`;
  el.querySelector(".x").onclick = () => { setOn(id, false); if (picked.id === id) pick(null) };
  el.addEventListener("pointerenter", () => { if (CFG.edit) el.style.zIndex = ++zTop });
  return el;
}
function styleCard(el, id){
  const p = wPos(id);
  el.style.transform = p.s === 1 ? "" : `scale(${p.s})`;   // transform-origin top left: x/y stay the card's anchor
  el.style.opacity = p.o === 1 ? "" : p.o;
}
// clamp inside the window's own viewport, not the reported desk: the window is the only place a card can live, and on
// some setups (mixed-DPI monitors, Windows nudging a transparent window) the real content area is smaller than the
// union of the displays — trusting the desk is what left cards cut off in a dead strip around the edge (Danny 10-28).
function clampCard(el){
  const r = el.getBoundingClientRect(), w = r.width || 200, h = r.height || 60;
  el.style.left = Math.min(Math.max(0, el.offsetLeft), Math.max(0, innerWidth - w)) + "px";
  el.style.top = Math.min(Math.max(0, el.offsetTop), Math.max(0, innerHeight - h)) + "px";
}
function place(){
  for (const id of Object.keys(KINDS)){
    const el = $("#ovw-" + id); if (!el || !el.isConnected) continue;
    el.style.left = Math.round(wPos(id).x - DESK.x) + "px";
    el.style.top = Math.round(wPos(id).y - DESK.y) + "px";
    styleCard(el, id);
    clampCard(el);
  }
}
function setOn(id, on){
  CFG.widgets[id] = {...(CFG.widgets[id] || HOME[id] || {x: 24, y: 24}), on};
  const el = $("#ovw-" + id);
  if (on && !el?.isConnected){ const c = el || mkCard(id); $("#ovroot").appendChild(c);
    c.style.left = Math.round(wPos(id).x - DESK.x) + "px"; c.style.top = Math.round(wPos(id).y - DESK.y) + "px";
    styleCard(c, id); clampCard(c) }
  else if (!on && el?.isConnected) el.remove();
  syncPanel(); ovSave(); if (on && DATA) apply(DATA);
}
function savePos(id){
  const el = $("#ovw-" + id); if (!el) return;
  CFG.widgets[id] = {...(CFG.widgets[id] || {}), x: DESK.x + el.offsetLeft, y: DESK.y + el.offsetTop};
  ovSave();
}
function setS(id, s){ s = clamp(Math.round(s * 100) / 100, .5, 2); CFG.widgets[id] = {...(CFG.widgets[id] || {}), s};
  const el = $("#ovw-" + id); if (el){ styleCard(el, id); clampCard(el) }
  const sv = document.querySelector(`.wrow[data-w="${id}"] .sv`); if (sv) sv.textContent = Math.round(s * 100) + "%";
  syncDetail(id); ovSave() }
function setO(id, o){ CFG.widgets[id] = {...(CFG.widgets[id] || {}), o: clamp(Math.round(o * 100) / 100, .25, 1)};
  const el = $("#ovw-" + id); if (el) styleCard(el, id); syncDetail(id); ovSave() }
let saveT = null;
const profSnap = () => ({widgets: JSON.parse(JSON.stringify(CFG.widgets)), panel: CFG.panel ? {...CFG.panel} : null});
const ovSave = () => { clearTimeout(saveT); saveT = setTimeout(() => {
  CFG.profiles[CFG.profile] = profSnap();   // the live layout IS the active profile (ElvUI's model): every save mirrors into it
  window.ovhost.settings({overlay: {edit: CFG.edit, widgets: CFG.widgets, snap: CFG.snap, grid: CFG.grid, gsize: CFG.gsize, panel: CFG.panel,
    profile: CFG.profile, profiles: CFG.profiles}}).catch(() => {});
}, 200) };

// ---- data: re-render every card (a push, or the 1 s tick for the countdowns) -------------------------------
function apply(d){
  DATA = d;
  if (d.th) theme(d.th);
  for (const id of Object.keys(KINDS)){
    const el = $("#ovw-" + id);
    if (el?.isConnected) el.querySelector(".b").innerHTML = RENDER[id](d);
  }
  toastsShow(d.toasts);
}
// the conditions engine's toasts (0.2.78): a glass stack top-right, gone after 6.5 s or when the tracker pulls them;
// the card they belong to pulses three times (WeakAuras' region flash). Never while editing — edit mode is for layout.
const flashed = new Set();
function toastsShow(list){
  const box = $("#ovtoasts"), now = Date.now();
  const live = (Array.isArray(list) ? list : []).filter(x => x && now - x.at < 6500);
  box.classList.toggle("hidden", CFG.edit || !live.length);
  const have = new Set([...box.children].map(el => el.dataset.at));
  for (const x of live){
    if (!have.has(String(x.at))){
      const el = document.createElement("div");
      el.className = "toast " + (x.sev || "info"); el.dataset.at = x.at; el.textContent = x.text;
      box.appendChild(el);
    }
    if (x.w && !flashed.has(x.at) && !CFG.edit){
      flashed.add(x.at); if (flashed.size > 8) flashed.delete(flashed.values().next().value);
      const c = $("#ovw-" + x.w);
      if (c){ c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 2400) }
    }
  }
  for (const el of [...box.children]) if (!live.some(x => String(x.at) === el.dataset.at)) el.remove();
}

// ---- the edit panel (was a checkbox strip; now one in-style card): rows with an eye toggle and size steppers, a detail
// strip under the picked row (scale, opacity, x/y, reset), and snap/grid/reset in the footer -------------------------------
const EYE = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z"/><circle cx="8" cy="8" r="2.2"/></svg>`;
const EYEOFF = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z" opacity=".45"/><path d="M2.5 13.5 13.5 2.5"/></svg>`;
function buildPanel(){
  const p = $("#ovpanel");
  p.innerHTML = `<header id="ovpHead"><span class="t">Overlay edit</span><button class="btn" id="ovDone">Done</button><button class="btn alt" id="ovClose" title="Close the overlay">×</button></header>
    <p class="hint">Drag the cards — Shift skips snapping, arrows nudge. Ctrl+scroll or the corner grip resizes. All saves by itself.</p>
    <div id="ovpRows"></div>
    <div class="foot"><label><input type="checkbox" id="ovSnap"> Snap</label><label><input type="checkbox" id="ovGrid"> Grid</label>
      <select id="ovGsize" title="Grid spacing"><option value="32">32 px</option><option value="64">64 px</option><option value="128">128 px</option></select>
      <button class="rw-all" id="ovReset">Reset layout</button></div>
    <div class="foot prof"><select id="ovProf" title="Layout profile"></select>
      <input id="ovProfName" maxlength="24" placeholder="new name" title="Type a name and press Save to copy this layout into it">
      <button class="btn alt" id="ovProfSave" title="Copy this layout into the name on the left">Save</button>
      <button class="btn alt" id="ovProfDel" title="Delete this profile">Del</button>
      <button class="btn alt" id="ovProfShare" title="Export or import this layout as a code">Share</button></div>
    <div id="ovShare" class="hidden"><input id="ovShareIn" spellcheck="false" title="The whole layout as a code — copy it somewhere safe, or paste one and Apply">
      <div class="shBtns"><button class="btn alt" id="ovShareCopy">Copy</button><button class="btn" id="ovShareApply">Apply code</button></div></div>`;
  $("#ovDone").onclick = () => window.ovhost.done();
  $("#ovClose").onclick = () => window.ovhost.close();
  $("#ovSnap").onchange = e => { CFG.snap = e.target.checked; ovSave() };
  $("#ovGrid").onchange = e => { CFG.grid = e.target.checked; gridShow() ; ovSave() };
  $("#ovGsize").onchange = e => { CFG.gsize = +e.target.value || 64; gridShow(); ovSave() };
  $("#ovReset").onclick = () => { const b = $("#ovReset");
    if (b.dataset.arm){ delete b.dataset.arm; b.textContent = "Reset layout"; resetAll() }
    else { b.dataset.arm = "1"; b.textContent = "Reset everything?"; setTimeout(() => { if (b.isConnected){ delete b.dataset.arm; b.textContent = "Reset layout" } }, 2600) } };
  profUi();
  $("#ovProf").onchange = e => profApply(e.target.value);
  $("#ovProfSave").onclick = () => { const n = $("#ovProfName").value.trim().slice(0, 24);
    if (!n) return;
    CFG.profiles[n] = profSnap(); CFG.profile = n; profUi(); ovSave(); $("#ovProfName").value = "" };
  $("#ovProfDel").onclick = () => { const b = $("#ovProfDel");
    if (!b.dataset.arm){ b.dataset.arm = "1"; b.textContent = "Delete?"; setTimeout(() => { if (b.isConnected && b.dataset.arm){ delete b.dataset.arm; b.textContent = "Del" } }, 2600); return }
    delete b.dataset.arm; b.textContent = "Del";
    const names = Object.keys(CFG.profiles); if (names.length <= 1) return;   // the last profile stays
    const gone = CFG.profile; delete CFG.profiles[gone];
    profApply(names.find(n => n !== gone) || names[0]) };
  $("#ovProfShare").onclick = () => { const sh = $("#ovShare");
    sh.classList.toggle("hidden");
    if (!sh.classList.contains("hidden")) $("#ovShareIn").value = profCode() };
  $("#ovShareCopy").onclick = () => { const i = $("#ovShareIn"); i.focus(); i.select(); navigator.clipboard?.writeText(i.value).catch(() => {}) };
  $("#ovShareApply").onclick = profImport;
  // the panel moves by its header, like any card; its spot saves too
  let pd = null;
  p.querySelector("#ovpHead").addEventListener("pointerdown", e => {
    if (e.target.closest("button") || e.button) return;
    const r = p.getBoundingClientRect();   // visual rect: the panel rests at left:50% + translateX(-50%), so offsetLeft lies
    pd = {dx: e.clientX - r.left, dy: e.clientY - r.top};
    p.setPointerCapture(e.pointerId); e.preventDefault();
  });
  p.addEventListener("pointermove", e => { if (!pd) return;
    p.style.left = clamp(e.clientX - pd.dx, 0, Math.max(0, innerWidth - p.offsetWidth)) + "px";
    p.style.top = clamp(e.clientY - pd.dy, 0, Math.max(0, innerHeight - p.offsetHeight)) + "px";
    p.style.transform = "none"; p.style.right = "auto" });
  p.addEventListener("pointerup", () => { if (!pd) return; pd = null;
    CFG.panel = {x: DESK.x + p.offsetLeft, y: DESK.y + p.offsetTop}; ovSave() });
  syncPanel();
}
function syncPanel(){
  const rows = $("#ovpRows"); if (!rows) return;
  rows.innerHTML = Object.entries(KINDS).map(([id, name]) => { const p = wPos(id);
    return `<div class="wrow${p.on ? "" : " off"}${picked.id === id ? " sel" : ""}" data-w="${id}">
      <button class="eye${p.on ? "" : " off"}" title="${p.on ? "Hide" : "Show"} ${esc(name)}">${p.on ? EYE : EYEOFF}</button>
      <button class="nm" title="Pick ${esc(name)}">${esc(name)}</button>
      <button class="st" data-d="-1" title="Smaller">−</button><span class="sv">${Math.round(p.s * 100)}%</span><button class="st" data-d="1" title="Bigger">+</button>
    </div>
    <div class="wdet${picked.id === id ? " open" : ""}" data-w="${id}">
      <label><b>Size</b><input type="range" min="50" max="200" step="5" value="${Math.round(p.s * 100)}" data-k="s"></label>
      <label><b>Opacity</b><input type="range" min="25" max="100" step="5" value="${Math.round(p.o * 100)}" data-k="o"></label>
      <div class="xy">x <input type="number" step="1" data-k="x"> y <input type="number" step="1" data-k="y"></div>
      <button class="rw">Reset ${esc(name)}</button>
    </div>`; }).join("");
  rows.querySelectorAll(".wrow").forEach(row => {
    const id = row.dataset.w;
    row.querySelector(".eye").onclick = () => setOn(id, !wPos(id).on);
    row.querySelector(".nm").onclick = () => pick(picked.id === id ? null : id);
    row.querySelectorAll(".st").forEach(b => b.onclick = () => setS(id, wPos(id).s + .05 * +b.dataset.d));
    row.onpointerenter = () => { const el = $("#ovw-" + id); document.body.classList.add("dim");
      if (el) el.classList.add("spot") };
    row.onpointerleave = () => { document.body.classList.remove("dim");
      document.querySelectorAll(".ovw.spot").forEach(el => el.classList.remove("spot")) };
  });
  rows.querySelectorAll(".wdet").forEach(det => {
    const id = det.dataset.w, el = $("#ovw-" + id);
    det.querySelectorAll("input[type=range]").forEach(r => r.oninput = () => (r.dataset.k === "s" ? setS : setO)(id, +r.value / 100));
    det.querySelectorAll("input[type=number]").forEach(n => n.onchange = () => {
      const k = n.dataset.k, v = Math.round(+n.value || 0), el2 = $("#ovw-" + id); if (!el2) return;
      el2.style[k === "x" ? "left" : "top"] = (v - DESK[k]) + "px";
      clampCard(el2); savePos(id) });
    det.querySelector(".rw").onclick = () => { const on = wPos(id).on;
      CFG.widgets[id] = {...(HOME[id] || {x: 24, y: 24}), on};
      if (el){ el.style.left = (HOME[id]?.x || 24) - DESK.x + "px"; el.style.top = (HOME[id]?.y || 24) - DESK.y + "px"; styleCard(el, id); clampCard(el) }
      syncPanel(); ovSave() };
  });
  const snap = $("#ovSnap"); if (snap) snap.checked = CFG.snap;
  const grid = $("#ovGrid"); if (grid) grid.checked = CFG.grid;
  const gs = $("#ovGsize"); if (gs) gs.value = String(CFG.gsize);
}
function syncDetail(id){
  const det = document.querySelector(`.wdet[data-w="${id}"]`), el = $("#ovw-" + id);
  if (!det || !el || !det.classList.contains("open")) return;
  det.querySelector('[data-k="s"]').value = Math.round(wPos(id).s * 100);
  det.querySelector('[data-k="o"]').value = Math.round(wPos(id).o * 100);
  det.querySelector('[data-k="x"]').value = Math.round(DESK.x + el.offsetLeft);
  det.querySelector('[data-k="y"]').value = Math.round(DESK.y + el.offsetTop);
}
function pick(id){
  picked.id = id;
  document.querySelectorAll(".ovw.sel").forEach(el => el.classList.remove("sel"));
  if (id){ $("#ovw-" + id)?.classList.add("sel"); $("#ovw-" + id)?.style.setProperty("z-index", ++zTop) }
  syncPanel();
}
function resetAll(){
  CFG.widgets = {};
  for (const id of Object.keys(KINDS)){ const el = $("#ovw-" + id);
    if (el?.isConnected) el.remove() }
  for (const id of Object.keys(KINDS)) if ((HOME[id] || {}).on) $("#ovroot").appendChild(mkCard(id));
  pick(null); place(); syncPanel(); ovSave();
}
// the grid is an edit-mode affordance (ElvUI draws its grid only while anchors are unlocked): the checkbox is the
// preference and survives Done, but the lines only render while editing — locked play never sees them (Danny 10-28:
// "the grid is only supposed to be active during edit mode. why is it permanently active?")
function gridShow(){
  const g = $("#ovgrid");
  g.classList.toggle("hidden", !CFG.grid || !CFG.edit);
  g.style.setProperty("--gs", CFG.gsize + "px");
}

// ---- layout profiles (0.2.79, ElvUI's profiles + WeakAuras' export ritual): named snapshots of the cards; the live
// layout is the active profile and mirrors on every save, switching loads the snapshot back out, and Share hands you a
// versioned code string to paste elsewhere (Apply reads one back, validating every widget). -------------------------------
const profCode = () => "OVL1." + btoa(JSON.stringify({widgets: CFG.widgets, panel: CFG.panel}));
function profCards(){
  for (const id of Object.keys(KINDS)){ const el = $("#ovw-" + id); if (!wPos(id).on && el?.isConnected) el.remove() }
  for (const id of Object.keys(KINDS)) if (wPos(id).on && !$("#ovw-" + id)?.isConnected) $("#ovroot").appendChild(mkCard(id));
}
function profApply(name){
  const p = CFG.profiles[name]; if (!p) return;
  CFG.profile = name;
  CFG.widgets = JSON.parse(JSON.stringify(p.widgets || {}));
  CFG.panel = p.panel ? {...p.panel} : null;
  profCards(); pick(null); place(); syncPanel(); profUi(); ovSave();
}
function profUi(){
  const sel = $("#ovProf"); if (!sel) return;
  sel.innerHTML = Object.keys(CFG.profiles).sort().map(n => `<option${n === CFG.profile ? " selected" : ""}>${esc(n)}</option>`).join("");
}
function profImport(){
  try {
    const v = $("#ovShareIn").value.trim();
    if (!v.startsWith("OVL1.")) throw new Error("prefix");
    const o = JSON.parse(atob(v.slice(5)));
    if (!o || typeof o.widgets !== "object" || !o.widgets) throw new Error("shape");
    const clean = {};
    for (const id of Object.keys(KINDS)){ const w = o.widgets[id];
      if (w && typeof w === "object") clean[id] = {on: w.on !== false, x: Math.round(+w.x || 0), y: Math.round(+w.y || 0),
        s: clamp(Number.isFinite(+w.s) ? +w.s : 1, .5, 2), o: clamp(Number.isFinite(+w.o) ? +w.o : 1, .25, 1)} }
    CFG.widgets = clean;
    if (o.panel && Number.isFinite(+o.panel.x)) CFG.panel = {x: Math.round(+o.panel.x), y: Math.round(+o.panel.y)};
    profCards(); pick(null); place(); syncPanel(); ovSave();
    return true;
  } catch { $("#ovShareIn").value = "that code didn't read — paste the whole OVL1. line"; return false }
}

// ---- dragging + snapping (edit mode only): ElvUI's sticky snap — 15 px to the screen edges/centre or another card's
// edges/centre on each axis (only when the cards overlap on the other axis, like LibSimpleSticky), Shift skips. Grid on
// also rounds to the grid lines (WoW Edit Mode's "snap to grid"). Guides show the live alignment. -------------------------------
const SNAP_PX = 15;
const guides = {v: $("#ovgv"), h: $("#ovgh")};
function guide(kind, at){
  const el = guides[kind]; if (at == null){ el.classList.add("hidden"); return }
  el.classList.remove("hidden");
  if (kind === "v") el.style.left = Math.round(at) + "px"; else el.style.top = Math.round(at) + "px";
}
function hideGuides(){ guide("v", null); guide("h", null) }
function magnet(L, T, W, H, skipId){
  const xs = [0, innerWidth / 2, innerWidth], ys = [0, innerHeight / 2, innerHeight];
  for (const el of document.querySelectorAll(".ovw")) if (el.dataset.w !== skipId){
    const r = el.getBoundingClientRect();
    xs.push(r.left, r.left + r.width / 2, r.left + r.width);
    ys.push(r.top, r.top + r.height / 2, r.top + r.height);
  }
  const best = (card, cands) => { let b = null;
    for (const c of card) for (const t of cands){ const d = t - c;
      if (Math.abs(d) <= SNAP_PX && (!b || Math.abs(d) < Math.abs(b.d))) b = {d, t} }
    return b };
  const bx = best([L, L + W / 2, L + W], xs), by = best([T, T + H / 2, T + H], ys);
  return {L: bx ? L + bx.d : null, T: by ? T + by.d : null, v: bx?.t, h: by?.t};
}
let drag = null, rz = null;
addEventListener("pointerdown", e => {
  if (!CFG.edit || e.button) return;
  const card = e.target.closest?.(".ovw");
  if (card){
    if (e.target.closest("button")) return;
    if (e.target.closest(".rsz")){
      const r = card.getBoundingClientRect();
      rz = {id: card.dataset.w, card, x0: r.left, y0: r.top, w0: r.width || 1, h0: r.height || 1, s0: wPos(card.dataset.w).s};
      card.setPointerCapture(e.pointerId);
    } else {
      drag = {id: card.dataset.w, dx: e.clientX - card.offsetLeft, dy: e.clientY - card.offsetTop, card};
      card.setPointerCapture(e.pointerId); card.classList.add("moving");
    }
    pick(card.dataset.w);
    e.preventDefault();
  } else if (!e.target.closest("#ovpanel")) pick(null);
});
addEventListener("pointermove", e => {
  if (rz){
    const k = Math.max((e.clientX - rz.x0) / rz.w0, (e.clientY - rz.y0) / rz.h0);
    setS(rz.id, rz.s0 * k);
    return;
  }
  if (!drag) return;
  let L = Math.round(e.clientX - drag.dx), T = Math.round(e.clientY - drag.dy);
  const r = drag.card.getBoundingClientRect(), free = e.shiftKey;
  if (!free){
    if (CFG.grid){ L = Math.round(L / CFG.gsize) * CFG.gsize; T = Math.round(T / CFG.gsize) * CFG.gsize }
    if (CFG.snap){ const s = magnet(L, T, r.width, r.height, drag.id);
      if (s){ if (s.L != null){ L = s.L; guide("v", s.v) } else guide("v", null);
        if (s.T != null){ T = s.T; guide("h", s.h) } else guide("h", null) }
      else hideGuides() }
    else hideGuides();
  } else hideGuides();
  drag.card.style.left = L + "px";
  drag.card.style.top = T + "px";
  syncDetail(drag.id);
});
addEventListener("pointerup", () => {
  if (rz){ rz = null; return }
  if (!drag) return;
  const {card, id} = drag; drag = null;
  card.classList.remove("moving");
  hideGuides();
  clampCard(card);
  savePos(id);
});
// Ctrl+scroll resizes the hovered card (WeakAuras' scale slider, at the pointer)
addEventListener("wheel", e => {
  if (!CFG.edit || !e.ctrlKey) return;
  const card = e.target.closest?.(".ovw"); if (!card) return;
  e.preventDefault();
  setS(card.dataset.w, wPos(card.dataset.w).s + (e.deltaY < 0 ? .05 : -.05));
}, {passive: false});
// arrows nudge the picked card (ElvUI's nudge panel: 1 px, Shift = 10); Esc = Done
addEventListener("keydown", e => {
  if (!CFG.edit || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || "")) return;
  if (e.key === "Escape"){ window.ovhost.done(); return }
  if (!picked.id) return;
  const d = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[e.key];
  if (!d) return;
  const step = e.shiftKey ? 10 : 1, el = $("#ovw-" + picked.id); if (!el) return;
  el.style.left = el.offsetLeft + d[0] * step + "px";
  el.style.top = el.offsetTop + d[1] * step + "px";
  clampCard(el); savePos(picked.id); syncDetail(picked.id);
  e.preventDefault();
});

// ---- boot -------------------------------
(async () => {
  try {
    const st = await window.ovhost.state();
    CFG = {edit: st.edit !== false, widgets: st.widgets && typeof st.widgets === "object" ? st.widgets : {},
      snap: st.snap !== false, grid: st.grid === true, gsize: [32, 64, 128].includes(+st.gsize) ? +st.gsize : 64, panel: st.panel || null,
      profile: typeof st.profile === "string" && st.profile ? st.profile : "Default",
      profiles: st.profiles && typeof st.profiles === "object" ? st.profiles : null};
    if (st.desk?.width) DESK = st.desk;
  } catch {}
  // profiles: the live layout is the truth, so the active profile starts as a mirror of it (first boot makes Default)
  if (!CFG.profiles || typeof CFG.profiles !== "object" || !CFG.profiles[CFG.profile])
    CFG.profiles = {[CFG.profile]: profSnap()};
  CFG.profiles[CFG.profile] = profSnap();
  for (const id of Object.keys(KINDS)) if (wPos(id).on) $("#ovroot").appendChild(mkCard(id));
  buildPanel();
  gridShow();
  document.body.classList.toggle("edit", CFG.edit);
  document.body.classList.toggle("locked", !CFG.edit);
  $("#ovpanel").classList.toggle("hidden", !CFG.edit);
  if (CFG.panel && Number.isFinite(+CFG.panel.x)){
    const p = $("#ovpanel");
    p.style.transform = "none"; p.style.right = "auto";
    p.style.left = clamp(CFG.panel.x - DESK.x, 0, Math.max(0, innerWidth - p.offsetWidth || 0)) + "px";
    p.style.top = clamp(CFG.panel.y - DESK.y, 0, Math.max(0, innerHeight - p.offsetHeight || 0)) + "px";
  }
  place();
  window.ovhost.onData(apply);
  window.ovhost.onMode(on => {
    CFG.edit = !!on;
    document.body.classList.toggle("edit", CFG.edit);
    document.body.classList.toggle("locked", !CFG.edit);
    $("#ovpanel").classList.toggle("hidden", !CFG.edit);
    if (!CFG.edit){ hideGuides(); pick(null) }
    gridShow();   // the grid follows edit mode: locked hides it, editing brings it back if the preference says so
    toastsShow(DATA ? DATA.toasts : []);   // toasts too: hidden at once while editing, back when the push resumes
    place(); ovSave();
  });
  window.ovhost.onScreens(d => { if (d?.width){ DESK = d; place() } });
  setInterval(() => { if (DATA) apply({...DATA, t: Date.now()}) }, 1000);   // the countdowns and clocks tick between pushes
})();
